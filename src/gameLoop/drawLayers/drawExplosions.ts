import type { GameState } from '../../types';
import type { EnvLike } from '../draw';

/** Threaded environment from Game.tsx (refs/config). Visual explosion particles. */
export function drawExplosions(
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  _env: EnvLike
): void {
  const explosions = (gameState as any).explosions as Array<any> | undefined;
  if (!explosions || explosions.length === 0) return;
  explosions.forEach(explosion => {
    const kind = (explosion && (explosion as any).kind) || '';
    if (kind === 'superUfoLite') {
      // Temporarily disable Super UFO explosion draw to eliminate dark black burst
      return;
    }

    // Default/existing path: rectangles with capped alpha
    explosion.particles.forEach((particle: any) => {
      ctx.save();
      // Cap alpha to prevent additive white-out when many particles overlap
      const baseA = 1 - (particle.life / particle.maxLife);
      ctx.globalAlpha = Math.min(0.35, baseA);
      ctx.fillStyle = particle.color;
      // Draw particles with varying sizes (shrink over time)
      const currentSize = particle.size * (1 - (particle.life / particle.maxLife) * 0.5);
      ctx.fillRect(
        particle.position.x - currentSize / 2,
        particle.position.y - currentSize / 2,
        currentSize,
        currentSize
      );
      ctx.restore();
    });
  });
}
