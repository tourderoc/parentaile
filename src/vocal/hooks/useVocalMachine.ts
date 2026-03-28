import { useEffect, useRef, useReducer, useCallback, useMemo } from 'react';
import { Participant } from 'livekit-client';
import { auth } from '../../lib/firebase';
import {
  suspendSession,
  resumeSession,
  cancelGroup,
  endSession,
  proposeAsAnimateur,
  initSessionStateV2,
} from '../../lib/groupeParoleService';
import {
  type VocalState,
  type VocalEvent,
  type SideEffect,
  type DisplayPhase,
  VOCAL_CONFIG,
  createInitialState,
  toDisplayPhase,
  isTerminalPhase,
} from '../machine';
import { transition } from '../machine/transitions';
import { TimerManager } from '../machine/timers';
import { useParticipantTracker } from './useParticipantTracker';

// ========== Output interface ==========

export interface VocalMachineOutput {
  /** Phase visible par l'UI (GRACE_PERIOD masqué en SESSION_ACTIVE) */
  phase: DisplayPhase;

  /** Raison du problème en cours */
  reason?: 'below_minimum' | 'animateur_left';

  /** Secondes restantes du countdown actif */
  countdownSec: number;

  /** Le bouton "Je prends le relais" peut être affiché */
  canPropose: boolean;

  /** Une proposition est en cours de traitement */
  isProposing: boolean;

  /** Nombre de suspensions déjà survenues */
  suspensionCount: number;

  /** La session a-t-elle déjà été active ? */
  sessionEverStarted: boolean;

  /** UID de l'animateur effectif (original ou remplaçant) */
  effectiveAnimateurUid: string;

  /** L'utilisateur local est-il l'animateur effectif ? */
  isEffectiveAnimateur: boolean;

  /** L'animateur effectif est-il un remplaçant ? */
  isReplacementAnimateur: boolean;

  /** Nombre de participants connectés LiveKit (local inclus) */
  participantCount: number;

  /** L'animateur est-il connecté en LiveKit ? */
  animateurPresent: boolean;

  /** Dispatch un événement vers la machine */
  dispatch: (event: VocalEvent) => void;

  /** Proposer de devenir animateur de remplacement */
  proposeAsReplacement: () => void;

  /** Terminer la session (animateur uniquement) */
  endSessionAction: () => void;
}

// ========== Props ==========

interface UseVocalMachineProps {
  groupeId: string;
  createurUid: string;
  localUid: string;
  localPseudo: string;
  liveKitParticipants: Participant[];
  isTestGroup: boolean;
  /** Firestore sessionState from parent — avoids double listener */
  firestoreSession?: {
    suspended: boolean;
    suspensionCount: number;
    currentAnimateurUid: string;
    currentAnimateurPseudo?: string;
    replacementUsed: boolean;
    sessionActive: boolean;
  } | null;
}

// ========== Internal reducer ==========

type MachineAction =
  | { type: 'DISPATCH'; event: VocalEvent }
  | { type: 'SET_STATE'; state: VocalState };

function machineReducer(state: VocalState, action: MachineAction): VocalState {
  switch (action.type) {
    case 'DISPATCH': {
      const result = transition(state, action.event);
      // Side effects are handled externally via ref
      return result.state;
    }
    case 'SET_STATE':
      return action.state;
    default:
      return state;
  }
}

// ========== Hook ==========

