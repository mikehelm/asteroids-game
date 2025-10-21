import { WORLD_MIN_TILE, WORLD_MAX_TILE } from '../constants';
import { WORLD_GRID_SIZE } from '../gameLoop/constants';
import type { GameState } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../utils';

// Advance only ejected/locked bonuses across tiles; despawn at world edge
export function advanceEjectedBonuses(gameState: GameState, now: number, dt: number): void {
  void now; // timing is used only for availableAfterTs checks externally
  const gs: any = gameState as any;
  if (!Array.isArray(gs.bonuses) || gs.bonuses.length === 0) return;
  const dtSec = Math.max(0, dt) / 1000;
  for (let i = gs.bonuses.length - 1; i >= 0; i--) {
    const b: any = gs.bonuses[i];
    const isEjected = !!b.ejected || (b.ignoreTractor === true && typeof b.availableAfterTs === 'number');
    if (!isEjected) continue;
    // Kinematics
    if (b.velocity) {
      b.position.x += b.velocity.x * dtSec;
      b.position.y += b.velocity.y * dtSec;
    }
    // Screen wrap with tile step
    while (b.position.x < 0) { b.position.x += CANVAS_WIDTH; b.tileX = (b.tileX ?? gs.worldTileX ?? 0) - 1; }
    while (b.position.x >= CANVAS_WIDTH) { b.position.x -= CANVAS_WIDTH; b.tileX = (b.tileX ?? gs.worldTileX ?? 0) + 1; }
    while (b.position.y < 0) { b.position.y += CANVAS_HEIGHT; b.tileY = (b.tileY ?? gs.worldTileY ?? 0) - 1; }
    while (b.position.y >= CANVAS_HEIGHT) { b.position.y -= CANVAS_HEIGHT; b.tileY = (b.tileY ?? gs.worldTileY ?? 0) + 1; }

    // Despawn if we stepped outside the finite world bounds
    const tx = (b.tileX ?? gs.worldTileX ?? 0) as number;
    const ty = (b.tileY ?? gs.worldTileY ?? 0) as number;
    if (tx < WORLD_MIN_TILE || tx > WORLD_MAX_TILE || ty < WORLD_MIN_TILE || ty > WORLD_MAX_TILE) {
      gs.bonuses.splice(i, 1);
      continue;
    }
  }
}
