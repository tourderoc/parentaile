// ========== Constantes centralisees ==========

export const VOCAL_CONFIG = {
  GRACE_PERIOD_SEC: 30,
  COUNTDOWN_SEC: 180,    // 3 minutes before automatic cancellation
  MIN_PARTICIPANTS: 3,
  MAX_SUSPENSIONS: 2,
  MAX_PARTICIPANT_EXITS: 2,
  PROPOSE_AFTER_SEC: 10, // Base delay before the first person can propose
  RANK_DELAY_SEC: 15,    // Delay added per rank (Rank 1: 10s, Rank 2: 25s, Rank 3: 40s...)
} as const;

// ========== Phases ==========

export type VocalPhase =
  | 'WAITING_ROOM'
  | 'COUNTDOWN_START'
  | 'SESSION_ACTIVE'
  | 'GRACE_PERIOD'
  | 'SUSPENDED'
  | 'SESSION_CANCELLED'
  | 'SESSION_ENDED';

/** Phase visible par l'UI (GRACE_PERIOD masque en SESSION_ACTIVE) */
export type DisplayPhase = Exclude<VocalPhase, 'GRACE_PERIOD'>;

// ========== Evenements ==========

export type VocalEvent =
  | { type: 'HOUR_REACHED' }
  | { type: 'CONDITIONS_CHANGED'; count: number; animateurPresent: boolean }
  | { type: 'GRACE_EXPIRED' }
  | { type: 'COUNTDOWN_TICK'; remaining: number }
  | { type: 'COUNTDOWN_EXPIRED' }
  | { type: 'REPLACEMENT_PROPOSED'; uid: string; pseudo: string }
  | { type: 'REPLACEMENT_ACCEPTED'; uid: string; pseudo: string }
  | { type: 'REPLACEMENT_FAILED'; reason: string }
  | { type: 'ANIMATEUR_END_SESSION' }
  | { type: 'PARTICIPANT_BANNED'; uid: string }
  | { type: 'REPLACEMENT_REFUSED' }
  | { type: 'REPLACEMENT_SYNC'; currentAnimateurUid: string; replacementUsed: boolean }
  | { type: 'FIRESTORE_SYNC'; suspended: boolean; suspensionCount: number; currentAnimateurUid: string };

// ========== Contexte (donnees accumulees) ==========

export interface VocalContext {
  participantCount: number;
  animateurPresent: boolean;
  suspensionCount: number;
  suspensionReason?: 'animateur_left' | 'below_minimum';
  countdownRemaining: number;
  replacementUid?: string;
  replacementPseudo?: string;
  isProposing: boolean;
  sessionEverStarted: boolean;
  currentAnimateurUid: string;
  participantPoints: Record<string, number>;
  refusedRelay: boolean;
}

// ========== Etat complet ==========

export interface VocalState {
  phase: VocalPhase;
  context: VocalContext;
}

// ========== Side effects ==========

export type SideEffect =
  | { type: 'START_TIMER'; slot: 'grace' | 'countdown' | 'startCheck'; durationSec: number; withTick?: boolean }
  | { type: 'CANCEL_TIMER'; slot: 'grace' | 'countdown' | 'startCheck' }
  | { type: 'CANCEL_ALL_TIMERS' }
  | { type: 'WRITE_FIRESTORE_SESSION_ACTIVE' }
  | { type: 'WRITE_FIRESTORE_SUSPENDED'; reason: 'animateur_left' | 'below_minimum' }
  | { type: 'WRITE_FIRESTORE_RESUMED' }
  | { type: 'WRITE_FIRESTORE_CANCELLED'; reason: string }
  | { type: 'WRITE_FIRESTORE_ENDED' }
  | { type: 'WRITE_FIRESTORE_REPLACEMENT'; uid: string; pseudo: string }
  | { type: 'KICK_PARTICIPANT'; uid: string };

// ========== Resultat de transition ==========

export interface TransitionResult {
  state: VocalState;
  sideEffects: SideEffect[];
}

// ========== Helpers ==========

export function isTerminalPhase(phase: VocalPhase): boolean {
  return phase === 'SESSION_CANCELLED' || phase === 'SESSION_ENDED';
}

export function toDisplayPhase(phase: VocalPhase): DisplayPhase {
  return phase === 'GRACE_PERIOD' ? 'SESSION_ACTIVE' : phase;
}

export function createInitialState(animateurUid: string): VocalState {
  return {
    phase: 'WAITING_ROOM',
    context: {
      participantCount: 0,
      animateurPresent: false,
      suspensionCount: 0,
      countdownRemaining: VOCAL_CONFIG.COUNTDOWN_SEC,
      isProposing: false,
      sessionEverStarted: false,
      currentAnimateurUid: animateurUid,
      participantPoints: {},
      refusedRelay: false,
    },
  };
}
