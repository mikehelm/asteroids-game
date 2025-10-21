// src/ui/canvasSizing.ts
import type React from 'react';

export type FitDeps = {
  initialCanvasRef: React.MutableRefObject<{ w: number; h: number }>;
  ensureStarsForCanvas: () => void;
  setCanvasSize: (w: number, h: number) => void;        // from utils
  setCanvasPixelSize: (s: { w: number; h: number }) => void; // local setter in Game.tsx
  setIsFitted: (b: boolean) => void;
  renderScale?: number; // optional resolution scale for pixel buffer (CSS size unchanged)
};

export function computeFitSize(
  baseW: number,
  baseH: number,
  maxW: number,
  maxH: number
): { w: number; h: number } {
  const scale = Math.min(maxW / baseW, maxH / baseH);
  const w = Math.max(100, Math.floor(baseW * scale));
  const h = Math.max(100, Math.floor(baseH * scale));
  return { w, h };
}

export function applyFitSizing(deps: FitDeps) {
  const margin = 48;
  const controlsReserve = 200;
  const maxW = Math.max(100, window.innerWidth - margin * 2);
  const maxH = Math.max(100, window.innerHeight - controlsReserve - margin);
  const { w: bw, h: bh } = deps.initialCanvasRef.current;
  const { w, h } = computeFitSize(bw, bh, maxW, maxH);
  deps.setCanvasSize(w, h);
  // Force 1:1 pixel buffer to logical size so gameplay (utils) and render canvas match
  const pw = Math.max(1, Math.floor(w));
  const ph = Math.max(1, Math.floor(h));
  deps.setCanvasPixelSize({ w: pw, h: ph });
  deps.ensureStarsForCanvas();
}

export function toggleFitToWindow(
  deps: FitDeps,
  isFittedRef?: React.MutableRefObject<boolean>
) {
  if (!isFittedRef?.current) {
    deps.setIsFitted(true);
    applyFitSizing(deps);
  } else {
    const { w, h } = deps.initialCanvasRef.current;
    deps.setCanvasSize(w, h);
    const rs = Math.max(0.5, Math.min(2, deps.renderScale ?? 1));
    deps.setCanvasPixelSize({ w: Math.max(1, Math.floor(w * rs)), h: Math.max(1, Math.floor(h * rs)) });
    deps.setIsFitted(false);
    // caller restores initial star density; no-op here
  }
}
