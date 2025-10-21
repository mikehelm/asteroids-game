// Shared render-only helpers for draw layers. No state writes.

// Small deterministic PRNG (32-bit mix), returns [0,1)
export function hash32(x: number): number {
  x |= 0; x = (x + 0x7ed55d16 + (x << 12)) | 0;
  x = (x ^ 0xc761c23c ^ (x >>> 19)) | 0;
  x = (x + 0x165667b1 + (x << 5)) | 0;
  x = ((x + 0xd3a2646c) ^ (x << 9)) | 0;
  x = (x + 0xfd7046c5 + (x << 3)) | 0;
  x = (x ^ 0xb55a4f09 ^ (x >>> 16)) | 0;
  return (x >>> 0) / 0xffffffff;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// Generic dashed ring. Caller sets strokeStyle/alpha/lineWidth as desired.
export function drawDashedRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  dashLen = 4,
  gapLen = 4
): void {
  const prevDash = (ctx as any).getLineDash ? (ctx as any).getLineDash() : [];
  if ((ctx as any).setLineDash) (ctx as any).setLineDash([dashLen, gapLen]);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  if ((ctx as any).setLineDash) (ctx as any).setLineDash(prevDash || []);
}

// Reset canvas state knobs commonly touched by layers. Does not save/restore.
export function resetCanvasState(ctx: CanvasRenderingContext2D): void {
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  if ('filter' in (ctx as any)) (ctx as any).filter = 'none';
}
