/*
  ExplosionDistortion.ts
  Canvas 2D background distortion utility for Asteroids.

  Usage (high-level):
  - Create a single manager per game:
      const distortion = new ExplosionDistortionManager();
  - Each frame, after you finish drawing the background into `ctx`, copy it to an offscreen buffer:
      const bg = distortion.captureBackground(ctx);
  - Spawn pulses whenever you need (intro beats, asteroid hit/break, etc.):
      distortion.spawn({ cx, cy, radiusPx: 300, strength: 0.9, durationMs: 700 });
  - Immediately after capture (and before drawing gameplay sprites), call:
      distortion.renderSimple(ctx, bg, performance.now());

  Later you can use the Advanced per-pixel renderer by calling `renderAdvanced` instead of `renderSimple`.
*/

export type DistortionMode = 'off' | 'simple' | 'advanced';

export interface DistortionPulse {
  cx: number;            // center x (canvas space)
  cy: number;            // center y (canvas space)
  radiusPx: number;      // base radius in pixels
  growToRadiusPx?: number; // optional: if provided, radius grows linearly to this value over lifetime
  strength: number;      // 0..1, displacement scale
  startedAt: number;     // ms timestamp (performance.now)
  durationMs: number;    // how long the pulse lasts (ms)
}

export interface DistortionParams {
  mode: DistortionMode;
  size01: number;    // 0..1 (maps to radius)
  depth01: number;   // 0..1 (maps to strength)
}

export class ExplosionDistortionManager {
  private pulses: DistortionPulse[] = [];
  private bgBuffer: HTMLCanvasElement | null = null;
  private bgCtx: CanvasRenderingContext2D | null = null;
  // Config
  private mode: DistortionMode = 'off';
  private size01 = 0.5;   // default 0.5
  private depth01 = 0.5;  // default 0.5

  setMode(mode: DistortionMode) { this.mode = mode; }
  setSize01(v: number) { this.size01 = Math.max(0, Math.min(1, v)); }
  setDepth01(v: number) { this.depth01 = Math.max(0, Math.min(1, v)); }

  setParams(p: Partial<DistortionParams>) {
    if (p.mode) this.mode = p.mode;
    if (typeof p.size01 === 'number') this.setSize01(p.size01);
    if (typeof p.depth01 === 'number') this.setDepth01(p.depth01);
  }

  isActive(): boolean {
    return this.pulses.length > 0;
  }

  // Call once per frame AFTER background render and BEFORE gameplay sprites
  captureBackground(srcCtx: CanvasRenderingContext2D): HTMLCanvasElement {
    const w = srcCtx.canvas.width;
    const h = srcCtx.canvas.height;
    if (!this.bgBuffer || this.bgBuffer.width !== w || this.bgBuffer.height !== h) {
      this.bgBuffer = document.createElement('canvas');
      this.bgBuffer.width = w; this.bgBuffer.height = h;
      this.bgCtx = this.bgBuffer.getContext('2d');
    }
    if (this.bgCtx) {
      this.bgCtx.clearRect(0, 0, w, h);
      this.bgCtx.drawImage(srcCtx.canvas, 0, 0);
    }
    return this.bgBuffer!;
  }

  clearAll() { this.pulses.length = 0; }

  // Spawn a pulse; if radius/strength are omitted, derive from current params
  spawn(p: Partial<DistortionPulse> & { cx: number; cy: number; durationMs?: number }): DistortionPulse {
    const now = performance.now();
    const radiusBase = 60 + this.size01 * 300;    // 60..360 px
    const strengthBase = 0.15 + this.depth01 * 0.85; // 0.15..1.0
    const pulse: DistortionPulse = {
      cx: p.cx,
      cy: p.cy,
      radiusPx: Math.max(20, p.radiusPx ?? radiusBase),
      growToRadiusPx: p.growToRadiusPx,
      strength: Math.max(0.01, Math.min(1.5, p.strength ?? strengthBase)),
      startedAt: now,
      durationMs: Math.max(60, p.durationMs ?? 600),
    };
    this.pulses.push(pulse);
    return pulse;
  }

  // Removes expired pulses and returns live ones
  private getLivePulses(now: number): DistortionPulse[] {
    this.pulses = this.pulses.filter(p => (now - p.startedAt) < p.durationMs);
    return this.pulses;
  }

  // Simple mesh warp: blit tiles from bgBuffer with radial-displaced source coords
  renderSimple(dstCtx: CanvasRenderingContext2D, bgBuffer: HTMLCanvasElement, now: number, options?: { debugRing?: boolean; perfCoarse?: boolean }) {
    if (this.mode === 'off') return;
    const pulses = this.getLivePulses(now);
    if (pulses.length === 0) return;
    const w = dstCtx.canvas.width, h = dstCtx.canvas.height;
    const src = bgBuffer;
    const cell = options?.perfCoarse ? 32 : 20; // grid cell size

    for (const p of pulses) {
      const life = Math.max(0, Math.min(1, (now - p.startedAt) / p.durationMs));
      const fade = 1 - life * life; // ease-out
      const R0 = p.radiusPx;
      const R1 = typeof p.growToRadiusPx === 'number' ? Math.max(R0, p.growToRadiusPx) : R0;
      const R = R0 + (R1 - R0) * life; // grow linearly from R0 to R1
      const S = p.strength * fade;
      const xMin = Math.max(0, Math.floor((p.cx - R) / cell) * cell);
      const yMin = Math.max(0, Math.floor((p.cy - R) / cell) * cell);
      const xMax = Math.min(w, Math.ceil((p.cx + R) / cell) * cell);
      const yMax = Math.min(h, Math.ceil((p.cy + R) / cell) * cell);

      for (let y = yMin; y < yMax; y += cell) {
        for (let x = xMin; x < xMax; x += cell) {
          const cx = x + cell * 0.5;
          const cy = y + cell * 0.5;
          const dx = cx - p.cx;
          const dy = cy - p.cy;
          const dist = Math.hypot(dx, dy);
          if (dist > R) continue;
          const t = dist / R; // 0..1
          // Radial displacement outward with smooth falloff
          const falloff = (1 - t) * (1 - t);
          const disp = S * 18 * falloff; // px displacement scale
          const nx = dx / (dist || 1);
          const ny = dy / (dist || 1);
          const sx = x - nx * disp; // sample from displaced point in bg
          const sy = y - ny * disp;
          dstCtx.drawImage(src, sx, sy, cell, cell, x, y, cell, cell);
        }
      }

      // no outline ring drawing
    }
  }

  // Advanced per-pixel refraction (CPU heavy). Implement stub for now; real impl can come after verification
  renderAdvanced(dstCtx: CanvasRenderingContext2D, bgBuffer: HTMLCanvasElement, now: number) {
    // For now, call simple to ensure visible effect; we can replace with per-pixel sampling later
    this.renderSimple(dstCtx, bgBuffer, now, { perfCoarse: true });
  }
}
