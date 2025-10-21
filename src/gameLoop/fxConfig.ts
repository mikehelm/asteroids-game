// Cosmetic FX budgets and scales (dev-tunable). Defaults preserve current visuals.
export interface FxConfig {
  debrisSpawnScale: number;         // multiplies counts of spawned debris
  debrisMaxChunks: number;          // global cap for visualDebris array length
  explosionSpawnScale: number;      // multiplies particles per explosion
  explosionMaxParticles: number;    // global cap across particles (if a global pool exists)
  artifactBonusMultiplier: number;  // applied on top of existing artifact multipliers
  // New performance/visual toggles
  starCountScale: number;           // scales star count target
  twinkleIntensity: number;         // 0..1 recommended range; 1 = current
  enableShadows: boolean;           // gate for shadowBlur/filter-like effects
  renderScale: number;              // 1 = native; <1 renders lower res buffer
  capFps?: number;                  // optional soft frame cap (handled in Game.tsx loop)
  explosionMaxParticlesGlobal?: number; // optional global explosion particle cap across systems
  // Per-type soft budgets (visual-only; preserve visuals unless breached)
  superUfoExplosionMaxParticles?: number; // cap for Super UFO explosion particles
  laserHitDebrisMax?: number;            // cap per laser-hit debris event
}

const DEFAULTS: FxConfig = {
  debrisSpawnScale: 1,
  debrisMaxChunks: 1200,
  explosionSpawnScale: 1,
  explosionMaxParticles: 800,
  artifactBonusMultiplier: 1,
  starCountScale: 1,
  twinkleIntensity: 1,
  enableShadows: true,
  renderScale: 1,
  capFps: undefined,
  explosionMaxParticlesGlobal: undefined,
  superUfoExplosionMaxParticles: 220,
  laserHitDebrisMax: 60,
};

// Pull overrides from env.refs.fxConfig if provided; otherwise fall back to defaults.
export function getFxConfig(env?: { refs?: any } | null | undefined): FxConfig {
  try {
    const cfg = (env as any)?.refs?.fxConfig;
    if (!cfg || typeof cfg !== 'object') return { ...DEFAULTS };
    // Merge with defaults to ensure all keys exist
    return {
      debrisSpawnScale: Number.isFinite(cfg.debrisSpawnScale) ? Number(cfg.debrisSpawnScale) : DEFAULTS.debrisSpawnScale,
      debrisMaxChunks: Number.isFinite(cfg.debrisMaxChunks) ? Number(cfg.debrisMaxChunks) : DEFAULTS.debrisMaxChunks,
      explosionSpawnScale: Number.isFinite(cfg.explosionSpawnScale) ? Number(cfg.explosionSpawnScale) : DEFAULTS.explosionSpawnScale,
      explosionMaxParticles: Number.isFinite(cfg.explosionMaxParticles) ? Number(cfg.explosionMaxParticles) : DEFAULTS.explosionMaxParticles,
      artifactBonusMultiplier: Number.isFinite(cfg.artifactBonusMultiplier) ? Number(cfg.artifactBonusMultiplier) : DEFAULTS.artifactBonusMultiplier,
      starCountScale: Number.isFinite(cfg.starCountScale) ? Number(cfg.starCountScale) : DEFAULTS.starCountScale,
      twinkleIntensity: Number.isFinite(cfg.twinkleIntensity) ? Number(cfg.twinkleIntensity) : DEFAULTS.twinkleIntensity,
      enableShadows: typeof cfg.enableShadows === 'boolean' ? cfg.enableShadows : DEFAULTS.enableShadows,
      renderScale: Number.isFinite(cfg.renderScale) ? Number(cfg.renderScale) : DEFAULTS.renderScale,
      capFps: Number.isFinite(cfg.capFps) ? Number(cfg.capFps) : DEFAULTS.capFps,
      explosionMaxParticlesGlobal: Number.isFinite(cfg.explosionMaxParticlesGlobal) ? Number(cfg.explosionMaxParticlesGlobal) : DEFAULTS.explosionMaxParticlesGlobal,
      superUfoExplosionMaxParticles: Number.isFinite(cfg.superUfoExplosionMaxParticles) ? Number(cfg.superUfoExplosionMaxParticles) : DEFAULTS.superUfoExplosionMaxParticles,
      laserHitDebrisMax: Number.isFinite(cfg.laserHitDebrisMax) ? Number(cfg.laserHitDebrisMax) : DEFAULTS.laserHitDebrisMax,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export const FX_DEFAULTS: FxConfig = { ...DEFAULTS };
