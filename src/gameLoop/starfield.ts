// src/gameLoop/starfield.ts
import type React from 'react';

export type Star = { x: number; y: number; brightness: number; twinkleSpeed: number };

export function regenerateStars(count: number, canvasW: number, canvasH: number): Star[] {
  const arr: Star[] = [];
  for (let i = 0; i < count; i++) {
    arr.push({
      x: Math.random() * canvasW,
      y: Math.random() * canvasH,
      brightness: 0.3 + Math.random() * 0.7,
      twinkleSpeed: 0.02 + Math.random() * 0.03,
    });
  }
  return arr;
}

export type EnsureStarsDeps = {
  starsRef: React.MutableRefObject<Star[]>;
  initialAreaRef: React.MutableRefObject<number>;
  initialStarCountRef: React.MutableRefObject<number>;
  CANVAS_WIDTH: number;
  CANVAS_HEIGHT: number;
  starCountScale?: number; // optional perf control; defaults to 1
};

export function ensureStarsForCanvas(deps: EnsureStarsDeps): void {
  const { starsRef, initialAreaRef, initialStarCountRef, CANVAS_WIDTH, CANVAS_HEIGHT } = deps;
  const area = CANVAS_WIDTH * CANVAS_HEIGHT;
  const ratio = Math.max(0.25, area / Math.max(1, initialAreaRef.current));
  const scale = Math.max(0.25, Math.min(4, deps.starCountScale ?? 1));
  const target = Math.max(150, Math.round(initialStarCountRef.current * ratio * scale));
  const cur = starsRef.current?.length || 0;
  if (Math.abs(cur - target) > Math.max(25, target * 0.15)) {
    starsRef.current = regenerateStars(target, CANVAS_WIDTH, CANVAS_HEIGHT);
  }
}
