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

  // Animate ship
  useEffect(() => {
    if (!open || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    startTimeRef.current = performance.now();

    const animate = (now: number) => {
      const elapsed = (now - startTimeRef.current) / 1000; // seconds
      
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Determine health state based on time (1 second each, end on green)
      let shipColor, glowColor;
      if (elapsed < 1) {
        // Red (low health)
        shipColor = '#ff3333';
        glowColor = '#ff3333';
      } else if (elapsed < 2) {
        // Yellow (medium health)
        shipColor = '#ffcc00';
        glowColor = '#ffcc00';
      } else {
        // Green (full health) - stays here
        shipColor = '#00ff66';
        glowColor = '#00ff66';
      }
      
      // After 3 seconds, ship flies around in header area
      let shipX, shipY, shipRotation;
      if (elapsed < 3) {
        // Centered during health cycle
        shipX = canvas.width / 2;
        shipY = canvas.height / 2;
        shipRotation = 0;
      } else {
        // Flying around after health cycle complete
        const flyTime = elapsed - 3;
        const radius = 25;
        shipX = canvas.width / 2 + Math.cos(flyTime * 1.2) * radius;
        shipY = canvas.height / 2 + Math.sin(flyTime * 1.2) * radius * 0.6;
        shipRotation = Math.atan2(Math.sin(flyTime * 1.2) * 0.6, Math.cos(flyTime * 1.2)) + Math.PI / 2;
      }
      
      // Draw ship
      ctx.save();
      ctx.translate(shipX, shipY);
      ctx.rotate(shipRotation);
      
      const shipSize = 20;
      
      // Glow effect
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 15;
      
      // Ship body (triangle)
      ctx.fillStyle = shipColor;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -shipSize);
      ctx.lineTo(-shipSize * 0.6, shipSize * 0.7);
      ctx.lineTo(shipSize * 0.6, shipSize * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // Cockpit
      ctx.fillStyle = 'rgba(100, 200, 255, 0.6)';
      ctx.beginPath();
      ctx.arc(0, -shipSize * 0.3, shipSize * 0.25, 0, Math.PI * 2);
      ctx.fill();
      
      // Engine flames (animated)
      const flameLength = 8 + Math.sin(elapsed * 10) * 4;
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#ff6600';
      ctx.fillStyle = '#ff6600';
      ctx.beginPath();
      ctx.moveTo(-shipSize * 0.3, shipSize * 0.7);
      ctx.lineTo(-shipSize * 0.15, shipSize * 0.7 + flameLength);
      ctx.lineTo(0, shipSize * 0.7);
      ctx.closePath();
      ctx.fill();
      
      ctx.beginPath();
      ctx.moveTo(shipSize * 0.3, shipSize * 0.7);
      ctx.lineTo(shipSize * 0.15, shipSize * 0.7 + flameLength);
      ctx.lineTo(0, shipSize * 0.7);
      ctx.closePath();
      ctx.fill();
      
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
