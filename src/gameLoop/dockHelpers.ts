// Render-only docking transform wrapper for the player ship.
// No game-state writes. Uses env.frameNow (fallback to performance.now()).
// Fully guards canvas state; applies subtle scale/tilt and a soft shadow during approach/egress.
export function withPlayerDockingXform(
  ctx: CanvasRenderingContext2D,
  gs: any,
  env: any,
  drawShip: () => void
) {
  ctx.save();
  try {
    const now = (env as any)?.frameNow ?? performance.now();
    const dk = (gs as any)?.dock; // { kind:'refuel'|'reward', phase:'approach'|'docked'|'egress'|..., startedAt, undockAt? }

    const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
    const easeInOut = (t: number) => t * t * (3 - 2 * t);

    let scale = 1, tiltDeg = 0, shadowAlpha = 0;

    if (dk?.phase === 'approach' && typeof dk.startedAt === 'number') {
      const t = clamp01((now - dk.startedAt) / 800);
      const e = easeInOut(t);
      scale = 0.92 + 0.14 * e;   // 0.92 → 1.06
      tiltDeg = -6 + 14 * e;     // -6° → +8°
      shadowAlpha = 0.15 + 0.25 * e;
    } else if (
      dk?.phase === 'egress' ||
      (typeof dk?.undockAt === 'number' && now >= dk.undockAt - 600 && now < dk.undockAt + 60)
    ) {
      const t = typeof dk?.undockAt === 'number' ? clamp01((now - (dk.undockAt - 600)) / 600) : 1;
      const e = 1 - easeInOut(t); // reverse to neutral
      scale = 0.92 + 0.14 * e;
      tiltDeg = -6 + 14 * e;
      shadowAlpha = 0.15 + 0.25 * e;
    }

    // Soft oval shadow under the ship
    if (shadowAlpha > 0.01) {
      ctx.save();
      try {
        ctx.globalAlpha = shadowAlpha;
        ctx.globalCompositeOperation = 'source-over';
        const hadFilter = 'filter' in ctx;
        const prevFilter = hadFilter ? (ctx as any).filter : undefined;
        if (hadFilter) (ctx as any).filter = 'blur(4px)';
        ctx.beginPath();
        ctx.ellipse(0, 14, 18, 8, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fill();
        if (hadFilter) (ctx as any).filter = prevFilter ?? 'none';
      } finally {
        ctx.restore();
      }
    }

    // Apply transform and draw the ship
    ctx.save();
    try {
      ctx.rotate((tiltDeg * Math.PI) / 180);
      ctx.scale(scale, scale);
      drawShip();
    } finally {
      ctx.restore();
    }
  } finally {
    ctx.restore();
  }
}
