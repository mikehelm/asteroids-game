import React, { useRef, useCallback } from 'react';
import './TouchControls.css';

interface TouchControlsProps {
  onFire: (active: boolean) => void;
  onMissile: () => void;
  onDash: (direction: 'forward' | 'backward' | 'left' | 'right') => void;
}

export const TouchControls: React.FC<TouchControlsProps> = ({
  onFire,
  onMissile,
  onDash,
}) => {
  const fireButtonRef = useRef<HTMLButtonElement>(null);
  const dashStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const handleFireStart = useCallback(() => {
    onFire(true);
  }, [onFire]);

  const handleFireEnd = useCallback(() => {
    onFire(false);
  }, [onFire]);

  const handleMissileTouch = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onMissile();
  }, [onMissile]);

  const handleMissileClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onMissile();
  }, [onMissile]);

  // Swipe detection for dash
  const handleDashStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    dashStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
  }, []);

  const handleDashEnd = useCallback((e: React.TouchEvent) => {
    if (!dashStartRef.current) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - dashStartRef.current.x;
    const deltaY = touch.clientY - dashStartRef.current.y;
    const deltaTime = Date.now() - dashStartRef.current.time;

    // Detect swipe (fast movement)
    if (deltaTime < 300) {
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      
      if (distance > 30) {
        const angle = Math.atan2(deltaY, deltaX);
        const degrees = (angle * 180) / Math.PI;
        
        // Determine direction
        if (degrees >= -45 && degrees < 45) {
          onDash('right');
        } else if (degrees >= 45 && degrees < 135) {
          onDash('forward');
        } else if (degrees >= -135 && degrees < -45) {
          onDash('backward');
        } else {
          onDash('left');
        }
      }
    }

    dashStartRef.current = null;
  }, [onDash]);

  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-3 select-none touch-controls-container">
      {/* Dash Zone (swipe area) */}
      <div
        className="relative w-32 h-32 rounded-full bg-purple-600/20 border-2 border-purple-400/40 flex items-center justify-center"
        onTouchStart={handleDashStart}
        onTouchEnd={handleDashEnd}
      >
        <div className="text-center text-purple-300 text-xs font-bold pointer-events-none">
          <div className="text-2xl mb-1">⚡</div>
          <div>SWIPE</div>
          <div>TO DASH</div>
        </div>
      </div>

      {/* Fire Button (hold to auto-fire) */}
      <button
        ref={fireButtonRef}
        className="w-32 h-32 rounded-full bg-red-600/80 border-4 border-red-400 flex items-center justify-center active:bg-red-500 active:scale-95 transition-all shadow-lg"
        onTouchStart={handleFireStart}
        onTouchEnd={handleFireEnd}
        onMouseDown={handleFireStart}
        onMouseUp={handleFireEnd}
        onMouseLeave={handleFireEnd}
        style={{
          boxShadow: '0 0 20px rgba(239, 68, 68, 0.6)',
        }}
      >
        <div className="text-center text-white font-bold pointer-events-none">
          <div className="text-4xl mb-1">🔫</div>
          <div className="text-sm">FIRE</div>
        </div>
      </button>

      {/* Missile Button */}
      <button
        className="w-32 h-32 rounded-full bg-yellow-600/80 border-4 border-yellow-400 flex items-center justify-center active:bg-yellow-500 active:scale-95 transition-all shadow-lg"
        onTouchStart={handleMissileTouch}
        onClick={handleMissileClick}
        style={{
          boxShadow: '0 0 20px rgba(234, 179, 8, 0.6)',
        }}
      >
        <div className="text-center text-white font-bold pointer-events-none">
          <div className="text-4xl mb-1">🚀</div>
          <div className="text-sm">MISSILE</div>
        </div>
      </button>
    </div>
  );
};
