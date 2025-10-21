// Health tier computation (extracted from Game.tsx). No behavior changes.
export function computeHealthTier(health: number, maxHealth: number): number {
  // Map ship look to health percentage (0-100): 0-20 => T1, 20-40 => T2, 40-60 => T3, 60-80 => T4, 80-100 => T5
  const pct = maxHealth > 0 ? Math.max(0, Math.min(100, (health / maxHealth) * 100)) : 0;
  if (pct >= 80) return 5;
  if (pct >= 60) return 4;
  if (pct >= 40) return 3;
  if (pct >= 20) return 2;
  return 1;
}
