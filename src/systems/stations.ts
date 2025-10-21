import type { GameState } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../utils';
import { WORLD_MIN_TILE, WORLD_MAX_TILE } from '../constants';
import { WORLD_GRID_SIZE } from '../gameLoop/constants';

// Advance both refuel and reward stations: slow drift across tiles and 2-minute respawn
// Speed rule: cross one tile in (120 / WORLD_GRID_SIZE) seconds → map width in ~2 minutes
export function advanceStations(gameState: GameState, frameNow: number, dt: number): void {
  const gs: any = gameState as any;
  const dtSec = Math.max(0, dt / 1000);
  const isDev = (import.meta as any)?.env?.MODE !== 'production';

  const tileSeconds = 120 / WORLD_GRID_SIZE;
  const speedPxPerSec = CANVAS_WIDTH / tileSeconds;

  const advanceOne = (kind: 'fuel' | 'reward', st: any | null | undefined) => {
    if (!st || !st.position) return;

    // Inactive → check cooldown and respawn
    if (st.active === false) {
      if (typeof st.cooldownUntil === 'number' && frameNow >= st.cooldownUntil) {
        st.tileX = Math.floor(Math.random() * (WORLD_MAX_TILE - WORLD_MIN_TILE + 1));
        st.tileY = Math.floor(Math.random() * (WORLD_MAX_TILE - WORLD_MIN_TILE + 1));
        const marginX = CANVAS_WIDTH / 6, marginY = CANVAS_HEIGHT / 6;
        st.position.x = marginX + Math.random() * (CANVAS_WIDTH - 2 * marginX);
        st.position.y = marginY + Math.random() * (CANVAS_HEIGHT - 2 * marginY);
        const heading = Math.random() * Math.PI * 2;
        st.vx = Math.cos(heading) * speedPxPerSec;
        st.vy = Math.sin(heading) * speedPxPerSec;
        st.active = true;
        st.cooldownUntil = undefined;
      }
      return;
    }

    if (typeof st.active !== 'boolean') st.active = true;
    if (!Number.isFinite(st.vx)) st.vx = 0;
    if (!Number.isFinite(st.vy)) st.vy = 0;

    // Advance
    if (st.active) {
      st.position.x += (st.vx || 0) * dtSec;
      st.position.y += (st.vy || 0) * dtSec;

      // Visibility/despawn rule: track on-screen presence and only become invisible
      // 120s after being fully off-screen. Reset timer if re-entering.
      const onScreen = st.position.x >= 0 && st.position.x < CANVAS_WIDTH && st.position.y >= 0 && st.position.y < CANVAS_HEIGHT;
      if (onScreen) {
        st._offscreenSince = undefined; // reset timer when visible again
      } else {
        if (typeof st._offscreenSince !== 'number') st._offscreenSince = frameNow;
      }

      // X-axis wrap/step
      if (st.position.x < 0) {
        if (st.tileX <= WORLD_MIN_TILE) {
          // Only invis after off-screen timer reaches 120s
          if (typeof st._offscreenSince === 'number' && (frameNow - st._offscreenSince) >= 120000) {
            st.active = false;
            st.cooldownUntil = frameNow + 120000;
          }
          return;
        } else {
          st.position.x += CANVAS_WIDTH;
          st.tileX -= 1;
        }
      } else if (st.position.x >= CANVAS_WIDTH) {
        if (st.tileX >= WORLD_MAX_TILE) {
          if (typeof st._offscreenSince === 'number' && (frameNow - st._offscreenSince) >= 120000) {
            st.active = false;
            st.cooldownUntil = frameNow + 120000;
          }
          return;
        } else {
          st.position.x -= CANVAS_WIDTH;
          st.tileX += 1;
        }
      }

      // Y-axis wrap/step
      if (st.position.y < 0) {
        if (st.tileY <= WORLD_MIN_TILE) {
          if (typeof st._offscreenSince === 'number' && (frameNow - st._offscreenSince) >= 120000) {
            st.active = false;
            st.cooldownUntil = frameNow + 120000;
          }
          return;
        } else {
          st.position.y += CANVAS_HEIGHT;
          st.tileY -= 1;
        }
      } else if (st.position.y >= CANVAS_HEIGHT) {
        if (st.tileY >= WORLD_MAX_TILE) {
          if (typeof st._offscreenSince === 'number' && (frameNow - st._offscreenSince) >= 120000) {
            st.active = false;
            st.cooldownUntil = frameNow + 120000;
          }
          return;
        } else {
          st.position.y -= CANVAS_HEIGHT;
          st.tileY += 1;
        }
      }
    }
  };

  advanceOne('fuel', gs.refuelStation);
  advanceOne('reward', gs.rewardShip);
}
