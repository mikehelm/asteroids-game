import type { GameState } from '../../types';
import type { EnvLike } from '../draw';
import { renderTractorOverlay, renderFlipit } from '../../tractorBeam';
import { beamUi } from '../../config/beamUi';
import { getMissileHudAnchor, getTopHudAnchors } from '../hudAnchors';
import { getFxConfig } from '../fxConfig';
import { getCurrentGameTickets } from '../../components/Scoreboard/storage';

// Tractor overlay + Flipit text rendering (moved from Game.tsx)
/** Threaded environment from Game.tsx (refs/config). If prefixed with _, it’s intentionally unused here. */
export function drawTractorOverlay(
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  env: EnvLike
): void {
  const r = (env as any).refs as any;
  const traction = r.tractionBeamRef?.current;
  if (!traction) return;
  const CANVAS_WIDTH = ctx.canvas.width;
  const CANVAS_HEIGHT = ctx.canvas.height;
  const tractionAugGuard = traction as any;
  const now = (env as any).frameNow as number;
  
  // Selectively block traction visual effects during capture/docking to avoid green blobs
  // but ALWAYS allow Flipit text to render
  const shouldBlockVisuals = !!(traction.active && (
    traction.phase === 'approaching' || traction.phase === 'locking' || traction.phase === 'attached' ||
    (traction.onTopEntry && traction.onTopEntry.inProgress)
  ));
  
  if (traction.active || (tractionAugGuard.textHoldUntil != null && now < tractionAugGuard.textHoldUntil)) {
    // Provide current stage snapshot for render (non-behavioral)
    const tractionAug = traction as any;
    tractionAug.gameState = { stage: gameState.stage };
    
    // Only render tractor overlay visuals if not in capture flow
    if (!shouldBlockVisuals) {
      renderTractorOverlay(ctx, traction, now);
    }
    
    // ALWAYS render Flipit text (includes decode, linger, and fade)
    renderFlipit(ctx, traction, now, CANVAS_WIDTH, CANVAS_HEIGHT);

    // ---- Decode explosion trigger (one-shot) ----
    const t = r.tractionBeamRef?.current;
    if (t.phase === 'displaying' && t.decodeStartTime) {
      const combinedStart = t.decodeStartTime + beamUi.DECODE_DURATION_MS + beamUi.MULTIPLIER_DELAY_MS + 400;
      const tAug = t as any;
      if (!tAug.decodeExplosionsFired && now >= combinedStart) {
        tAug.decodeExplosionsFired = true;
        ctx.save();
        ctx.font = 'bold 22px Arial';
        const cx = CANVAS_WIDTH / 2;
        const cy = CANVAS_HEIGHT / 2 - 40;
        const pctStr = `${(t.flipitChance * 100).toFixed(1)}%`;
        const stage = gameState.stage;
        const multStr = `×${stage}`;
        const pctW = ctx.measureText(pctStr).width;
        const multW = ctx.measureText(multStr).width;
        const pctX = cx;
        const multX = pctX + pctW / 2 + beamUi.GAP_PCT_TO_MULT + multW / 2;
        const y = cy;
        // Render-safe FX enqueue (no state write here)
        const enqueueFx = r?.enqueueFx as ((fx: { type: string; x: number; y: number; size: number }) => void) | undefined;
        // Small black puffs along the LEFT text (percent) from left→right
        const leftStart = pctX - pctW / 2;
        const samples = Math.max(3, Math.round(pctW / 40));
        for (let i = 0; i < samples; i++) {
          const sx = leftStart + (i / Math.max(1, samples - 1)) * pctW;
          enqueueFx?.({ type: 'blackPuff', x: sx, y, size: 6 + (i % 3) });
        }
        // Multiplier burst at its center
        const mx = multX;
        for (let k = 0; k < 12; k++) {
          enqueueFx?.({ type: 'blackPuff', x: mx, y, size: 8 });
        }
        ctx.restore();
      }
    }
  }
}


