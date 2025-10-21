// src/gameLoop/artifact.ts
export type ArtifactTint = 'black' | 'charcoal' | 'deep-purple';

export interface ArtifactAppearance {
  scale: number;       // 0.75 .. 1.5
  patternId: number;   // 0..4 inclusive
  baseTint: ArtifactTint;
}

export function pickArtifactAppearance(): ArtifactAppearance {
  const scale = 0.75 + Math.random() * 0.75; // [0.75, 1.5]
  const patternId = Math.floor(Math.random() * 5); // 0..4
  const t = Math.random();
  const baseTint: ArtifactTint = t < 0.4 ? 'black' : (t < 0.75 ? 'charcoal' : 'deep-purple');
  return { scale, patternId, baseTint };
}
