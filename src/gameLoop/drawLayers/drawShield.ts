import type { GameState } from '../../types';
import type { EnvLike } from '../draw';

// Subtle shield: soft rim + faint hex ripples. Overlay-only, uses env.frameNow.
export function drawShield(
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  env: EnvLike
): void {
  // Optional graceful degrade: skip shield when scene is very busy
  if (Array.isArray((gameState as any).explosions) && (gameState as any).explosions.length > 8) return;
  const p: any = (gameState as any).player;
  const hasShield = (p?.shieldTime ?? 0) > 0 || (p?.invulnerable ?? 0) > 0;
  if (!hasShield) return;

  const x = p.position.x;
  const y = p.position.y;
  const baseR = Math.max(18, p.radius ? p.radius + 6 : 28);
  const now = (env as any).frameNow as number | undefined;
  const t = (now || 0) * 0.0012; // animation rate (frameNow-based)

  ctx.save();
  ctx.translate(x, y);

  // Soft outer rim
  const rim = ctx.createRadialGradient(0, 0, baseR * 0.65, 0, 0, baseR * 1.25);
  rim.addColorStop(0, 'rgba(140, 255, 240, 0.10)');
  rim.addColorStop(1, 'rgba(140, 255, 240, 0.0)');
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(0, 0, baseR * 1.25, 0, Math.PI * 2);
  ctx.fill();

  // Faint hex grid ripples
  ctx.save();
  ctx.globalAlpha *= 0.55;
  const cell = 10;
  const hexH = Math.sin(Math.PI / 3) * cell;
  const cols = Math.ceil((baseR * 2) / cell) + 2;
  const rows = Math.ceil((baseR * 2) / hexH) + 2;
  ctx.strokeStyle = 'rgba(120, 240, 220, 0.25)';
  ctx.lineWidth = 0.8;

  // Clip to shield circle so we don't overdraw
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, baseR, 0, Math.PI * 2);
  ctx.clip();

  // Offset for ripple motion
  const ox = (Math.sin(t * 2.1) * 0.5 + 0.5) * cell;
  const oy = (Math.cos(t * 1.7) * 0.5 + 0.5) * hexH;

  for (let r = -rows; r <= rows; r++) {
    for (let c = -cols; c <= cols; c++) {
      const x0 = (c + (r % 2 ? 0.5 : 0)) * cell - baseR + ox;
      const y0 = r * hexH - baseR + oy;
      // Draw small hex cell
      const rad = cell * 0.5;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 3 * i + Math.PI / 6;
        const px = x0 + Math.cos(a) * rad;
        const py = y0 + Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore(); // clip
  ctx.restore(); // grid alpha

  // Inner highlight ring (subtle)
  ctx.strokeStyle = 'rgba(200,255,250,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, baseR * (0.82 + 0.02 * Math.sin(t * 2)), 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}
