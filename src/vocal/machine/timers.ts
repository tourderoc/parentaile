export type TimerSlot = 'grace' | 'countdown' | 'startCheck';

interface ActiveTimer {
  intervalId: ReturnType<typeof setInterval>;
  timeoutId: ReturnType<typeof setTimeout>;
}

export class TimerManager {
  private timers = new Map<TimerSlot, ActiveTimer>();

  /**
   * Demarre un timer sur un slot (annule le precedent sur ce slot).
   * @param onTick appele chaque seconde avec le nombre de secondes restantes
   * @param onExpire appele quand le timer atteint 0
   */
  start(
    slot: TimerSlot,
    durationSec: number,
    onTick: ((remaining: number) => void) | undefined,
    onExpire: () => void,
  ): void {
    this.cancel(slot);

    let remaining = durationSec;

    const intervalId = onTick
      ? setInterval(() => {
          remaining--;
          if (remaining > 0) {
            onTick(remaining);
          }
        }, 1000)
      : setInterval(() => {}, 1_000_000); // noop placeholder pour typage uniforme

    const timeoutId = setTimeout(() => {
      this.cancel(slot);
      onExpire();
    }, durationSec * 1000);

    this.timers.set(slot, { intervalId, timeoutId });
  }

  cancel(slot: TimerSlot): void {
    const timer = this.timers.get(slot);
    if (!timer) return;
    clearInterval(timer.intervalId);
    clearTimeout(timer.timeoutId);
    this.timers.delete(slot);
  }

  cancelAll(): void {
    this.timers.forEach((_, slot) => this.cancel(slot));
  }

  isActive(slot: TimerSlot): boolean {
    return this.timers.has(slot);
  }
}
