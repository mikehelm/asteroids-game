import type { GameState } from '../../types';
import type { EnvLike } from '../draw';
import { shouldDrawTrails } from '../trailsControl';

// Background rendering extracted from Game.tsx. This function relies on refs passed via env.refs
// to avoid circular imports and preserve behavior.
/** Threaded environment from Game.tsx (refs/config). If prefixed with _, it’s intentionally unused here. */
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  env: EnvLike
): { sx: number; sy: number; sw: number; sh: number; iw: number; ih: number } | null {
  const r = env.refs;
  const now = (env as any).frameNow;
  // Outer canvas-state guard and normalization (idempotent)
  ctx.save();
  try {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if ('filter' in (ctx as unknown as Record<string, unknown>)) {
      (ctx as unknown as { filter?: string }).filter = 'none';
    }
  const bg: HTMLImageElement | null = r.bgImageRef?.current ?? null;

  // Mapping info for sampling background brightness under stars (kept local)
  let bgMap: { sx: number; sy: number; sw: number; sh: number; iw: number; ih: number } | null = null;
  const CANVAS_WIDTH = ctx.canvas.width;
  const CANVAS_HEIGHT = ctx.canvas.height;

  if (bg && (bg as HTMLImageElement).complete && (bg as HTMLImageElement).naturalWidth > 0) {
    const iw = (bg as HTMLImageElement).naturalWidth;
    const ih = (bg as HTMLImageElement).naturalHeight;

    // Update parallax offset based on ship velocity (20% of star parallax)
    if (gameState.gameRunning) {
      const shipVelocity = gameState.player.velocity;
      const moving = Math.hypot(shipVelocity.x, shipVelocity.y) > 0.01;
      const parallaxFactor = (moving ? 2.0 : 1.0) * 0.02; // 20% of stars' 0.1 factor
      const wantX = r.bgOffsetRef.current.x - shipVelocity.x * parallaxFactor;
      const wantY = r.bgOffsetRef.current.y - shipVelocity.y * parallaxFactor;
      r.bgOffsetRef.current.x = wantX;
      r.bgOffsetRef.current.y = wantY;
    }

    // If we're fading out to black for level end, also zoom the background towards us
    let pOutEarly = 0;
    if (gameState.levelComplete && r.levelEndStartRef.current > 0) {
      pOutEarly = Math.max(0, Math.min(1, (now - r.levelEndStartRef.current) / r.DUCK_HOLD_MS));
    }
    // Accelerate zoom-in (ease-in) and increase intensity to ~+240%
    const zoomEase = pOutEarly * pOutEarly; // accelerate
    // Intro zoom: start at +20% and ease back to 0 over 2s
    const tIntro = Math.max(0, Math.min(1, (now - r.introZoomStartRef.current) / r.INTRO_ZOOM_DUR_MS));
    const introExtra = r.START_ZOOM_EXTRA * (1 - tIntro);
    const baseZoom = (1.2 + r.bgZoomExtraRef.current) * (1 + introExtra) * (1 + zoomEase * 2.4);
    const sw = Math.max(10, iw / baseZoom);
    const sh = Math.max(10, ih / baseZoom);
    // Map offset as pixels in source space
    let sx = iw * 0.5 - sw * 0.5 + r.bgOffsetRef.current.x;
    let sy = ih * 0.5 - sh * 0.5 + r.bgOffsetRef.current.y;

    // Clamp to image bounds; if clamped, accumulate extra zoom slightly to simulate motion
    let clamped = false;
    if (sx < 0) { sx = 0; clamped = true; }
    if (sy < 0) { sy = 0; clamped = true; }
    if (sx + sw > iw) { sx = iw - sw; clamped = true; }
    if (sy + sh > ih) { sy = ih - sh; clamped = true; }
    if (clamped) {
      r.bgZoomExtraRef.current = Math.min(r.bgZoomExtraRef.current + 0.005, 0.12); // up to +12% more
    } else {
      r.bgZoomExtraRef.current = Math.max(0, r.bgZoomExtraRef.current - 0.008); // decay back
    }

    // Derive performance-active flag: user perfMode OR UFO present OR recent missile event
    const ufoPresent = (gameState.alienShips?.length || 0) > 0;
    const nowPerf = now;
    const perfActive = (r.perfModeRef.current || ufoPresent || (nowPerf - r.lastMissileEventRef.current) < 1500);

    // Motion Trails: gently fade prior frame, but suspend during missile effects and fade back in
    {
      const canDrawTrails = shouldDrawTrails(
        {
          trailsEnabledRef: r.trailsEnabledRef,
          trailsStrengthRef: r.trailsStrengthRef,
          trailsSuspendUntilRef: r.trailsSuspendUntilRef,
          trailsFadeInStartRef: r.trailsFadeInStartRef,
        } as any,
        now
      );
      if (canDrawTrails) {
        const nowFade = now;
        let trailsAlpha = 1;
        if (nowFade < r.trailsSuspendUntilRef.current || perfActive) {
          trailsAlpha = 0; // fully suspended
        } else if (r.trailsFadeInStartRef.current > 0 || r.trailsSuspendUntilRef.current > 0) {
          const t = Math.max(0, Math.min(1, (nowFade - r.trailsFadeInStartRef.current) / 600));
          trailsAlpha = t;
        }
        if (trailsAlpha > 0) {
          ctx.save();
          // Reset transform to identity to ensure blur fade covers entire canvas
          // regardless of any parent translations (e.g., screen shake)
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          const cap = perfActive ? 0.18 : 0.25;
          const base = Math.max(0.08, Math.min(cap, r.trailsStrengthRef.current));
          const fade = base * trailsAlpha;
          ctx.globalAlpha = fade;
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          ctx.restore();
        }
      }
    }

    // Draw with current opacity/filters, factoring crossfade states
    const nowTs = now;
    const oBase = Math.max(0, Math.min(1, r.bgOpacityRef.current));
    const c = Math.max(0.0, r.bgContrastRef.current);
    const b = Math.max(0.0, r.bgBrightnessRef.current);

    const effBg = r.effectsApplyRef.current;
    const useFxBg = effBg.background;
    // Suppress background filters during heavy scenes
    const suppressBgFilter = perfActive;
    if (r.fadeInActiveRef.current) {
      // Fade in new backdrop from black
      const pIn = Math.max(0, Math.min(1, (nowTs - r.fadeInStartRef.current) / 2000));
      // Clear to black (reset transform to ignore parent translations)
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.restore();
      // Draw bg increasing alpha
      ctx.save();
      ctx.globalAlpha = (useFxBg ? oBase : 1) * pIn;
      (ctx as any).filter = (useFxBg && !suppressBgFilter) ? `contrast(${c * 100}%) brightness(${b * 100}%)` : 'none';
      ctx.drawImage(bg, sx, sy, sw, sh, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.restore();
      // Capture background and apply distortion pulses BEFORE drawing gameplay sprites
      if (r.distortionRef.current) {
        try {
          const bgBuf = r.distortionRef.current.captureBackground(ctx);
          const coarse = !!r.perfModeRef.current; // coarser grid when perf mode is active
          r.distortionRef.current.renderSimple(ctx, bgBuf, now, { debugRing: false, perfCoarse: coarse });
        } catch {}
      }
      if (pIn >= 1) {
        r.fadeInActiveRef.current = false;
      }
    } else {
      // Normal draw
      ctx.save();
      // When trails are disabled and drawing with partial opacity, clear the canvas first to avoid residual trails
      if (!r.trailsEnabledRef.current && useFxBg && oBase < 1) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.restore();
      }
      ctx.globalAlpha = useFxBg ? oBase : 1;
      (ctx as any).filter = useFxBg ? `contrast(${c * 100}%) brightness(${b * 100}%)` : 'none';
      ctx.drawImage(bg, sx, sy, sw, sh, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.restore();
      // Capture background and apply distortion pulses in normal draw branch as well
      if (r.distortionRef.current) {
        try {
          const bgBuf = r.distortionRef.current.captureBackground(ctx);
          const coarse = !!r.perfModeRef.current; // coarser grid when perf mode is active
          r.distortionRef.current.renderSimple(ctx, bgBuf, now, { debugRing: true, perfCoarse: coarse });
        } catch {}
      }
      // If level is ending, fade to black over the duck hold duration
      if (gameState.levelComplete && r.levelEndStartRef.current > 0) {
        const pOut = Math.max(0, Math.min(1, (nowTs - r.levelEndStartRef.current) / r.DUCK_HOLD_MS));
        if (pOut > 0) {
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = pOut;
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          ctx.restore();
        }
      }
    }

    // Cache mapping values for star masking
    bgMap = { sx, sy, sw, sh, iw, ih };
  } else {
    // With true page wallpaper, keep canvas transparent; only fill if no backdrop is available at all
    if (!r.backdrops || r.backdrops.length === 0) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#000011';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.restore();
    } else {
      // Transparent background lets body wallpaper show through
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.restore();
    }
  }
  // Reset any filter/alpha side-effects before drawing stars/objects
  ctx.globalAlpha = 1;
  (ctx as any).filter = 'none';
  return bgMap;
  } finally {
    ctx.restore();
  }
}
