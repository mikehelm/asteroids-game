import { CANVAS_WIDTH } from '../utils';

// Map X in [0, W] to stereo pan in [-1, 1] with clamping.
// If canvasWidth is undefined or not finite, fall back to global CANVAS_WIDTH.
export function panFromX(x: number, canvasWidth: number | undefined): number {
  const W = Number.isFinite(canvasWidth as number)
    ? (canvasWidth as number)
    : (typeof CANVAS_WIDTH !== 'undefined' ? CANVAS_WIDTH : 1);
  const t = W > 0 ? x / W : 0.5;
  return Math.max(-1, Math.min(1, t * 2 - 1));
}
