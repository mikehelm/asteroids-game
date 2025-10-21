// Enhanced autopilot docking planner and stepper
// Produces a three-stage plan: wide arc around back, approach, then settle
export type DockPlan = {
  start: { x: number; y: number; angle: number };
  target: { x: number; y: number };
  // timestamps in env.frameNow units
  t0: number;
  arcMs: number;      // Time for wide arc around back
  approachMs: number; // Time for final approach
  settleMs: number;   // Time for settle and rotate
  // Cached control points for cubic Bezier (for smoother arc)
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
  midx: number;
  midy: number;
  // rotation clamp (rad per frame)
  rotClamp: number;
};

// Plan enhanced docking curve that flies around the back of the station
export function planAutoDock(
  startPos: { x: number; y: number },
  targetPos: { x: number; y: number },
  startAngle: number,
  now: number
): DockPlan {
  // Calculate direction from start to target
  const dx = targetPos.x - startPos.x;
  const dy = targetPos.y - startPos.y;
  const mag = Math.hypot(dx, dy) || 1;
  const ux = dx / mag, uy = dy / mag;
  
  // Perpendicular vector for arc
  const sideX = -uy, sideY = ux;
  
  // Create a wide arc that goes around the back
  const arcRadius = 120; // Wider arc for going around back
  
  // First control point: wide to the side
  const c1x = startPos.x + dx * 0.3 + sideX * arcRadius;
  const c1y = startPos.y + dy * 0.3 + sideY * arcRadius;
  
  // Second control point: behind the station
  const c2x = targetPos.x - ux * arcRadius * 1.5;
  const c2y = targetPos.y - uy * arcRadius * 1.5;
  
  // Mid point: approach from behind
  const midx = targetPos.x - ux * 60;
  const midy = targetPos.y - uy * 60;

  return {
    start: { x: startPos.x, y: startPos.y, angle: startAngle },
    target: { x: targetPos.x, y: targetPos.y },
    t0: now,
    arcMs: 1200,      // Longer for wide arc around back
    approachMs: 600,  // Approach from behind
    settleMs: 400,    // Final settle
    c1x, c1y, c2x, c2y, midx, midy,
    rotClamp: 0.06,
  };
}

// Step the enhanced docking plan at time tNow (env.frameNow). Returns pose and done flag.
export function stepAutoDock(
  plan: DockPlan,
  tNow: number
): { x: number; y: number; angle: number; done: boolean } {
  const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
  const dt = Math.max(0, tNow - plan.t0);
  
  // Phase 1: Wide arc around the back (cubic Bezier)
  if (dt < plan.arcMs) {
    const u = easeInOut(Math.max(0, Math.min(1, dt / plan.arcMs)));
    // Cubic Bezier: start -> c1 -> c2 -> mid (behind station)
    const omu = 1 - u;
    const omu2 = omu * omu;
    const omu3 = omu2 * omu;
    const u2 = u * u;
    const u3 = u2 * u;
    
    const x = omu3 * plan.start.x + 
              3 * omu2 * u * plan.c1x + 
              3 * omu * u2 * plan.c2x + 
              u3 * plan.midx;
    const y = omu3 * plan.start.y + 
              3 * omu2 * u * plan.c1y + 
              3 * omu * u2 * plan.c2y + 
              u3 * plan.midy;
    
    // Angle follows velocity direction
    const vx = -3 * omu2 * plan.start.x + 
               3 * omu2 * plan.c1x - 6 * omu * u * plan.c1x + 
               6 * omu * u * plan.c2x - 3 * u2 * plan.c2x + 
               3 * u2 * plan.midx;
    const vy = -3 * omu2 * plan.start.y + 
               3 * omu2 * plan.c1y - 6 * omu * u * plan.c1y + 
               6 * omu * u * plan.c2y - 3 * u2 * plan.c2y + 
               3 * u2 * plan.midy;
    const desired = Math.atan2(vy, vx);
    let ang = plan.start.angle;
    let diff = desired - ang; 
    while (diff > Math.PI) diff -= 2 * Math.PI; 
    while (diff < -Math.PI) diff += 2 * Math.PI;
    ang += Math.max(-plan.rotClamp, Math.min(plan.rotClamp, diff));
    return { x, y, angle: ang, done: false };
  }
  
  // Phase 2: Approach from behind
  const approachDt = dt - plan.arcMs;
  if (approachDt < plan.approachMs) {
    const u = easeInOut(Math.max(0, Math.min(1, approachDt / plan.approachMs)));
    const x = plan.midx + (plan.target.x - plan.midx) * u;
    const y = plan.midy + (plan.target.y - plan.midy) * u;
    // Angle points toward target
    const desired = Math.atan2(plan.target.y - y, plan.target.x - x);
    let ang = plan.start.angle;
    let diff = desired - ang;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    ang += Math.max(-plan.rotClamp, Math.min(plan.rotClamp, diff));
    return { x, y, angle: ang, done: false };
  }
  
  // Phase 3: Final settle and rotate
  const settleDt = approachDt - plan.approachMs;
  const settleT = Math.max(0, Math.min(1, settleDt / plan.settleMs));
  const u2 = easeInOut(settleT);
  // Already at target, just fine-tune rotation
  const x = plan.target.x;
  const y = plan.target.y;
  // Final angle points back toward approach direction
  const desired = Math.atan2(plan.midy - plan.target.y, plan.midx - plan.target.x);
  let ang = plan.start.angle;
  let diff = desired - ang;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  ang += Math.max(-plan.rotClamp, Math.min(plan.rotClamp, diff)) * (1 - u2 * 0.5);
  return { x, y, angle: ang, done: settleT >= 1 };
}
