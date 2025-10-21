import type { GameState, Asteroid, Vector2, VisualDebris } from '../types';
import { getFxConfig } from './fxConfig';

export type DebrisPalette = {
  dust: string;
  chunk: string;
  chunkEdge?: string | null;
};

function rand(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pushDebris(gs: GameState, d: VisualDebris & { edgeColor?: string }): void {
  if (!gs.visualDebris) gs.visualDebris = [];
  (gs.visualDebris as Array<VisualDebris & { edgeColor?: string }>).push(d);
}

export function chooseAsteroidDebrisPalette(asteroid: Asteroid, isArtifact?: boolean): DebrisPalette {
  if (isArtifact) {
    return { dust: '#2b2b2b', chunk: '#333333', chunkEdge: '#7a0d0d' };
  }
  // Regular grays scaled by size
  if (asteroid.size === 'large') return { dust: '#777777', chunk: '#888888' };
  if (asteroid.size === 'medium') return { dust: '#999999', chunk: '#aaaaaa' };
  return { dust: '#bbbbbb', chunk: '#cccccc' };
}

export function spawnImpactDebris(args: {
  gs: GameState;
  at: Vector2;
  baseVelocity?: Vector2;
  countDust: number;
  countChunks: number;
  lifeMul?: number;
  speedMul?: number;
  palette: DebrisPalette;
  // Optional env for dev-only FX config overrides
  env?: { refs?: any } | null;
}): void {
  const { gs, at, baseVelocity, countDust, countChunks, lifeMul = 1, speedMul = 1, palette, env } = args;
  const cfg = getFxConfig(env || undefined);
  const bv = baseVelocity ?? { x: 0, y: 0 };
  // Apply spawn scaling (defaults to 1, preserves visuals)
  const dustN = Math.max(0, Math.floor(countDust * cfg.debrisSpawnScale));
  const chunkN = Math.max(0, Math.floor(countChunks * cfg.debrisSpawnScale));
  // Dust
  for (let i = 0; i < dustN; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = (1.0 + Math.random() * 2.0) * speedMul;
    const vx = Math.cos(ang) * spd + bv.x * 0.2;
    const vy = Math.sin(ang) * spd + bv.y * 0.2;
    const maxLife = Math.floor((100 + Math.random() * 100) * lifeMul);
    pushDebris(gs, {
      position: { x: at.x, y: at.y },
      velocity: { x: vx, y: vy },
      life: 0,
      maxLife,
      size: 1 + Math.random() * 2,
      color: palette.dust,
      kind: 'dust',
    });
  }
  // Chunks
  for (let i = 0; i < chunkN; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = (1.2 + Math.random() * 2.8) * speedMul;
    const vx = Math.cos(ang) * spd + bv.x * 0.25;
    const vy = Math.sin(ang) * spd + bv.y * 0.25;
    const maxLife = Math.floor((140 + Math.random() * 180) * lifeMul);
    const rotation = Math.random() * Math.PI * 2;
    const rotationSpeed = (Math.random() - 0.5) * 0.12;
    const d: VisualDebris & { edgeColor?: string } = {
      position: { x: at.x, y: at.y },
      velocity: { x: vx, y: vy },
      life: 0,
      maxLife,
      size: 2 + Math.random() * 4,
      color: palette.chunk,
      kind: 'chunk',
      rotation,
      rotationSpeed,
    };
    if (palette.chunkEdge && Math.random() < 0.35) d.edgeColor = palette.chunkEdge;
    pushDebris(gs, d);
  }
  // Enforce global debris cap after spawning; drop oldest if over budget
  try {
    const arr = (gs as any).visualDebris as Array<VisualDebris> | undefined;
    if (arr && arr.length > cfg.debrisMaxChunks) {
      const drop = arr.length - cfg.debrisMaxChunks;
      if (drop > 0) arr.splice(0, drop);
    }
  } catch { /* ignore */ }
}

export function markArtifactEdgeGlow(artifact: Asteroid, now: number, contactAngle: number, durationMs: number): void {
  (artifact as any).edgeGlowUntil = now + durationMs;
  (artifact as any).edgeGlowAngle = contactAngle;
}