export function useVocalMachine({
  groupeId,
  createurUid,
  localUid,
  localPseudo,
  liveKitParticipants,
  isTestGroup,
  firestoreSession,
}: UseVocalMachineProps): VocalMachineOutput {

  // ---------- Core state ----------
  const [machineState, reducerDispatch] = useReducer(
    machineReducer,
    createurUid,
    createInitialState,
  );

  const stateRef = useRef(machineState);
  stateRef.current = machineState;

  // ---------- Timer manager (stable across renders) ----------
  const timerManagerRef = useRef<TimerManager | null>(null);
  if (!timerManagerRef.current) {
    timerManagerRef.current = new TimerManager();
  }
  const timerManager = timerManagerRef.current;

  // ---------- Side effect executor ----------
  const executeSideEffects = useCallback(async (effects: SideEffect[]) => {
    for (const effect of effects) {
      try {
        switch (effect.type) {
          case 'START_TIMER':
            timerManager.start(
              effect.slot,
              effect.durationSec,
              effect.withTick
                ? (remaining: number) => {
                    dispatch({ type: 'COUNTDOWN_TICK', remaining });
                  }
                : undefined,
              () => {
                if (effect.slot === 'grace') {
                  dispatch({ type: 'GRACE_EXPIRED' });
                } else {
                  dispatch({ type: 'COUNTDOWN_EXPIRED' });
                }
              },
            );
            break;

          case 'CANCEL_TIMER':
            timerManager.cancel(effect.slot);
            break;

          case 'CANCEL_ALL_TIMERS':
            timerManager.cancelAll();
            break;

          case 'WRITE_FIRESTORE_SESSION_ACTIVE':
            await initSessionStateV2(groupeId, stateRef.current.context.currentAnimateurUid, localPseudo);
            break;

          case 'WRITE_FIRESTORE_SUSPENDED':
            await suspendSession(groupeId, effect.reason);
            break;

          case 'WRITE_FIRESTORE_RESUMED':
            await resumeSession(groupeId);
            break;

          case 'WRITE_FIRESTORE_CANCELLED': {
            // OPTIMIZATION: If animator is present, only they should perform the cancellation.
            // If animator is absent, everyone tries, but the transaction in the service will ensure idempotency.
            const isAnyAnimPresent = stateRef.current.context.animateurPresent;
            const amIAnim = stateRef.current.context.currentAnimateurUid === localUid;
            
            if (isAnyAnimPresent && !amIAnim) {
              console.log("[VOCAL_MACHINE] Skipping redundancy: animator present, skipping cancelGroup call.");
              break;
            }
            await cancelGroup(groupeId, effect.reason);
            break;
          }

          case 'WRITE_FIRESTORE_ENDED':
            await endSession(groupeId);
            break;

          case 'WRITE_FIRESTORE_REPLACEMENT':
            // Handled in proposeAsReplacement action below
            break;

          case 'KICK_PARTICIPANT':
            // KICK is handled at the LiveKit data channel level in SalleVocalePage
            console.log(`[VOCAL_MACHINE] KICK_PARTICIPANT: ${effect.uid} — handled by data channel`);
            break;
        }
      } catch (err) {
        console.error(`[VOCAL_MACHINE] Side effect error (${effect.type}):`, err);
      }
    }
  }, [groupeId, localPseudo, timerManager]);

  // ---------- Dispatch with side effects ----------
  const dispatch = useCallback((event: VocalEvent) => {
    const currentState = stateRef.current;

    // Don't process events on terminal states
    if (isTerminalPhase(currentState.phase)) return;

    const result = transition(currentState, event);
    reducerDispatch({ type: 'SET_STATE', state: result.state });
    stateRef.current = result.state;

    if (result.sideEffects.length > 0) {
      executeSideEffects(result.sideEffects);
    }
  }, [executeSideEffects]);

  // ---------- Participant tracker (bridge LiveKit → events) ----------
  const effectiveAnimateurUid = machineState.context.currentAnimateurUid;

  const { participantCount, animateurPresent } = useParticipantTracker({
    groupeId,
    localUid,
    liveKitParticipants,
    effectiveAnimateurUid,
    dispatch,
  });

  // ---------- Sync Firestore sessionState → machine ----------
  useEffect(() => {
    if (!firestoreSession) return;

    dispatch({
      type: 'FIRESTORE_SYNC',
      suspended: firestoreSession.suspended,
      suspensionCount: firestoreSession.suspensionCount,
      currentAnimateurUid: firestoreSession.currentAnimateurUid || createurUid,
    });
  }, [
    firestoreSession?.suspended,
    firestoreSession?.suspensionCount,
    firestoreSession?.currentAnimateurUid,
    createurUid,
    dispatch,
  ]);

  // ---------- canPropose logic ----------
  // Show "Je prends le relais" button after PROPOSE_AFTER_SEC seconds
  // during COUNTDOWN_START (no_anim) or SUSPENDED (animateur_left)
  const canPropose = useMemo(() => {
    const { phase, context } = machineState;
    const isWaitingPhase = phase === 'COUNTDOWN_START' || phase === 'SUSPENDED';
    if (!isWaitingPhase) return false;

    const hasAnimateurIssue =
      context.suspensionReason === 'animateur_left' ||
      context.suspensionReason === 'below_minimum';
    if (!hasAnimateurIssue) return false;

    // Don't allow if already the animateur
    if (localUid === effectiveAnimateurUid) return false;

    // Must wait PROPOSE_AFTER_SEC
    const elapsed = VOCAL_CONFIG.COUNTDOWN_SEC - context.countdownRemaining;
    if (elapsed < VOCAL_CONFIG.PROPOSE_AFTER_SEC) return false;

    // In test groups, always allow
    if (isTestGroup) return true;

    // In non-test groups, need >= 3 participants to propose
    return participantCount >= VOCAL_CONFIG.MIN_PARTICIPANTS;
  }, [machineState, localUid, effectiveAnimateurUid, isTestGroup, participantCount]);

  // ---------- Actions ----------
  const proposeAsReplacement = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;

    // Double-check: enough participants?
    if (!isTestGroup && participantCount < VOCAL_CONFIG.MIN_PARTICIPANTS) {
      console.warn('[VOCAL_MACHINE] Cannot propose: below minimum participants');
      return;
    }

    // Dispatch PROPOSED (sets isProposing = true, greys out button)
    dispatch({
      type: 'REPLACEMENT_PROPOSED',
      uid: user.uid,
      pseudo: localPseudo,
    });

    // Call Firestore transaction
    const success = await proposeAsAnimateur(groupeId, user.uid, localPseudo);

    if (success) {
      dispatch({
        type: 'REPLACEMENT_ACCEPTED',
        uid: user.uid,
        pseudo: localPseudo,
      });
    } else {
      dispatch({
        type: 'REPLACEMENT_FAILED',
        reason: 'Transaction échouée — un autre participant a peut-être pris le relais',
      });
    }
  }, [groupeId, localPseudo, isTestGroup, participantCount, dispatch]);

  const endSessionAction = useCallback(() => {
    dispatch({ type: 'ANIMATEUR_END_SESSION' });
  }, [dispatch]);

  // ---------- Cleanup on unmount ----------
  useEffect(() => {
    return () => {
      timerManager.cancelAll();
    };
  }, [timerManager]);

  // ---------- Derived values ----------
  const isEffectiveAnimateur = effectiveAnimateurUid === localUid;
  const isReplacementAnimateur = !!(firestoreSession?.replacementUsed) && isEffectiveAnimateur;

  return {
    phase: toDisplayPhase(machineState.phase),
    reason: machineState.context.suspensionReason,
    countdownSec: machineState.context.countdownRemaining,
    canPropose,
    isProposing: machineState.context.isProposing,
    suspensionCount: machineState.context.suspensionCount,
    sessionEverStarted: machineState.context.sessionEverStarted,
    effectiveAnimateurUid,
    isEffectiveAnimateur,
    isReplacementAnimateur,
    participantCount,
    animateurPresent,
    dispatch,
    proposeAsReplacement,
    endSessionAction,
  };
}
