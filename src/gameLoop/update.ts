import type { GameState, Explosion } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../utils';
import { getFxConfig } from './fxConfig';
// (moved station math into systems/stations)
import { updateExplosion, updatePlayer, updateAlienBullet, updateAlienShip, updateBonus, updateBullet } from '../gameObjects';
import { maybeBeginRefuelDock, updateRefuelDock, isDocking as isRefuelDocking } from '../systems/refuelDock';
import { maybeBeginRewardDock, updateRewardDock, isRewardDocking } from '../systems/rewardDock';
import { advanceStations } from '../systems/stations';
import { advanceEjectedBonuses } from '../systems/bonusMove';

// Keep the surface minimal for Pass A to avoid cycles. Expand in Pass B as needed.
export type EnvLike = Record<string, unknown>;

export interface SoundSystemLike {
  setMusicVolume?: (n: number) => void;
  setSfxVolume?: (n: number) => void;
  playMusic?: (...args: unknown[]) => void; // structural typing only; no runtime dependence
  pauseMusic?: () => void;
  stopThrust?: () => void;
  // add more members as needed in Pass B
}

// Pass A: forwarder only, no logic moved yet. Do not resample time here.
export function update(
  gameState: GameState,
  now: number,
  dt: number,
  _env: EnvLike,
  _soundSystem: SoundSystemLike
): void {
  // Note: This function intentionally performs only lifetime/cleanup style updates.
  // No physics integration, collision detection, spawns, or stage transitions here.
  void now; void dt; void _soundSystem; // use provided timing; no resampling here

  // 1) Visual debris lifetime and off-screen culling (moved from Game.tsx:updateVisualDebris)
  if (Array.isArray(gameState.visualDebris) && gameState.visualDebris.length > 0) {
    const arr = gameState.visualDebris;
    for (let i = arr.length - 1; i >= 0; i--) {
      const d = arr[i] as any;
      // Validate shape; drop malformed entries to avoid crashes during transient states
      if (!d || !d.position || !d.velocity) { arr.splice(i, 1); continue; }
      if (typeof d.position.x !== 'number' || typeof d.position.y !== 'number' || typeof d.velocity.x !== 'number' || typeof d.velocity.y !== 'number') { arr.splice(i, 1); continue; }
      // Update position
      d.position.x += d.velocity.x;
      d.position.y += d.velocity.y;
      // Reduce drag so debris holds velocity longer
      d.velocity.x *= 0.995;
      d.velocity.y *= 0.995;
      // Rotation advance when present
      if (typeof d.rotation === 'number' && typeof d.rotationSpeed === 'number') {
        d.rotation += d.rotationSpeed;
      }

  // 4) Alien lasers: advance and cull expired beams
  if (!Array.isArray((gameState as any).alienLasers)) (gameState as any).alienLasers = [];
  const lasers = (gameState as any).alienLasers as Array<any>;
  if (lasers.length > 0) {
    for (let i = lasers.length - 1; i >= 0; i--) {
      const l = lasers[i];
      if (!l) { lasers.splice(i, 1); continue; }
      l.life = (l.life || 0) + 1;
      const maxLife = l.maxLife || 8;
      if (l.life >= maxLife) lasers.splice(i, 1);
    }
  }
      d.life = (typeof d.life === 'number' ? d.life : 0) + 1;
      const maxLife = typeof d.maxLife === 'number' ? d.maxLife : 0;
      // Remove if out of life or well off-screen (no wrap)
      const off = d.position.x < -60 || d.position.x > CANVAS_WIDTH + 60 || d.position.y < -60 || d.position.y > CANVAS_HEIGHT + 60;
      if (d.life >= maxLife || off) {
        arr.splice(i, 1);
      }
    }
  }

  // 2) Simple lifetime counters tied to visuals (shield, heal) — decrement only
  if (typeof (gameState.player as any).shieldTime === 'number' && (gameState.player as any).shieldTime > 0) {
    (gameState.player as any).shieldTime--;
  }
  if (typeof (gameState as any).healEffect === 'number' && (gameState as any).healEffect > 0) {
    (gameState as any).healEffect--;
  }

  // 3) Explosions: advance and cull empty particle systems
  if (Array.isArray(gameState.explosions) && gameState.explosions.length > 0) {
    gameState.explosions = gameState.explosions
      .map((e) => {
        // Remove lightweight Super UFO explosions before doing any per-particle work (visuals already disabled)
        if ((e as any)?.kind === 'superUfoLite') {
          (e as any).particles = [];
          return e as Explosion;
        }
        // Ensure particles array exists to satisfy updateExplosion expectations
        if (!e || !Array.isArray((e as any).particles)) { (e as any) = { position: { x: 0, y: 0 }, particles: [] }; }
        return updateExplosion(e);
      })
      .filter((explosion): explosion is Explosion => Array.isArray(explosion.particles) && explosion.particles.length > 0);

    // Optional global particle cap (visual-only). Operates in-place, preserves ordering.
    try {
      const cfg = getFxConfig(_env as any);
      const budget = cfg.explosionMaxParticlesGlobal;
      if (Number.isFinite(budget) && typeof budget === 'number' && budget >= 0) {
        let total = 0;
        for (let i = 0; i < gameState.explosions.length; i++) {
          const p = gameState.explosions[i].particles;
          total += Array.isArray(p) ? p.length : 0;
        }
        if (total > budget) {
          let over = total - budget;
          // Oldest first: earlier indices assumed older
          for (let i = 0; i < gameState.explosions.length && over > 0; i++) {
            const p = gameState.explosions[i].particles;
            if (p.length === 0) continue;
            const cut = Math.min(over, p.length);
            if (cut > 0) {
              p.splice(0, cut);
              over -= cut;
            }
          }
          // Keep any empty explosions; they will be dropped next frame by the normal filter
        }
      }
    } catch { /* ignore */ }
  }

  // =======================
  // PHYSICS START (Pass B)
  // =======================
  // Player: respect tractor-beam attach guard from Game.tsx, and docking phases
  try {
    const r = (_env as any)?.refs as any;
    const t = r?.tractionBeamRef?.current;
    const isAttachedToAsteroid = !!(t && t.active && (t.phase === 'locking' || t.phase === 'attached'));
    // Trigger begin-dock before updating player inputs
    maybeBeginRefuelDock(gameState, now);
    maybeBeginRewardDock(gameState, now);
    const dockingActive = isRefuelDocking(gameState) || isRewardDocking(gameState);
    if (!isAttachedToAsteroid && !dockingActive) {
      // Use dt as in original call; no resampling
      // keys lives on gameState in Game.tsx; keep structural access
      const reversedControls = (gameState as any).reversedControls || false;
      gameState.player = updatePlayer(gameState.player, (gameState as any).keys, dt, reversedControls);
    }
  } catch { /* no-op */ }

  // Player bullets: per-frame kinematics
  if (!Array.isArray(gameState.bullets)) gameState.bullets = [];
  gameState.bullets = gameState.bullets.map(updateBullet);

  // Alien bullets (includes enemy shots and non-homing projectiles): per-frame kinematics
  if (!Array.isArray(gameState.alienBullets)) gameState.alienBullets = [];
  gameState.alienBullets = gameState.alienBullets.map(updateAlienBullet);

  // Player missiles (share AlienBullet shape): per-frame kinematics
  if (Array.isArray((gameState as any).playerMissiles)) {
    (gameState as any).playerMissiles = (gameState as any).playerMissiles.map(updateAlienBullet);
  }

  // Alien ships: base steering/position update, keep Date.now() argument as in source
  if (!Array.isArray(gameState.alienShips)) gameState.alienShips = [];
  gameState.alienShips = gameState.alienShips.map(s => updateAlienShip(s, gameState.player.position, now, gameState.asteroids));

  // Bonuses: drift and rotation
  if (!Array.isArray(gameState.bonuses)) gameState.bonuses = [];
  gameState.bonuses = gameState.bonuses.map(updateBonus);
  // Ejected reward bonuses traverse tiles and despawn at world edge
  try { advanceEjectedBonuses(gameState, now, dt); } catch { /* no-op */ }

  // =====================
  // PHYSICS END (Pass B)
  // =====================

  // Docking: advance using systems modules
  updateRefuelDock(gameState, now, dt);
  updateRewardDock(gameState, now, dt);

  // Stations drift/respawn (systems module)
  advanceStations(gameState, now, dt);
}
