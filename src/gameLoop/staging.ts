import { createAsteroid } from '../gameObjects';
import { pickArtifactAppearance } from './artifact';
import { multiplyVector } from '../utils';
import type { Asteroid } from '../types';

// Difficulty helpers extracted verbatim from Game.tsx
export function getDifficultySettings(difficulty: 'easy'|'medium'|'hard') {
  if (difficulty === 'easy') {
    return {
      asteroidCountDelta: -1, // fewer asteroids
      speedMultiplier: 0.8,
      alienDifficultyOffset: -1,
      damageScale: 0.75,
      bonusIntervalMs: 10000, // doubled bonus spawn rate (was 20000)
      alienSpeedMultiplier: 0.8, // 20% slower UFOs
      alienSpawnDelayMultiplier: 1.2, // 20% slower UFO spawn timer
    } as const;
  }
  if (difficulty === 'hard') {
    return {
      asteroidCountDelta: +1, // more asteroids
      speedMultiplier: 1.3,
      alienDifficultyOffset: +1,
      damageScale: 1.5,
      bonusIntervalMs: 40000,
      alienSpeedMultiplier: 1.0, // normal UFO speed
      alienSpawnDelayMultiplier: 1.0, // normal UFO spawn timer
    } as const;
  }
  // medium (current defaults)
  return {
    asteroidCountDelta: 0,
    speedMultiplier: 1.0,
    alienDifficultyOffset: 0,
    damageScale: 1.0,
    bonusIntervalMs: 30000,
    alienSpeedMultiplier: 1.0, // normal UFO speed
    alienSpawnDelayMultiplier: 1.0, // normal UFO spawn timer
  } as const;
}

// Function to create asteroids for a specific stage with difficulty applied (verbatim)
export function createStageAsteroids(stageNumber: number, difficulty: 'easy'|'medium'|'hard'): Asteroid[] {
  const asteroids: Asteroid[] = [];
  const settings = getDifficultySettings(difficulty);
  
  if (stageNumber === 1) {
    // Stage 1: Start with 4 large asteroids
    asteroids.push(createAsteroid('large', undefined, stageNumber));
    asteroids.push(createAsteroid('large', undefined, stageNumber));
    asteroids.push(createAsteroid('large', undefined, stageNumber));
    asteroids.push(createAsteroid('large', undefined, stageNumber));
  } else if (stageNumber === 2) {
    // Stage 2: Current difficulty
    asteroids.push(createAsteroid('large', undefined, stageNumber));
    asteroids.push(createAsteroid('large', undefined, stageNumber));
    asteroids.push(createAsteroid('large', undefined, stageNumber));
    asteroids.push(createAsteroid('medium', undefined, stageNumber));
    asteroids.push(createAsteroid('medium', undefined, stageNumber));
  } else if (stageNumber === 3) {
    // Stage 3: More asteroids, faster
    asteroids.push(createAsteroid('large', undefined, stageNumber));
    asteroids.push(createAsteroid('large', undefined, stageNumber));
    asteroids.push(createAsteroid('large', undefined, stageNumber));
    asteroids.push(createAsteroid('large', undefined, stageNumber));
    asteroids.push(createAsteroid('medium', undefined, stageNumber));
    asteroids.push(createAsteroid('medium', undefined, stageNumber));
    asteroids.push(createAsteroid('medium', undefined, stageNumber));
  } else {
    // Stage 4+: Even more asteroids
    const largeCount = Math.min(3 + stageNumber, 8); // Cap at 8 large asteroids
    const mediumCount = Math.min(2 + stageNumber, 6); // Cap at 6 medium asteroids
    
    for (let i = 0; i < largeCount; i++) {
      asteroids.push(createAsteroid('large', undefined, stageNumber));
    }
    for (let i = 0; i < mediumCount; i++) {
      asteroids.push(createAsteroid('medium', undefined, stageNumber));
    }
  }

  // Apply asteroid count delta (ensure non-negative length)
  if (settings.asteroidCountDelta < 0) {
    for (let i = 0; i < Math.abs(settings.asteroidCountDelta); i++) {
      if (asteroids.length > 0) asteroids.pop();
    }
  } else if (settings.asteroidCountDelta > 0) {
    for (let i = 0; i < settings.asteroidCountDelta; i++) {
      asteroids.push(createAsteroid('medium', undefined, stageNumber));
    }
  }

  // Apply speed multiplier
  if (settings.speedMultiplier !== 1) {
    for (const a of asteroids) {
      // multiplyVector imported to match original semantics
      a.velocity = multiplyVector(a.velocity, settings.speedMultiplier);
    }
  }
  // Choose one large asteroid to be special: triple health, ominous look, special spawn
  const largeIndices = asteroids
    .map((a, idx) => ({ a, idx }))
    .filter(({ a }) => a.size === 'large')
    .map(({ idx }) => idx);
  if (largeIndices.length > 0) {
    const pick = largeIndices[Math.floor(Math.random() * largeIndices.length)];
    const special = asteroids[pick] as any;
    special.special = true;
    special.glowColor = Math.random() < 0.5 ? 'green' : 'red';
    special.specialSpawn = Math.random() < 0.5 ? 'bonus' : 'alien';
    // Generate and lock the Flipit chance for this asteroid (1% to 10%)
    special.flipitChance = 0.01 + Math.random() * 0.09;
    // Artifact appearance: scale 0.75..1.5, pattern 0..4, and deep neutral/purple tint
    const ap = pickArtifactAppearance();
    special.artifactScale = ap.scale;
    special.artifactPattern = ap.patternId;
    special.artifactTint = ap.baseTint; // 'black' | 'charcoal' | 'deep-purple'
    // Apply scale to radius so gameplay hitbox matches visuals
    special.radius = special.radius * ap.scale;
    // Durability: 2x current special health baseline (current code was 3x normal)
    special.health = special.maxHealth * 3 * 2;
    special.maxHealth = special.health;
  }
  return asteroids;
}
