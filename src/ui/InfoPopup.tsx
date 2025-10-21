import { useEffect, useRef } from 'react';
import './infoPopup.css';
import { Asteroid } from '../types';

type Props = {
  open: boolean;
  onClose: () => void;
};

// Star for background
interface Star {
  x: number;
  y: number;
  size: number;
  opacity: number;
  twinkleSpeed: number;
  twinklePhase: number;
}

export default function InfoPopup({ open, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const asteroidsRef = useRef<Asteroid[]>([]);
  const starsRef = useRef<Star[]>([]);
  const animationFrameRef = useRef<number>();

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Animated background with asteroids and stars
  useEffect(() => {
    if (!open || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Initialize stars
    if (starsRef.current.length === 0) {
      for (let i = 0; i < 100; i++) {
        starsRef.current.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 2 + 0.5,
          opacity: Math.random() * 0.5 + 0.3,
          twinkleSpeed: Math.random() * 0.02 + 0.01,
          twinklePhase: Math.random() * Math.PI * 2
        });
      }
    }

    // Initialize asteroids using game asteroid format
    if (asteroidsRef.current.length === 0) {
      const sizes: ('small' | 'medium' | 'large')[] = ['small', 'medium', 'large'];
      
      for (let i = 0; i < 12; i++) {
        const size = sizes[Math.floor(Math.random() * sizes.length)];
        const radius = size === 'small' ? 15 : size === 'medium' ? 30 : 50;
        
        asteroidsRef.current.push({
          position: {
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height
          },
          velocity: {
            x: (Math.random() - 0.5) * 0.5,
            y: (Math.random() - 0.5) * 0.5
          },
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.02,
          size,
          radius,
          health: 1,
          maxHealth: 1,
          mass: radius * 0.1
        });
      }
    }

    // Animation loop
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw stars
      starsRef.current.forEach(star => {
        star.twinklePhase += star.twinkleSpeed;
        const twinkle = Math.sin(star.twinklePhase) * 0.3 + 0.7;
        ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity * twinkle})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw and update asteroids (using game rendering)
      asteroidsRef.current.forEach(ast => {
        // Update position
        ast.position.x += ast.velocity.x;
        ast.position.y += ast.velocity.y;
        ast.rotation += ast.rotationSpeed;

        // Wrap around edges
        if (ast.position.x < -ast.radius) ast.position.x = canvas.width + ast.radius;
        if (ast.position.x > canvas.width + ast.radius) ast.position.x = -ast.radius;
        if (ast.position.y < -ast.radius) ast.position.y = canvas.height + ast.radius;
        if (ast.position.y > canvas.height + ast.radius) ast.position.y = -ast.radius;

        // Draw asteroid using game's rendering (50% transparent)
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.translate(ast.position.x, ast.position.y);
        ctx.rotate(ast.rotation);
        
        // Use game's asteroid shape rendering
        const r = ast.radius;
        const points = 14;
        const jitter = (i: number) => {
          const s = Math.sin(i * 12.9898 + r * 78.233) * 43758.5453;
          return (s - Math.floor(s)) * 0.4 - 0.2;
        };
        
        ctx.beginPath();
        for (let i = 0; i < points; i++) {
          const ang = (i / points) * Math.PI * 2;
          const rr = r * (0.85 + jitter(i));
          const x = Math.cos(ang) * rr;
          const y = Math.sin(ang) * rr;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        
        // Fill and stroke like game asteroids
        ctx.fillStyle = '#3a3a3a';
        ctx.fill();
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        ctx.restore();
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
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