// HUD rendering (moved from Game.tsx drawUI)
/** Threaded environment from Game.tsx (refs/config). If prefixed with _, it’s intentionally unused here. */
export function drawHUD(
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  env: EnvLike
): void {
  // HUD alpha wrapper (25% of incoming)
  ctx.save();
  const prevHudAlpha = ctx.globalAlpha;
  ctx.globalAlpha = prevHudAlpha * 0.25;
  const r = (env as any).refs as any;
  const CANVAS_WIDTH = ctx.canvas.width;
  const CANVAS_HEIGHT = ctx.canvas.height;
  const now = (env as any).frameNow as number;
  const baseAlpha = 0.5;

  // Stage + Lives + Score on one line using centralized anchors
  ctx.save();
  ctx.globalAlpha = baseAlpha;
  ctx.font = '600 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'; // Clean modern font
  const anchors = getTopHudAnchors(CANVAS_WIDTH, CANVAS_HEIGHT);
  const stageText = `Stage: ${gameState.stage}`;
  const livesTextInline = `Lives: ${gameState.lives}`;
  const scoreText = `Score: ${gameState.score}`;
  const baseX = anchors.marginX;
  const topY = anchors.topLineY;
  const gap = anchors.gapX;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(stageText, baseX, topY);
  const stageW = ctx.measureText(stageText).width;
  const livesX = baseX + stageW + gap;
  ctx.fillText(livesTextInline, livesX, topY);
  const livesW = ctx.measureText(livesTextInline).width;
  const scoreX = livesX + livesW + gap;
  ctx.fillStyle = (now < (r.scoreDropUntilRef?.current ?? -Infinity)) ? '#ff5555' : '#ffffff';
  ctx.fillText(scoreText, scoreX, topY);
  ctx.restore();

  // Missile popups flying to HUD
  if (gameState.missilePopups && gameState.missilePopups.length > 0) {
    for (const p of gameState.missilePopups) {
      const age = now - p.start;
      const alpha = p.phase === 'hover' ? 1.0 : Math.max(0.6, 1.0 - age / 1600);
      const sc = typeof p.scale === 'number' ? p.scale! : 1.0;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(sc, sc);
      ctx.globalAlpha = alpha;
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 8;
      ctx.lineWidth = 2;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-8, -5);
      ctx.lineTo(-8, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-11, 0, 3, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  // (Lives rendered inline above)

  // Health bar set (with healing glow/pass)
  const healthBarWidth = 200;
  const healthBarHeight = getTopHudAnchors(CANVAS_WIDTH, CANVAS_HEIGHT).healthBarHeight; // half height centralized
  const healthPercentage = gameState.player.health / gameState.player.maxHealth;
  const healthBright = now < (r.healthBrightUntilRef?.current ?? -Infinity);
  const healthDrop = now < (r.healthDropUntilRef?.current ?? -Infinity);

  // Bar paint (50% alpha composed, then locally dimmed to 25%)
  {
    const prevA = ctx.globalAlpha;
    ctx.save();
    // existing HUD compositing for health bar
    ctx.globalAlpha = prevA * 0.5;
    ctx.globalAlpha = (healthBright ? 1.0 : baseAlpha) * 0.5 + 0;
    // locally dim the bar rectangles only
    ctx.save();
    ctx.globalAlpha *= 0.25;
    ctx.fillStyle = '#333333';
    ctx.fillRect(anchors.marginX, anchors.healthBarY, healthBarWidth, healthBarHeight);
    if (healthDrop) ctx.fillStyle = '#ff3333';
    else {
      const pct = Math.max(0, Math.min(1, healthPercentage));
      ctx.fillStyle = pct > 0.5 ? '#00ff66' : '#ffcc00';
    }
    ctx.fillRect(anchors.marginX, anchors.healthBarY, healthBarWidth * Math.max(0, Math.min(1, healthPercentage)), healthBarHeight);
    ctx.restore(); // end local 25% dim
    ctx.restore();
    ctx.globalAlpha = prevA;
  }

  // Healing overlay and final bar
  const isHealing = gameState.healEffect > 0;
  const healGlowIntensity = isHealing ? (gameState.healEffect / 120) : 0;
  // Healing overlay and final bar (50% base -> locally dimmed to 25%)
  {
    const prevA = ctx.globalAlpha;
    ctx.save();
    ctx.globalAlpha = prevA * 0.5;
    // locally dim
    ctx.save();
    ctx.globalAlpha *= 0.25;
    ctx.fillStyle = '#333333';
    ctx.fillRect(anchors.marginX, anchors.healthBarY, healthBarWidth, healthBarHeight);
    if (isHealing) {
      const cfg = getFxConfig(env as any);
      const enable = cfg.enableShadows !== false;
      if (enable) {
        ctx.shadowColor = '#00ff00';
        ctx.shadowBlur = 20 * healGlowIntensity;
      }
      ctx.fillStyle = `rgba(0, 255, 0, ${0.3 * healGlowIntensity})`;
      ctx.fillRect(anchors.marginX - 5, anchors.healthBarY - 5, healthBarWidth + 10, healthBarHeight + 10);
      ctx.shadowBlur = 0;
    }
    let healthColor = healthPercentage > 0.5 ? '#00ff00' : healthPercentage > 0.25 ? '#ffff00' : '#ff0000';
    if (isHealing) healthColor = `rgba(0, 255, 0, ${0.8 + 0.2 * healGlowIntensity})`;
    ctx.fillStyle = healthColor;
    ctx.fillRect(anchors.marginX, anchors.healthBarY, healthBarWidth * healthPercentage, healthBarHeight);
    ctx.restore(); // end local 25% dim
    ctx.restore();
    ctx.globalAlpha = prevA;
  }

  // Artifact/Reward display under health bar (persistent, updates per scan)
  {
    ctx.save();
    ctx.font = 'bold 16px Arial';
    ctx.globalAlpha = baseAlpha;
    
    const artifactY = anchors.healthBarY + healthBarHeight + 28;
    
    // Show current artifact info from gameState (persistent across docks)
    if (gameState.currentArtifact) {
      // Check if artifact was lost
      const status = (gameState.currentArtifact as any).status;
      if (status === 'LOST') {
        ctx.fillStyle = '#ff0000'; // Red for lost
        ctx.fillText('Artifact: LOST', anchors.marginX, artifactY);
      } else {
        // Show resolved reward after scan
        const rewardText = `${gameState.currentArtifact.type}: ${gameState.currentArtifact.finalChance.toFixed(1)}%`;
        ctx.fillStyle = '#ffeb3b'; // Yellow for scanned reward
        ctx.fillText(rewardText, anchors.marginX, artifactY);
      }
    } else {
      // Before first scan, show placeholder
      const traction = r.tractionBeamRef?.current;
      if (traction && traction.active && traction.flipitChance != null && traction.phase !== 'displaying') {
        // During active scan before display, show scanning state
        const chanceText = (traction.flipitChance * 100).toFixed(1);
        const artifactText = `Scanning: ${chanceText}%`;
        ctx.fillStyle = '#66e0ff'; // Cyan for scanning
        ctx.fillText(artifactText, anchors.marginX, artifactY);
      } else {
        // Default: no scan yet this level
        ctx.fillStyle = '#888888'; // Gray for unknown
        ctx.fillText('Artifact: ???', anchors.marginX, artifactY);
      }
    }
    
    // Display current game tickets below artifact with glow effect
    const ticketsY = artifactY + 24;
    const currentTickets = getCurrentGameTickets();
    
    if (currentTickets > 0) {
      ctx.save();
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 15;
      ctx.fillStyle = '#fbbf24'; // Yellow-orange for tickets
      ctx.fillText(`🎟️ Tickets: ${currentTickets}`, anchors.marginX, ticketsY);
      ctx.restore();
    } else {
      ctx.fillStyle = '#888888'; // Gray when no tickets
      ctx.fillText(`🎟️ Tickets: 0`, anchors.marginX, ticketsY);
    }
    
    ctx.restore();
  }

  // Fuel meter (ENERGY bar) bottom-left with toast and beeps
  {
    const fuel = gameState.player.fuel ?? 0;
    const maxFuel = gameState.player.maxFuel ?? 100;
    const low = gameState.player.fuelLowThreshold ?? Math.floor(maxFuel * 0.25);
    const crit = gameState.player.fuelCriticalThreshold ?? Math.floor(maxFuel * 0.1);
    const pct = Math.max(0, Math.min(1, fuel / maxFuel));
    const x = 20, y = CANVAS_HEIGHT - 24, w = 200, h = 7; // positioned to match bottom menu buttons
    const isCrit = fuel <= crit;
    const isLow = fuel <= low;
    const flash = isCrit ? (0.5 + 0.5 * Math.sin(now * 0.02)) : (isLow ? (0.7 + 0.3 * Math.sin(now * 0.015)) : 1.0);
    // ENERGY bar rectangles only at 25% opacity
    ctx.save();
    const prevA2 = ctx.globalAlpha;
    ctx.globalAlpha = prevA2 * 0.25;
    // bar background frame
    ctx.save();
    ctx.globalAlpha *= 0.8; // preserve prior look but under 25%
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.restore();
    // bar background
    ctx.save();
    ctx.globalAlpha *= 0.6;
    ctx.fillStyle = '#222';
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    // bar fill
    const color = isCrit ? `rgba(255,50,50,${flash})` : isLow ? `rgba(255,190,60,${flash})` : 'rgba(80,255,120,0.95)';
    ctx.fillStyle = color;
    ctx.globalAlpha = prevA2 * 0.25; // full for fill within 25%
    ctx.fillRect(x, y, w * pct, h);
    ctx.restore();

    // Missiles icons as a vertical column above ENERGY (bottom-left)
    {
      const segs = (gameState.player as any).missileSegments as number | undefined;
      const missilesWhole = gameState.player.missiles ?? 0;
      const totalSegs = Number.isFinite(segs) ? (segs as number) : Math.max(0, missilesWhole * 5);
      const fullIcons = Math.floor(totalSegs / 5);
      const rem = totalSegs % 5;
      const gapV = 8; // vertical gap between icons
      const iconW = 16, iconH = 12;
      const drawIcon = (cx: number, cy: number, frac: number = 1.0) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.fillStyle = '#cfe3ff';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(iconW * 0.5, 0);
        ctx.lineTo(-iconW * 0.3, -iconH * 0.5);
        ctx.lineTo(-iconW * 0.3, iconH * 0.5);
        ctx.closePath();
        if (frac < 1) {
          ctx.save();
          ctx.rect(-iconW * 0.3, -iconH * 0.5, (iconW * 0.8) * frac, iconH);
          ctx.clip();
          ctx.fill();
          ctx.restore();
          ctx.globalAlpha = 0.35;
          ctx.fill();
          ctx.globalAlpha = 1.0;
          ctx.stroke();
        } else {
          ctx.fill();
          ctx.stroke();
        }
        // small flame
        ctx.beginPath();
        ctx.fillStyle = '#ff9933';
        ctx.moveTo(-iconW * 0.35, 0);
        ctx.lineTo(-iconW * 0.6, -3);
        ctx.lineTo(-iconW * 0.6, 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      };
      const anchor = getMissileHudAnchor(CANVAS_WIDTH, CANVAS_HEIGHT);
      const baseX = anchor.x;
      const baseY = anchor.y; // top icon center Y
      const iconHeight = iconH; // visual height used in drawIcon
      const iconGap = gapV;     // vertical spacing
      const centerX = baseX + iconW * 0.5;
      let i = 0;
      for (; i < fullIcons; i++) {
        const cy = baseY - i * (iconHeight + iconGap);
        drawIcon(centerX, cy, 1.0);
      }
      if (rem > 0) {
        const cy = baseY - i * (iconHeight + iconGap);
        drawIcon(centerX, cy, rem / 5);
      }
    }
    // ENERGY label (full alpha)
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('ENERGY', x, y - 6);
    ctx.restore();

    let level: 'normal' | 'low' | 'critical' = 'normal';
    if (fuel <= crit) level = 'critical'; else if (fuel <= low) level = 'low';
    if (level !== (r.lastFuelWarnLevelRef?.current)) {
      const cooldownMs = 1500;
      if (now - (r.lastFuelBeepTsRef?.current ?? -Infinity) > cooldownMs) {
        try {
          const ss = r.soundSystem as { playLowFuelBeep?: (lvl: 'critical' | 'low') => void; playUiBeep?: () => void };
          if (r.soundSystem && level === 'critical' && typeof ss?.playLowFuelBeep === 'function') ss.playLowFuelBeep('critical');
          else if (r.soundSystem && level === 'low' && typeof ss?.playLowFuelBeep === 'function') ss.playLowFuelBeep('low');
          else if (r.soundSystem && typeof ss?.playUiBeep === 'function') ss.playUiBeep();
        } catch {}
        if (r.lastFuelBeepTsRef) r.lastFuelBeepTsRef.current = now;
      }
      if (r.lastFuelWarnLevelRef) r.lastFuelWarnLevelRef.current = level;
    }

    if (fuel >= maxFuel && (r.prevFuelRef?.current ?? 0) < maxFuel) {
      if (r.refuelToastUntilRef) r.refuelToastUntilRef.current = now + 1200;
    }
    if (r.prevFuelRef) r.prevFuelRef.current = fuel;
    if ((r.refuelToastUntilRef?.current ?? -Infinity) > now) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#c8ffe6';
      ctx.font = 'bold 14px Arial';
      ctx.fillText('REFUELED!', x + w + 16, y + 10);
      ctx.restore();
    }
  }

  // Debug box
  if (r.showDebugHud) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(8, CANVAS_HEIGHT - 88, 260, 80);
    ctx.fillStyle = '#88ffcc';
    ctx.font = '12px monospace';
    const tx = gameState.worldTileX ?? 0;
    const ty = gameState.worldTileY ?? 0;
    const st = (gameState as any).refuelStation;
    const dtx = st ? st.tileX - tx : 0;
    const dty = st ? st.tileY - ty : 0;
    const vel = gameState.player.velocity;
    const keys = Object.keys(gameState.keys).filter((k: string) => gameState.keys[k]).join('');
    ctx.fillText(`Tile: (${tx}, ${ty})`, 14, CANVAS_HEIGHT - 68);
    ctx.fillText(`To Station: dT=(${dtx}, ${dty})`, 14, CANVAS_HEIGHT - 52);
    ctx.fillText(`Vel: (${vel.x.toFixed(2)}, ${vel.y.toFixed(2)})`, 14, CANVAS_HEIGHT - 36);
    ctx.fillText(`Keys: ${keys}`, 14, CANVAS_HEIGHT - 20);
    ctx.restore();
  }
  // Restore HUD alpha
  ctx.globalAlpha = prevHudAlpha;
  ctx.restore();
}

