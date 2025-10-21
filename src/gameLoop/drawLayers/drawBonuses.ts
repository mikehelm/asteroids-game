import type { GameState } from '../../types';
import type { EnvLike } from '../draw';

/** Threaded environment from Game.tsx (refs/config). Render-only UI bonuses. */
export function drawBonuses(
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  _env: EnvLike
): void {
  const now = (_env as any).frameNow as number;
  const arr = (gameState as any).bonuses || [];
  const CANVAS_W = ctx.canvas.width;
  const CANVAS_H = ctx.canvas.height;
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  const sizePx = clamp(Math.min(CANVAS_W, CANVAS_H) * 0.04, 32, 48);
  const outline = 'rgba(0,0,0,0.22)';

  const drawDashedRing = (cx: number, cy: number, radius: number, color: string, alpha = 0.6) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    const prevDash = (ctx as any).getLineDash ? (ctx as any).getLineDash() : [];
    if ((ctx as any).setLineDash) (ctx as any).setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
    if ((ctx as any).setLineDash) (ctx as any).setLineDash(prevDash || []);
    ctx.restore();
  };

  for (let i = 0; i < arr.length; i++) {
    const b = arr[i] as any;
    const x = Number(b?.position?.x);
    const y = Number(b?.position?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const xi = Math.round(x);
    const yi = Math.round(y);

    const kindRaw = (b?.kind ?? b?.type ?? b?.bonusType ?? 'misc') as string;
    const kind = String(kindRaw).toLowerCase();
    const availableAfterTs = Number(b?.availableAfterTs ?? NaN);
    const locked = (Number.isFinite(availableAfterTs) && now < availableAfterTs) || b?.ignoreTractor === true;

    ctx.save();
    ctx.globalAlpha = locked ? 0.6 : 1.0;
    ctx.globalCompositeOperation = 'source-over';
    if ('filter' in (ctx as any)) (ctx as any).filter = locked ? 'saturate(60%)' : 'none';

    const fuelPulse = Math.sin(now * 0.003) * 0.02;
    const heartPulse = Math.sin(now * 0.002) * 0.02;
    const R = sizePx * (kind === 'fuel' ? 1 + fuelPulse : (kind === 'life' || kind === 'heart' || kind === 'heal') ? 1 + heartPulse : 1) * 0.5;
    const Ri = Math.round(R);

    const col = {
      fuel: '#2ee6c5',
      shield: '#4db2ff',
      missile: '#ff9d3c',
      life: '#ff4d6d',
      star: '#ffd166',
      coin: '#ffe8a3',
    } as const;

    switch (kind) {
      case 'fuel': {
        // Enhanced fuel droplet with glow
        const fuelGlow = Math.sin(now * 0.004) * 0.2 + 0.8;
        
        // Outer glow effect
        ctx.save();
        ctx.globalAlpha = 0.4 * fuelGlow;
        ctx.fillStyle = col.fuel;
        ctx.beginPath(); ctx.arc(xi, yi, Ri * 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        
        // Background circle
        ctx.fillStyle = col.coin;
        ctx.beginPath(); ctx.arc(xi, yi, Ri, 0, Math.PI * 2); ctx.fill();
        
        // Pulsing ring
        const ringPulse = 0.25 + Math.sin(now * 0.005) * 0.15;
        ctx.save();
        ctx.globalAlpha = ringPulse;
        ctx.strokeStyle = col.fuel;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(xi, yi, Ri * 1.25, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        
        // Large droplet shape
        ctx.save();
        ctx.translate(xi, yi - Ri * 0.1);
        
        // Gradient for 3D effect
        const dropGradient = ctx.createRadialGradient(-R * 0.2, -R * 0.2, 0, 0, 0, R * 0.7);
        dropGradient.addColorStop(0, '#5ffae6');
        dropGradient.addColorStop(0.5, '#2ee6c5');
        dropGradient.addColorStop(1, '#1ac5a5');
        ctx.fillStyle = dropGradient;
        
        ctx.beginPath();
        ctx.moveTo(0, -R * 0.6);
        ctx.quadraticCurveTo(R * 0.45, -R * 0.15, R * 0.35, R * 0.35);
        ctx.quadraticCurveTo(0, R * 0.65, -R * 0.35, R * 0.35);
        ctx.quadraticCurveTo(-R * 0.45, -R * 0.15, 0, -R * 0.6);
        ctx.fill();
        
        // White highlight
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.arc(-R * 0.15, -R * 0.25, R * 0.15, 0, Math.PI * 2);
        ctx.fill();
        
        // Border
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -R * 0.6);
        ctx.quadraticCurveTo(R * 0.45, -R * 0.15, R * 0.35, R * 0.35);
        ctx.quadraticCurveTo(0, R * 0.65, -R * 0.35, R * 0.35);
        ctx.quadraticCurveTo(-R * 0.45, -R * 0.15, 0, -R * 0.6);
        ctx.stroke();
        
        ctx.restore();
        break;
      }
      case 'shield': {
        // Prominent shield badge with pulsing glow
        const shieldPulse = Math.sin(now * 0.005) * 0.15 + 0.85;
        
        // Outer glow
        ctx.save();
        ctx.globalAlpha = 0.4 * shieldPulse;
        ctx.fillStyle = col.shield;
        ctx.beginPath(); ctx.arc(xi, yi, Ri * 1.3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        
        // Main shield shape (classic badge/crest)
        ctx.save();
        ctx.translate(xi, yi);
        
        // Shield fill with gradient effect
        const gradient = ctx.createRadialGradient(0, -R * 0.3, 0, 0, 0, R);
        gradient.addColorStop(0, '#6dc5ff');
        gradient.addColorStop(0.5, '#4db2ff');
        gradient.addColorStop(1, '#2a8fdf');
        ctx.fillStyle = gradient;
        
        // Shield outline path
        ctx.beginPath();
        ctx.moveTo(0, -R * 0.85);
        ctx.lineTo(R * 0.65, -R * 0.65);
        ctx.lineTo(R * 0.75, 0);
        ctx.lineTo(R * 0.65, R * 0.5);
        ctx.lineTo(0, R * 0.9);
        ctx.lineTo(-R * 0.65, R * 0.5);
        ctx.lineTo(-R * 0.75, 0);
        ctx.lineTo(-R * 0.65, -R * 0.65);
        ctx.closePath();
        ctx.fill();
        
        // Shield border
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Inner shine/highlight
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.moveTo(0, -R * 0.75);
        ctx.lineTo(R * 0.5, -R * 0.55);
        ctx.lineTo(R * 0.6, -R * 0.1);
        ctx.lineTo(0, R * 0.1);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        
        // Cross/plus symbol in center for extra clarity
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, -R * 0.4);
        ctx.lineTo(0, R * 0.4);
        ctx.moveTo(-R * 0.4, 0);
        ctx.lineTo(R * 0.4, 0);
        ctx.stroke();
        
        ctx.restore();
        break;
      }
      case 'missile':
      case 'double':
      case 'doubleshooter': {
        // Enhanced missile/rocket with prominent shape
        const missilePulse = Math.sin(now * 0.006) * 0.1 + 0.9;
        
        // Outer glow
        ctx.save();
        ctx.globalAlpha = 0.3 * missilePulse;
        ctx.fillStyle = col.missile;
        ctx.beginPath(); ctx.arc(x, y, R * 1.4, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-Math.PI / 4 + Math.sin(now * 0.003) * 0.08); // Slight rotation animation
        
        // Rocket body (main cone)
        const gradient = ctx.createLinearGradient(-R * 0.6, 0, R * 0.7, 0);
        gradient.addColorStop(0, '#ff7a3c');
        gradient.addColorStop(0.5, '#ff9d3c');
        gradient.addColorStop(1, '#ffb85c');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(R * 0.8, 0); // Tip
        ctx.lineTo(-R * 0.3, -R * 0.3);
        ctx.lineTo(-R * 0.5, 0);
        ctx.lineTo(-R * 0.3, R * 0.3);
        ctx.closePath();
        ctx.fill();
        
        // Rocket border/outline
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Fins
        ctx.fillStyle = '#ff5a1c';
        ctx.beginPath();
        ctx.moveTo(-R * 0.3, R * 0.3);
        ctx.lineTo(-R * 0.5, R * 0.6);
        ctx.lineTo(-R * 0.5, 0);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-R * 0.3, -R * 0.3);
        ctx.lineTo(-R * 0.5, -R * 0.6);
        ctx.lineTo(-R * 0.5, 0);
        ctx.closePath();
        ctx.fill();
        
        // Flame trail (animated)
        const flameAnim = (Math.sin(now * 0.025) * 0.5 + 0.5);
        const flameLength = 0.4 + flameAnim * 0.3;
        
        // Outer flame (orange)
        ctx.fillStyle = 'rgba(255,140,60,0.8)';
        ctx.beginPath();
        ctx.moveTo(-R * 0.5, -R * 0.15);
        ctx.lineTo(-R * (0.5 + flameLength), 0);
        ctx.lineTo(-R * 0.5, R * 0.15);
        ctx.closePath();
        ctx.fill();
        
        // Inner flame (yellow/white)
        ctx.fillStyle = 'rgba(255,230,100,0.9)';
        ctx.beginPath();
        ctx.moveTo(-R * 0.5, -R * 0.08);
        ctx.lineTo(-R * (0.5 + flameLength * 0.7), 0);
        ctx.lineTo(-R * 0.5, R * 0.08);
        ctx.closePath();
        ctx.fill();
        
        // Window/cockpit detail
        ctx.fillStyle = '#4a90e2';
        ctx.beginPath();
        ctx.arc(R * 0.2, 0, R * 0.15, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
        break;
      }
      case 'life':
      case 'heart':
      case 'heal': {
        // Enhanced heart with glow and pulse
        const heartBeat = Math.abs(Math.sin(now * 0.008)) * 0.15 + 0.85;
        
        // Outer glow
        ctx.save();
        ctx.globalAlpha = 0.4 * heartBeat;
        ctx.fillStyle = col.life;
        ctx.beginPath(); ctx.arc(x, y, R * 1.6, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        
        // Background circle
        ctx.fillStyle = col.coin;
        ctx.beginPath(); ctx.arc(x, y, R * heartBeat, 0, Math.PI * 2); ctx.fill();
        
        ctx.save();
        ctx.translate(xi, yi + Ri * 0.08);
        ctx.scale(heartBeat, heartBeat);
        
        // Heart gradient for 3D effect
        const heartGradient = ctx.createRadialGradient(0, -R * 0.2, 0, 0, 0, R * 0.8);
        heartGradient.addColorStop(0, '#ff7a8d');
        heartGradient.addColorStop(0.5, '#ff4d6d');
        heartGradient.addColorStop(1, '#d93555');
        ctx.fillStyle = heartGradient;
        
        const h = R * 0.75; // Larger heart
        ctx.beginPath();
        ctx.moveTo(0, h * 0.25);
        ctx.bezierCurveTo(h * 0.95, -h * 0.25, h * 0.75, -h * 1.05, 0, -h * 0.52);
        ctx.bezierCurveTo(-h * 0.75, -h * 1.05, -h * 0.95, -h * 0.25, 0, h * 0.25);
        ctx.fill();
        
        // Heart border
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Shine highlight
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(-h * 0.25, -h * 0.35, h * 0.15, h * 0.25, Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        
        // Small cross/plus for heal indicator
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, -h * 0.15);
        ctx.lineTo(0, h * 0.1);
        ctx.moveTo(-h * 0.12, -h * 0.03);
        ctx.lineTo(h * 0.12, -h * 0.03);
        ctx.stroke();
        
        ctx.restore();
        break;
      }
      case 'score':
      case 'star':
      default: {
        ctx.fillStyle = col.coin;
        ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
        ctx.save();
        ctx.translate(x, y);
        ctx.fillStyle = col.star;
        const pts = 5, inner = R * 0.45, outer = R * 0.9;
        ctx.beginPath();
        for (let k = 0; k < pts * 2; k++) {
          const rad = (k % 2 === 0 ? outer : inner);
          const ang = (Math.PI / pts) * k - Math.PI / 2;
          const px = Math.cos(ang) * rad * 0.5;
          const py = Math.sin(ang) * rad * 0.5;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 0.28;
        ctx.rotate((now * 0.001) % (Math.PI * 2));
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, 0, Math.PI * 0.22); ctx.closePath();
        ctx.fillStyle = '#ffffff'; ctx.fill();
        ctx.restore();
        break;
      }
    }

    ctx.strokeStyle = outline;
    ctx.lineWidth = Math.min(1.25, 1);
    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.stroke();

    if (locked) drawDashedRing(xi, yi, Ri * 1.25, '#b0b0b0', 0.6);

    if ('filter' in (ctx as any)) (ctx as any).filter = 'none';
    ctx.restore();
  }
}
