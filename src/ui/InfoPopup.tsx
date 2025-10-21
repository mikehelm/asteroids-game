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
    
    // Flight state
    let shipX = canvas.width / 2;
    let shipY = canvas.height / 2;
    let velocityX = 0;
    let velocityY = 0;
    let rotation = -Math.PI / 2; // Point up initially
    let targetX = shipX;
    let targetY = shipY;
    let isMoving = false;
    let nextTargetTime = 0;

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
      
      // After 5 seconds, start flying around
      if (elapsed >= 5) {
        // Pick new target location every few seconds
        if (now >= nextTargetTime) {
          const margin = 30;
          targetX = margin + Math.random() * (canvas.width - margin * 2);
          targetY = margin + Math.random() * (canvas.height - margin * 2);
          isMoving = true;
          nextTargetTime = now + 2000 + Math.random() * 2000; // 2-4 seconds
        }
        
        if (isMoving) {
          // Calculate direction to target
          const dx = targetX - shipX;
          const dy = targetY - shipY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance > 5) {
            // Accelerate towards target
            const acceleration = 0.3;
            const maxSpeed = 2;
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
            rotation += rotDiff * 0.1; // Smooth rotation
          } else {
            // Decelerate when close to target
            velocityX *= 0.9;
            velocityY *= 0.9;
            if (Math.abs(velocityX) < 0.1 && Math.abs(velocityY) < 0.1) {
              velocityX = 0;
              velocityY = 0;
              isMoving = false;
            }
          }
          
          // Update position
          shipX += velocityX;
          shipY += velocityY;
          
          // Keep in bounds
          shipX = Math.max(20, Math.min(canvas.width - 20, shipX));
          shipY = Math.max(20, Math.min(canvas.height - 20, shipY));
        }
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
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="ip-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="ip-card" onClick={(e) => e.stopPropagation()}>
        <button className="ip-close" aria-label="Close" onClick={onClose}>×</button>
        
        {/* Hero Section */}
        <div className="ip-hero">
          <div className="ip-icon-burst">
            <canvas 
              ref={canvasRef} 
              width={120} 
              height={80}
              style={{ display: 'block', margin: '0 auto' }}
            />
          </div>
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
  );
}
