import {
  VocalState,
  VocalEvent,
  VocalContext,
  TransitionResult,
  SideEffect,
  VOCAL_CONFIG,
  isTerminalPhase,
} from './types';

// ========== Logger ==========

function logTransition(from: VocalState, event: VocalEvent, to: VocalState): void {
  const details: string[] = [];
  if ('count' in event) details.push(`count: ${event.count}`);
  if ('remaining' in event) details.push(`remaining: ${event.remaining}`);
  if ('uid' in event) details.push(`uid: ${event.uid}`);
  if ('reason' in event) details.push(`reason: ${event.reason}`);
  if (to.context.suspensionReason) details.push(`reason: ${to.context.suspensionReason}`);
  if (to.context.suspensionCount > 0) details.push(`suspensionCount: ${to.context.suspensionCount}`);

  const suffix = details.length > 0 ? ` | ${details.join(' | ')}` : '';
  console.log(`[VOCAL_MACHINE] ${from.phase} → ${to.phase} | event: ${event.type}${suffix}`);
}

// ========== Helpers ==========

function same(state: VocalState): TransitionResult {
  return { state, sideEffects: [] };
}


// ========== Conditions helpers ==========

function hasEnoughParticipants(count: number): boolean {
  return count >= VOCAL_CONFIG.MIN_PARTICIPANTS;
}

function canStartSession(count: number, animateurPresent: boolean): boolean {
  return hasEnoughParticipants(count) && animateurPresent;
}

// ========== Transition function ==========

export function transition(state: VocalState, event: VocalEvent): TransitionResult {
  // Triple garde terminale : les etats terminaux ignorent TOUT
  if (isTerminalPhase(state.phase)) {
    return same(state);
  }

  const result = transitionInner(state, event);

  // Log uniquement si changement de phase ou side effects
  if (result.state.phase !== state.phase || result.sideEffects.length > 0) {
    logTransition(state, event, result.state);
  }

  return result;
}

function transitionInner(state: VocalState, event: VocalEvent): TransitionResult {
  const { phase, context } = state;
  const ctx = context;

  switch (phase) {
    // ============================
    // WAITING_ROOM
    // ============================
    case 'WAITING_ROOM':
      return handleWaitingRoom(state, event, ctx);

    // ============================
    // COUNTDOWN_START
    // ============================
    case 'COUNTDOWN_START':
      return handleCountdownStart(state, event, ctx);

    // ============================
    // SESSION_ACTIVE
    // ============================
    case 'SESSION_ACTIVE':
      return handleSessionActive(state, event, ctx);

    // ============================
    // GRACE_PERIOD
    // ============================
    case 'GRACE_PERIOD':
      return handleGracePeriod(state, event, ctx);

    // ============================
    // SUSPENDED
    // ============================
    case 'SUSPENDED':
      return handleSuspended(state, event, ctx);

    default:
      return same(state);
  }
}

// ========== WAITING_ROOM ==========

function handleWaitingRoom(state: VocalState, event: VocalEvent, ctx: VocalContext): TransitionResult {
  switch (event.type) {
    case 'HOUR_REACHED': {
      const updatedCtx = { ...ctx };
      if (canStartSession(ctx.participantCount, ctx.animateurPresent)) {
        // Assez de monde + animateur → SESSION_ACTIVE
        return {
          state: { phase: 'SESSION_ACTIVE', context: { ...updatedCtx, sessionEverStarted: true } },
          sideEffects: [
            { type: 'WRITE_FIRESTORE_SESSION_ACTIVE' },
          ],
        };
      }
      // Pas assez ou pas d'animateur → COUNTDOWN_START
      const reason: 'below_minimum' | 'animateur_left' = !ctx.animateurPresent ? 'animateur_left' : 'below_minimum';
      return {
        state: {
          phase: 'COUNTDOWN_START',
          context: {
            ...updatedCtx,
            suspensionReason: reason,
            countdownRemaining: VOCAL_CONFIG.COUNTDOWN_SEC,
          },
        },
        sideEffects: [
          { type: 'START_TIMER', slot: 'countdown', durationSec: VOCAL_CONFIG.COUNTDOWN_SEC, withTick: true },
        ],
      };
    }

    case 'CONDITIONS_CHANGED':
      // Mettre a jour le contexte en attente
      return {
        state: {
          phase: 'WAITING_ROOM',
          context: { ...ctx, participantCount: event.count, animateurPresent: event.animateurPresent },
        },
        sideEffects: [],
      };

    default:
      return same(state);
  }
}

// ========== COUNTDOWN_START ==========

