import { WORLD_MIN_TILE, WORLD_MAX_TILE } from '../constants';
import { WORLD_GRID_SIZE } from '../gameLoop/constants';
import { logOnce } from '../dev/logger';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../utils';

export type Station = {
  tileX: number; tileY: number;
  position: { x: number; y: number };
  vx: number; vy: number;
  active: boolean;
};

export function createRefuelStation(): Station {
  // Place a refuel station far off-screen (several tiles away)
  const dxTiles = (Math.random() < 0.5 ? -1 : 1) * (5 + Math.floor(Math.random() * 4)); // 5..8 tiles
  const dyTiles = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.floor(Math.random() * 4)); // 4..7 tiles
  const localX = Math.random() * CANVAS_WIDTH;
  const localY = Math.random() * CANVAS_HEIGHT;
  // Clamp into finite grid 0..4
  const tx = Math.max(WORLD_MIN_TILE, Math.min(WORLD_MAX_TILE, dxTiles));
  const ty = Math.max(WORLD_MIN_TILE, Math.min(WORLD_MAX_TILE, dyTiles));
  // Seed drift speed derived from map size: cross one tile in (120 / WORLD_GRID_SIZE) seconds
  const heading = Math.random() * Math.PI * 2;
  const tileSeconds = 120 / WORLD_GRID_SIZE;
  const speedPxPerSec = CANVAS_WIDTH / tileSeconds;
  return {
    tileX: tx,
    tileY: ty,
    position: { x: localX, y: localY },
    vx: Math.cos(heading) * speedPxPerSec,
    vy: Math.sin(heading) * speedPxPerSec,
    active: true,
  } as any;
}

export function createRewardShip(): Station {
  // Spawn a reward ship off-screen as well (tiles)
  const dxTiles = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 3)); // 1..3 tiles
  const dyTiles = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 3)); // 1..3 tiles
  const localX = Math.random() * CANVAS_WIDTH;
  const localY = Math.random() * CANVAS_HEIGHT;
  const rx = Math.max(WORLD_MIN_TILE, Math.min(WORLD_MAX_TILE, dxTiles));
  const ry = Math.max(WORLD_MIN_TILE, Math.min(WORLD_MAX_TILE, dyTiles));
  const headingR = Math.random() * Math.PI * 2;
  const tileSecondsR = 120 / WORLD_GRID_SIZE;
  const speedPxPerSecR = CANVAS_WIDTH / tileSecondsR;
  return {
    tileX: rx,
    tileY: ry,
    position: { x: localX, y: localY },
    vx: Math.cos(headingR) * speedPxPerSecR,
    vy: Math.sin(headingR) * speedPxPerSecR,
    active: true,
  } as any;
}

export function devLogSpawns(station: Station | null, reward: Station | null, dev: boolean): void {
  if (!dev) return;
  try {
    const payload = {
      fuel: station && { tx: station.tileX, ty: station.tileY, x: station.position?.x, y: station.position?.y },
      reward: reward && { tx: reward.tileX, ty: reward.tileY, x: reward.position?.x, y: reward.position?.y },
    };
    logOnce('spawn:targets:init', '[spawn:targets]', payload);
  } catch {}
}
