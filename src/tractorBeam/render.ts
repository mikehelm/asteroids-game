import { beamUi } from '../config/beamUi';
import type { TractorBeamState } from '../types';
import type { HasGridScan } from './state';
// Minimal canvas render helpers for tractor beam overlays
// These draw nothing by default to keep gameplay visuals unchanged.

// Local render state composed from strong types + optional UI fields used by renderer only
type RenderState = TractorBeamState & HasGridScan & {
  // decode timings used by renderer
  decodeStartTime?: number;
  decodeDoneTime?: number;
  // stage may be provided directly or via gameState
  stage?: number;
  gameState?: { stage?: number };
  // drifting text start time (optional)
  textDropStart?: number;
};

export function renderTractorOverlay(
  ctx: CanvasRenderingContext2D,
  state: RenderState,
  now: number,
): void {
  if (!state.active) return;
  
  ctx.save();
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = '#00ffff';
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'center';
  
  let text = '';
  
  if (state.phase === 'approaching') {
    text = 'APPROACHING';
  } else if (state.phase === 'locking') {
    text = 'LOCKING';
  } else if (state.phase === 'attached') {
    text = 'ATTACHED';
  } else if (state.phase === 'displaying') {
    text = 'ANALYZING';
  }
  // --- Near-asteroid status label with edge-aware placement ---
  // Only draw if we have text to show (skip empty label during pushing phase)
  if (state.targetAsteroid && text) {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const a = state.targetAsteroid;
    const ax = a.position.x;
    const ay = a.position.y;
    const ar = a.radius || 28;

    // Base text styling (reuse previous font/outline/shadow)
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Measure and set clamps
    const metrics = ctx.measureText(text);
    const textW = Math.max(64, metrics.width);
    const margin = 10;
    const padX = 8, padY = 6;

    // Prefer above; if too close to top, place below
    let px = ax;
    let py = ay - (ar + 18);
    if (py - padY - margin < 0) {
      py = ay + (ar + 18);
    }
    if (py + padY + margin > h) {
      py = Math.max(margin + padY, ay - (ar + 18));
    }

    // Side placement if near left/right edges (toward canvas center)
    const nearLeft = ax < w * 0.22;
    const nearRight = ax > w * 0.78;
    if (nearLeft || nearRight) {
      if (nearLeft) {
        ctx.textAlign = 'left';
        px = Math.min(ax + ar + 18, w - margin - textW);
      } else {
        ctx.textAlign = 'right';
        px = Math.max(ax - (ar + 18), margin + textW);
      }
      // Keep vertical on screen
      py = Math.max(margin + padY, Math.min(h - margin - padY, ay));
    }

    // Clamp when centered alignment
    if (ctx.textAlign === 'center') {
      px = Math.max(margin + textW * 0.5, Math.min(w - margin - textW * 0.5, px));
    }

    // Leader line from asteroid edge to label
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = '#66e0ff';
    ctx.lineWidth = 1.5;
    const vx = px - ax;
    const vy = py - ay;
    const vd = Math.hypot(vx, vy) || 1;
    const ux = vx / vd, uy = vy / vd;
    const ex = ax + ux * (ar + 6);
    const ey = ay + uy * (ar + 6);
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.restore();

    // Background pill for readability
    const pillW = textW + padX * 2;
    const pillH = 22 + padY * 2;
    const pillX = (ctx.textAlign === 'left') ? px : (ctx.textAlign === 'right') ? px - pillW : px - pillW / 2;
    const pillY = py - pillH / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    const r = 10;
    ctx.beginPath();
    ctx.moveTo(pillX + r, pillY);
    ctx.lineTo(pillX + pillW - r, pillY);
    ctx.quadraticCurveTo(pillX + pillW, pillY, pillX + pillW, pillY + r);
    ctx.lineTo(pillX + pillW, pillY + pillH - r);
    ctx.quadraticCurveTo(pillX + pillW, pillY + pillH, pillX + pillW - r, pillY + pillH);
    ctx.lineTo(pillX + r, pillY + pillH);
    ctx.quadraticCurveTo(pillX, pillY + pillH, pillX, pillY + pillH - r);
    ctx.lineTo(pillX, pillY + r);
    ctx.quadraticCurveTo(pillX, pillY, pillX + r, pillY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Text (outline + fill) — keep existing cyan styling
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.95;
    ctx.strokeText(text, px, py);
    ctx.fillStyle = '#00ffff';
    ctx.globalAlpha = 1;
    ctx.fillText(text, px, py);
  }
  
  // Data link FX: packets flowing between ship (predicted orbit point) and asteroid
  if ((state.phase === 'attached' || state.phase === 'displaying') && state.targetAsteroid) {
    const ax = state.targetAsteroid.position.x;
    const ay = state.targetAsteroid.position.y;
    const oa = state.orbitAngle ?? 0;
    const or = state.orbitRadius ?? ((state.targetAsteroid.radius ?? 28) + 40);
    const sx = ax + Math.cos(oa) * or;
    const sy = ay + Math.sin(oa) * or;

    ctx.save();
    // faint beam line
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = '#66e0ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ax, ay);
    ctx.stroke();

    // moving packets (both directions)
    const segs = 8;
    for (let i = 0; i < segs; i++) {
      const t = ((now * 0.002 + i / segs) % 1);
      const u = ((now * 0.0025 + i / segs) % 1);
      const px1 = sx + (ax - sx) * t;
      const py1 = sy + (ay - sy) * t;
      const px2 = ax + (sx - ax) * u;
      const py2 = ay + (sy - ay) * u;

      ctx.globalAlpha = 0.5;
      ctx.fillStyle = (i & 1) ? '#b3ecff' : '#80dfff';
      ctx.beginPath(); ctx.arc(px1, py1, 2, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.arc(px2, py2, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  
  // Scan grid
  renderScanGrid(ctx, state, now);
  
  ctx.restore();
}

export function renderScanGrid(ctx: CanvasRenderingContext2D, state: RenderState, now: number): void {
  const g = state.gridScan;
  if (!g || !g.active || !state.targetAsteroid) return;
  const a = state.targetAsteroid;
  const ax = a.position.x, ay = a.position.y;
  const r = (a.radius ?? 28);
  const cols = g.cols, rows = g.rows;
  const size = (r * 2) / Math.max(cols, rows);
  const left = ax - r;
  const top = ay - r;

  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(a.rotation);
  
  // Clip to asteroid's actual shape if available, otherwise use circle
  const anyAst = a as typeof a & { shapePoints?: Array<{x:number,y:number}> };
  ctx.beginPath();
  if (anyAst.shapePoints && anyAst.shapePoints.length > 0) {
    // Use asteroid's actual polygon shape for clipping
    anyAst.shapePoints.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
  } else {
    // Fallback to circle
    ctx.arc(0, 0, r, 0, Math.PI * 2);
  }
  ctx.clip();
  
  // Reset transform for grid drawing
  ctx.rotate(-a.rotation);
  ctx.translate(-ax, -ay);
  
  ctx.setLineDash([3, 4]);
  ctx.lineDashOffset = (now * 0.05) % 8;
  ctx.strokeStyle = 'rgba(120, 255, 160, 0.5)'; // 50% transparent
  ctx.lineWidth = 1;
  for (let i = 0; i <= cols; i++) {
    const x = left + i * size;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + rows * size);
    ctx.stroke();
  }
  for (let i = 0; i <= rows; i++) {
    const y = top + i * size;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left + cols * size, y);
    ctx.stroke();
  }

  if (g.retracting) {
    const t = Math.min(1, (now - (g.retractStart ?? now)) / 600);
    ctx.globalAlpha = Math.max(0, 1 - t);
  }

  ctx.restore();
}

export function renderFlipit(
  ctx: CanvasRenderingContext2D,
  state: RenderState,
  now: number,
  canvasWidth: number,
  canvasHeight: number,
): void {
  if (!state || !state.active) return;

  ctx.save();
  
  // Displaying phase: slower decode to % then ×stage, then final combined linger
  if (state.phase === 'displaying' && typeof state.flipitChance === 'number') {
    // Decode UI: glyphs resolve to %, then ×stage, then combined result
    const GLYPHS = 'ᚠᚢᚦᚨᚱᚲᛃᛇᛉᛊᛏᛒᛖᛗᛚᛝᛟᛞ01ƖƷ7ΣΛЖΨ◊⌁';
    const revealText = (target: string, elapsed: number, dur: number) => {
      const n = target.length;
      const p = Math.min(1, elapsed / dur);
      const reveal = Math.floor(n * p);
      let s = '';
      for (let i = 0; i < n; i++) {
        if (i < reveal) s += target[i];
        else s += GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      return s;
    };

    // Centralized decode config
    const DECODE_DURATION_MS = 2000; // 2 seconds decode
    const MULTIPLIER_DELAY_MS = beamUi.MULTIPLIER_DELAY_MS;
    const FINAL_STAY_MS = 5000; // 5 seconds linger
    const FADE_DURATION_MS = 1000; // 1 second fade
    const FADE_EARLIER_MS = 2000; // 2 second fade for percent and multiplier
    const FINAL_DRIFT_PX = beamUi.FINAL_DRIFT_PX;

    const cx = (ctx.canvas?.width ?? canvasWidth) / 2;
    const cy = (ctx.canvas?.height ?? canvasHeight) / 2 - 40;
    const pct = (state.flipitChance * 100).toFixed(1);
    const target = `${pct}%`;

    const decodeStart = (state.decodeStartTime ?? state.displayStartTime) || now;
    const el = now - decodeStart;
    const txt = el < DECODE_DURATION_MS ? revealText(target, el, DECODE_DURATION_MS) : target;

    ctx.save();
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 2;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    // Stage: prefer state.stage set by Game, fallback to gameState.stage, else 1
    const stage = (state.stage != null ? state.stage : (state.gameState?.stage ?? 1));

    // Strings and measured layout
    ctx.font = 'bold 22px Arial'; // ensure measurement font is the same
    const pctStr = target;
    const multStr = `×${stage}`;
    const combStr = `${(Number(pct) * stage).toFixed(1)}%`;

    const pctW  = ctx.measureText(pctStr).width;
    const multW = ctx.measureText(multStr).width;
    const combW = ctx.measureText(combStr).width;

    const pctX  = cx; // centered
    const multX = pctX + (pctW / 2) + beamUi.GAP_PCT_TO_MULT + (multW / 2);

    // Combined reveal timing and drift
    const combinedStart = (state.decodeStartTime ?? state.displayStartTime ?? now)
      + DECODE_DURATION_MS + MULTIPLIER_DELAY_MS + 400;
    const elapsedSinceCombined = Math.max(0, now - combinedStart);
    const appearT = Math.min(1, elapsedSinceCombined / FINAL_STAY_MS);
    const baseCombinedX = multX + (multW / 2) + beamUi.GAP_MULT_TO_COMBINED + (combW / 2);
    const driftDir = Math.sign(cx - baseCombinedX) || 1;
    const driftMagnitude = FINAL_DRIFT_PX;
    const driftX = driftDir * Math.min(driftMagnitude, Math.abs(cx - baseCombinedX)) * appearT;

    // Fade percent and multiplier when combined appears (2s fade)
    const fadeProgress = now >= combinedStart ? Math.min(1, elapsedSinceCombined / FADE_EARLIER_MS) : 0;
    const pctAlpha = 1 - fadeProgress;
    const multAlpha = 1 - fadeProgress;

    // Draw percent (reveal animation as before)
    if (pctAlpha > 0) {
      ctx.globalAlpha = 0.95 * pctAlpha;
      ctx.strokeText(txt, pctX, cy);
      ctx.fillStyle = '#ffeb3b';
      ctx.globalAlpha = 1 * pctAlpha;
      ctx.fillText(txt, pctX, cy);
    }

    // After a beat, show ×stage and the combined result to the right (measured spacing)
    const afterDelay = el - DECODE_DURATION_MS - MULTIPLIER_DELAY_MS;
    if (afterDelay > 0) {
      const multTxt = multStr;
      // Draw multiplier with fade when combined appears
      if (multAlpha > 0) {
        ctx.globalAlpha = 0.95 * multAlpha;
        ctx.strokeText(multTxt, multX, cy);
        ctx.fillStyle = '#a2ffea';
        ctx.globalAlpha = 1 * multAlpha;
        ctx.fillText(multTxt, multX, cy);
      }

      // Final combined result: full alpha during linger, then fade over 1s
      const combined = combStr;
      let combinedAlpha = 1.0;
      if (elapsedSinceCombined > FINAL_STAY_MS) {
        const fadeT = Math.min(1, (elapsedSinceCombined - FINAL_STAY_MS) / FADE_DURATION_MS);
        combinedAlpha = 1.0 - fadeT;
      }
      ctx.globalAlpha = combinedAlpha;
      ctx.strokeText(combined, baseCombinedX + driftX, cy);
      ctx.fillStyle = '#76e0a9';
      ctx.fillText(combined, baseCombinedX + driftX, cy);

      // Mark decode done time once fade completes
      if (elapsedSinceCombined > FINAL_STAY_MS + FADE_DURATION_MS) {
        if (!state.decodeDoneTime) state.decodeDoneTime = now;
      }
    }
    ctx.restore();
  }
  
  // Post-eject floating text removed - reward info now shown in HUD
}