function handleCountdownStart(state: VocalState, event: VocalEvent, ctx: VocalContext): TransitionResult {
  switch (event.type) {
    case 'CONDITIONS_CHANGED': {
      const newCtx = { ...ctx, participantCount: event.count, animateurPresent: event.animateurPresent };
      // Si conditions remplies → SESSION_ACTIVE
      if (canStartSession(event.count, event.animateurPresent)) {
        return {
          state: { phase: 'SESSION_ACTIVE', context: { ...newCtx, sessionEverStarted: true, suspensionReason: undefined } },
          sideEffects: [
            { type: 'CANCEL_TIMER', slot: 'countdown' },
            { type: 'WRITE_FIRESTORE_SESSION_ACTIVE' },
          ],
        };
      }
      return { state: { phase: 'COUNTDOWN_START', context: newCtx }, sideEffects: [] };
    }

    case 'COUNTDOWN_TICK':
      return {
        state: { phase: 'COUNTDOWN_START', context: { ...ctx, countdownRemaining: event.remaining } },
        sideEffects: [],
      };

    case 'COUNTDOWN_EXPIRED':
      return {
        state: {
          phase: 'SESSION_CANCELLED',
          context: { ...ctx, countdownRemaining: 0 },
        },
        sideEffects: [
          { type: 'CANCEL_ALL_TIMERS' },
          { type: 'WRITE_FIRESTORE_CANCELLED', reason: ctx.suspensionReason === 'animateur_left'
            ? 'Aucun animateur disponible'
            : 'Pas assez de participants' },
        ],
      };

    case 'REPLACEMENT_PROPOSED':
      return {
        state: {
          phase: 'COUNTDOWN_START',
          context: { ...ctx, isProposing: true, replacementUid: event.uid, replacementPseudo: event.pseudo },
        },
        sideEffects: [
          { type: 'WRITE_FIRESTORE_REPLACEMENT', uid: event.uid, pseudo: event.pseudo },
        ],
      };

    case 'REPLACEMENT_ACCEPTED':
      return {
        state: {
          phase: 'SESSION_ACTIVE',
          context: {
            ...ctx,
            sessionEverStarted: true,
            isProposing: false,
            currentAnimateurUid: event.uid,
            animateurPresent: true,
            suspensionReason: undefined,
            replacementUid: undefined,
            replacementPseudo: undefined,
          },
        },
        sideEffects: [
          { type: 'CANCEL_TIMER', slot: 'countdown' },
          { type: 'WRITE_FIRESTORE_SESSION_ACTIVE' },
        ],
      };

    case 'REPLACEMENT_FAILED':
      return {
        state: {
          phase: 'COUNTDOWN_START',
          context: { ...ctx, isProposing: false, replacementUid: undefined, replacementPseudo: undefined },
        },
        sideEffects: [],
      };

    default:
      return same(state);
  }
}

// ========== SESSION_ACTIVE ==========

function handleSessionActive(state: VocalState, event: VocalEvent, ctx: VocalContext): TransitionResult {
  switch (event.type) {
    case 'CONDITIONS_CHANGED': {
      const newCtx = { ...ctx, participantCount: event.count, animateurPresent: event.animateurPresent };

      // Tout va bien
      if (canStartSession(event.count, event.animateurPresent)) {
        return { state: { phase: 'SESSION_ACTIVE', context: newCtx }, sideEffects: [] };
      }

      // Probleme detecte → GRACE_PERIOD
      const reason: 'animateur_left' | 'below_minimum' =
        !event.animateurPresent ? 'animateur_left' : 'below_minimum';

      return {
        state: { phase: 'GRACE_PERIOD', context: { ...newCtx, suspensionReason: reason } },
        sideEffects: [
          { type: 'START_TIMER', slot: 'grace', durationSec: VOCAL_CONFIG.GRACE_PERIOD_SEC },
        ],
      };
    }

    case 'ANIMATEUR_END_SESSION':
      return {
        state: { phase: 'SESSION_ENDED', context: ctx },
        sideEffects: [
          { type: 'CANCEL_ALL_TIMERS' },
          { type: 'WRITE_FIRESTORE_ENDED' },
        ],
      };

    case 'PARTICIPANT_BANNED':
      return {
        state: { phase: 'SESSION_ACTIVE', context: ctx },
        sideEffects: [
          { type: 'KICK_PARTICIPANT', uid: event.uid },
        ],
      };

    case 'FIRESTORE_SYNC':
      return {
        state: {
          phase: 'SESSION_ACTIVE',
          context: {
            ...ctx,
            suspensionCount: event.suspensionCount,
            currentAnimateurUid: event.currentAnimateurUid,
          },
        },
        sideEffects: [],
      };

    default:
      return same(state);
  }
}

// ========== GRACE_PERIOD ==========

