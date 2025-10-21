import type { GameState } from '../../types';
import type { EnvLike } from '../draw';

/** Threaded environment from Game.tsx (refs/config). If prefixed with _, it’s intentionally unused here. */
export function drawAliens(
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  _env: EnvLike
): void {
  const now = (_env as any).frameNow as number;
  gameState.alienShips.forEach(ship => {
    // Draw tractor beam for science vessels during docking
    const isScienceVessel = !!(ship as any).isScienceVessel;
    if (isScienceVessel) {
      const sv = ship as any;
      const state = sv.scienceState || 'approaching';
      
      if (state === 'docking') {
        // Find target asteroid
        const specialAsteroid = gameState.asteroids.find((a: any) => a.special === true);
        if (specialAsteroid) {
          const ax = specialAsteroid.position.x;
          const ay = specialAsteroid.position.y;
          const sx = ship.position.x;
          const sy = ship.position.y;
          
          ctx.save();
          
          // Draw beam line (faint red)
          ctx.globalAlpha = 0.2;
          ctx.strokeStyle = '#ff6666';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(ax, ay);
          ctx.stroke();
          
          // Moving data packets (red theme)
          const segs = 6;
          for (let i = 0; i < segs; i++) {
            const t = ((now * 0.0018 + i / segs) % 1);
            const u = ((now * 0.0022 + i / segs) % 1);
            const px1 = sx + (ax - sx) * t;
            const py1 = sy + (ay - sy) * t;
            const px2 = ax + (sx - ax) * u;
            const py2 = ay + (sy - ay) * u;
            
            ctx.globalAlpha = 0.6;
            ctx.fillStyle = (i & 1) ? '#ffaaaa' : '#ff8888';
            ctx.beginPath();
            ctx.arc(px1, py1, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 0.4;
            ctx.beginPath();
            ctx.arc(px2, py2, 1.6, 0, Math.PI * 2);
            ctx.fill();
          }
          
          // Status label above asteroid (similar to player's)
          const progress = sv.scienceDockProgress || 0;
          const statusText = `STEALING: ${progress.toFixed(0)}%`;
          const labelY = ay - (specialAsteroid.radius || 30) - 25;
          
          ctx.globalAlpha = 0.9;
          ctx.font = 'bold 14px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          // Background pill
          const textW = ctx.measureText(statusText).width;
          const pillW = textW + 16;
          const pillH = 24;
          const pillX = ax - pillW / 2;
          const pillY = labelY - pillH / 2;
          
          ctx.fillStyle = 'rgba(40,0,0,0.6)';
          ctx.strokeStyle = 'rgba(255,100,100,0.3)';
          ctx.lineWidth = 1;
          const r = 8;
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
          
          // Text
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2;
          ctx.strokeText(statusText, ax, labelY);
          ctx.fillStyle = '#ff4444';
          ctx.fillText(statusText, ax, labelY);
          
          ctx.restore();
        }
      }
    }
    
    ctx.save();
    
    // Check ship type
    const missileType = !!(ship as any).isMissileType;
    const doomStage = (ship as any).doomStage || 0;
    const doomTimer = (ship as any).doomTimer || 0;
    
    // Vibrate jitter during stage 2
    let jitterX = 0, jitterY = 0;
    if (missileType && doomStage === 2) {
      jitterX = (Math.random() - 0.5) * 6;
      jitterY = (Math.random() - 0.5) * 6;
    }
    ctx.translate(ship.position.x + jitterX, ship.position.y + jitterY);
    
    // Shrink during stage 3
    let baseScale = missileType ? 2.0 : 1.0;
    if (missileType && doomStage === 3) {
      const t = Math.max(0.05, (doomTimer || 1) / 60);
      baseScale *= t;
    }
    const scale = baseScale;
    ctx.scale(scale, scale);

    // Draw science vessel (different design)
    if (isScienceVessel) {
      ctx.shadowBlur = 0;
      
      // Main rectangular body (boxy science ship)
      ctx.fillStyle = '#556677';
      ctx.strokeStyle = '#88aacc';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(-12, -8, 24, 16);
      ctx.fill();
      ctx.stroke();
      
      // Front section (cockpit)
      ctx.fillStyle = '#667788';
      ctx.strokeStyle = '#99bbdd';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(12, -6);
      ctx.lineTo(18, 0);
      ctx.lineTo(12, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // Rotating scanning dish on top
      const dishRotation = now * 0.003;
      ctx.save();
      ctx.translate(0, -8);
      ctx.rotate(dishRotation);
      ctx.fillStyle = '#7799bb';
      ctx.strokeStyle = '#aaccee';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, 8, 3, 0, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      // Dish support
      ctx.strokeStyle = '#556677';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 8);
      ctx.stroke();
      ctx.restore();
      
      // Scanning lights (pulsing)
      const scanPulse = 0.5 + 0.5 * Math.sin(now * 0.008);
      ctx.fillStyle = `rgba(100, 200, 255, ${0.6 * scanPulse})`;
      ctx.beginPath();
      ctx.arc(-8, 0, 3, 0, 2 * Math.PI);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(8, 0, 3, 0, 2 * Math.PI);
      ctx.fill();
      
      // Engine glow at back
      ctx.fillStyle = 'rgba(100, 150, 255, 0.3)';
      ctx.beginPath();
      ctx.arc(-15, 0, 4, 0, 2 * Math.PI);
      ctx.fill();
    } 
    // Draw regular combat UFO
    else {
      // Saucer body
      ctx.shadowBlur = 0; // keep glow disabled for perf
      ctx.fillStyle = missileType ? '#222326' : '#444444';
      ctx.strokeStyle = missileType ? '#ff6b3a' : '#666666';
      ctx.lineWidth = missileType ? 2.5 : 2;
      ctx.beginPath();
      ctx.ellipse(0, 2, 20, 8, 0, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      // Top dome (pulse for missile type)
      const pulse = missileType ? (0.85 + 0.15 * Math.sin(now * 0.006)) : 1;
      ctx.fillStyle = missileType ? `rgba(255,120,60,${0.5 * pulse})` : '#555555';
      ctx.strokeStyle = missileType ? '#ffb46b' : '#777777';
      ctx.lineWidth = missileType ? 1.8 : 1.5;
      ctx.beginPath();
      ctx.ellipse(0, -6, 10, 6, 0, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      // Lower orb/glow
      ctx.fillStyle = missileType ? (doomStage >= 2 ? 'rgba(255, 68, 68, 0.7)' : 'rgba(255, 68, 68, 0.4)') : 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.arc(0, 8, 6, 0, 2 * Math.PI);
      ctx.fill();
    }
    
    ctx.restore();

    // Health bar above ship (scale width by scale) - 50% transparent
    const healthPercentage = ship.health / ship.maxHealth;
    const barWidth = 20 * scale;
    const barHeight = 3;
    ctx.save();
    ctx.globalAlpha = 0.5; // 50% transparent
    ctx.fillStyle = '#333333';
    ctx.fillRect(ship.position.x - barWidth / 2, ship.position.y - ship.radius - 10, barWidth, barHeight);
    ctx.fillStyle = healthPercentage > 0.5 ? '#00ff00' : '#ff0000';
    ctx.fillRect(
      ship.position.x - barWidth / 2,
      ship.position.y - ship.radius - 10,
      barWidth * healthPercentage,
      barHeight
    );
    ctx.restore();
  });
}
