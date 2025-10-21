import type { GameState } from '../types';
export { withPlayerDockingXform } from './dockHelpers';
// Stage 1 barrel re-exports for split modules
export { drawStars } from './drawLayers/drawStars';
export { drawBackground } from './drawLayers/drawBackground';
export { drawPlayer } from './drawLayers/drawPlayer';
export { drawAsteroids, drawSpecialAsteroids, drawNormalAsteroids } from './drawLayers/drawAsteroids';
export { drawAliens } from './drawLayers/drawAliens';
export { drawBullets, drawAlienBullets, drawPlayerMissiles } from './drawLayers/drawProjectiles';
export { drawObjectives, drawMiniMap } from './drawLayers/drawObjectives';
export { drawTractorOverlay, drawHUD } from './drawLayers/drawOverlays';
export { drawDebris } from './drawLayers/drawFx';
export { drawBonuses } from './drawLayers/drawBonuses';
export { drawExplosions } from './drawLayers/drawExplosions';

// Typed shape of the refs bag Game.tsx provides. We list the common refs used in this module
// and include an index signature to remain forward-compatible without breaking type-checks.
// Intentionally using 'any' for the index signature to avoid TS errors across many narrowly-typed refs.
// This is a type-only aid; runtime behavior is unchanged.
// Optional render-safe FX enqueue used by overlays:
//   refs.enqueueFx?: (fx: { type: string; x: number; y: number; size: number }) => void
// If absent, calls are no-ops. This keeps render-time pure (no direct gameState writes).
export type EnvRefs = {
  // Background
  bgImageRef?: { current: HTMLImageElement | null };
  bgImageDataRef?: { current: ImageData | null };
  bgRawCanvasRef?: { current: HTMLCanvasElement | null };
  bgOffsetRef?: { current: { x: number; y: number } };
  bgZoomExtraRef?: { current: number };
  backdrops?: string[];
  fadeInActiveRef?: { current: boolean };
  fadeInStartRef?: { current: number };
  introZoomStartRef?: { current: number };
  INTRO_ZOOM_DUR_MS?: number;
  START_ZOOM_EXTRA?: number;
  DUCK_HOLD_MS?: number;
  DEFAULT_BG_BRIGHTNESS?: number;
  perfModeRef?: { current: unknown };

  // Stars / warp
  starsRef?: { current: Array<{ x: number; y: number; brightness: number; twinkleSpeed: number }> };
  initialAreaRef?: { current: number };
  isPausedRef?: { current: boolean };
  warpParticlesRef?: { current: Array<any> };
  trailsEnabledRef?: { current: boolean };
  trailsSuspendUntilRef?: { current: number };
  trailsFadeInStartRef?: { current: number };
  trailsStrengthRef?: { current: number };
  lastMissileEventRef?: { current: number };

  // Effects + tunables
  effectsApplyRef?: { current: { background: boolean; stars: boolean; distantStars: boolean; warpTrails: boolean } };
  bgOpacityRef?: { current: number };
  bgContrastRef?: { current: number };
  bgBrightnessRef?: { current: number };

  // Tractor overlay / HUD
  tractionBeamRef?: { current?: any };
  scoreDropUntilRef?: { current: number };
  livesBrightUntilRef?: { current: number };
  healthBrightUntilRef?: { current: number };
  healthDropUntilRef?: { current: number };
  prevFuelRef?: { current: number };
  refuelToastUntilRef?: { current: number };
  lastFuelWarnLevelRef?: { current: 'normal' | 'low' | 'critical' };
  lastFuelBeepTsRef?: { current: number };
  soundSystem?: { playLowFuelBeep?: (lvl: 'critical' | 'low') => void; playUiBeep?: () => void };

  // Distortion and overlay
  distortionRef?: { current?: any };
  levelEndStartRef?: { current: number };

  // Index signature to allow additional fields without tightening further
  [key: string]: any;
};

export type EnvLike = { refs: any; frameNow?: number; isBootSettled?: boolean };

// Pass A stub: forwarder only. Do not resample time here.
/** Threaded environment from Game.tsx (refs/config). If prefixed with _, it’s intentionally unused here. */
export function draw(
  _ctx: CanvasRenderingContext2D,
  _gameState: GameState,
  _now: number,
  _env: EnvLike
): void {
  // no-op stub for Pass A
  void _ctx; void _gameState; void _now; void _env;
}

// Barrel file only; all implementations live under drawLayers/*
