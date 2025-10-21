import type { GameState } from '../../types';
import type { EnvLike } from '../draw';
import { hash32, clamp } from './drawUtils';
import { getFxConfig } from '../fxConfig';

// Starfield update/draw extracted from Game.tsx. Requires refs provided in env.refs.
/** Threaded environment from Game.tsx (refs/config). If prefixed with _, it’s intentionally unused here. */
export function drawStars(
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  env: EnvLike,
  bgMap: unknown
): void {
  const r = env.refs as any;
  const cfg = getFxConfig(env as any);
  const now = (env as any).frameNow as number;
  const CANVAS_WIDTH = ctx.canvas.width;
  const CANVAS_HEIGHT = ctx.canvas.height;

  // Seed stars once if not provided by Game.tsx (safety net to avoid flicker)
  if (!r.starsRef || !r.starsRef.current) {
    r.starsRef = { current: [] };
  }
  if (r.starsRef.current.length === 0) {
    const count = Math.max(150, Math.round((ctx.canvas.width * ctx.canvas.height) / (800 * 600) * 200));
    const arr: Array<any> = [];
    for (let i = 0; i < count; i++) {
      const seed = (i * 2654435761) >>> 0; // Knuth constant
      const base = 0.65 + 0.3 * hash32(seed ^ 0x1);
      const amp  = 0.10 + 0.15 * hash32(seed ^ 0x2);
      const freq = 0.8  + 1.8  * hash32(seed ^ 0x3); // Hz-ish
      const phase= 6.28318 * hash32(seed ^ 0x4);     // 0..2π
      arr.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT,
        brightness: 0.3 + Math.random() * 0.7, // retained for compatibility; not used for twinkle alpha
        twinkleSpeed: 0.02 + Math.random() * 0.03, // retained for compatibility
        base, amp, freq, phase,
      });
    }
    r.starsRef.current = arr;
  }

  // Stable twinkle clock (relative to first use)
  const starClockStart = (r.starClockStartRef?.current != null)
    ? r.starClockStartRef.current
    : ((r.starClockStartRef = { current: now }), now);
  const t = now - starClockStart;
  void t; // currently only used for stability; keep for parity

  // Update dynamic stars with parallax and twinkling
  if (gameState.gameRunning) {
    const shipVelocity = gameState.player.velocity;
    const moving = Math.hypot(shipVelocity.x, shipVelocity.y) > 0.01;
    const speedFactor = moving ? 2.0 : 1.0; // 2x when flying
    r.starsRef.current.forEach((star: any) => {
      const moveFactorX = 0.1 * speedFactor;
      const moveFactorY = 0.1 * speedFactor;
      star.x -= shipVelocity.x * moveFactorX;
      star.y -= shipVelocity.y * moveFactorY;
      // Wrap
      if (star.x < 0) star.x += CANVAS_WIDTH;
      if (star.x > CANVAS_WIDTH) star.x -= CANVAS_WIDTH;
      if (star.y < 0) star.y += CANVAS_HEIGHT;
      if (star.y > CANVAS_HEIGHT) star.y -= CANVAS_HEIGHT;
    });
  }

  // Draw stars as white only with gentle twinkle; during warp keep points dim (streaks handled below)
  const bgData = r.bgImageDataRef.current as ImageData | null;
  const map = bgMap as any;
  const centerX = CANVAS_WIDTH / 2;
  const centerY = CANVAS_HEIGHT / 2;
  r.starsRef.current.forEach((star: any, i: number) => {
    // Mask: only draw if underlying bg pixel is dark
    let draw = true;
    if (bgData && map) {
      const u = map.sx + (star.x / CANVAS_WIDTH) * map.sw;
      const v = map.sy + (star.y / CANVAS_HEIGHT) * map.sh;
      const ix = Math.max(0, Math.min(map.iw - 1, Math.floor(u)));
      const iy = Math.max(0, Math.min(map.ih - 1, Math.floor(v)));
      const idx = (iy * map.iw + ix) * 4;
      const rr = bgData.data[idx];
      const gg = bgData.data[idx + 1];
      const bb = bgData.data[idx + 2];
      const luma = (0.2126 * rr + 0.7152 * gg + 0.0722 * bb) / 255;
      draw = luma < 0.20; // only in dark zones
    }
    if (!draw) return;

    const warp = gameState.warpEffect;
    // Twinkle phase uses env.frameNow only; no new timing sources
    const offset = hash32(i) * Math.PI * 2;
    const phase = now * star.twinkleSpeed + offset;
    const base = 0.5 + 0.5 * Math.sin(phase);
    const mod = 0.5 + (base - 0.5) * (cfg.twinkleIntensity ?? 1);
    const alpha = clamp(0.25 + 0.75 * mod * star.brightness, 0.15, 1);
    const size = (warp > 0) ? 1 : (star.brightness > 0.8 ? 2 : 1);
    ctx.fillStyle = `rgba(255,255,255,${warp > 0 ? Math.min(0.6, alpha * 0.6) : alpha})`;
    ctx.fillRect(star.x, star.y, size, size);
  });

  // Warp particles: spawn from center and fly outward to simulate passing stars
  if (gameState.warpEffect > 0) {
    // Limit warp particle effect to 2 seconds from level end start
    const sinceLevelEnd = r.levelEndStartRef.current > 0 ? (now - r.levelEndStartRef.current) : 0;
    if (sinceLevelEnd > 2000) {
      // Past 2 seconds: stop spawning/drawing particles
      if (r.warpParticlesRef.current.length) r.warpParticlesRef.current.length = 0;
    } else {
      // Easing for spawn and speed so it starts slow and accelerates
      const tWarp = Math.max(0, Math.min(1, gameState.warpEffect));
      const easeIn = (x: number) => x * x;
      const eased = easeIn(tWarp);
      // Reduce further: about 35% of previous, scaled by easing
      const spawnCount = Math.floor((30 + tWarp * 90) * 0.35 * Math.max(0.4, eased));
      for (let i = 0; i < spawnCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        // Start slow, accelerate with eased t
        const speed = 4 + eased * 26 + Math.random() * 5;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        // Spawn with a hole in the middle (ring start radius)
        const holeR = 50; // radius of central hole
        const rr = holeR + Math.random() * 20; // start outside the hole with small jitter band
        const x = centerX + Math.cos(angle) * rr;
        const y = centerY + Math.sin(angle) * rr;
        // Slightly shorter lifetimes so they fade sooner in the distance
        r.warpParticlesRef.current.push({ x, y, vx, vy, life: 0, maxLife: 12 + Math.floor(Math.random() * 6), prevX: x, prevY: y });
      }
      // Update and draw
      ctx.strokeStyle = '#ffffff';
      // Local effect params
      const effWarp = r.effectsApplyRef.current;
      const fxAlpha = Math.max(0, Math.min(1, r.bgOpacityRef.current));
      const fxC = Math.max(0.0, r.bgContrastRef.current);
      const fxB = Math.max(0.0, r.bgBrightnessRef.current);
      // Apply effects to warp trails if enabled
      const baseWarpAlpha = effWarp.warpTrails ? fxAlpha : 1;
      if (effWarp.warpTrails && (cfg.enableShadows !== false)) {
        ctx.save();
        (ctx as any).filter = `contrast(${fxC * 100}%) brightness(${fxB * 100}%)`;
      }
      for (let i = r.warpParticlesRef.current.length - 1; i >= 0; i--) {
        const p = r.warpParticlesRef.current[i];
        p.prevX = p.x; p.prevY = p.y;
        p.x += p.vx; p.y += p.vy;
        p.life++;
        // Remove if off-screen or life exceeded
        const off = p.x < -20 || p.x > CANVAS_WIDTH + 20 || p.y < -20 || p.y > CANVAS_HEIGHT + 20;
        if (p.life > p.maxLife || off) {
          r.warpParticlesRef.current.splice(i, 1);
          continue;
        }
        // Alpha tapers with life; small streak from previous to current
        const t2 = p.life / p.maxLife;
        let alpha = Math.max(0, 1 - t2) * Math.min(1, 0.4 + eased * 0.6);
        // Fade at edges of screen
        const edgeFade = 80; // px fade width at edges
        const dxEdge = Math.min(p.x, CANVAS_WIDTH - p.x);
        const dyEdge = Math.min(p.y, CANVAS_HEIGHT - p.y);
        const edgeFactor = Math.max(0, Math.min(1, Math.min(dxEdge, dyEdge) / edgeFade));
        alpha *= edgeFactor;
        ctx.globalAlpha = alpha * baseWarpAlpha;
        ctx.lineWidth = 1 + Math.min(2, eased * 1.2);
        // Shorter streak: draw only a fraction behind current position to avoid long smears
        const sx = p.x - p.vx * 0.4;
        const sy = p.y - p.vy * 0.4;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (effWarp.warpTrails && (cfg.enableShadows !== false)) {
        ctx.restore();
      }
    }
  } else if (r.warpParticlesRef.current.length) {
    // Clear any leftovers when not in warp
    r.warpParticlesRef.current.length = 0;
  }

  // Remove secondary/colored distant stars layer: nothing else to draw here
}
