import type { GameState } from '../../types';
import type { EnvLike } from '../draw';

// Visual-only debris rendering (moved from Game.tsx)
/** Threaded environment from Game.tsx (refs/config). If prefixed with _, it’s intentionally unused here. */
export function drawDebris(
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  _env: EnvLike
): void {
  const arr = (gameState as any).visualDebris as Array<any> | undefined;
  if (!arr || arr.length === 0) return;
  for (let i = arr.length - 1; i >= 0; i--) {
    const d = arr[i] as any;
    if (!d || !d.position || !d.velocity) { arr.splice(i, 1); continue; }
    const t = d.life / d.maxLife;
    const alpha = Math.max(0, 1 - t); // fade out
    ctx.save();
    ctx.globalAlpha = alpha * 0.9;
    ctx.translate(d.position.x, d.position.y);
    if (d.kind === 'chunk') {
      ctx.rotate(d.rotation ?? 0);
      ctx.fillStyle = d.color;
      ctx.beginPath();
      const s = d.size;
      ctx.moveTo(-s, -s * 0.6);
      ctx.lineTo(s * 0.8, -s * 0.4);
      ctx.lineTo(s, s * 0.5);
      ctx.lineTo(-s * 0.5, s * 0.7);
      ctx.closePath();
      ctx.fill();
      // Optional edge accent (artifact)
      if ((d as any).edgeColor) {
        ctx.strokeStyle = (d as any).edgeColor as string;
        ctx.lineWidth = 1;
        ctx.globalAlpha = alpha * 0.9;
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(0, 0, d.size * (0.8 + 0.4 * Math.random()), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
