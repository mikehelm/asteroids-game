// Render clock helpers (no React dependency). Minimal ref shape.
export type MutableRef<T> = { current: T };

// Initialize render-time clocks exactly as Game.tsx did: performance.now()
export function useRenderClock(_deps?: {}): {
  bootStartRef: MutableRef<number>;
  lastFrameNowRef: MutableRef<number>;
} {
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  return {
    bootStartRef: { current: now },
    lastFrameNowRef: { current: now },
  };
}

// Freeze the render-time clock on pause by recording a freeze timestamp
export function freezeRenderClockOnPause(deps: {
  isPausedRef: MutableRef<boolean>;
  pauseFreezeNowRef: MutableRef<number | undefined>;
}) {
  const { isPausedRef, pauseFreezeNowRef } = deps;
  if (isPausedRef.current) {
    pauseFreezeNowRef.current = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  } else {
    pauseFreezeNowRef.current = undefined;
  }
}
