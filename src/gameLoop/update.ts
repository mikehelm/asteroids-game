import type { GameState, Explosion } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../utils';
import { updateExplosion } from '../gameObjects';

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
  void now; void dt; // not resampling time here; dt/now are reserved for future guards

  // 1) Visual debris lifetime and off-screen culling (moved from Game.tsx:updateVisualDebris)
  if (gameState.visualDebris && gameState.visualDebris.length > 0) {
    const arr = gameState.visualDebris;
    for (let i = arr.length - 1; i >= 0; i--) {
      const d = arr[i];
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
      d.life++;
      // Remove if out of life or well off-screen (no wrap)
      const off = d.position.x < -60 || d.position.x > CANVAS_WIDTH + 60 || d.position.y < -60 || d.position.y > CANVAS_HEIGHT + 60;
      if (d.life >= d.maxLife || off) {
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
      .map(updateExplosion)
      .filter((explosion): explosion is Explosion => explosion.particles.length > 0);
  }
}
