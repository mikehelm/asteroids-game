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
    let stuckCounter = 0; // Track how long ship has been stuck
    let waypoint: { x: number; y: number } | null = null; // Current pathfinding waypoint

    // Get forbidden zones from actual DOM elements
    const getForbiddenZones = (): Array<{ x: number; y: number; width: number; height: number }> => {
      const zones: Array<{ x: number; y: number; width: number; height: number }> = [];
      const canvasRect = canvas.getBoundingClientRect();
      
      // Get all elements with specific classes that should be avoided
      const selectors = [
        '.ip-title',          // Title text
        '.ip-subtitle',       // Subtitle text  
        '.ip-feature',        // Feature boxes
        '.ip-featured-badge', // Orange button
        '.ip-featured-card',  // Invite friends container
        '.ip-cta'             // Continue playing button
      ];
      
      selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          const rect = el.getBoundingClientRect();
          
          // Convert to canvas coordinates with tighter bounds (reduce padding)
          const padding = 10; // Reduce zone by 10px on each side
          const x = ((rect.left - canvasRect.left) / canvasRect.width) * canvas.width + padding;
          const y = ((rect.top - canvasRect.top) / canvasRect.height) * canvas.height + padding;
          const width = (rect.width / canvasRect.width) * canvas.width - (padding * 2);
          const height = (rect.height / canvasRect.height) * canvas.height - (padding * 2);
          
          // Only add if zone is still valid after padding reduction
          if (width > 0 && height > 0) {
            zones.push({ x, y, width, height });
          }
        });
      });
      
      return zones;
    };
    
    // Get initial forbidden zones
    let forbiddenZones = getForbiddenZones();

    // Helper function to check if point is in any forbidden zone
    const isInForbiddenZone = (x: number, y: number): boolean => {
      for (const zone of forbiddenZones) {
        if (x >= zone.x && x <= zone.x + zone.width &&
            y >= zone.y && y <= zone.y + zone.height) {
          return true;
        }
      }
      return false;
    };

    // Find a waypoint to navigate around obstacles
    const findWaypoint = (fromX: number, fromY: number, toX: number, toY: number): { x: number; y: number } | null => {
      // Check if direct path is clear
      if (!isInForbiddenZone(toX, toY)) {
        // Try to find a point that's not in a forbidden zone
        // Check corners of obstacles between ship and target
        for (const zone of forbiddenZones) {
          // Check if this obstacle is between ship and target
          const zoneCenterX = zone.x + zone.width / 2;
          const zoneCenterY = zone.y + zone.height / 2;
          
          // Generate corner waypoints around this obstacle
          const corners = [
            { x: zone.x - 20, y: zone.y - 20 }, // Top-left
            { x: zone.x + zone.width + 20, y: zone.y - 20 }, // Top-right
            { x: zone.x - 20, y: zone.y + zone.height + 20 }, // Bottom-left
            { x: zone.x + zone.width + 20, y: zone.y + zone.height + 20 }, // Bottom-right
          ];
          
          // Find closest valid corner
          for (const corner of corners) {
            if (!isInForbiddenZone(corner.x, corner.y) &&
                corner.x >= 20 && corner.x <= canvas.width - 20 &&
                corner.y >= 20 && corner.y <= canvas.height - 20) {
              return corner;
            }
          }
        }
      }
      return null;
    };

    // Mouse tracking - attach to parent div to ensure it works
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = ((e.clientX - rect.left) / rect.width) * canvas.width;
      mouseY = ((e.clientY - rect.top) / rect.height) * canvas.height;
      hasMouseMoved = true;
    };

    // Attach to parent element instead of canvas
    const parentDiv = canvas.parentElement;
    if (parentDiv) {
      parentDiv.addEventListener('mousemove', handleMouseMove);
    }

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
      
      // Start following mouse immediately (while cycling through tiers)
      {
        // Determine target (waypoint or mouse)
        let targetX = mouseX;
        let targetY = mouseY;
        
        // If we have a waypoint, use it as target
        if (waypoint) {
          targetX = waypoint.x;
          targetY = waypoint.y;
          
          // Check if we reached the waypoint
          const distToWaypoint = Math.sqrt((shipX - waypoint.x) ** 2 + (shipY - waypoint.y) ** 2);
          if (distToWaypoint < 30) {
            // Reached waypoint, clear it
            waypoint = null;
            stuckCounter = 0;
          }
        }
        
        // Calculate direction to target
        const dx = targetX - shipX;
        const dy = targetY - shipY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 5) {
          // Accelerate towards target
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
        } else {
          // Decelerate when close
          velocityX *= 0.9;
          velocityY *= 0.9;
        }
        
        // Calculate next position
        const nextX = shipX + velocityX;
        const nextY = shipY + velocityY;
        
        // Check if next position is in forbidden zone
        if (!isInForbiddenZone(nextX, nextY)) {
          // Safe to move - update position
          shipX = nextX;
          shipY = nextY;
          stuckCounter = 0; // Reset stuck counter
        } else {
          // Would enter forbidden zone - try sliding
          let moved = false;
          
          // Try moving only in X direction
          if (!isInForbiddenZone(shipX + velocityX, shipY)) {
            shipX += velocityX;
            moved = true;
          } else if (!isInForbiddenZone(shipX, shipY + velocityY)) {
            // Try moving only in Y direction
            shipY += velocityY;
            moved = true;
          }
          
          if (!moved) {
            // Can't move at all - we're stuck
            stuckCounter++;
            velocityX *= 0.5;
            velocityY *= 0.5;
            
            // If stuck for too long, find a waypoint
            if (stuckCounter > 30 && !waypoint) {
              waypoint = findWaypoint(shipX, shipY, mouseX, mouseY);
              stuckCounter = 0;
            }
          } else {
            stuckCounter = 0;
          }
        }
        
        // Rotate to face movement direction
        if (Math.abs(velocityX) > 0.1 || Math.abs(velocityY) > 0.1) {
          const targetRotation = Math.atan2(velocityY, velocityX);
          let rotDiff = targetRotation - rotation;
          while (rotDiff > Math.PI) rotDiff -= 2 * Math.PI;
          while (rotDiff < -Math.PI) rotDiff += 2 * Math.PI;
          rotation += rotDiff * 0.15;
        }
        
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
      if (parentDiv) {
        parentDiv.removeEventListener('mousemove', handleMouseMove);
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
