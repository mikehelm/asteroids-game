import React, { useRef, useEffect, useState, useCallback } from 'react';

interface VirtualJoystickProps {
  onMove: (angle: number | null, distance: number) => void;
  size?: number;
}

export const VirtualJoystick: React.FC<VirtualJoystickProps> = ({ 
  onMove, 
  size = 120 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const touchIdRef = useRef<number | null>(null);

  const handleStart = useCallback((clientX: number, clientY: number, touchId?: number) => {
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    setActive(true);
    if (touchId !== undefined) touchIdRef.current = touchId;
    
    handleMove(clientX, clientY, centerX, centerY);
  }, []);

  const handleMove = useCallback((clientX: number, clientY: number, centerX?: number, centerY?: number) => {
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const cx = centerX ?? rect.left + rect.width / 2;
    const cy = centerY ?? rect.top + rect.height / 2;
    
    const deltaX = clientX - cx;
    const deltaY = clientY - cy;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const maxDistance = size / 2;
    
    // Clamp to circle
    const clampedDistance = Math.min(distance, maxDistance);
    const angle = Math.atan2(deltaY, deltaX);
    
    const x = Math.cos(angle) * clampedDistance;
    const y = Math.sin(angle) * clampedDistance;
    
    setPosition({ x, y });
    
    // Normalize distance (0-1)
    const normalizedDistance = clampedDistance / maxDistance;
    
    // Send angle and distance to parent
    onMove(angle, normalizedDistance);
  }, [size, onMove]);

  const handleEnd = useCallback(() => {
    setActive(false);
    setPosition({ x: 0, y: 0 });
    touchIdRef.current = null;
    onMove(null, 0);
  }, [onMove]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      handleStart(touch.clientX, touch.clientY, touch.identifier);
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (touchIdRef.current === null) return;
      
      // Find the touch that matches our stored ID
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === touchIdRef.current) {
          handleMove(e.touches[i].clientX, e.touches[i].clientY);
          break;
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      // Check if our touch ended
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchIdRef.current) {
          handleEnd();
          break;
        }
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      handleStart(e.clientX, e.clientY);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!active) return;
      handleMove(e.clientX, e.clientY);
    };

    const onMouseUp = () => {
      handleEnd();
    };

    container.addEventListener('touchstart', onTouchStart, { passive: false });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd, { passive: false });
    container.addEventListener('touchcancel', onTouchEnd, { passive: false });
    
    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('touchcancel', onTouchEnd);
      
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [active, handleStart, handleMove, handleEnd]);

  return (
    <div
      ref={containerRef}
      className="relative select-none touch-none"
      style={{
        width: size,
        height: size,
      }}
    >
      {/* Outer circle (base) */}
      <div
        className="absolute inset-0 rounded-full bg-gray-800/60 border-2 border-cyan-400/40"
        style={{
          boxShadow: active ? '0 0 20px rgba(34, 211, 238, 0.4)' : 'none',
        }}
      />
      
      {/* Inner circle (stick) */}
      <div
        className="absolute rounded-full bg-cyan-400/80 border-2 border-cyan-200 transition-all"
        style={{
          width: size / 3,
          height: size / 3,
          left: '50%',
          top: '50%',
          transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
          boxShadow: active ? '0 0 15px rgba(34, 211, 238, 0.8)' : '0 0 10px rgba(34, 211, 238, 0.4)',
        }}
      />
      
      {/* Center dot */}
      <div
        className="absolute rounded-full bg-white/60"
        style={{
          width: 6,
          height: 6,
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      />
    </div>
  );
};
