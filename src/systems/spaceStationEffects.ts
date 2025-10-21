/**
 * Space Station Visual Effects System
 * Handles entrance warp, docking animation, bonus ejection, and exit black hole
 */

import { Vector2 } from '../types';

export interface StationEntranceEffect {
  active: boolean;
  startedAt: number;
  durationMs: number;
  stationPos: Vector2;
}

export interface BonusEject {
  type: 'shield' | 'heal' | 'doubleShooter' | 'missile' | 'fuel';
  position: Vector2;
  velocity: Vector2;
  life: number;
  maxLife: number;
  rotation: number;
  rotationSpeed: number;
}

export interface BlackHoleEffect {
  active: boolean;
  startedAt: number;
  position: Vector2; // Starts in front of ship
  radius: number;
  maxRadius: number;
  phase: 'grow' | 'shrink' | 'flash' | 'done';
}

export interface StationEffectsState {
  entrance?: StationEntranceEffect;
  bonusEjects: BonusEject[];
  blackHole?: BlackHoleEffect;
}

/**
 * Create entrance warp effect (reverse of level-end warp)
 */
export function createEntranceEffect(stationPos: Vector2, now: number): StationEntranceEffect {
  return {
    active: true,
    startedAt: now,
    durationMs: 1500, // 1.5 seconds
    stationPos,
  };
}

/**
 * Generate 5 random bonus items ejected from station
 */
export function generateBonusEjects(stationPos: Vector2): BonusEject[] {
  const bonusTypes: Array<'shield' | 'heal' | 'doubleShooter' | 'missile' | 'fuel'> = [
    'shield',
    'heal',
    'doubleShooter',
    'missile',
    'fuel',
  ];
  
  const ejects: BonusEject[] = [];
  const angleStep = (Math.PI * 2) / 5;
  const baseAngle = Math.random() * Math.PI * 2;
  
  for (let i = 0; i < 5; i++) {
    const angle = baseAngle + angleStep * i + (Math.random() - 0.5) * 0.3;
    const speed = 1.5 + Math.random() * 1; // Slow enough to catch
    
    ejects.push({
      type: bonusTypes[i],
      position: { x: stationPos.x, y: stationPos.y },
      velocity: {
        x: Math.cos(angle) * speed,
        y: Math.sin(angle) * speed,
      },
      life: 0,
      maxLife: 8000, // 8 seconds to collect
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.05,
    });
  }
  
  return ejects;
}

/**
 * Create black hole effect that starts small in front of ship
 */
export function createBlackHoleEffect(shipPos: Vector2, shipRotation: number, now: number): BlackHoleEffect {
  // Position black hole slightly in front of ship
  const distance = 40;
  const holeX = shipPos.x + Math.cos(shipRotation) * distance;
  const holeY = shipPos.y + Math.sin(shipRotation) * distance;
  
  return {
    active: true,
    startedAt: now,
    position: { x: holeX, y: holeY },
    radius: 10,
    maxRadius: 200,
    phase: 'grow',
  };
}

/**
 * Update entrance effect progress
 */
export function updateEntranceEffect(
  effect: StationEntranceEffect,
  now: number
): { progress: number; done: boolean } {
  const elapsed = now - effect.startedAt;
  const progress = Math.min(1, elapsed / effect.durationMs);
  const done = progress >= 1;
  
  return { progress, done };
}

/**
 * Update bonus ejects (movement and lifetime)
 */
export function updateBonusEjects(ejects: BonusEject[], deltaTime: number): BonusEject[] {
  return ejects
    .map(eject => ({
      ...eject,
      position: {
        x: eject.position.x + eject.velocity.x * deltaTime,
        y: eject.position.y + eject.velocity.y * deltaTime,
      },
      rotation: eject.rotation + eject.rotationSpeed * deltaTime,
      life: eject.life + deltaTime,
    }))
    .filter(eject => eject.life < eject.maxLife);
}

/**
 * Update black hole effect
 */
export function updateBlackHoleEffect(
  effect: BlackHoleEffect,
  now: number,
  shipPos: Vector2
): { progress: number; phase: BlackHoleEffect['phase']; pullStrength: number } {
  const elapsed = now - effect.startedAt;
  
  if (effect.phase === 'grow') {
    // Grow for 800ms
    const growProgress = Math.min(1, elapsed / 800);
    effect.radius = effect.maxRadius * easeOutQuad(growProgress);
    
    if (growProgress >= 1) {
      effect.phase = 'shrink';
      effect.startedAt = now; // Reset timer for shrink phase
    }
    
    return { progress: growProgress, phase: 'grow', pullStrength: growProgress * 0.5 };
  }
  
  if (effect.phase === 'shrink') {
    // Shrink for 400ms while pulling ship in
    const shrinkProgress = Math.min(1, elapsed / 400);
    effect.radius = effect.maxRadius * (1 - easeInQuad(shrinkProgress));
    
    if (shrinkProgress >= 1) {
      effect.phase = 'flash';
      effect.startedAt = now;
    }
    
    return { progress: shrinkProgress, phase: 'shrink', pullStrength: 1 + shrinkProgress };
  }
  
  if (effect.phase === 'flash') {
    // Flash for 200ms
    const flashProgress = Math.min(1, elapsed / 200);
    
    if (flashProgress >= 1) {
      effect.phase = 'done';
    }
    
    return { progress: flashProgress, phase: 'flash', pullStrength: 0 };
  }
  
  return { progress: 1, phase: 'done', pullStrength: 0 };
}

// Easing functions
function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function easeInQuad(t: number): number {
  return t * t;
}
