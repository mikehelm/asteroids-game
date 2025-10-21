import type { GameState } from '../types';
import { planAutoDock, stepAutoDock } from '../gameLoop/docking';

export type RewardDockPhase = 'approach' | 'docked' | 'eject' | 'done';

export interface RewardDock {
  kind: 'reward';
  phase: RewardDockPhase;
  startedAt: number; // ms (frameNow)
  station: 'reward';
  savedV?: { vx: number; vy: number };
  ejectAt?: number;
  finishedAt?: number;
  // Cinematic anchors
  arcT0?: number;
  setdownT0?: number;
  egressT0?: number;
  abortHoldSince?: number;
  aborted?: boolean;
}

// Begin docking when player is near the reward station (same tile, <= 36px)
export function maybeBeginRewardDock(gameState: GameState, frameNow: number): void {
  const gs: any = gameState as any;
  if (gs.dock) return;
  const st = gs.rewardShip as any;
  if (!st || !st.position) return;
  const tx = gs.worldTileX ?? 0;
  const ty = gs.worldTileY ?? 0;
  if (st.tileX !== tx || st.tileY !== ty) return;
  if (st.active === false) return;
  const px = gs.player?.position?.x;
  const py = gs.player?.position?.y;
  if (!Number.isFinite(px) || !Number.isFinite(py)) return;
  const dx = st.position.x - px;
  const dy = st.position.y - py;
  const dist2 = dx * dx + dy * dy;
  if (dist2 > 36 * 36) return;
  const savedV = { vx: st.vx || 0, vy: st.vy || 0 };
  st.vx = 0; st.vy = 0; // pause drift
  const d: RewardDock = {
    kind: 'reward',
    phase: 'approach',
    startedAt: frameNow,
    station: 'reward',
    savedV,
  } as RewardDock;
  d.arcT0 = frameNow;
  (d as any)._apStartX = px;
  (d as any)._apStartY = py;
  // Plan autopilot curve
  try {
    const startAng = (gs.player?.rotation ?? 0) as number;
    (gs as any).autoDockPlan = planAutoDock({ x: px, y: py }, { x: st.position.x, y: st.position.y }, startAng, frameNow);
  } catch { /* no-op */ }
  gs.dock = d;
  if ((import.meta as any)?.env?.MODE !== 'production') {
    try { console.log('[reward:dock begin]', { d: Math.sqrt(dist2).toFixed(1) }); } catch {}
  }
}

