import type { GameState, PlayerDock } from '../types';
import { planAutoDock, stepAutoDock } from '../gameLoop/docking';

// Pure helpers for refuel docking state machine
export type DockPhase = 'approach' | 'docked';

// Begin docking if player is close enough to the refuel station (same tile, <= 36px)
export function maybeBeginRefuelDock(gameState: GameState, frameNow: number): void {
  try {
    const gs: any = gameState as any;
    if (gs.dock) return; // already docking
    const st = gs.refuelStation as any;
    if (!st || !st.position) return;
    const txCur = gs.worldTileX ?? 0;
    const tyCur = gs.worldTileY ?? 0;
    if (st.tileX !== txCur || st.tileY !== tyCur) return;
    if (st.active === false) return;
    const px = gs.player?.position?.x;
    const py = gs.player?.position?.y;
    if (!Number.isFinite(px) || !Number.isFinite(py)) return;
    const dx = st.position.x - px;
    const dy = st.position.y - py;
    const dist2 = dx * dx + dy * dy;
    if (dist2 > 36 * 36) return;
    const savedV = { vx: st.vx || 0, vy: st.vy || 0 };
    st.vx = 0; st.vy = 0; // pause drift while docking
    const dock: PlayerDock = {
      kind: 'refuel',
      phase: 'approach',
      startedAt: frameNow,
      station: 'refuel',
      savedV,
    } as PlayerDock;
    // Cinematic sub-phase anchors
    (dock as any).arcT0 = frameNow;
    (dock as any)._apStartX = px;
    (dock as any)._apStartY = py;
    // Plan autopilot curve (two-stage) and store on game state
    try {
      const startAng = (gs.player?.rotation ?? 0) as number;
      (gs as any).autoDockPlan = planAutoDock({ x: px, y: py }, { x: st.position.x, y: st.position.y }, startAng, frameNow);
    } catch { /* no-op */ }
    gs.dock = dock;
  } catch { /* no-op */ }
}

// Advance approach/docked phases; lerp toward pad (~600ms) and refill (10s empty→full)
export function updateRefuelDock(gameState: GameState, frameNow: number, dt: number): void {
  const gs: any = gameState as any;
  const dock = gs.dock as PlayerDock | undefined;
  if (!dock || dock.kind !== 'refuel') return;
  const st = gs.refuelStation as any;
  // If station disappeared (despawn/cooldown), gracefully cancel and return control
  if (!st || !st.position) { gs.dock = undefined; return; }

  // ---- Tunables ----
  const ARC_MS = 800;
  const SETDOWN_MS = 400;
  const EGRESS_MS = 600;
  const ABORT_HOLD_MS = 2000;
  const ARC_RADIUS = 56; // px
  const EGRESS_OUT = 64; // px

  // Convenience
  const pObj = gs.player;
  const p = pObj.position;
  const dtSec = Math.max(0, dt) / 1000;
  void dtSec; // not strictly needed for kinematic lerps below

  // Determine forward/behind unit from saved station drift
  const sv = dock.savedV || { vx: 0, vy: -1 };
  let fx = sv.vx, fy = sv.vy;
  let mag = Math.hypot(fx, fy);
  if (mag < 0.0001) { fx = 0; fy = -1; mag = 1; }
  fx /= mag; fy /= mag;
  // Behind points from station center
  const bx = -fx, by = -fy;

  // Manual abort handling (hold Up)
  try {
    const upHeld = !!(gs.keys && (gs.keys['ArrowUp'] || gs.keys['KeyW']));
    if ((dock.phase === 'approach' || dock.phase === 'docked') && !((dock as any).egressT0)) {
      if (upHeld) {
        if (!(dock as any).abortHoldSince) (dock as any).abortHoldSince = frameNow;
        else if (frameNow - (dock as any).abortHoldSince >= ABORT_HOLD_MS) {
          // Initiate egress immediately
          (dock as any).egressT0 = frameNow;
          (dock as any).setdownT0 = (dock as any).setdownT0 || frameNow; // ensure defined
          (dock as any).undockAt = undefined;
        }
      } else {
        (dock as any).abortHoldSince = undefined;
      }
    }
  } catch { /* no-op */ }

  if (dock.phase === 'approach') {
    // Drive pose via docking plan to avoid teleports and clamp rotation
    const plan = (gs as any).autoDockPlan;
    if (plan) {
      const pose = stepAutoDock(plan, frameNow);
      p.x = pose.x; p.y = pose.y;
      if (typeof gs.player?.rotation === 'number') {
        gs.player.rotation = pose.angle;
      }
      if (pose.done) {
        dock.phase = 'docked';
        (gs as any).autoDockPlan = undefined;
        (dock as any).abortHoldSince = undefined;
      }
      return;
    }
    // Fallback to legacy arc if plan missing
    return;
  }

  if (dock.phase === 'docked') {
    const ply: any = gs.player;
    const maxFuel = Math.max(0, Number(ply?.maxFuel || 0));
    if (maxFuel > 0) {
      const ratePerMs = maxFuel / 10000; // 10s to full
      ply.fuel = Math.min(maxFuel, Math.max(0, Number(ply.fuel || 0)) + ratePerMs * dt);
      if (ply.fuel >= maxFuel - 1e-6 && typeof (dock as any).undockAt !== 'number' && !(dock as any).egressT0) {
        // Small pause then begin egress
        (dock as any).undockAt = frameNow + 300;
      }
    }
    // Start egress when undockAt reached or manual abort already triggered
    if ((dock as any).egressT0 == null && ((dock as any).undockAt != null && frameNow >= (dock as any).undockAt)) {
      (dock as any).egressT0 = frameNow;
    }
    // If egress active, move outward along forward vector
    if ((dock as any).egressT0 != null) {
      const t3 = Math.max(0, Math.min(1, (frameNow - (dock as any).egressT0) / EGRESS_MS));
      const ease = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const u3 = ease(t3);
      const sx = st.position.x;
      const sy = st.position.y;
      p.x = sx + fx * (EGRESS_OUT * u3);
      p.y = sy + fy * (EGRESS_OUT * u3);
      if (t3 >= 1) {
        // Restore station drift and clear dock
        if (st && dock.savedV) {
          st.vx = dock.savedV.vx;
          st.vy = dock.savedV.vy;
          st.active = true;
        }
        gs.dock = undefined;
      }
    }
  }
}

export function isDocking(gameState: GameState): boolean {
  const d = (gameState as any).dock as PlayerDock | undefined;
  return !!(d && (d.phase === 'approach' || d.phase === 'docked'));
}