function handleGracePeriod(state: VocalState, event: VocalEvent, ctx: VocalContext): TransitionResult {
  switch (event.type) {
    case 'CONDITIONS_CHANGED': {
      const newCtx = { ...ctx, participantCount: event.count, animateurPresent: event.animateurPresent };

      // Probleme resolu → retour SESSION_ACTIVE
      if (canStartSession(event.count, event.animateurPresent)) {
        return {
          state: { phase: 'SESSION_ACTIVE', context: { ...newCtx, suspensionReason: undefined } },
          sideEffects: [
            { type: 'CANCEL_TIMER', slot: 'grace' },
          ],
        };
      }

      return { state: { phase: 'GRACE_PERIOD', context: newCtx }, sideEffects: [] };
    }

    case 'GRACE_EXPIRED': {
      const newSuspensionCount = ctx.suspensionCount + 1;

      // Trop de suspensions → annulation
      if (newSuspensionCount > VOCAL_CONFIG.MAX_SUSPENSIONS) {
        return {
          state: {
            phase: 'SESSION_CANCELLED',
            context: { ...ctx, suspensionCount: newSuspensionCount },
          },
          sideEffects: [
            { type: 'CANCEL_ALL_TIMERS' },
            { type: 'WRITE_FIRESTORE_CANCELLED', reason: 'Trop de suspensions' },
          ],
        };
      }

      // Suspension normale
      return {
        state: {
          phase: 'SUSPENDED',
          context: {
            ...ctx,
            suspensionCount: newSuspensionCount,
            countdownRemaining: VOCAL_CONFIG.COUNTDOWN_SEC,
          },
        },
        sideEffects: [
          { type: 'START_TIMER', slot: 'countdown', durationSec: VOCAL_CONFIG.COUNTDOWN_SEC, withTick: true },
          { type: 'WRITE_FIRESTORE_SUSPENDED', reason: ctx.suspensionReason ?? 'below_minimum' },
        ],
      };
    }

    case 'ANIMATEUR_END_SESSION':
      return {
        state: { phase: 'SESSION_ENDED', context: ctx },
        sideEffects: [
          { type: 'CANCEL_ALL_TIMERS' },
          { type: 'WRITE_FIRESTORE_ENDED' },
        ],
      };

    default:
      return same(state);
  }
}

// ========== SUSPENDED ==========

function handleSuspended(state: VocalState, event: VocalEvent, ctx: VocalContext): TransitionResult {
  switch (event.type) {
    case 'CONDITIONS_CHANGED': {
      const newCtx = { ...ctx, participantCount: event.count, animateurPresent: event.animateurPresent };

      // Conditions restaurees → SESSION_ACTIVE
      if (canStartSession(event.count, event.animateurPresent)) {
        return {
          state: { phase: 'SESSION_ACTIVE', context: { ...newCtx, suspensionReason: undefined } },
          sideEffects: [
            { type: 'CANCEL_TIMER', slot: 'countdown' },
            { type: 'WRITE_FIRESTORE_RESUMED' },
          ],
        };
      }

      return { state: { phase: 'SUSPENDED', context: newCtx }, sideEffects: [] };
    }

    case 'COUNTDOWN_TICK':
      return {
        state: { phase: 'SUSPENDED', context: { ...ctx, countdownRemaining: event.remaining } },
        sideEffects: [],
      };

    case 'COUNTDOWN_EXPIRED':
      return {
        state: { phase: 'SESSION_CANCELLED', context: { ...ctx, countdownRemaining: 0 } },
        sideEffects: [
          { type: 'CANCEL_ALL_TIMERS' },
          { type: 'WRITE_FIRESTORE_CANCELLED', reason: ctx.suspensionReason === 'animateur_left'
            ? 'Animateur absent trop longtemps'
            : 'Pas assez de participants' },
        ],
      };

    case 'REPLACEMENT_PROPOSED':
      return {
        state: {
          phase: 'SUSPENDED',
          context: { ...ctx, isProposing: true, replacementUid: event.uid, replacementPseudo: event.pseudo },
        },
        sideEffects: [
          { type: 'WRITE_FIRESTORE_REPLACEMENT', uid: event.uid, pseudo: event.pseudo },
        ],
      };

    case 'REPLACEMENT_ACCEPTED':
      return {
        state: {
          phase: 'SESSION_ACTIVE',
          context: {
            ...ctx,
            isProposing: false,
            currentAnimateurUid: event.uid,
            animateurPresent: true,
            suspensionReason: undefined,
            replacementUid: undefined,
            replacementPseudo: undefined,
          },
        },
        sideEffects: [
          { type: 'CANCEL_TIMER', slot: 'countdown' },
          { type: 'WRITE_FIRESTORE_RESUMED' },
        ],
      };

    case 'REPLACEMENT_FAILED':
      return {
        state: {
          phase: 'SUSPENDED',
          context: { ...ctx, isProposing: false, replacementUid: undefined, replacementPseudo: undefined },
        },
        sideEffects: [],
      };

    case 'PARTICIPANT_BANNED':
      return {
        state: { phase: 'SUSPENDED', context: ctx },
        sideEffects: [
          { type: 'KICK_PARTICIPANT', uid: event.uid },
        ],
      };

    default:
      return same(state);
  }
}
