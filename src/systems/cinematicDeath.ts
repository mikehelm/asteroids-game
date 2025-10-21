/**
 * Cinematic Death Sequence System
 * Handles dramatic slow-motion death with camera zoom and ship respawn
 */

import { Vector2 } from '../types';

export interface DeathSequenceState {
  active: boolean;
  phase: 'slowdown' | 'replay' | 'explosion' | 'zoomout' | 'respawn' | 'done';
  startTime: number;
  deathPosition: Vector2;
  deathRotation: number;
  lastShotDirection?: Vector2; // Direction of the shot that killed the player
  killerPosition?: Vector2; // Position of what killed the player
  timeScale: number; // 1.0 = normal, 0.2 = slow motion
  cameraZoom: number; // 1.0 = normal, 2.0 = 2x zoom
  targetZoom: number;
  hasLivesLeft: boolean;
}

/**
 * Create a new death sequence
 */
export function createDeathSequence(
  playerPos: Vector2,
  playerRotation: number,
  hasLivesLeft: boolean,
  killerPos?: Vector2
): DeathSequenceState {
  return {
    active: true,
    phase: 'slowdown',
    startTime: performance.now(),
    deathPosition: { ...playerPos },
    deathRotation: playerRotation,
    killerPosition: killerPos ? { ...killerPos } : undefined,
    timeScale: 1.0,
    cameraZoom: 1.0,
    targetZoom: 2.5, // Zoom in 2.5x
    hasLivesLeft,
  };
}

/**
 * Update death sequence state
 */
export function updateDeathSequence(
  state: DeathSequenceState,
  now: number,
  deltaTime: number
): void {
  if (!state.active) return;

  const elapsed = now - state.startTime;

  switch (state.phase) {
    case 'slowdown':
      // Slow down time over 0.5 seconds
      if (elapsed < 500) {
        state.timeScale = 1.0 - (elapsed / 500) * 0.8; // Go from 1.0 to 0.2
        state.cameraZoom = 1.0 + (elapsed / 500) * (state.targetZoom - 1.0); // Zoom in
      } else {
        state.timeScale = 0.2;
        state.cameraZoom = state.targetZoom;
        state.phase = 'replay';
        state.startTime = now;
      }
      break;

    case 'replay':
      // Hold slow motion and zoom for 1 second (replay the death)
      if (elapsed >= 1000) {
        state.phase = 'explosion';
        state.startTime = now;
      }
      break;

    case 'explosion':
      // Show explosion for 0.8 seconds in slow motion
      if (elapsed >= 800) {
        state.phase = 'zoomout';
        state.startTime = now;
      }
      break;

    case 'zoomout':
      // Zoom out and speed up over 0.6 seconds
      if (elapsed < 600) {
        const progress = elapsed / 600;
        state.cameraZoom = state.targetZoom - (state.targetZoom - 1.0) * easeInOut(progress);
        state.timeScale = 0.2 + 0.8 * easeInOut(progress); // Go from 0.2 to 1.0
      } else {
        state.cameraZoom = 1.0;
        state.timeScale = 1.0;
        
        if (state.hasLivesLeft) {
          state.phase = 'respawn';
          state.startTime = now;
        } else {
          state.phase = 'done';
          state.active = false;
        }
      }
      break;

    case 'respawn':
      // Show new ship spawning animation for 0.5 seconds
      if (elapsed >= 500) {
        state.phase = 'done';
        state.active = false;
      }
      break;

    case 'done':
      state.active = false;
      break;
  }
}

/**
 * Get camera offset for death sequence zoom
 */
export function getDeathCameraOffset(
  state: DeathSequenceState,
  canvasWidth: number,
  canvasHeight: number
): Vector2 {
  if (!state.active || state.cameraZoom === 1.0) {
    return { x: 0, y: 0 };
  }

  // Calculate offset to center camera on death position
  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;
  
  const offsetX = (centerX - state.deathPosition.x) * (state.cameraZoom - 1.0);
  const offsetY = (centerY - state.deathPosition.y) * (state.cameraZoom - 1.0);
  
  return { x: offsetX, y: offsetY };
}

/**
 * Check if death sequence should prevent normal game updates
 */
export function shouldFreezeGameplay(state: DeathSequenceState): boolean {
  return state.active && state.phase !== 'done';
}

/**
 * Check if explosion should be shown
 */
export function shouldShowExplosion(state: DeathSequenceState): boolean {
  return state.active && (state.phase === 'explosion' || state.phase === 'zoomout');
}

/**
 * Check if respawn animation should be shown
 */
export function shouldShowRespawn(state: DeathSequenceState): boolean {
  return state.active && state.phase === 'respawn';
}

/**
 * Get respawn animation progress (0-1)
 */
export function getRespawnProgress(state: DeathSequenceState, now: number): number {
  if (state.phase !== 'respawn') return 0;
  const elapsed = now - state.startTime;
  return Math.min(1, elapsed / 500);
}

// Easing function for smooth transitions
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}
