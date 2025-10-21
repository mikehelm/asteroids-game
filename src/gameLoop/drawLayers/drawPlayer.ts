import type { GameState } from '../../types';
import type { EnvLike } from '../draw';

// Adapters for entity rendering (Pass A shim): delegate to Game.tsx local fns via env.refs
/** Threaded environment from Game.tsx (refs/config). If prefixed with _, it’s intentionally unused here. */
export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  env: EnvLike
): void {
  const { player } = gameState;
  const r = env.refs as any;

  // Helper brought over from Game.tsx
  const computeHealthTier = (health: number, maxHealth: number): number => {
    const pct = maxHealth > 0 ? Math.max(0, Math.min(100, (health / maxHealth) * 100)) : 0;
    if (pct >= 80) return 5;
    if (pct >= 60) return 4;
    if (pct >= 40) return 3;
    if (pct >= 20) return 2;
    return 1;
  };

  // Determine current visible tier: show intro tiers during intro, else by health
  let visibleTier = computeHealthTier(player.health, player.maxHealth);
  if (gameState.introPhase === 'ship-entrance') {
    // Timeline: 0-1.0s => 5, 1.0-1.5s => 4, 1.5-2.0s => 3, 2.0-2.5s => 2, then normal
    const t = gameState.introTimer / 1000;
    if (t < 1.0) visibleTier = 5; else if (t < 1.5) visibleTier = 4; else if (t < 2.0) visibleTier = 3; else if (t < 2.5) visibleTier = 2;
  }

  ctx.save();
  let scale = 1.0;
  let offsetY = 0;
  if (gameState.introPhase === 'ship-entrance') {
    const t = Math.min(2500, gameState.introTimer);
    const k = 1 - (t / 2500);
    scale = 1.0 + k * 0.6;
    offsetY = -40 * k;
  }
  
  // Draw dash trail effect (before ship for background effect)
  if (player.dashActive && player.dashDuration && player.dashDuration > 0) {
    const trailCount = 5;
    const trailSpacing = 8;
    const dashProgress = 1 - (player.dashDuration / 15); // 0 to 1
    
    for (let i = 0; i < trailCount; i++) {
      const trailAlpha = (1 - (i / trailCount)) * (1 - dashProgress * 0.5);
      const offsetDistance = (i + 1) * trailSpacing;
      
      // Position trail ghost behind ship based on dash direction
      const dashDir = player.dashDirection || { x: 0, y: 0 };
      const trailX = player.position.x - dashDir.x * offsetDistance;
      const trailY = player.position.y - dashDir.y * offsetDistance;
      
      ctx.save();
      ctx.translate(trailX, trailY + offsetY);
      ctx.rotate(player.rotation);
      ctx.scale(scale, scale);
      ctx.globalAlpha = trailAlpha * 0.4;
      
      // Draw simple ship silhouette for trail
      ctx.strokeStyle = '#00ddff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(15, 0);
      ctx.lineTo(-10, -8);
      ctx.lineTo(-5, 0);
      ctx.lineTo(-10, 8);
      ctx.closePath();
      ctx.stroke();
      
      ctx.restore();
    }
  }
  
  ctx.translate(player.position.x, player.position.y + offsetY);
  
  // Special transparent effect for forward dash
  const isForwardDashing = player.dashActive && player.dashType === 'forward';
  if (isForwardDashing) {
    ctx.globalAlpha *= 0.4; // 60% transparent
    // Add ghostly glow
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 20;
  }
  
  // Dim ship during behind-entry occlusion
  if (r.tractionBeamRef?.current?._occludeShip) {
    ctx.globalAlpha *= 0.5;
  }
  ctx.rotate(player.rotation);
  ctx.scale(scale, scale);

  // Draw ship per tier
  const isFlashing = player.invulnerable > 0 && Math.floor(player.invulnerable / 5) % 2 === 0;
  const baseStroke = isFlashing ? '#ff0000' : '#00ffff';

  const drawTier1 = () => {
    ctx.strokeStyle = baseStroke;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(-10, -8);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-10, 8);
    ctx.closePath();
    ctx.stroke();
  };

  const drawTier2 = () => {
    ctx.strokeStyle = '#7ffcff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(-10, -8);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-10, 8);
    ctx.closePath();
    ctx.stroke();
  };

  const drawTier3 = () => {
    const time = (env as any).frameNow * 0.0006;
    const hue = Math.floor((time * 60) % 360);
    ctx.fillStyle = `hsl(${hue}, 80%, 55%)`;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(-10, -8);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-10, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };

  const drawTier4 = () => {
    const time = (env as any).frameNow * 0.0006;
    const hue = Math.floor((time * 60) % 360);
    ctx.fillStyle = `hsl(${hue}, 80%, 55%)`;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    // body
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(-10, -8);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-10, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // side turrets
    ctx.fillStyle = '#cccccc';
    ctx.strokeStyle = '#999999';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.rect(-6, -10, 4, 6); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.rect(-6, 4, 4, 6); ctx.fill(); ctx.stroke();
    // barrels
    ctx.strokeStyle = '#dddddd';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-2, -7); ctx.lineTo(8, -7);
    ctx.moveTo(-2, 7); ctx.lineTo(8, 7);
    ctx.stroke();
  };

  const drawTier5 = () => {
    // Procedural detailed ship, centered around (0,0)
    // Apply a tiny alignment tweak so visual centroid matches bullet origin
    ctx.save();
    ctx.translate(-2, 0); // slight left shift to center mass
    ctx.fillStyle = '#88e0ff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(2, -10);
    ctx.lineTo(-12, -6);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-12, 6);
    ctx.lineTo(2, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // canopy
    ctx.fillStyle = '#1b2a41';
    ctx.beginPath();
    ctx.ellipse(4, 0, 6, 4, 0, 0, 2 * Math.PI);
    ctx.fill();
    // fins
    ctx.fillStyle = '#66d0ff';
    ctx.beginPath(); ctx.moveTo(-8, -9); ctx.lineTo(-2, -4); ctx.lineTo(-12, -2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-8, 9);  ctx.lineTo(-2, 4);  ctx.lineTo(-12, 2);  ctx.closePath(); ctx.fill();
    // nose detail
    ctx.strokeStyle = '#dff6ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(17, 0); ctx.stroke();
    ctx.restore();
  };

  switch (visibleTier) {
    case 1: drawTier1(); break;
    case 2: drawTier2(); break;
    case 3: drawTier3(); break;
    case 4: drawTier4(); break;
    case 5: drawTier5(); break;
    default: drawTier1();
  }
  
  // Draw thrust
  if (player.thrust > 0) {
    ctx.strokeStyle = '#ff6600';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.lineTo(-15, -3);
    ctx.lineTo(-12, 0);
    ctx.lineTo(-15, 3);
    ctx.closePath();
    ctx.stroke();
  }
  
  ctx.restore();
  
  // Draw bubble effect around ship when controls are scrambled
  const bubbleEffect = (gameState as any).bubbleEffect;
  if (bubbleEffect) {
    ctx.save();
    ctx.translate(player.position.x, player.position.y + offsetY);
    
    // Animated bubble with distortion effect
    const time = (env as any).frameNow * 0.003;
    const bubbleRadius = 30 + Math.sin(time * 2) * 3; // Pulsing size
    
    // Create gradient for bubble surface
    const gradient = ctx.createRadialGradient(0, 0, bubbleRadius * 0.7, 0, 0, bubbleRadius);
    gradient.addColorStop(0, 'rgba(255, 100, 200, 0)');
    gradient.addColorStop(0.7, 'rgba(255, 100, 200, 0.15)');
    gradient.addColorStop(0.9, 'rgba(255, 150, 220, 0.4)');
    gradient.addColorStop(1, 'rgba(255, 200, 240, 0.6)');
    
    // Draw bubble fill
    ctx.beginPath();
    ctx.arc(0, 0, bubbleRadius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    
    // Draw animated distortion rings
    const numRings = 3;
    for (let i = 0; i < numRings; i++) {
      const phase = (time + i * 0.8) % 2;
      const ringAlpha = Math.max(0, 1 - phase * 0.5);
      const ringRadius = bubbleRadius * (0.3 + phase * 0.7);
      
      ctx.strokeStyle = `rgba(255, 150, 220, ${ringAlpha * 0.3})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    // Add shimmer highlights
    const shimmerAngle = time * 3;
    const shimmerX = Math.cos(shimmerAngle) * bubbleRadius * 0.6;
    const shimmerY = Math.sin(shimmerAngle) * bubbleRadius * 0.6;
    
    const shimmerGradient = ctx.createRadialGradient(shimmerX, shimmerY, 0, shimmerX, shimmerY, 12);
    shimmerGradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
    shimmerGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    ctx.beginPath();
    ctx.arc(shimmerX, shimmerY, 12, 0, Math.PI * 2);
    ctx.fillStyle = shimmerGradient;
    ctx.fill();
    
    ctx.restore();
  }
}