// Update the reward docking flow and manage ejection lifecycle
export function updateRewardDock(gameState: GameState, frameNow: number, dt: number): void {
  const gs: any = gameState as any;
  const dock = gs.dock as RewardDock | undefined;
  if (!dock || dock.kind !== 'reward') return;
  const st = gs.rewardShip as any;
  // If station disappeared, cancel and hand back control
  if (!st || !st.position) { gs.dock = undefined; return; }

  // Tunables
  const ARC_MS = 800;
  const SETDOWN_MS = 400;
  const EGRESS_MS = 600;
  const ABORT_HOLD_MS = 2000;
  const ARC_RADIUS = 56;
  const EGRESS_OUT = 64;

  // Forward/behind from saved velocity
  const sv = dock.savedV || { vx: 0, vy: -1 };
  let fx = sv.vx, fy = sv.vy;
  let mag = Math.hypot(fx, fy);
  if (mag < 0.0001) { fx = 0; fy = -1; mag = 1; }
  fx /= mag; fy /= mag;
  const bx = -fx, by = -fy;

  const p = gs.player.position;

  // Manual abort handling
  try {
    const upHeld = !!(gs.keys && (gs.keys['ArrowUp'] || gs.keys['KeyW']));
    if ((dock.phase === 'approach' || dock.phase === 'docked') && !dock.egressT0) {
      if (upHeld) {
        if (!dock.abortHoldSince) dock.abortHoldSince = frameNow;
        else if (frameNow - dock.abortHoldSince >= ABORT_HOLD_MS) {
          dock.aborted = true;
          dock.egressT0 = frameNow;
        }
      } else {
        dock.abortHoldSince = undefined;
      }
    }
  } catch { /* no-op */ }

  // Phase: approach via arc/set-down
  if (dock.phase === 'approach') {
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
        dock.ejectAt = frameNow + 250;
      }
      return;
    }
    return;
  }

  // Phase: docked -> wait, then eject 3 rewards
  if (dock.phase === 'docked') {
    if (!dock.aborted && typeof dock.ejectAt === 'number' && frameNow >= dock.ejectAt) {
      // Determine behind vector from saved velocity; fallback upward if zero
      const sv = dock.savedV || { vx: 0, vy: -1 };
      let bx = -sv.vx;
      let by = -sv.vy;
      const mag = Math.hypot(bx, by);
      if (mag < 0.0001) { bx = 0; by = -1; } else { bx /= mag; by /= mag; }
      // Angles -15, 0, +15 degrees around behind
      const deg15 = Math.PI * 15 / 180;
      const baseAng = Math.atan2(by, bx);
      const angles = [baseAng - deg15, baseAng, baseAng + deg15];
      // Initial speed: 320..420 px/s
      const speeds = [
        320 + Math.random() * 100,
        360 + Math.random() * 60,
        320 + Math.random() * 100,
      ];
      const tileX = st.tileX;
      const tileY = st.tileY;
      // Spawn slightly outside the hull along the behind vector
      const spawnOffset = 24; // stationRadius (~12) + margin
      const baseX = st.position.x + Math.cos(baseAng) * spawnOffset;
      const baseY = st.position.y + Math.sin(baseAng) * spawnOffset;
      for (let i = 0; i < 3; i++) {
        const ang = angles[i];
        const sp = speeds[i];
        const vx = Math.cos(ang) * sp;
        const vy = Math.sin(ang) * sp;
        // Random bonus type from existing set
        const types: Array<'missile' | 'shield' | 'heal' | 'doubleShooter'> = ['missile', 'shield', 'heal', 'doubleShooter'];
        const btype = types[Math.floor(Math.random() * types.length)];
        const bonus: any = {
          type: btype,
          position: { x: baseX, y: baseY },
          velocity: { x: vx, y: vy },
          rotation: 0,
          radius: 10,
          life: 0,
          maxLife: 999999, // persistent until world-edge or collected
          // Ejection metadata (non-schema fields allowed at runtime)
          tileX, tileY,
          ejected: true,
          availableAfterTs: frameNow + 2000,
          ignoreTractor: true,
        };
        if (!Array.isArray(gs.bonuses)) gs.bonuses = [];
        gs.bonuses.push(bonus);
      }
      dock.phase = 'eject';
      // Kick off egress motion during/after ejection
      dock.egressT0 = frameNow;
      dock.finishedAt = frameNow + Math.max(150, EGRESS_MS);
    }
    return;
  }

  // Phase: eject (settle) + egress → done
  if (dock.phase === 'eject') {
    // Drive egress if scheduled
    if (dock.egressT0 != null) {
      const t3 = Math.max(0, Math.min(1, (frameNow - dock.egressT0) / EGRESS_MS));
      const ease = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const u3 = ease(t3);
      const sx = st.position.x;
      const sy = st.position.y;
      p.x = sx + fx * (EGRESS_OUT * u3);
      p.y = sy + fy * (EGRESS_OUT * u3);
    }
    if (typeof dock.finishedAt === 'number' && frameNow >= dock.finishedAt) {
      // Resume station drift and clear dock
      if (st && dock.savedV) {
        st.vx = dock.savedV.vx;
        st.vy = dock.savedV.vy;
        st.active = true;
      }
      gs.dock = undefined;
      dock.phase = 'done';
    }
    return;
  }
}

export function isRewardDocking(gameState: GameState): boolean {
  const d: any = (gameState as any).dock;
  return !!(d && d.kind === 'reward' && d.phase !== 'done');
}
