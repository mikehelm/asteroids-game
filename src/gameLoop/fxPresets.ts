// src/gameLoop/fxPresets.ts
import type { FxConfig } from './fxConfig';
import { FX_DEFAULTS } from './fxConfig';

export const FX_PRESETS: Record<'high' | 'medium' | 'low', Partial<FxConfig>> = {
  high: { ...FX_DEFAULTS },
  medium: {
    starCountScale: 0.75,
    twinkleIntensity: 0.75,
    debrisSpawnScale: 0.7,
    explosionSpawnScale: 0.7,
    enableShadows: true,
    renderScale: 1,
    explosionMaxParticles: FX_DEFAULTS.explosionMaxParticles,
    debrisMaxChunks: FX_DEFAULTS.debrisMaxChunks,
  },
  low: {
    starCountScale: 0.5,
    twinkleIntensity: 0.5,
    debrisSpawnScale: 0.5,
    explosionSpawnScale: 0.5,
    enableShadows: false,
    renderScale: 0.75,
    explosionMaxParticles: Math.floor(FX_DEFAULTS.explosionMaxParticles * 0.6),
    debrisMaxChunks: Math.floor(FX_DEFAULTS.debrisMaxChunks * 0.6),
  },
};

export function applyFxPreset(refs: { fxConfig?: Partial<FxConfig> | null }, name: 'high' | 'medium' | 'low') {
  const preset = FX_PRESETS[name];
  if (!preset) return;
  const prev = refs.fxConfig ?? {};
  // Shallow assign only, no other ref mutations
  refs.fxConfig = { ...prev, ...preset };
}
