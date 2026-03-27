export {
  VOCAL_CONFIG,
  type VocalPhase,
  type DisplayPhase,
  type VocalEvent,
  type VocalContext,
  type VocalState,
  type SideEffect,
  type TransitionResult,
  isTerminalPhase,
  toDisplayPhase,
  createInitialState,
} from './types';

export { transition } from './transitions';

export { TimerManager, type TimerSlot } from './timers';
