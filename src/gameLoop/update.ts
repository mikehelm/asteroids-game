import type { GameState } from '../types';

// Keep the surface minimal for Pass A to avoid cycles. Expand in Pass B as needed.
export type EnvLike = Record<string, unknown>;

export interface SoundSystemLike {
  setMusicVolume?: (n: number) => void;
  setSfxVolume?: (n: number) => void;
  playMusic?: (...args: unknown[]) => void; // structural typing only; no runtime dependence
  pauseMusic?: () => void;
  stopThrust?: () => void;
  // add more members as needed in Pass B
}

// Pass A: forwarder only, no logic moved yet. Do not resample time here.
export function update(
  _gameState: GameState,
  _now: number,
  _dt: number,
  _env: EnvLike,
  _soundSystem: SoundSystemLike
): void {
  // no-op stub for Pass A
  void _gameState; void _now; void _dt; void _env; void _soundSystem;
}
