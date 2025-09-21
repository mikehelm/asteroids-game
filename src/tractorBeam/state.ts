// Minimal typed tractor beam state and pure helpers
// These are scaffolds to satisfy imports without affecting gameplay.
import { TractorBeamState, TractorBeamPhase } from '../types';

export function initTractorBeamState(): TractorBeamState {
  // Provide explicit defaults for required fields; leave optional fields undefined
  return {
    active: false,
    phase: 'idle' as TractorBeamPhase,
    targetAsteroid: null,
    orbitAngle: 0,
    orbitRadius: 0,
  };
}

// Advance phase is a no-op scaffold; real logic can be added later
export function advancePhase(state: TractorBeamState, _now: number): TractorBeamState {
  void _now;
  return state;
}

// Compute Flipit overlay parameters; returns invisible by default
export function computeFlipit(_state: TractorBeamState): { alpha: number; text: string; yOffset: number } {
  void _state;
  return { alpha: 0, text: '', yOffset: 0 };
}

// --- Scan Grid State (used during tractor-beam attached phase) ---
export type GridScanState = {
  active: boolean;
  complete: boolean;
  retracting: boolean;
  startTime: number;
  retractStart?: number;
  cols: number;
  rows: number;
  revealed: boolean[];
  revealRate: number; // cells per second
  // Deterministic per-encounter flicker/reveal
  rng?: () => number;
  // Pause-safe timing accumulators (ms)
  elapsed?: number;
  retractElapsed?: number;
};

export interface HasGridScan {
  gridScan?: GridScanState;
  targetAsteroid?: { 
    id?: number | string; 
    radius?: number; 
    position: { x: number; y: number }; 
    velocity?: { x: number; y: number };
  } | null;
}

function seedRng(seed: number) {
  let x = (seed | 0) || 1234567;
  return () => (x = (x * 1664525 + 1013904223) | 0, ((x >>> 0) % 1e7) / 1e7);
}

export function startGridScan(s: HasGridScan, now: number): void {
  const R = s.targetAsteroid?.radius ?? 28;
  const cells = R < 26 ? 6 : R < 40 ? 8 : R < 60 ? 10 : 12;
  const cols = cells, rows = cells;
  const total = cols * rows;
  s.gridScan = {
    active: true,
    complete: false,
    retracting: false,
    startTime: now,
    cols,
    rows,
    revealed: Array(total).fill(false),
    revealRate: 30,
    rng: seedRng(Math.floor(now) ^ (typeof s.targetAsteroid?.id === 'number' ? (s.targetAsteroid?.id as number) : (String(s.targetAsteroid?.id ?? 0).length))),
    elapsed: 0,
    retractElapsed: 0,
  };
}

export function advanceGridScanDt(s: HasGridScan, dtMs: number): void {
  const g = s.gridScan;
  if (!g || !g.active || g.complete) return;
  g.elapsed = (g.elapsed ?? 0) + Math.max(0, dtMs);
  const total = g.cols * g.rows;
  // Determine how many to reveal this tick based on dt
  const perMs = g.revealRate / 1000;
  const expectedReveal = perMs * Math.max(0, dtMs);
  const toReveal = Math.max(1, Math.floor(expectedReveal));
  let revealedCount = 0;
  for (let i = 0; i < g.revealed.length; i++) if (g.revealed[i]) revealedCount++;
  const rand = g.rng ?? Math.random;
  for (let k = 0; k < toReveal && revealedCount < total; k++) {
    let idx = Math.floor(rand() * total);
    let safety = 0;
    while (g.revealed[idx] && safety++ < total) idx = (idx + 1) % total;
    if (!g.revealed[idx]) { g.revealed[idx] = true; revealedCount++; }
  }
  if (revealedCount >= total) {
    g.complete = true;
    if (!g.retracting) {
      g.retracting = true;
      g.retractStart = (g.startTime || 0) + (g.elapsed ?? 0);
      g.retractElapsed = 0;
    }
  }
}

export function advanceGridRetractDt(s: HasGridScan, dtMs: number): void {
  const g = s.gridScan;
  if (!g || !g.retracting) return;
  g.retractElapsed = (g.retractElapsed ?? 0) + Math.max(0, dtMs);
  if ((g.retractElapsed ?? 0) > 600) { g.retracting = false; g.active = false; }
}

// Backwards-compatible adapters (approximate 60fps frame step)
export function advanceGridScan(s: HasGridScan, _now: number): void { void _now; advanceGridScanDt(s, 16); }
export function advanceGridRetract(s: HasGridScan, _now: number): void { void _now; advanceGridRetractDt(s, 16); }

export function isGridComplete(s: HasGridScan): boolean {
  const g = s.gridScan;
  return !!(g && g.complete && !g.retracting);
}

export function isGridActive(s: HasGridScan): boolean {
  const g = s.gridScan;
  return !!(g && g.active);
}
