// Centralized constants used across the game. Keep as UPPER_SNAKE_CASE.
// NOTE: Only safe, behavior-preserving extractions. Do not change values.

// Dev / Debug
export const DEBUG_PANEL_MAX = 200; // max lines kept in the in-app DebugPanel

// Visual defaults

// Flipit text timings (documented values from PRD; wire in as needed during refactors)
export const FLIPIT_HOLD_MS = 3000;
export const FLIPIT_FADE_MS = 1000;

// World grid (finite square grid)
// Source of truth for WORLD_GRID_SIZE lives in ./gameLoop/constants
import { WORLD_GRID_SIZE as WORLD_GRID_SIZE_INTERNAL } from './gameLoop/constants';
export const WORLD_MIN_TILE = 0;
export const WORLD_MAX_TILE = WORLD_GRID_SIZE_INTERNAL - 1; // 0..(N-1)

// Minimap UI constants
export const MINIMAP_WIDTH = 140;
export const MINIMAP_HEIGHT = 140;
export const MINIMAP_MARGIN_X = 16;
export const MINIMAP_MARGIN_Y = 16;
export const MINIMAP_BG_ALPHA = 0.25;
export const MINIMAP_BORDER = 2;
