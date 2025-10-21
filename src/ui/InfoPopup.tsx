import { useEffect, useRef } from 'react';
import './infoPopup.css';

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function InfoPopup({ open, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const startTimeRef = useRef<number>(0);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Animate ship with realistic flight
  useEffect(() => {
    if (!open || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    startTimeRef.current = performance.now();
    
    // Flight state - start in top left corner
    let shipX = 40;
    let shipY = 40;
    let velocityX = 0;
    let velocityY = 0;
    let rotation = -Math.PI / 2; // Point up initially
    let mouseX = canvas.width / 2;
    let mouseY = canvas.height / 2;
    let hasMouseMoved = false;

    // Obstacle zones (text sections to avoid)
    const obstacles = [
      { x: 100, y: 0, width: 580, height: 120 }, // Title area
      { x: 80, y: 150, width: 620, height: 100 }, // Features grid
      { x: 80, y: 270, width: 620, height: 200 }, // Invite section
      { x: 80, y: 490, width: 620, height: 100 }, // CTA button
    ];

    // Mouse tracking
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = ((e.clientX - rect.left) / rect.width) * canvas.width;
      mouseY = ((e.clientY - rect.top) / rect.height) * canvas.height;
      hasMouseMoved = true;
    };

    canvas.addEventListener('mousemove', handleMouseMove);

    // Ship rendering functions (from game)
    const drawTier1 = (ctx: CanvasRenderingContext2D) => {
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(15, 0);
      ctx.lineTo(-10, -8);
      ctx.lineTo(-5, 0);
      ctx.lineTo(-10, 8);
      ctx.closePath();
      ctx.stroke();
    };

    const drawTier2 = (ctx: CanvasRenderingContext2D) => {
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

    const drawTier3 = (ctx: CanvasRenderingContext2D, time: number) => {
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

    const drawTier4 = (ctx: CanvasRenderingContext2D, time: number) => {
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

    const drawTier5 = (ctx: CanvasRenderingContext2D) => {
      ctx.save();
      ctx.translate(-2, 0);
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

    const animate = (now: number) => {
      const elapsed = (now - startTimeRef.current) / 1000;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Determine tier based on time (1 second each, cycling through tiers)
      let tier;
      if (elapsed < 1) tier = 1;
      else if (elapsed < 2) tier = 2;
      else if (elapsed < 3) tier = 3;
      else if (elapsed < 4) tier = 4;
      else tier = 5; // Stay at tier 5 (healthiest)
      
      // After 5 seconds, start following mouse
      if (elapsed >= 5) {
        // Always use actual mouse position as target
        const targetX = mouseX;
        const targetY = mouseY;
        
        // Calculate base direction to target
        let dx = targetX - shipX;
        let dy = targetY - shipY;
        
        // Strong obstacle avoidance with steering
        let avoidanceX = 0;
        let avoidanceY = 0;
        
        for (const obs of obstacles) {
          // Expand obstacle bounds for avoidance
          const expandedObs = {
            x: obs.x - 40,
            y: obs.y - 40,
            width: obs.width + 80,
            height: obs.height + 80
          };
          
          // Check if ship is inside or near obstacle
          const isNearX = shipX >= expandedObs.x && shipX <= expandedObs.x + expandedObs.width;
          const isNearY = shipY >= expandedObs.y && shipY <= expandedObs.y + expandedObs.height;
          
          if (isNearX && isNearY) {
            // Find closest edge to escape from
            const distToLeft = Math.abs(shipX - expandedObs.x);
            const distToRight = Math.abs(shipX - (expandedObs.x + expandedObs.width));
            const distToTop = Math.abs(shipY - expandedObs.y);
            const distToBottom = Math.abs(shipY - (expandedObs.y + expandedObs.height));
            
            const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
            
            // Push away from nearest edge with strong force
            const pushStrength = 100;
            if (minDist === distToLeft) avoidanceX -= pushStrength;
            else if (minDist === distToRight) avoidanceX += pushStrength;
            else if (minDist === distToTop) avoidanceY -= pushStrength;
            else if (minDist === distToBottom) avoidanceY += pushStrength;
          }
          
          // Also check if direct path to target crosses obstacle
          const pathCrossesObs = 
            targetX >= obs.x && targetX <= obs.x + obs.width &&
            targetY >= obs.y && targetY <= obs.y + obs.height;
          
          if (pathCrossesObs) {
            // Steer around obstacle - go around the side
            const obsCenterX = obs.x + obs.width / 2;
            const obsCenterY = obs.y + obs.height / 2;
            
            // Determine which way to go around
            if (shipX < obsCenterX) {
              // Ship is on left, steer left
              avoidanceX -= 30;
            } else {
              // Ship is on right, steer right
              avoidanceX += 30;
            }
            
            if (shipY < obsCenterY) {
              // Ship is above, steer up
              avoidanceY -= 30;
            } else {
              // Ship is below, steer down
              avoidanceY += 30;
            }
          }
        }
        
        // Combine target direction with avoidance
        dx += avoidanceX;
        dy += avoidanceY;
        
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 5) {
          // Accelerate towards adjusted target
          const acceleration = 0.5;
          const maxSpeed = 4;
          velocityX += (dx / distance) * acceleration;
          velocityY += (dy / distance) * acceleration;
          
          // Cap speed
          const speed = Math.sqrt(velocityX * velocityX + velocityY * velocityY);
          if (speed > maxSpeed) {
            velocityX = (velocityX / speed) * maxSpeed;
            velocityY = (velocityY / speed) * maxSpeed;
          }
          
          // Rotate to face movement direction
          const targetRotation = Math.atan2(velocityY, velocityX);
          let rotDiff = targetRotation - rotation;
          // Normalize to -PI to PI
          while (rotDiff > Math.PI) rotDiff -= 2 * Math.PI;
          while (rotDiff < -Math.PI) rotDiff += 2 * Math.PI;
          rotation += rotDiff * 0.15; // Smooth rotation
        } else {
          // Decelerate when close to target
          velocityX *= 0.9;
          velocityY *= 0.9;
        }
        
        // Update position
        shipX += velocityX;
        shipY += velocityY;
        
        // Keep in bounds
        shipX = Math.max(20, Math.min(canvas.width - 20, shipX));
        shipY = Math.max(20, Math.min(canvas.height - 20, shipY));
      }
      
      // Draw ship
      ctx.save();
      ctx.translate(shipX, shipY);
      ctx.rotate(rotation);
      
      // Draw appropriate tier
      const time = elapsed * 0.6;
      switch (tier) {
        case 1: drawTier1(ctx); break;
        case 2: drawTier2(ctx); break;
        case 3: drawTier3(ctx, time); break;
        case 4: drawTier4(ctx, time); break;
        case 5: drawTier5(ctx); break;
      }
      
      // Draw thrust when moving
      const speed = Math.sqrt(velocityX * velocityX + velocityY * velocityY);
      if (speed > 0.5) {
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
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      canvas.removeEventListener('mousemove', handleMouseMove);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="ip-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="ip-card" onClick={(e) => e.stopPropagation()} style={{ position: 'relative' }}>
        {/* Full-size background canvas for ship */}
        <canvas 
          ref={canvasRef} 
          width={780} 
          height={900}
          style={{ 
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 0
          }}
        />
        
        {/* Content overlay */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <button className="ip-close" aria-label="Close" onClick={onClose}>×</button>
          
          {/* Hero Section */}
          <div className="ip-hero">
            <h2 className="ip-title">Flipit Asteroids</h2>
            <p className="ip-subtitle">Play Free, Win Big</p>
          </div>

        {/* Features Grid */}
        <div className="ip-features">
          <div className="ip-feature">
            <div className="ip-feature-icon">💰</div>
            <div className="ip-feature-content">
              <h3 className="ip-feature-title">Win up to $10,000</h3>
              <p className="ip-feature-desc">Random Flipit rewards await</p>
            </div>
          </div>

          <div className="ip-feature">
            <div className="ip-feature-icon">🎁</div>
            <div className="ip-feature-content">
              <h3 className="ip-feature-title">Node Giveaways</h3>
              <p className="ip-feature-desc">Exclusive drops with lasting value</p>
            </div>
          </div>
        </div>

        {/* Featured: Invite Friends */}
        <div className="ip-featured-section">
          <div className="ip-featured-badge">Invite for rewards!</div>
          <div className="ip-featured-card">
            <div className="ip-featured-icon">🤝</div>
            <h3 className="ip-featured-title">Invite Friends & Match Rewards!</h3>
            <p className="ip-featured-desc">
              When your friends win big, <strong>you win too!</strong> Get matching rewards for every prize they unlock. 
              The more friends, the more chances to win.
            </p>
            <div className="ip-featured-highlight">
              💎 <strong>100% Reward Match</strong> on all friend prizes
            </div>
          </div>
        </div>

          {/* CTA Button */}
          <button className="ip-cta" onClick={onClose}>
            <span className="ip-cta-main">Continue Playing</span>
            <span className="ip-cta-sub">Good luck, pilot. 🛸</span>
          </button>
        </div>
      </div>
    </div>
  );
}
