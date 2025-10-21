import type { GameState, Asteroid } from '../../types';
import type { EnvLike } from '../draw';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../utils';
// (no imports needed for docking helpers; use direct state)

// New 3D green grid scan: expands from center to beyond edge, outlines rock, then flickers while docked
export function drawAsteroidScanGrid(
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  env: EnvLike
): void {
  const gs: any = gameState as any;
  // Only draw while docking is active: refuel/reward dock OR traction-beam land flow
  const d: any = (gameState as any).dock;
  const tbr: any = (env as any)?.refs?.tractionBeamRef?.current;
  const tbActive = !!(tbr && (tbr.active || (tbr.onTopEntry && tbr.onTopEntry.inProgress)));
  const dockingActive = !!(
    (d && (d.phase === 'approach' || d.phase === 'docked') && (d.kind === 'refuel' || d.kind === 'reward'))
    || tbActive
  );
  if (!dockingActive) {
    return;
  }

  const now = (env as any).frameNow as number | undefined;
  const tNow = now ?? performance.now();

  // Get target directly from traction beam (already set by game logic)
  const target = tbr?.targetAsteroid as Asteroid | undefined;
  if (!target || !target.position) return;
  
  // Get grid scan state from traction beam
  const gridScan = tbr?.gridScan;
  if (!gridScan || !gridScan.active) return;
  
  const player = gs.player?.position;
  if (!player) return;

  // Wrap asteroid center to the on-screen copy nearest the player
  let cx = target.position.x; let cy = target.position.y;
  {
    let dx = player.x - cx; let dy = player.y - cy;
    if (dx > CANVAS_WIDTH / 2) cx += CANVAS_WIDTH; else if (dx < -CANVAS_WIDTH / 2) cx -= CANVAS_WIDTH;
    if (dy > CANVAS_HEIGHT / 2) cy += CANVAS_HEIGHT; else if (dy < -CANVAS_HEIGHT / 2) cy -= CANVAS_HEIGHT;
  }

  const r = Math.max(10, target.radius || 0);
  const overshoot = 6; // draw slightly past edge
  
  // Progress: expand based on grid scan completion (cells revealed / total cells)
  const totalCells = gridScan.cols * gridScan.rows;
  const revealedCount = gridScan.revealed.filter((v: boolean) => v).length;
  const revealProgress = Math.min(1, revealedCount / totalCells);
  
  // Ease-out expansion for nicer feel
  const p = 1 - Math.pow(1 - revealProgress, 2);
  const scanRadius = Math.max(8, (r + overshoot) * p); // Start at small radius, expand to full

  // 25% transparency as requested
  const alpha = 0.25;

  ctx.save();
  ctx.translate(cx, cy);

  // No temporary cross or logs in production behavior

  // Clip to asteroid circle for the grid body; expand clip gradually while scanning
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(1, scanRadius), 0, Math.PI * 2);
  ctx.clip();

  // Grid style
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = '#66ff88';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  // Boost visibility over asteroid by additive blending and soft glow
  const prevComp = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  const prevShadowBlur = ctx.shadowBlur;
  const prevShadowColor = (ctx as any).shadowColor;
  ctx.shadowColor = '#66ff88';
  ctx.shadowBlur = 6;

  // Animated offsets to simulate scanning motion
  const t = (tNow * 0.002) | 0; // integer steps for subtle jitter
  const step = 10;
  const w = (r + overshoot) * 2 + 12;
  const h = (r + overshoot) * 2 + 12;
  const ox = ((tNow * 0.040) % step);
  const oy = ((tNow * 0.028) % step);

  // Vertical grid lines
  for (let gx = -w / 2 - step; gx <= w / 2 + step; gx += step) {
    ctx.beginPath();
    ctx.moveTo(Math.floor(gx + ox) + 0.5, -h / 2);
    ctx.lineTo(Math.floor(gx + ox) + 0.5, h / 2);
    ctx.stroke();
  }
  // Horizontal grid lines
  for (let gy = -h / 2 - step; gy <= h / 2 + step; gy += step) {
    ctx.beginPath();
    ctx.moveTo(-w / 2, Math.floor(gy + oy) + 0.5);
    ctx.lineTo(w / 2, Math.floor(gy + oy) + 0.5);
    ctx.stroke();
  }
  // Restore composite and shadow
  ctx.globalCompositeOperation = prevComp;
  ctx.shadowBlur = prevShadowBlur;
  (ctx as any).shadowColor = prevShadowColor;
  ctx.restore(); // clip

  // After grid reaches edge, draw asteroid-shaped outline (follows actual polygon)
  // Outline at same transparency to blend with grid
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = '#66ff88';
  ctx.lineWidth = 2;
  
  // Use asteroid's actual shape points if available, otherwise fall back to circle
  const anyTarget = target as Asteroid & { shapePoints?: Array<{x:number,y:number}> };
  ctx.beginPath();
  if (anyTarget.shapePoints && anyTarget.shapePoints.length > 0) {
    // Draw polygon outline following asteroid's exact shape
    const overhang = 2; // Small offset outward
    anyTarget.shapePoints.forEach((p: {x:number,y:number}, i: number) => {
      // Calculate outward normal direction for this point
      const angle = Math.atan2(p.y, p.x);
      const offsetX = p.x + Math.cos(angle) * overhang;
      const offsetY = p.y + Math.sin(angle) * overhang;
      
      if (i === 0) {
        ctx.moveTo(offsetX, offsetY);
      } else {
        ctx.lineTo(offsetX, offsetY);
      }
    });
    ctx.closePath();
  } else {
    // Fallback: circular outline
    ctx.arc(0, 0, r + 2, 0, Math.PI * 2);
  }
  ctx.stroke();

  ctx.restore();
  
  // Draw red scanning grids for science vessels attempting to steal Flipit
  const scienceVessels = gameState.alienShips.filter((ship: any) => 
    ship.isScienceVessel && ship.scienceState === 'docking' && ship.scienceDockProgress > 0
  );
  
  for (const vessel of scienceVessels) {
    const sv: any = vessel;
    const targetAsteroid = gameState.asteroids.find((a: any) => a.special === true);
    if (!targetAsteroid || !targetAsteroid.position) continue;
    
    // Wrap asteroid center to on-screen copy
    let cx = targetAsteroid.position.x;
    let cy = targetAsteroid.position.y;
    if (player) {
      let dx = player.x - cx;
      let dy = player.y - cy;
      if (dx > CANVAS_WIDTH / 2) cx += CANVAS_WIDTH;
      else if (dx < -CANVAS_WIDTH / 2) cx -= CANVAS_WIDTH;
      if (dy > CANVAS_HEIGHT / 2) cy += CANVAS_HEIGHT;
      else if (dy < -CANVAS_HEIGHT / 2) cy -= CANVAS_HEIGHT;
    }
    
    const r = Math.max(10, targetAsteroid.radius || 0);
    const progress = (sv.scienceDockProgress || 0) / 100;
    const p = 1 - Math.pow(1 - progress, 2);
    const scanRadius = Math.max(8, (r + 6) * p);
    
    ctx.save();
    ctx.translate(cx, cy);
    
    // Clip to asteroid circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(1, scanRadius), 0, Math.PI * 2);
    ctx.clip();
    
    // Red grid style (very faded as requested)
    ctx.globalAlpha = 0.15; // More faded than green
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 1.5;
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = '#ff4444';
    ctx.shadowBlur = 6;
    
    // Animated grid
    const step = 10;
    const w = (r + 6) * 2 + 12;
    const h = (r + 6) * 2 + 12;
    const ox = ((tNow * 0.040) % step);
    const oy = ((tNow * 0.028) % step);
    
    // Vertical lines
    for (let gx = -w / 2 - step; gx <= w / 2 + step; gx += step) {
      ctx.beginPath();
      ctx.moveTo(Math.floor(gx + ox) + 0.5, -h / 2);
      ctx.lineTo(Math.floor(gx + ox) + 0.5, h / 2);
      ctx.stroke();
    }
    // Horizontal lines
    for (let gy = -h / 2 - step; gy <= h / 2 + step; gy += step) {
      ctx.beginPath();
      ctx.moveTo(-w / 2, Math.floor(gy + oy) + 0.5);
      ctx.lineTo(w / 2, Math.floor(gy + oy) + 0.5);
      ctx.stroke();
    }
    
    ctx.restore(); // clip
    
    // Red outline
    ctx.globalAlpha = 0.15;
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(0, 0, r + 2, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.restore();
  }
}
