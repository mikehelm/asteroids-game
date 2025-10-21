// Centralized trails control helpers (no React dependency)

export type MutableRef<T> = { current: T };

export type TrailsDeps = {
  trailsSuspendUntilRef: MutableRef<number>;
  trailsFadeInStartRef: MutableRef<number>;
  trailsEnabledRef: MutableRef<boolean>;
  trailsStrengthRef: MutableRef<number>;
  lastMissileEventRef?: MutableRef<number>;
};

export function suspendTrails(deps: TrailsDeps, reasonTs: number): void {
  // Preserve existing semantics: extend suspension window and reset fade-in
  const { trailsSuspendUntilRef, trailsFadeInStartRef } = deps;
  trailsSuspendUntilRef.current = Math.max(trailsSuspendUntilRef.current, reasonTs);
  trailsFadeInStartRef.current = 0;
}

export function resumeTrails(deps: TrailsDeps, startTs: number): void {
  const { trailsFadeInStartRef } = deps;
  if (startTs > trailsFadeInStartRef.current) {
    trailsFadeInStartRef.current = startTs;
  }
}

export function shouldDrawTrails(deps: TrailsDeps, now: number): boolean {
  const { trailsEnabledRef, trailsSuspendUntilRef, trailsFadeInStartRef } = deps;
  if (!trailsEnabledRef.current) return false;
  if (now < trailsSuspendUntilRef.current) return false;
  if (trailsFadeInStartRef.current === 0) {
    trailsFadeInStartRef.current = now;
  }
  return true;
}
