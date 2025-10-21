// Screen shake utility for juice effects
export interface ScreenShake {
  x: number;
  y: number;
  intensity: number;
  duration: number;
}

export function triggerScreenShake(
  shakeRef: React.MutableRefObject<ScreenShake>,
  startRef: React.MutableRefObject<number>,
  intensity: number,
  duration: number
): void {
  shakeRef.current.intensity = Math.max(shakeRef.current.intensity, intensity);
  shakeRef.current.duration = Math.max(shakeRef.current.duration, duration);
  if (shakeRef.current.intensity === intensity) {
    startRef.current = Date.now();
  }
}

export function updateScreenShake(
  shakeRef: React.MutableRefObject<ScreenShake>,
  startRef: React.MutableRefObject<number>
): { x: number; y: number } {
  const now = Date.now();
  const elapsed = now - startRef.current;
  
  if (elapsed >= shakeRef.current.duration) {
    shakeRef.current.intensity = 0;
    shakeRef.current.x = 0;
    shakeRef.current.y = 0;
    return { x: 0, y: 0 };
  }
  
  // Exponential decay
  const progress = elapsed / shakeRef.current.duration;
  const decay = Math.pow(1 - progress, 2);
  const currentIntensity = shakeRef.current.intensity * decay;
  
  // Random shake with reduced frequency for smoothness
  const freq = 20; // Lower = smoother
  const phase = Math.floor(elapsed / freq);
  const random = (phase * 9301 + 49297) % 233280 / 233280.0;
  const angle = random * Math.PI * 2;
  
  shakeRef.current.x = Math.cos(angle) * currentIntensity;
  shakeRef.current.y = Math.sin(angle) * currentIntensity;
  
  return {
    x: shakeRef.current.x,
    y: shakeRef.current.y
  };
}

export function getShakeIntensityForSize(size: 'small' | 'medium' | 'large'): number {
  switch (size) {
    case 'small': return 2;
    case 'medium': return 4;
    case 'large': return 8;
    default: return 2;
  }
}
