// Simple autopilot docking planner and stepper
// Produces a two-stage plan: approach curve then settle+rotate gently
export type DockPlan = {
  start: { x: number; y: number; angle: number };
  target: { x: number; y: number };
  // timestamps in env.frameNow units
  t0: number;
  arcMs: number;
  settleMs: number;
  // Cached control points for quadratic Bezier
  c1x: number;
  c1y: number;
  midx: number;
  midy: number;
  // rotation clamp (rad per frame)
  rotClamp: number;
};

// Plan a gentle two-stage docking curve
export function planAutoDock(
  startPos: { x: number; y: number },
  targetPos: { x: number; y: number },
  startAngle: number,
  now: number
): DockPlan {
  // Control point to the side of the target to generate a shallow arc
  const dx = targetPos.x - startPos.x;
  const dy = targetPos.y - startPos.y;
  const mag = Math.hypot(dx, dy) || 1;
  const ux = dx / mag, uy = dy / mag;
  const sideX = -uy, sideY = ux;
  const arcRadius = 56; // tuned
  const c1x = targetPos.x + sideX * arcRadius;
  const c1y = targetPos.y + sideY * arcRadius;
  const midx = targetPos.x - ux * arcRadius;
  const midy = targetPos.y - uy * arcRadius;

  return {
    start: { x: startPos.x, y: startPos.y, angle: startAngle },
    target: { x: targetPos.x, y: targetPos.y },
    t0: now,
    arcMs: 800,
    settleMs: 400,
    c1x, c1y, midx, midy,
    rotClamp: 0.06,
  };
}

// Step the docking plan at time tNow (env.frameNow). Returns pose and done flag.
export function stepAutoDock(
  plan: DockPlan,
  tNow: number
): { x: number; y: number; angle: number; done: boolean } {
  const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
  const dt = Math.max(0, tNow - plan.t0);
  const arcDone = dt >= plan.arcMs;
  if (!arcDone) {
    const u = easeInOut(Math.max(0, Math.min(1, dt / plan.arcMs)));
    // Quadratic Bezier from start -> c1 -> mid
    const omu = 1 - u;
    const x = omu * omu * plan.start.x + 2 * omu * u * plan.c1x + u * u * plan.midx;
    const y = omu * omu * plan.start.y + 2 * omu * u * plan.c1y + u * u * plan.midy;
    // Angle turns toward velocity direction with clamp
    const vx = (plan.c1x - plan.start.x) * (1 - u) + (plan.midx - plan.c1x) * u;
    const vy = (plan.c1y - plan.start.y) * (1 - u) + (plan.midy - plan.c1y) * u;
    const desired = Math.atan2(vy, vx);
    let ang = plan.start.angle;
    let diff = desired - ang; while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
    ang += Math.max(-plan.rotClamp, Math.min(plan.rotClamp, diff));
    return { x, y, angle: ang, done: false };
  }
  const settleT = Math.max(0, Math.min(1, (dt - plan.arcMs) / plan.settleMs));
  const u2 = easeInOut(settleT);
  const x = plan.midx + (plan.target.x - plan.midx) * u2;
  const y = plan.midy + (plan.target.y - plan.midy) * u2;
  // Final angle points behind the approach (toward plan.midx/midy)
  const desired = Math.atan2(plan.midy - y, plan.midx - x);
  let ang = plan.start.angle;
  let diff = desired - ang; while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
  ang += Math.max(-plan.rotClamp, Math.min(plan.rotClamp, diff));
  return { x, y, angle: ang, done: settleT >= 1 };
}
