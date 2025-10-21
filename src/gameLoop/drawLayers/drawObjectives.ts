import type { GameState } from '../../types';
import { WORLD_MIN_TILE, WORLD_MAX_TILE, MINIMAP_WIDTH, MINIMAP_HEIGHT, MINIMAP_MARGIN_X, MINIMAP_MARGIN_Y, MINIMAP_BG_ALPHA, MINIMAP_BORDER } from '../../constants';
import { WORLD_GRID_SIZE } from '../../gameLoop/constants';
import type { EnvLike } from '../draw';
import { clamp, drawDashedRing, resetCanvasState } from './drawUtils';

// UI-only minimap (no gameplay/timing changes)
export function drawMiniMap(
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  _env: EnvLike
): void {
  const x0 = ctx.canvas.width - MINIMAP_MARGIN_X - MINIMAP_WIDTH;
  const y0 = MINIMAP_MARGIN_Y;

  ctx.save();
  const prevA = ctx.globalAlpha;
  const uiMul = 0.5; // preserve existing background behavior for minimap background only
  ctx.globalAlpha = prevA * MINIMAP_BG_ALPHA * uiMul;
  ctx.fillStyle = '#000000';
  ctx.fillRect(x0, y0, MINIMAP_WIDTH, MINIMAP_HEIGHT);
  // Outline at 25% opacity (overlay-only), scoped to border only
  ctx.save();
  ctx.globalAlpha = prevA * 0.25;
  ctx.lineWidth = MINIMAP_BORDER;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeRect(x0 + MINIMAP_BORDER * 0.5, y0 + MINIMAP_BORDER * 0.5, MINIMAP_WIDTH - MINIMAP_BORDER, MINIMAP_HEIGHT - MINIMAP_BORDER);
  ctx.restore();

  const clamp01 = (v: number) => clamp(v, 0, 1);
  const N = clamp(WORLD_GRID_SIZE, 1, 9);
  const cellW = MINIMAP_WIDTH / N;
  const cellH = MINIMAP_HEIGHT / N;
  // Grid at 20% opacity
  ctx.save();
  ctx.globalAlpha = prevA * 0.2;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  for (let i = 1; i < N; i++) {
    const gx = x0 + i * cellW;
    const gy = y0 + i * cellH;
    ctx.beginPath(); ctx.moveTo(gx, y0); ctx.lineTo(gx, y0 + MINIMAP_HEIGHT); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0, gy); ctx.lineTo(x0 + MINIMAP_WIDTH, gy); ctx.stroke();
  }
  ctx.restore();

  const txRaw = (gameState.worldTileX ?? 0) as number;
  const tyRaw = (gameState.worldTileY ?? 0) as number;
  const tx = clamp(txRaw, WORLD_MIN_TILE, WORLD_MAX_TILE);
  const ty = clamp(tyRaw, WORLD_MIN_TILE, WORLD_MAX_TILE);
  // Current tile fill at full opacity
  ctx.save();
  ctx.globalAlpha = prevA;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x0 + tx * cellW, y0 + ty * cellH, cellW, cellH);
  ctx.restore();

  const drawMarker = (cx: number, cy: number, ring: string, dot: string, label?: string) => {
    ctx.save();
    // Outer glow for visibility
    ctx.shadowColor = ring;
    ctx.shadowBlur = 8;
    ctx.globalAlpha = prevA * 0.6;
    ctx.fillStyle = ring;
    ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill();
    
    // Bright ring
    ctx.shadowBlur = 0;
    ctx.globalAlpha = prevA;
    ctx.strokeStyle = ring;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.stroke();
    
    // Bright center dot
    ctx.fillStyle = dot;
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
    
    // Optional label
    if (label) {
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.strokeText(label, cx, cy + 10);
      ctx.fillText(label, cx, cy + 10);
    }
    ctx.restore();
  };

  const clampTile = (v: number) => clamp(v, WORLD_MIN_TILE, WORLD_MAX_TILE);
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const safePx = (v: number) => clamp(v, x0, x0 + MINIMAP_WIDTH);
  const safePy = (v: number) => clamp(v, y0, y0 + MINIMAP_HEIGHT);

  const st = (gameState as any).refuelStation as { tileX: number; tileY: number; position?: { x: number; y: number } } | undefined;
  if (st && Number.isFinite(st.tileX) && Number.isFinite(st.tileY)) {
    const sx = clampTile(st.tileX);
    const sy = clampTile(st.tileY);
    const fx = clamp((st.position?.x ?? 0) / Math.max(1, W), 0, 1);
    const fy = clamp((st.position?.y ?? 0) / Math.max(1, H), 0, 1);
    const px = safePx(x0 + sx * cellW + fx * cellW);
    const py = safePy(y0 + sy * cellH + fy * cellH);
    drawMarker(px, py, '#66d9aa', '#88ffcc', 'F');
  }

  const rw = (gameState as any).rewardShip as { tileX: number; tileY: number; position?: { x: number; y: number } } | undefined;
  if (rw && Number.isFinite(rw.tileX) && Number.isFinite(rw.tileY)) {
    const rx = clampTile(rw.tileX);
    const ry = clampTile(rw.tileY);
    const fx = clamp((rw.position?.x ?? 0) / Math.max(1, W), 0, 1);
    const fy = clamp((rw.position?.y ?? 0) / Math.max(1, H), 0, 1);
    const px = safePx(x0 + rx * cellW + fx * cellW);
    const py = safePy(y0 + ry * cellH + fy * cellH);
    drawMarker(px, py, '#cfe3ff', '#88aaff', 'R');
  }

  const fx = clamp01(gameState.player.position.x / ctx.canvas.width);
  const fy = clamp01(gameState.player.position.y / ctx.canvas.height);
  const px = x0 + tx * cellW + fx * cellW;
  const py = y0 + ty * cellH + fy * cellH;
  
  // Enhanced player marker with pulsing glow
  ctx.save();
  ctx.globalAlpha = prevA;
  
  // Outer pulsing glow
  const pulseTime = (_env as any)?.frameNow || 0;
  const pulse = 0.6 + 0.4 * Math.sin(pulseTime * 0.005);
  ctx.shadowColor = '#00ffff';
  ctx.shadowBlur = 12 * pulse;
  ctx.fillStyle = 'rgba(0, 255, 255, 0.4)';
  ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2); ctx.fill();
  
  // Bright ring
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#00ffff';
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.stroke();
  
  // Bright center
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
  
  // "YOU" label
  ctx.font = 'bold 10px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.strokeText('YOU', px, py - 10);
  ctx.fillText('YOU', px, py - 10);
  
  ctx.restore();

  const vx = gameState.player.velocity.x;
  const vy = gameState.player.velocity.y;
  const speed2 = vx * vx + vy * vy;
  if (speed2 > 0.0001) {
    const ang = Math.atan2(vy, vx);
    // Velocity arrow at full opacity
    ctx.save();
    ctx.globalAlpha = prevA;
    ctx.translate(px, py);
    ctx.rotate(ang);
    ctx.fillStyle = '#fff8c4';
    ctx.strokeStyle = '#fff1a6';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, -3);
    ctx.lineTo(-4, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

// Objectives layer (UI-only draw of refuel/reward in current tile)
export function drawObjectives(
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  env: EnvLike
): void {
  ctx.save();
  try {
    resetCanvasState(ctx);

    const now = (env as any).frameNow as number;
    const tx = gameState.worldTileX ?? 0;
    const ty = gameState.worldTileY ?? 0;
    const CANVAS_W = ctx.canvas.width;
    const CANVAS_H = ctx.canvas.height;

    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const inTileRange = (v: number) => Number.isFinite(v) && v >= WORLD_MIN_TILE && v <= WORLD_MAX_TILE;
    const safeX = (v: number) => clamp(v, 0, Math.max(0, CANVAS_W - 1));
    const safeY = (v: number) => clamp(v, 0, Math.max(0, CANVAS_H - 1));

    // Refuel Station
    {
      const st = (gameState as any).refuelStation as { tileX: number; tileY: number; position?: { x: number; y: number } } | undefined;
      const valid = !!(st && st.position && Number.isFinite(st.position.x) && Number.isFinite(st.position.y));
      const validTiles = !!(st && inTileRange(st.tileX) && inTileRange(st.tileY));
      const sameTile = !!(st && st.tileX === tx && st.tileY === ty);
      if (valid && validTiles && sameTile) {
        const sx = safeX(st!.position!.x), sy = safeY(st!.position!.y);
        ctx.save();
        ctx.translate(sx, sy);
        const pulse = 0.85 + 0.15 * Math.sin((now || 0) * 0.002);
        ctx.save();
        ctx.globalAlpha = 0.25 * pulse;
        ctx.shadowColor = '#88ffcc';
        ctx.shadowBlur = 18;
        ctx.fillStyle = '#66d9aa';
        ctx.beginPath(); ctx.arc(0, 0, 42, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.fillStyle = '#2b6e62';
        ctx.strokeStyle = '#66d9aa';
        ctx.lineWidth = 1.5;
        const hullW = 140, hullH = 68, r = 16;
        const rx = -hullW / 2, ry = -hullH / 2;
        ctx.beginPath();
        ctx.moveTo(rx + r, ry);
        ctx.lineTo(rx + hullW - r, ry);
        ctx.quadraticCurveTo(rx + hullW, ry, rx + hullW, ry + r);
        ctx.lineTo(rx + hullW, ry + hullH - r);
        ctx.quadraticCurveTo(rx + hullW, ry + hullH, rx + hullW - r, ry + hullH);
        ctx.lineTo(rx + r, ry + hullH);
        ctx.quadraticCurveTo(rx, ry + hullH, rx, ry + hullH - r);
        ctx.lineTo(rx, ry + r);
        ctx.quadraticCurveTo(rx, ry, rx + r, ry);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        ctx.save();
        ctx.fillStyle = '#1f3f3a';
        ctx.strokeStyle = '#88ffcc';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.globalAlpha = 0.7;
        ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        ctx.save();
        ctx.translate(0, -8);
        ctx.fillStyle = '#88ffcc';
        ctx.strokeStyle = '#d0ffee';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -14);
        ctx.bezierCurveTo(8, -6, 10, 0, 0, 10);
        ctx.bezierCurveTo(-10, 0, -8, -6, 0, -14);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        ctx.save();
        const blink = 0.5 + 0.5 * Math.sin((now || 0) * 0.006);
        ctx.globalAlpha = 0.4 + 0.6 * blink;
        ctx.fillStyle = '#b8ffe8';
        const lx = hullW / 2 - 10;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath(); ctx.arc(lx, i * 14, 3, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
        ctx.restore();
      }
    }

    // Reward Ship
    {
      const rw = (gameState as any).rewardShip as { tileX: number; tileY: number; position?: { x: number; y: number } } | undefined;
      const valid = !!(rw && rw.position && Number.isFinite(rw.position.x) && Number.isFinite(rw.position.y));
      const validTiles = !!(rw && inTileRange(rw.tileX) && inTileRange(rw.tileY));
      const sameTile = !!(rw && rw.tileX === tx && rw.tileY === ty);
      if (valid && validTiles && sameTile) {
        const sx = safeX(rw!.position!.x), sy = safeY(rw!.position!.y);
        ctx.save();
        ctx.translate(sx, sy);
        const breathe = 0.85 + 0.15 * Math.sin((now || 0) * 0.0025);
        ctx.save();
        ctx.globalAlpha = 0.18 * breathe;
        ctx.shadowColor = '#8fb3ff';
        ctx.shadowBlur = 16;
        ctx.fillStyle = '#3a59a6';
        ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.fillStyle = '#27437d';
        ctx.strokeStyle = '#cfe3ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(56, 0);
        ctx.lineTo(18, -22);
        ctx.quadraticCurveTo(-40, -22, -40, 0);
        ctx.quadraticCurveTo(-40, 22, 18, 22);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        ctx.save();
        ctx.fillStyle = 'rgba(180,200,255,0.25)';
        ctx.strokeStyle = '#a9c1ff';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); (ctx as any).roundRect?.(-36, -14, 24, 28, 6 as any);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        ctx.save();
        ctx.translate(4, 0);
        ctx.fillStyle = '#d6e6ff';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        const starR = 10, starR2 = 4;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const ang = (-Math.PI / 2) + i * (Math.PI / 5);
          const ruse = (i % 2 === 0) ? starR : starR2;
          const x = Math.cos(ang) * ruse;
          const y = Math.sin(ang) * ruse;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        ctx.save();
        const blink2 = 0.5 + 0.5 * Math.sin((now || 0) * 0.0065);
        ctx.globalAlpha = 0.4 + 0.6 * blink2;
        ctx.fillStyle = '#bfd4ff';
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath(); ctx.arc(40, i * 12, 3, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
        ctx.restore();
      }
    }

    // UI-only: Fuel percent above player while docked
    try {
      const dock: any = (gameState as any).dock;
      if (dock && dock.kind === 'refuel' && dock.phase === 'docked') {
        const ply: any = (gameState as any).player;
        const px = Number(ply?.position?.x);
        const py = Number(ply?.position?.y);
        const fuel = Number(ply?.fuel ?? 0);
        const maxFuel = Math.max(1, Number(ply?.maxFuel ?? 1));
        if (Number.isFinite(px) && Number.isFinite(py)) {
          const pct = Math.round(100 * Math.max(0, Math.min(1, fuel / maxFuel)));
          const fade = Math.max(0, Math.min(1, ((env as any)?.frameNow - (dock.startedAt ?? 0)) / 250));
          ctx.save();
          ctx.translate(px, py - 24);
          ctx.globalAlpha = 0.2 + 0.8 * fade;
          ctx.font = 'bold 14px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillStyle = '#d6ffe6';
          ctx.strokeStyle = 'rgba(0,0,0,0.6)';
          ctx.lineWidth = 3;
          const text = `Fuel: ${pct}% ↑`;
          ctx.strokeText(text, 0, 0);
          ctx.fillText(text, 0, 0);
          ctx.restore();
        }
      }
    } catch {}
  } finally {
    ctx.restore();
  }
}
