import type { GameState } from '../../types';
import type { EnvLike } from '../draw';

/** Threaded environment from Game.tsx (refs/config). If prefixed with _, it’s intentionally unused here. */
export function drawAlienBullets(
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  _env: EnvLike
): void {
  const env = _env as any;
  const r = env.refs || {};
  const now = (env as any).frameNow as number;
  // timing log removed to reduce console noise (no behavior change)
  // Draw alien lasers first so missiles render on top
  const lasers = (gameState as any).alienLasers as Array<any> | undefined;
  if (Array.isArray(lasers) && lasers.length > 0) {
    for (let i = 0; i < lasers.length; i++) {
      const l = lasers[i];
      if (!l) continue;
      const t = (l.life || 0) / (l.maxLife || 8);
      const alpha = Math.max(0, 1 - t);
      // Warmup cue: color ramps from orange to white during warmup entries
      const isWarmup = l.kind === 'warmup';
      ctx.save();
      if (isWarmup) {
        const u = Math.max(0, Math.min(1, t));
        // Ramp from orange to white
        const r0 = 255, g0 = 150, b0 = 40;
        const r1 = 255, g1 = 255, b1 = 255;
        const rr = Math.round(r0 + (r1 - r0) * u);
        const gg = Math.round(g0 + (g1 - g0) * u);
        const bb = Math.round(b0 + (b1 - b0) * u);
        const col = `rgba(${rr},${gg},${bb},1)`;
        // Small pulsing dot/mini line at nose
        ctx.globalAlpha = Math.min(0.85, 0.85 * (0.6 + 0.4 * Math.sin((now * 0.06) % (Math.PI * 2))));
        ctx.strokeStyle = col;
        ctx.lineWidth = (l.width || 2) * 2;
        ctx.beginPath();
        ctx.moveTo(l.from.x, l.from.y);
        ctx.lineTo(l.from.x + (l.to.x - l.from.x) * 0.06, l.from.y + (l.to.y - l.from.y) * 0.06);
        ctx.stroke();
      } else {
        // Outer soft yellow glow
        ctx.globalAlpha = Math.min(0.6, 0.6 * alpha);
        ctx.strokeStyle = 'rgba(255, 230, 120, 1)';
        ctx.lineWidth = (l.width || 2) * 3;
        ctx.beginPath();
        ctx.moveTo(l.from.x, l.from.y);
        ctx.lineTo(l.to.x, l.to.y);
        ctx.stroke();
        // Inner bright white core
        ctx.globalAlpha = Math.min(0.95, 0.9 * alpha);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = (l.width || 2);
        ctx.beginPath();
        ctx.moveTo(l.from.x, l.from.y);
        ctx.lineTo(l.to.x, l.to.y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  const bullets = (gameState as any).alienBullets || [] as any[];
  bullets.forEach((bullet: any) => {
    const isMissile = !!bullet.homing;
    const ang = Math.atan2(bullet.velocity.y, bullet.velocity.x);
    if (isMissile) {
      const isPlayer = bullet.owner === 'player';
      ctx.save();
      if (isPlayer) {
        // White missile head without costly glow
        ctx.shadowColor = '#000000';
        ctx.beginPath();
        ctx.arc(bullet.position.x, bullet.position.y, Math.max(3, bullet.radius + 1), 0, 2 * Math.PI);
        ctx.fill();
        const isExtra = !!bullet.isExtra;
        if (isExtra) {
          // Simple minimal tail for extras: short faint line, no flame/smoke
          const len = 14;
          const tailX = bullet.position.x - Math.cos(ang) * len;
          const tailY = bullet.position.y - Math.sin(ang) * len;
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          ctx.moveTo(bullet.position.x, bullet.position.y);
          ctx.lineTo(tailX, tailY);
          ctx.stroke();
        } else {
          // Primary: flame + spotty smoke along the historical path
          {
            ctx.save();
            ctx.translate(bullet.position.x, bullet.position.y);
            ctx.rotate(ang);
            const flameLen = 14 + Math.sin(now * 0.02) * 2;
            const flameWidth = 6;
            // Outer red
            let grad = ctx.createLinearGradient(0, 0, -flameLen, 0);
            grad.addColorStop(0, 'rgba(255, 180, 0, 0.95)');
            grad.addColorStop(0.6, 'rgba(255, 90, 0, 0.55)');
            grad.addColorStop(1, 'rgba(255, 0, 0, 0.0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-flameLen, flameWidth * 0.5);
            ctx.lineTo(-flameLen, -flameWidth * 0.5);
            ctx.closePath();
            ctx.fill();
            // Inner bright yellow core
            const coreLen = flameLen * 0.7;
            const coreW = flameWidth * 0.35;
            grad = ctx.createLinearGradient(0, 0, -coreLen, 0);
            grad.addColorStop(0, 'rgba(255, 255, 160, 0.95)');
            grad.addColorStop(1, 'rgba(255, 200, 0, 0.0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-coreLen, coreW * 0.5);
            ctx.lineTo(-coreLen, -coreW * 0.5);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
          const hist = (bullet as any).history as Array<{x:number,y:number}> || [];
          if (hist.length >= 2) {
            const gap = 3;
            const end = Math.max(1, hist.length - gap);
            for (let i = 0; i < end; i += 2) {
              const t = i / end;
              const size = 3.2 * (1 - t) + Math.random() * 0.8;
              const alpha = Math.max(0, 0.22 * (1 - t) + (Math.random() - 0.5) * 0.04);
              ctx.fillStyle = `rgba(235,240,255,${alpha})`;
              const jitterX = (Math.random() - 0.5) * 0.9;
              const jitterY = (Math.random() - 0.5) * 0.9;
              ctx.beginPath();
              ctx.arc(hist[i].x + jitterX, hist[i].y + jitterY, size * 0.6, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      } else {
        // Alien missile: compact red/orange head with short tail
        ctx.beginPath();
        ctx.fillStyle = '#ff5544';
        ctx.arc(bullet.position.x, bullet.position.y, Math.max(3, bullet.radius + 1), 0, 2 * Math.PI);
        ctx.fill();
        const len = 10;
        const tailX = bullet.position.x - Math.cos(ang) * len;
        const tailY = bullet.position.y - Math.sin(ang) * len;
        ctx.strokeStyle = 'rgba(255,120,60,0.85)';
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.moveTo(bullet.position.x, bullet.position.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();
      }
      // Always restore for both player and alien missiles to avoid leaking state
      ctx.restore();
    } else {
      // Non-missile bullet visual
      ctx.fillStyle = '#ff0066';
      ctx.beginPath();
      ctx.arc(bullet.position.x, bullet.position.y, bullet.radius, 0, 2 * Math.PI);
      ctx.fill();
    }
  });

  // Stage-1 fairness: off-screen missile edge pips pointing toward nearest missile
  // DEV-only beep at most every 1s per missile. No per-frame allocations.
  try {
    const CANVAS_W = (ctx.canvas.width) | 0;
    const CANVAS_H = (ctx.canvas.height) | 0;
    const bulletsArr = (gameState as any).alienBullets as any[];
    if (Array.isArray(bulletsArr) && bulletsArr.length > 0) {
      for (let i = 0; i < bulletsArr.length; i++) {
        const b = bulletsArr[i];
        if (!b || !b.homing) continue; // only missiles
        const x = b.position.x, y = b.position.y;
        const off = x < 0 || x > CANVAS_W || y < 0 || y > CANVAS_H;
        if (!off) continue;
        // Find intersection with screen border along bearing toward player center
        const cx = CANVAS_W * 0.5, cy = CANVAS_H * 0.5;
        const ang = Math.atan2(cy - y, cx - x);
        // Ray to border
        const cos = Math.cos(ang), sin = Math.sin(ang);
        let tEdge = 1e9, ex = cx, ey = cy;
        if (cos !== 0) {
          const t1 = (0 - x) / cos; if (t1 > 0) { const yy = y + sin * t1; if (yy >= 0 && yy <= CANVAS_H && t1 < tEdge) { tEdge = t1; ex = 0; ey = yy; } }
          const t2 = (CANVAS_W - x) / cos; if (t2 > 0) { const yy = y + sin * t2; if (yy >= 0 && yy <= CANVAS_H && t2 < tEdge) { tEdge = t2; ex = CANVAS_W; ey = yy; } }
        }
        if (sin !== 0) {
          const t3 = (0 - y) / sin; if (t3 > 0) { const xx = x + cos * t3; if (xx >= 0 && xx <= CANVAS_W && t3 < tEdge) { tEdge = t3; ex = xx; ey = 0; } }
          const t4 = (CANVAS_H - y) / sin; if (t4 > 0) { const xx = x + cos * t4; if (xx >= 0 && xx <= CANVAS_W && t4 < tEdge) { tEdge = t4; ex = xx; ey = CANVAS_H; } }
        }
        // Draw small inward pointing pip
        const age = b.life | 0;
        const fade = 0.5 + 0.5 * Math.sin(((now + i * 13) * 0.06) % (Math.PI * 2));
        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(ang);
        ctx.globalAlpha = 0.6 * fade;
        ctx.fillStyle = '#ffaa66';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(10, 4);
        ctx.lineTo(10, -4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        // DEV-only beep (max every 1s per missile)
        if ((import.meta as any)?.env?.MODE !== 'production') {
          const refs = (env && env.refs) || {};
          const lastBeep = b._edgeBeepAt || -1e9;
          if (now - lastBeep > 60) { // 60 frames ~ 1s
            try { refs.soundSystem?.playMissileWarning?.(); } catch {}
            b._edgeBeepAt = now;
          }
        }
      }
    }
  } catch { /* no-op */ }
}

/** Threaded environment from Game.tsx (refs/config). If prefixed with _, it’s intentionally unused here. */
export function drawPlayerMissiles(
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  _env: EnvLike
): void {
  const env = _env as any;
  const now = (env as any).frameNow as number;
  const missiles = (gameState as any).playerMissiles || [] as any[];
  missiles.forEach((bullet: any) => {
    const isMissile = !!bullet.homing;
    const ang = Math.atan2(bullet.velocity.y, bullet.velocity.x);
    if (isMissile) {
      const isPlayer = bullet.owner === 'player';
      ctx.save();
      if (isPlayer) {
        // White missile head without costly glow
        ctx.shadowColor = '#000000';
        ctx.beginPath();
        ctx.arc(bullet.position.x, bullet.position.y, Math.max(3, bullet.radius + 1), 0, 2 * Math.PI);
        ctx.fill();
        const isExtra = !!bullet.isExtra;
        if (isExtra) {
          const len = 14;
          const tailX = bullet.position.x - Math.cos(ang) * len;
          const tailY = bullet.position.y - Math.sin(ang) * len;
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          ctx.moveTo(bullet.position.x, bullet.position.y);
          ctx.lineTo(tailX, tailY);
          ctx.stroke();
        } else {
          // Primary: flame + spotty smoke along the historical path
          {
            ctx.save();
            ctx.translate(bullet.position.x, bullet.position.y);
            ctx.rotate(ang);
            const flameLen = 14 + Math.sin(now * 0.02) * 2;
            const flameWidth = 6;
            let grad = ctx.createLinearGradient(0, 0, -flameLen, 0);
            grad.addColorStop(0, 'rgba(255, 180, 0, 0.95)');
            grad.addColorStop(0.6, 'rgba(255, 90, 0, 0.55)');
            grad.addColorStop(1, 'rgba(255, 0, 0, 0.0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-flameLen, flameWidth * 0.5);
            ctx.lineTo(-flameLen, -flameWidth * 0.5);
            ctx.closePath();
            ctx.fill();
            const coreLen = flameLen * 0.7;
            const coreW = flameWidth * 0.35;
            grad = ctx.createLinearGradient(0, 0, -coreLen, 0);
            grad.addColorStop(0, 'rgba(255, 255, 160, 0.95)');
            grad.addColorStop(1, 'rgba(255, 200, 0, 0.0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-coreLen, coreW * 0.5);
            ctx.lineTo(-coreLen, -coreW * 0.5);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
          const hist = (bullet as any).history as Array<{x:number,y:number}> || [];
          if (hist.length >= 2) {
            const gap = 3;
            const end = Math.max(1, hist.length - gap);
            for (let i = 0; i < end; i += 2) {
              const t = i / end;
              const size = 3.2 * (1 - t) + Math.random() * 0.8;
              const alpha = Math.max(0, 0.22 * (1 - t) + (Math.random() - 0.5) * 0.04);
              ctx.fillStyle = `rgba(235,240,255,${alpha})`;
              const jitterX = (Math.random() - 0.5) * 0.9;
              const jitterY = (Math.random() - 0.5) * 0.9;
              ctx.beginPath();
              ctx.arc(hist[i].x + jitterX, hist[i].y + jitterY, size * 0.6, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
    } else {
      // Non-missile style is not expected for player missiles; fallback draw
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(bullet.position.x, bullet.position.y, bullet.radius, 0, 2 * Math.PI);
      ctx.fill();
    }
  });
}

/** Threaded environment from Game.tsx (refs/config). If prefixed with _, it’s intentionally unused here. */
export function drawBullets(
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  _env: EnvLike
): void {
  ctx.fillStyle = '#ffff00';
  gameState.bullets.forEach(bullet => {
    ctx.beginPath();
    ctx.arc(bullet.position.x, bullet.position.y, bullet.radius, 0, 2 * Math.PI);
    ctx.fill();
  });
}
