import type { GameState, Asteroid } from '../types';
export type EnvLike = { refs: Record<string, unknown> };

// Pass A stub: forwarder only. Do not resample time here.
export function draw(
  _ctx: CanvasRenderingContext2D,
  _gameState: GameState,
  _now: number,
  _env: EnvLike
): void {
  // no-op stub for Pass A
  void _ctx; void _gameState; void _now; void _env;
}

// Adapters for entity rendering (Pass A shim): delegate to Game.tsx local fns via env.refs
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
  ctx.translate(player.position.x, player.position.y + offsetY);
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
    const time = Date.now() * 0.0006;
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
    const time = Date.now() * 0.0006;
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
}

export function drawAsteroids(
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  _env: EnvLike
): void {
  gameState.asteroids.forEach(asteroid => {
    ctx.save();
    ctx.translate(asteroid.position.x, asteroid.position.y);
    ctx.rotate(asteroid.rotation);
    // Detailed procedural asteroid with cached irregular shape, shading and craters
    const r = asteroid.radius;
    const anyAst = asteroid as Asteroid & { shapePoints?: Array<{x:number,y:number}>; baseFill?: string; strokeColor?: string; craters?: Array<{x:number,y:number,r:number}> };
    if (!anyAst.shapePoints) {
      const points = 14; // richer silhouette
      const arr: Array<{x:number,y:number}> = [];
      // Create stable random-ish offsets using a deterministic function of index and radius
      const jitter = (i: number) => {
        // pseudo-random in [-0.2,0.2]
        const s = Math.sin(i * 12.9898 + r * 78.233) * 43758.5453;
        return (s - Math.floor(s)) * 0.4 - 0.2;
      };
      for (let i = 0; i < points; i++) {
        const ang = (i / points) * Math.PI * 2;
        const rr = r * (0.85 + jitter(i));
        arr.push({ x: Math.cos(ang) * rr, y: Math.sin(ang) * rr });
      }
      anyAst.shapePoints = arr;
    }
    // Body fill
    ctx.beginPath();
    anyAst.shapePoints.forEach((p: {x:number,y:number}, i: number) => {
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    // Determine special "crystallized black glass" large asteroid vs regular
    const isCrystal = asteroid.size === 'large' && !!asteroid.special;
    // Base color: special crystal uses near-black; others use darker randomized gray (cached)
    if (!anyAst.baseFill) {
      if (isCrystal) {
        // Deep almost-black with a cold tint
        anyAst.baseFill = '#0b0d11';
        anyAst.strokeColor = '#1a1f29';
      } else {
        // Deterministic pseudo-random in 0..1
        const seed = asteroid.position.x * 0.131 + asteroid.position.y * 0.173 + r * 0.219;
        const n = Math.sin(seed * 12.9898) * 43758.5453;
        const t = n - Math.floor(n);
        const veryDark = t < 0.3; // ~30% are much darker
        let gray: number;
        if (asteroid.size === 'large') {
          // Large regular: rock-like but darker
          gray = 45 + Math.floor(t * 35); // 45..80
        } else if (veryDark) {
          gray = 55 + Math.floor(t * 30); // 55..85
        } else {
          gray = 80 + Math.floor(t * 40); // 80..120
        }
        const hex = gray.toString(16).padStart(2, '0');
        anyAst.baseFill = `#${hex}${hex}${hex}`;
        const strokeG = Math.min(255, gray + 35);
        anyAst.strokeColor = `#${strokeG.toString(16).padStart(2, '0').repeat(3)}`;
      }
    }
    ctx.fillStyle = anyAst.baseFill;
    ctx.fill();
    // Edge stroke
    ctx.strokeStyle = anyAst.strokeColor || '#b5b5b5';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Lighting: soft rim light on top-left
    {
      const grad = ctx.createRadialGradient(-r * 0.4, -r * 0.4, r * 0.2, 0, 0, r * 1.2);
      grad.addColorStop(0, isCrystal ? 'rgba(180,210,255,0.30)' : 'rgba(255,255,255,0.22)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      anyAst.shapePoints.forEach((p: {x:number,y:number}, i: number) => {
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.fill();
    }

    // Additional 3D shading for regular (non-crystal) asteroids
    if (!isCrystal) {
      // Directional shadow from top-left to bottom-right
      const lg = ctx.createLinearGradient(-r, -r, r, r);
      lg.addColorStop(0.55, 'rgba(0,0,0,0)');
      lg.addColorStop(1.0, 'rgba(0,0,0,0.28)');
      ctx.fillStyle = lg;
      ctx.beginPath();
      anyAst.shapePoints.forEach((p: {x:number,y:number}, i: number) => {
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.fill();

      // Soft highlight towards the light direction (top-left)
      const hg = ctx.createRadialGradient(-r * 0.5, -r * 0.5, r * 0.1, -r * 0.2, -r * 0.2, r * 0.9);
      hg.addColorStop(0, 'rgba(255,255,255,0.08)');
      hg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hg;
      ctx.beginPath();
      anyAst.shapePoints.forEach((p: {x:number,y:number}, i: number) => {
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.fill();
    }
    
    // Crystalline reflective look for the special large asteroid
    if (isCrystal) {
      ctx.save();
      // Facet lines: faint cool strokes from edges toward center
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = 'rgba(160,200,255,0.45)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < anyAst.shapePoints.length; i += 2) {
        const p = anyAst.shapePoints[i];
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x * 0.3, p.y * 0.3);
        ctx.stroke();
      }
      // Sharp specular streaks
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = 'rgba(200,230,255,0.95)';
      ctx.lineWidth = 1.4;
      const streaks = 4;
      for (let i = 0; i < streaks; i++) {
        const ang = -Math.PI / 5 + (i - 1.5) * 0.22;
        const len = r * (1.0 + i * 0.15);
        ctx.beginPath();
        ctx.moveTo(-Math.cos(ang) * len * 0.4, -Math.sin(ang) * len * 0.4);
        ctx.lineTo(Math.cos(ang) * len * 0.4, Math.sin(ang) * len * 0.4);
        ctx.stroke();
      }
      // Bright glints
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = 'rgba(220,240,255,0.98)';
      for (let i = 0; i < 3; i++) {
        const gx = (-0.25 + i * 0.22) * r;
        const gy = (-0.28 + i * 0.18) * r;
        ctx.beginPath();
        ctx.arc(gx, gy, Math.max(1.8, r * 0.035), 0, Math.PI * 2);
        ctx.fill();
      }
      // Subtle inner cold glow for glassy depth
      const core = ctx.createRadialGradient(-r * 0.1, -r * 0.15, 0, 0, 0, r * 1.0);
      core.addColorStop(0, 'rgba(90,110,140,0.10)');
      core.addColorStop(1, 'rgba(90,110,140,0)');
      ctx.globalAlpha = 1.0;
      ctx.fillStyle = core;
      ctx.beginPath();
      anyAst.shapePoints.forEach((p: {x:number,y:number}, i: number) => {
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    
    // Craters: randomized count 1..6, cached for stability
    const craters = anyAst.craters || (() => {
      const list: Array<{x:number,y:number,r:number}> = [];
      let seed = asteroid.position.x * 0.311 + asteroid.position.y * 0.197 + r * 0.421;
      const rand = () => {
        const v = Math.sin(seed * 12.9898) * 43758.5453;
        seed = v;
        return v - Math.floor(v);
      };
      const count = 1 + Math.floor(rand() * 6); // 1..6
      for (let i = 0; i < count; i++) {
        const ang = rand() * Math.PI * 2;
        const rad = rand() * 0.45 + 0.05; // 0.05..0.5 of radius from center
        const cx = Math.cos(ang) * r * rad * 1.6;
        const cy = Math.sin(ang) * r * rad * 1.6;
        const rr = r * (0.06 + rand() * 0.08); // size varies
        list.push({ x: cx, y: cy, r: rr });
      }
      anyAst.craters = list;
      return list;
    })();
    craters.forEach((c: {x:number,y:number,r:number}) => {
      // dark crater base
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fill();
      // inner highlight arc
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(c.x - c.r * 0.25, c.y - c.r * 0.25, c.r * 0.65, Math.PI * 0.1, Math.PI * 1.1);
      ctx.stroke();
    });
    
    // Small sparkly highlights
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    for (let i = 0; i < 3; i++) {
      const ang = i * 2 + 0.6;
      const rr = r * (0.25 + 0.12 * i);
      ctx.beginPath();
      ctx.arc(Math.cos(ang) * rr - r * 0.15, Math.sin(ang) * rr - r * 0.15, r * 0.06, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
}

export function drawAliens(
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  _env: EnvLike
): void {
  gameState.alienShips.forEach(ship => {
    ctx.save();
    // Doom sequence visuals for missile-type
    const missileType = !!ship.isMissileType;
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

    // Saucer body
    // Disable heavy shadow glows to avoid large-area wash; shading remains via fills/strokes
    if (missileType && doomStage === 2) {
      ctx.shadowColor = '#ff6b3a';
      ctx.shadowBlur = 0;
    } else if (missileType && doomStage === 3) {
      ctx.shadowColor = '#ffd8b0';
      ctx.shadowBlur = 0;
    } else {
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = missileType ? '#222326' : '#444444';
    ctx.strokeStyle = missileType ? '#ff6b3a' : '#666666';
    ctx.lineWidth = missileType ? 2.5 : 2;
    ctx.beginPath();
    ctx.ellipse(0, 2, 20, 8, 0, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    // Top dome (pulse for missile type)
    const pulse = missileType ? (0.85 + 0.15 * Math.sin(Date.now() * 0.006)) : 1;
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
    ctx.restore();

    // Health bar above ship (scale width by scale)
    const healthPercentage = ship.health / ship.maxHealth;
    const barWidth = 20 * scale;
    const barHeight = 3;
    ctx.fillStyle = '#333333';
    ctx.fillRect(ship.position.x - barWidth / 2, ship.position.y - ship.radius - 10, barWidth, barHeight);
    ctx.fillStyle = healthPercentage > 0.5 ? '#00ff00' : '#ff0000';
    ctx.fillRect(
      ship.position.x - barWidth / 2,
      ship.position.y - ship.radius - 10,
      barWidth * healthPercentage,
      barHeight
    );
  });
}

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

export function drawBonuses(
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  _env: EnvLike
): void {
  const bonuses = gameState.bonuses;
  bonuses.forEach(bonus => {
    ctx.save();
    ctx.translate(bonus.position.x, bonus.position.y);

    if (bonus.type === 'shield') {
      // Draw shield bonus - blue glowing hexagon with shield symbol
      const time = Date.now() * 0.003;
      const glowIntensity = 0.7 + Math.sin(time) * 0.3;

      // Outer glow
      ctx.fillStyle = `rgba(0, 150, 255, ${glowIntensity * 0.3})`;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * 2 * Math.PI;
        const x = Math.cos(angle) * 30;
        const y = Math.sin(angle) * 30;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();

      // Core hexagon
      ctx.fillStyle = 'rgba(0, 120, 255, 0.9)';
      ctx.strokeStyle = 'rgba(200, 230, 255, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * 2 * Math.PI;
        const x = Math.cos(angle) * 20;
        const y = Math.sin(angle) * 20;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Shield emblem
      ctx.fillStyle = '#e6f7ff';
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(8, -2);
      ctx.lineTo(6, 8);
      ctx.lineTo(-6, 8);
      ctx.lineTo(-8, -2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // muzzle flashes
      ctx.fillStyle = '#ffff66';
      ctx.beginPath(); ctx.arc(10, 0, 3, 0, 2 * Math.PI); ctx.fill();
      ctx.beginPath(); ctx.arc(-10, 0, 3, 0, 2 * Math.PI); ctx.fill();
    } else if (bonus.type === 'missile') {
      // Missile bonus: larger white missile icon with glow
      const time = Date.now() * 0.004;
      const pulse = 0.6 + 0.4 * Math.sin(time);
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 16 * pulse;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      // Draw a simple missile body
      ctx.save();
      ctx.rotate((Math.PI / 8) * Math.sin(time * 0.4));
      // nose
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-10, -6);
      ctx.lineTo(-10, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // fins
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(-12, -2); ctx.lineTo(-4, -2); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-6, 8); ctx.lineTo(-12, 2); ctx.lineTo(-4, 2); ctx.closePath(); ctx.fill();
      // small trail puff
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath(); ctx.arc(-14, 0, 4 + 2 * pulse, 0, 2 * Math.PI); ctx.fill();
      ctx.restore();
    } else {
      // unknown: no-op
    }

    ctx.restore();
  });
}
// Visual-only debris rendering (moved from Game.tsx)
export function drawDebris(
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  _env: EnvLike
): void {
  const arr = gameState.visualDebris;
  if (!arr || arr.length === 0) return;
  for (const d of arr) {
    const t = d.life / d.maxLife;
    const alpha = Math.max(0, 1 - t); // fade out
    ctx.save();
    ctx.globalAlpha = alpha * 0.9;
    ctx.translate(d.position.x, d.position.y);
    if (d.kind === 'chunk') {
      ctx.rotate(d.rotation ?? 0);
      ctx.fillStyle = d.color;
      // Draw small irregular quad/triangle
      ctx.beginPath();
      const s = d.size;
      ctx.moveTo(-s, -s * 0.6);
      ctx.lineTo(s * 0.8, -s * 0.4);
      ctx.lineTo(s, s * 0.5);
      ctx.lineTo(-s * 0.5, s * 0.7);
      ctx.closePath();
      ctx.fill();
    } else {
      // dust
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(0, 0, d.size * (0.8 + 0.4 * Math.random()), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// Explosion particles rendering (moved from Game.tsx)
export function drawExplosions(
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  _env: EnvLike
): void {
  const explosions = gameState.explosions;
  if (!explosions || explosions.length === 0) return;
  explosions.forEach(explosion => {
    explosion.particles.forEach(particle => {
      ctx.save();
      // Cap alpha to prevent additive white-out when many particles overlap
      const baseA = 1 - (particle.life / particle.maxLife);
      ctx.globalAlpha = Math.min(0.35, baseA);
      ctx.fillStyle = particle.color;
      // Draw particles with varying sizes (shrink over time)
      const currentSize = particle.size * (1 - (particle.life / particle.maxLife) * 0.5);
      ctx.fillRect(
        particle.position.x - currentSize / 2,
        particle.position.y - currentSize / 2,
        currentSize,
        currentSize
      );
      ctx.restore();
    });
  });
}

// Starfield update/draw extracted from Game.tsx. Requires refs provided in env.refs.
export function drawStars(
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  env: EnvLike,
  bgMap: unknown
): void {
  const r = env.refs as any;
  const CANVAS_WIDTH = ctx.canvas.width;
  const CANVAS_HEIGHT = ctx.canvas.height;

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

  // Draw stars with twinkling; during warp draw as dim points (streaks handled by warp particles)
  const bgData = r.bgImageDataRef.current as ImageData | null;
  const map = bgMap as any;
  const centerX = CANVAS_WIDTH / 2;
  const centerY = CANVAS_HEIGHT / 2;
  r.starsRef.current.forEach((star: any) => {
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
    if (warp > 0) {
      // During warp, draw small dim points; main motion comes from warp particles below
      const alpha = Math.min(0.6, star.brightness * 0.4);
      const size = 1;
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fillRect(star.x, star.y, size, size);
    } else {
      const alpha = star.brightness;
      const size = star.brightness > 0.8 ? 2 : 1;
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fillRect(star.x, star.y, size, size);
    }
  });

  // Warp particles: spawn from center and fly outward to simulate passing stars
  if (gameState.warpEffect > 0) {
    // Limit warp particle effect to 2 seconds from level end start
    const sinceLevelEnd = r.levelEndStartRef.current > 0 ? (performance.now() - r.levelEndStartRef.current) : 0;
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
      if (effWarp.warpTrails) {
        ctx.save();
        ctx.filter = `contrast(${fxC * 100}%) brightness(${fxB * 100}%)`;
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
        const t = p.life / p.maxLife;
        let alpha = Math.max(0, 1 - t) * Math.min(1, 0.4 + eased * 0.6);
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
      if (effWarp.warpTrails) {
        ctx.restore();
      }
    }
  } else if (r.warpParticlesRef.current.length) {
    // Clear any leftovers when not in warp
    r.warpParticlesRef.current.length = 0;
  }

  // Twinkling stars (background layer)
  {
    const stars = r.starsRef.current as any[];
    if (stars && stars.length) {
      const nowTs = performance.now();
      ctx.save();
      ctx.fillStyle = '#ffffff';
      // Scale star size slightly with area ratio so stars appear a bit larger when the playable area grows
      const areaRatio = Math.max(1, (CANVAS_WIDTH * CANVAS_HEIGHT) / Math.max(1, r.initialAreaRef.current));
      const starSize = Math.min(2, 1 + 0.35 * Math.sqrt(areaRatio));
      // Local effect params
      const effStars = r.effectsApplyRef.current;
      const fxAlphaS = Math.max(0, Math.min(1, r.bgOpacityRef.current));
      const fxCS = Math.max(0.0, r.bgContrastRef.current);
      const fxBS = Math.max(0.0, r.bgBrightnessRef.current);
      // Apply effects to stars if enabled
      const baseStarAlpha = effStars.stars ? fxAlphaS : 1;
      if (effStars.stars) {
        ctx.filter = `contrast(${fxCS * 100}%) brightness(${fxBS * 100}%)`;
      }
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i] as any;
        // Subtle parallax relative to player
        const x = ((s.x - gameState.player.position.x * 0.01) % CANVAS_WIDTH + CANVAS_WIDTH) % CANVAS_WIDTH;
        const y = ((s.y - gameState.player.position.y * 0.01) % CANVAS_HEIGHT + CANVAS_HEIGHT) % CANVAS_HEIGHT;
        // Twinkle between 0.2..1.0 based on speed and per-star phase via index
        const phase = i * 1.7; // deterministic per-star offset
        const tw = 0.2 + 0.8 * (0.5 + 0.5 * Math.sin(nowTs * s.twinkleSpeed * 0.006 + phase));
        ctx.globalAlpha = (tw * s.brightness) * baseStarAlpha;
        ctx.fillRect(x, y, starSize, starSize);
      }
      ctx.restore();
    }
  }

  // Add some larger, more distant stars that move slower
  if (gameState.gameRunning && !r.isPausedRef.current) {
    const effDist = r.effectsApplyRef.current;
    // Local effect params
    const fxAlphaD = Math.max(0, Math.min(1, r.bgOpacityRef.current));
    const fxCD = Math.max(0.0, r.bgContrastRef.current);
    const fxBD = Math.max(0.0, r.bgBrightnessRef.current);
    // Apply effects to distant stars if enabled
    const baseDistAlpha = effDist.distantStars ? fxAlphaD : 1;
    ctx.save();
    if (effDist.distantStars) {
      ctx.filter = `contrast(${fxCD * 100}%) brightness(${fxBD * 100}%)`;
    }
    ctx.fillStyle = `rgba(200, 200, 255, ${0.3 * baseDistAlpha})`;
    for (let i = 0; i < 20; i++) {
      const x = ((i * 127 - gameState.player.position.x * 0.02) % CANVAS_WIDTH + CANVAS_WIDTH) % CANVAS_WIDTH;
      const y = ((i * 83 - gameState.player.position.y * 0.02) % CANVAS_HEIGHT + CANVAS_HEIGHT) % CANVAS_HEIGHT;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();
  }
}
// Background rendering extracted from Game.tsx. This function relies on refs passed via env.refs
// to avoid circular imports and preserve behavior. It intentionally uses performance.now() in
// the same places the original code did (no additional resampling beyond original behavior).
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  env: EnvLike
): { sx: number; sy: number; sw: number; sh: number; iw: number; ih: number } | null {
  const r = env.refs as any;
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
      const nowTsEarly = performance.now();
      pOutEarly = Math.max(0, Math.min(1, (nowTsEarly - r.levelEndStartRef.current) / r.DUCK_HOLD_MS));
    }
    // Accelerate zoom-in (ease-in) and increase intensity to ~+240%
    const zoomEase = pOutEarly * pOutEarly; // accelerate
    // Intro zoom: start at +20% and ease back to 0 over 2s
    const tIntro = Math.max(0, Math.min(1, (performance.now() - r.introZoomStartRef.current) / r.INTRO_ZOOM_DUR_MS));
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
    const nowPerf = performance.now();
    const perfActive = (r.perfModeRef.current || ufoPresent || (nowPerf - r.lastMissileEventRef.current) < 1500);

    // Motion Trails: gently fade prior frame, but suspend during missile effects and fade back in
    if (r.trailsEnabledRef.current) {
      const nowFade = performance.now();
      let trailsAlpha = 1;
      if (nowFade < r.trailsSuspendUntilRef.current || perfActive) {
        trailsAlpha = 0; // fully suspended
      } else if (r.trailsFadeInStartRef.current > 0 || r.trailsSuspendUntilRef.current > 0) {
        if (r.trailsFadeInStartRef.current === 0) r.trailsFadeInStartRef.current = nowFade;
        const t = Math.max(0, Math.min(1, (nowFade - r.trailsFadeInStartRef.current) / 600));
        trailsAlpha = t;
      }
      if (trailsAlpha > 0) {
        ctx.save();
        const cap = perfActive ? 0.18 : 0.25;
        const base = Math.max(0.08, Math.min(cap, r.trailsStrengthRef.current));
        const fade = base * trailsAlpha;
        ctx.globalAlpha = fade;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.restore();
      }
    }

    // Draw with current opacity/filters, factoring crossfade states
    const nowTs = performance.now();
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
      // Clear to black
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      // Draw bg increasing alpha
      ctx.save();
      ctx.globalAlpha = (useFxBg ? oBase : 1) * pIn;
      ctx.filter = (useFxBg && !suppressBgFilter) ? `contrast(${c * 100}%) brightness(${b * 100}%)` : 'none';
      ctx.drawImage(bg, sx, sy, sw, sh, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.restore();
      // Capture background and apply distortion pulses BEFORE drawing gameplay sprites
      if (r.distortionRef.current) {
        try {
          const bgBuf = r.distortionRef.current.captureBackground(ctx);
          const nowTs2 = performance.now();
          const coarse = !!r.perfModeRef.current; // coarser grid when perf mode is active
          r.distortionRef.current.renderSimple(ctx, bgBuf, nowTs2, { debugRing: false, perfCoarse: coarse });
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
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      }
      ctx.globalAlpha = useFxBg ? oBase : 1;
      ctx.filter = useFxBg ? `contrast(${c * 100}%) brightness(${b * 100}%)` : 'none';
      ctx.drawImage(bg, sx, sy, sw, sh, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.restore();
      // Capture background and apply distortion pulses in normal draw branch as well
      if (r.distortionRef.current) {
        try {
          const bgBuf = r.distortionRef.current.captureBackground(ctx);
          const nowTs2 = performance.now();
          const coarse = !!r.perfModeRef.current; // coarser grid when perf mode is active
          r.distortionRef.current.renderSimple(ctx, bgBuf, nowTs2, { debugRing: true, perfCoarse: coarse });
        } catch {}
      }
      // If level is ending, fade to black over the duck hold duration
      if (gameState.levelComplete && r.levelEndStartRef.current > 0) {
        const pOut = Math.max(0, Math.min(1, (nowTs - r.levelEndStartRef.current) / r.DUCK_HOLD_MS));
        if (pOut > 0) {
          ctx.save();
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
      ctx.fillStyle = '#000011';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    } else {
      // Transparent background lets body wallpaper show through
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
  }
  // Reset any filter/alpha side-effects before drawing stars/objects
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  return bgMap;
}
