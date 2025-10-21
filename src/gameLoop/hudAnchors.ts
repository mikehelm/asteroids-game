// UI-only HUD anchor helpers (no gameplay logic)
// Returns the anchor for the missiles HUD (leftmost icon center), based on canvas size.
export function getMissileHudAnchor(canvasWidth: number, canvasHeight: number): { x: number; y: number } {
  const marginX = 20;                   // align with left HUD margin
  const energyBarY = canvasHeight - 40; // ENERGY bar baseline used by HUD
  const iconsTopY = energyBarY - 44;    // vertical column starts ~44px above ENERGY (clear label + breathing room)
  return { x: marginX, y: iconsTopY };
}

// Returns the top HUD text baseline (single line: Stage / Lives / Score)
export function getTopHudY(_canvasHeight: number): number {
  // Chosen to avoid clipping with current font; adjust if font changes
  return 26;
}

// Centralized top-left HUD anchors (text + health bar)
export function getTopHudAnchors(canvasWidth: number, canvasHeight: number): {
  marginX: number;
  topLineY: number;
  gapX: number;
  healthBarY: number;
  healthBarHeight: number;
} {
  const marginX = 20;
  const topLineY = 32;       // Stage / Lives / Score line
  const gapX = 24;           // horizontal spacing between blocks
  const healthBarY = 52;     // directly beneath top line
  const healthBarHeight = 10; // half-height bar (existing spec)
  return { marginX, topLineY, gapX, healthBarY, healthBarHeight };
}
