/**
 * Universal velocity cap system for all flying objects
 * Objects can exceed cap temporarily (from collisions, explosions)
 * After 2s delay, they decelerate over 5s back to cap speed
 */

export interface VelocityCapConfig {
  capSpeed: number; // Maximum allowed sustained speed
  delayMs: number; // Time before deceleration starts (default 2000ms)
  decelerationMs: number; // Time to decelerate to cap (default 5000ms)
}

export interface EntityWithVelocity {
  velocity: { x: number; y: number };
  _overspeedSince?: number; // Timestamp when overspeed started
  _decelerationStarted?: boolean; // Whether deceleration has begun
}

const DEFAULT_CONFIG: VelocityCapConfig = {
  capSpeed: 0, // Will be set per entity type
  delayMs: 2000, // 2 second delay
  decelerationMs: 5000, // 5 second deceleration
};

/**
 * Apply velocity cap to an entity
 * Call this after updating velocity each frame
 */
export function applyVelocityCap(
  entity: EntityWithVelocity,
  config: VelocityCapConfig,
  now: number
): void {
  const currentSpeed = Math.hypot(entity.velocity.x, entity.velocity.y);
  
  // If under cap, clear overspeed tracking
  if (currentSpeed <= config.capSpeed) {
    entity._overspeedSince = undefined;
    entity._decelerationStarted = false;
    return;
  }
  
  // Start tracking overspeed
  if (!entity._overspeedSince) {
    entity._overspeedSince = now;
    entity._decelerationStarted = false;
    return; // First frame of overspeed, don't decelerate yet
  }
  
  const overspeedDuration = now - entity._overspeedSince;
  
  // Wait for delay before starting deceleration
  if (overspeedDuration < config.delayMs) {
    return; // Still in delay period
  }
  
  // Mark deceleration as started
  if (!entity._decelerationStarted) {
    entity._decelerationStarted = true;
  }
  
  // Calculate deceleration progress (0 to 1)
  const decelerationDuration = overspeedDuration - config.delayMs;
  const decelerationProgress = Math.min(1, decelerationDuration / config.decelerationMs);
  
  // Interpolate from current speed to cap speed
  const targetSpeed = config.capSpeed;
  const newSpeed = currentSpeed - (currentSpeed - targetSpeed) * decelerationProgress;
  
  // Apply new speed while maintaining direction
  if (currentSpeed > 0) {
    const scale = newSpeed / currentSpeed;
    entity.velocity.x *= scale;
    entity.velocity.y *= scale;
  }
  
  // Once we reach cap speed, clear overspeed tracking
  if (decelerationProgress >= 1) {
    entity._overspeedSince = undefined;
    entity._decelerationStarted = false;
  }
}

/**
 * Velocity cap configurations for different entity types
 */
export const VELOCITY_CAPS = {
  // Player ship caps
  PLAYER_NORMAL: 8.0, // Normal max speed
  PLAYER_DOUBLE_SHOOTER: 4.0, // Reduced when double shooter active
  
  // Asteroid caps (size-based)
  ASTEROID_LARGE: 2.5,
  ASTEROID_MEDIUM: 3.5,
  ASTEROID_SMALL: 5.0,
  ASTEROID_TINY: 6.0,
  ASTEROID_SPECIAL: 2.0, // Flipit asteroids move slower
  
  // Alien ship caps
  ALIEN_STANDARD: 3.0,
  ALIEN_MISSILE: 2.0, // Missile UFOs are slower
  ALIEN_SCIENCE: 2.5, // Science vessels
  
  // Projectile caps
  BULLET_PLAYER: 12.0,
  BULLET_ALIEN: 8.0,
  MISSILE_PLAYER: 10.0,
  
  // Bonus/debris caps
  BONUS: 4.0,
  DEBRIS: 6.0,
};
