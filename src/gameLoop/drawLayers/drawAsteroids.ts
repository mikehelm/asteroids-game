import type { GameState, Asteroid } from '../../types';
import type { EnvLike } from '../draw';

function drawOneAsteroid(ctx: CanvasRenderingContext2D, asteroid: Asteroid, env: EnvLike): void {
    ctx.save();
    ctx.translate(asteroid.position.x, asteroid.position.y);
    ctx.rotate(asteroid.rotation);
    // Detailed procedural asteroid with cached irregular shape, shading and craters
    const r = asteroid.radius;
    const anyAst = asteroid as Asteroid & { shapePoints?: Array<{x:number,y:number}>; baseFill?: string; strokeColor?: string; craters?: Array<{x:number,y:number,r:number}>; artifactPattern?: number; artifactTint?: 'black'|'charcoal'|'deep-purple' };
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
        // Artifact base tint variants (deep, muted)
        const tint = anyAst.artifactTint || 'black';
        if (tint === 'black') {
          anyAst.baseFill = '#0b0d11'; // deep black
          anyAst.strokeColor = '#171a1f';
        } else if (tint === 'charcoal') {
          anyAst.baseFill = '#141416'; // charcoal
          anyAst.strokeColor = '#22252b';
        } else {
          anyAst.baseFill = '#14101a'; // very dark purple
          anyAst.strokeColor = '#231a2e';
        }
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
    // Special asteroids: Visual states with colored body (NO colored edge lines)
    if (isCrystal) {
      const specialState = (asteroid as any).specialState || 'normal'; // 'normal', 'scanned', 'hacked'
      
      if (specialState === 'scanned') {
        // Player has scanned: Subtle cyan-tinted body showing ownership
        // Base fill first
        ctx.fillStyle = anyAst.baseFill;
        ctx.fill();
        
        // Cyan tinted overlay on body
        const cyanOverlay = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
        cyanOverlay.addColorStop(0, 'rgba(100, 200, 255, 0.25)');
        cyanOverlay.addColorStop(0.6, 'rgba(100, 200, 255, 0.12)');
        cyanOverlay.addColorStop(1, 'rgba(100, 200, 255, 0)');
        ctx.fillStyle = cyanOverlay;
        ctx.fill();
        
        // Subtle cyan edge (no glow)
        ctx.strokeStyle = 'rgba(120, 210, 255, 0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();
        
      } else if (specialState === 'hacked') {
        // UFO hacked: Depleted/broken look with reddish body tinge
        // Darker base fill
        const depletedFill = anyAst.baseFill.replace(/\d+/g, (match: string) => {
          return String(Math.floor(parseInt(match) * 0.5)); // 50% darker
        });
        ctx.fillStyle = depletedFill;
        ctx.fill();
        
        // Add reddish depleted tinge overlay on body
        const depletedOverlay = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
        depletedOverlay.addColorStop(0, 'rgba(120, 30, 30, 0.3)');
        depletedOverlay.addColorStop(0.6, 'rgba(80, 20, 20, 0.15)');
        depletedOverlay.addColorStop(1, 'rgba(60, 15, 15, 0)');
        ctx.fillStyle = depletedOverlay;
        ctx.fill();
        
        // Broken/cracked edge effect
        ctx.strokeStyle = 'rgba(100, 40, 40, 0.7)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]); // Dashed/broken edge
        ctx.stroke();
        ctx.setLineDash([]); // Reset
        
      } else {
        // Normal state: Standard appearance (no colored lines)
        ctx.fillStyle = anyAst.baseFill;
        ctx.fill();
        ctx.strokeStyle = anyAst.strokeColor || '#b5b5b5';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      
    } else {
      // Regular asteroids: Health-based edge glow (50% more transparent, 0.3s fade in 3 stages)
      const edgeColor = anyAst.strokeColor || '#b5b5b5';
      let healthColor = null;
      let fadeAlpha = 0;
      
      if (asteroid.health !== undefined && asteroid.maxHealth) {
        const healthPercent = asteroid.health / asteroid.maxHealth;
        
        if (healthPercent < 1.0) {
          // Calculate damage color
          let r, g, b;
          if (healthPercent > 0.66) {
            // 100% → 66%: green-yellow
            const t = (1.0 - healthPercent) / 0.34;
            r = Math.floor(100 + (200 - 100) * t);
            g = Math.floor(220 - (20 * t));
            b = 50;
          } else if (healthPercent > 0.33) {
            // 66% → 33%: yellow → orange
            const t = (0.66 - healthPercent) / 0.33;
            r = Math.floor(200 + (255 - 200) * t);
            g = Math.floor(200 - (100 * t));
            b = 50;
          } else {
            // 33% → 0%: orange → red
            const t = healthPercent / 0.33;
            r = 255;
            g = Math.floor(100 * t);
            b = Math.floor(50 * t);
          }
          
          healthColor = `rgb(${r}, ${g}, ${b})`;
          
          // Calculate fade in 3 stages over 0.3 seconds (100% -> 66% -> 33% -> 0%)
          const now = performance.now();
          const lastHitTime = (asteroid as any).lastHitTime || 0;
          const timeSinceHit = now - lastHitTime;
          
          if (timeSinceHit < 300) {
            // 3 stages: 0-100ms=100%, 100-200ms=66%, 200-300ms=33%
            if (timeSinceHit < 100) {
              fadeAlpha = 1.0;
            } else if (timeSinceHit < 200) {
              fadeAlpha = 0.66;
            } else {
              fadeAlpha = 0.33;
            }
          }
          
          // Store health color on asteroid for effects to use
          (asteroid as any).healthColor = healthColor;
        }
      }
      
      // Base fill
      ctx.fillStyle = anyAst.baseFill;
      ctx.fill();
      
      // Draw edge stroke with fading glow (50% more transparent)
      if (healthColor && fadeAlpha > 0) {
        // Outer glow with fade (50% more transparent)
        const glowIntensity = 1.0 - (asteroid.health / asteroid.maxHealth);
        const transparency = fadeAlpha * 0.5; // 50% more transparent
        ctx.shadowColor = healthColor.replace('rgb', 'rgba').replace(')', `, ${transparency * 0.6})`);
        ctx.shadowBlur = 8 * glowIntensity * transparency;
        ctx.strokeStyle = healthColor.replace('rgb', 'rgba').replace(')', `, ${transparency})`);
        ctx.lineWidth = 2 + (glowIntensity * 2 * transparency);
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else {
        // Normal edge
        ctx.strokeStyle = edgeColor;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    
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
    
    // Crystalline reflective look for the special large asteroid with pattern variants
    if (isCrystal) {
      ctx.save();
      // Facet lines: faint cool strokes from edges toward center
      ctx.globalAlpha = 0.22;
      // Slight hue shift for purple tint
      const coolStroke = (anyAst.artifactTint === 'deep-purple') ? 'rgba(190,170,255,0.45)' : 'rgba(160,200,255,0.45)';
      ctx.strokeStyle = coolStroke;
      ctx.lineWidth = 1.2;
      const pat = (anyAst.artifactPattern ?? 0) % 5;
      const step = pat === 0 ? 2 : pat === 1 ? 3 : pat === 2 ? 1 : pat === 3 ? 2 : 4;
      for (let i = 0; i < anyAst.shapePoints.length; i += step) {
        const p = anyAst.shapePoints[i];
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        const k = pat === 2 ? 0.25 : pat === 4 ? 0.35 : 0.3;
        ctx.lineTo(p.x * k, p.y * k);
        ctx.stroke();
      }
      // Sharp specular streaks
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = (anyAst.artifactTint === 'deep-purple') ? 'rgba(220,210,255,0.95)' : 'rgba(200,230,255,0.95)';
      ctx.lineWidth = 1.4;
      const streaks = pat === 1 ? 3 : 4;
      for (let i = 0; i < streaks; i++) {
        const ang = -Math.PI / 5 + (i - 1.5) * (pat === 3 ? 0.18 : 0.22);
        const len = r * (1.0 + i * 0.15);
        ctx.beginPath();
        ctx.moveTo(-Math.cos(ang) * len * 0.4, -Math.sin(ang) * len * 0.4);
        ctx.lineTo(Math.cos(ang) * len * 0.4, Math.sin(ang) * len * 0.4);
        ctx.stroke();
      }
      // Bright glints
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = (anyAst.artifactTint === 'deep-purple') ? 'rgba(230,220,255,0.98)' : 'rgba(220,240,255,0.98)';
      for (let i = 0; i < 3; i++) {
        const gx = (-0.25 + i * 0.22) * r;
        const gy = (-0.28 + i * 0.18) * r;
        ctx.beginPath();
        ctx.arc(gx, gy, Math.max(1.8, r * 0.035), 0, Math.PI * 2);
        ctx.fill();
      }
      // Subtle inner cold glow for glassy depth
      const core = ctx.createRadialGradient(-r * 0.1, -r * 0.15, 0, 0, 0, r * 1.0);
      core.addColorStop(0, anyAst.artifactTint === 'deep-purple' ? 'rgba(130,110,180,0.10)' : 'rgba(90,110,140,0.10)');
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
    // Artifact edge glow (short red arc), driven by update code timestamps; use env.frameNow only
    try {
      const anyAst2 = asteroid as Asteroid & { edgeGlowUntil?: number; edgeGlowAngle?: number };
      const until = anyAst2.edgeGlowUntil ?? 0;
      if (asteroid.special && until > (env as any).frameNow) {
        const now = (env as any).frameNow as number;
        const duration = 600;
        const t = Math.max(0, Math.min(1, (until - now) / duration));
        const alpha = t * 0.85;
        const span = Math.PI * (50 / 180); // ~50 degrees total span
        const localAngle = (anyAst2.edgeGlowAngle ?? 0) - asteroid.rotation; // account for current rotation
        ctx.save();
        ctx.strokeStyle = `rgba(200,0,0,${alpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r + 2, localAngle - span * 0.5, localAngle + span * 0.5);
        ctx.stroke();
        ctx.restore();
      }
    } catch { /* ignore */ }
    ctx.restore();
}

/** Threaded environment from Game.tsx (refs/config). If prefixed with _, it’s intentionally unused here. */
export function drawAsteroids(
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  env: EnvLike
): void {
  gameState.asteroids.forEach(asteroid => drawOneAsteroid(ctx, asteroid, env));
}

/** Draw only the special asteroid(s) (e.g., docking target) */
export function drawSpecialAsteroids(
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  env: EnvLike
): void {
  for (const a of gameState.asteroids) {
    if ((a as any).special) drawOneAsteroid(ctx, a, env);
  }
}

/** Draw only non-special (normal) asteroids */
export function drawNormalAsteroids(
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  env: EnvLike
): void {
  for (const a of gameState.asteroids) {
    if (!(a as any).special) drawOneAsteroid(ctx, a, env);
  }
}
