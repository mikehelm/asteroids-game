# Tractor Beam & Grid Scan Analysis

## Current Code Flow

### 1. **Capture Detection** (`Game.tsx` lines 1278-1330)
- **Gravity Well Detection**: Checks if player is within capture radius of special asteroids
- **Multiple Capture Conditions**:
  - Side capture: Same direction, similar speed
  - Front capture: Player ahead of asteroid, asteroid catching up, within cone
- **Triggers**: Sets `traction.phase = 'approaching'` and starts `onTopEntry` animation
- **Problem**: Complex logic with multiple paths, hard to debug

### 2. **On-Top Entry** (`Game.tsx` lines 1230-1277)
- **Animation**: 500ms ease-in movement to asteroid surface
- **Visual Feedback**: Green dust particles during approach
- **Completion**: Sets `traction.phase = 'attached'` and calls `startGridScan()`
- **Problem**: This phase seems redundant - why not go straight to orbit?

### 3. **Phases After Capture**
Currently has 5 phases with overlapping logic:
1. `approaching` - initial capture (lines 1419-1479)
2. `locking` - smooth lock-in to orbit (lines 1480-1498) 
3. `attached` - orbital motion + grid scan (lines 1499-1577)
4. `displaying` - show results (lines 1578-1611)
5. `pushing` - eject player (lines 1612-1652)

**Problems**:
- `approaching` phase has its own movement logic PLUS the `onTopEntry` animation
- `locking` phase exists but is rarely reached (immediately skips to `attached`)
- Redundant orbit calculations in multiple places

### 4. **Grid Scan System** (`tractorBeam/state.ts`)
**Grid State**:
- Creates NxN grid based on asteroid size (6x6 to 12x12)
- Reveals cells randomly at 30 cells/second
- Has retract animation after completion
- **Status**: Logic is WORKING correctly

### 5. **Grid Rendering** (`drawAsteroidScanGrid.ts`)
**What it does**:
- Lines 116-120: Clips drawing to expanding circle as scan progresses
- Lines 144-157: Draws animated grid lines (10px spacing, moving offsets)
- Lines 166-171: Draws green circular outline

**Why grid doesn't show**:
1. ✅ Grid IS being drawn (lines 144-157)
2. ❌ **CLIPPING IS THE PROBLEM**: Lines 118-120 clip to `scanRadius` which expands over 2000ms
3. ❌ The clip region uses the scan start time from `gs.__scanGridStartAt`
4. ❌ This timestamp might not be synchronized with when grid scan actually starts

**Why only circle shows**:
- Line 170: The outline circle is drawn OUTSIDE the clipped region
- It's the only thing not affected by the clip
- Should follow asteroid shape but currently uses `ctx.arc()` (perfect circle)

## Root Causes

### Issue 1: Grid Not Visible
**Problem**: The grid is clipped to an expanding circle that may not be expanding
**Evidence**: 
- Grid drawing code exists (lines 144-157 in drawAsteroidScanGrid.ts)
- Clipping region at lines 118-120
- Timing based on `gs.__scanGridStartAt` which is set in drawAsteroidScanGrid.ts (line 87)
- BUT: This is separate from when `startGridScan()` is called in Game.tsx (line 1273)

**Fix**: Synchronize the clip expansion with the actual grid scan start time from `traction.gridScan.startTime`

### Issue 2: Circular Outline Instead of Asteroid Shape
**Problem**: Line 170 uses `ctx.arc()` which draws a circle
**Fix**: Need to trace asteroid's actual polygon points to draw proper outline

### Issue 3: Over-Complex Phase Logic
**Problem**: 5 phases with overlapping movement code
- `onTopEntry` animation happens during `approaching`
- `locking` phase is skipped
- Redundant orbit calculations

**Fix**: Simplify to 3 phases:
1. `capturing` - fly to asteroid and lock on
2. `scanning` - orbit while grid scans
3. `ejecting` - push away

## Recommended Plan

### Phase 1: Simplify Tractor Beam Flow (CRITICAL)
**Goal**: Make capture instant and simple

1. **Remove Complex Capture Logic**
   - Delete gravity well, side/front capture conditions
   - Simple rule: Player overlaps special asteroid → capture starts
   
2. **Merge Phases**
   - Delete `onTopEntry` animation (redundant)
   - Delete `locking` phase (never properly used)
   - Rename `attached` → `scanning`
   - Keep `displaying` and `pushing`

3. **Single Orbit Implementation**
   - Keep ONLY the orbit code from `attached` phase
   - Remove duplicate orbit logic from `displaying`

**Files to modify**:
- `Game.tsx` lines 1230-1650 (tractor beam logic)
- Remove constants: `GRAV_WELL_RADIUS_BASE`, `CAPTURE_RADIUS_EXTRA`, etc.

### Phase 2: Fix Grid Visualization (HIGH PRIORITY)
**Goal**: Make grid visible and expand properly

1. **Synchronize Timing**
   - Use `traction.gridScan.startTime` instead of `gs.__scanGridStartAt`
   - Remove `gs.__scanGridStartAt`, `gs.__scanGridLockAt`, `gs.__scanGridTarget`
   - Get target directly from `traction.targetAsteroid`

2. **Fix Clipping**
   - Change clip expansion from 2000ms to match grid reveal duration
   - Calculate: `duration = (cols * rows) / revealRate` ms
   - Use `traction.gridScan.elapsed` for progress

3. **Test Grid Rendering**
   - Should expand smoothly as cells reveal
   - Grid should be visible inside the clip region

**Files to modify**:
- `drawAsteroidScanGrid.ts` lines 28-107 (timing and target selection)
- Lines 100-120 (clipping logic)

### Phase 3: Asteroid-Shaped Outline (MEDIUM PRIORITY)
**Goal**: Make outline follow asteroid edges

1. **Access Asteroid Points**
   - Asteroids already have polygon points for collision
   - Need to expose these in the Asteroid type

2. **Draw Polygon Outline**
   - Replace `ctx.arc()` with `ctx.moveTo/lineTo` using asteroid points
   - Apply same stroke style (`#66ff88`)

3. **Handle Rotation**
   - Apply asteroid's current rotation to points
   - Offset by position

**Files to modify**:
- `types.ts` - ensure Asteroid type exposes `points`
- `drawAsteroidScanGrid.ts` lines 164-171 (outline drawing)
- Create helper: `drawAsteroidOutline(ctx, asteroid, overhang)`

### Phase 4: Polish (LOW PRIORITY)
1. Adjust grid cell reveal rate for better visual feedback
2. Add pulse effect to outline when scan completes
3. Sound effects sync with grid reveal progress

## Testing Checklist

After Phase 1:
- [ ] Flying over special asteroid captures immediately
- [ ] No complex speed/direction checks
- [ ] Smooth orbit starts right away
- [ ] Grid scan starts immediately

After Phase 2:
- [ ] Grid lines are VISIBLE
- [ ] Grid expands from center to edge
- [ ] Expansion matches cell reveal progress
- [ ] Grid stays clipped to asteroid boundary

After Phase 3:
- [ ] Outline follows asteroid shape (not circular)
- [ ] Outline rotates with asteroid
- [ ] Jagged/rocky asteroids show properly

## Estimated Impact

**Code Reduction**:
- Phase 1: Remove ~100 lines of complex capture logic
- Phase 2: Simplify ~50 lines of timing code
- Total: ~150 lines removed, cleaner flow

**Bug Fixes**:
- Grid visibility: FIXED
- Outline shape: IMPROVED
- Capture reliability: MUCH BETTER

## Priority Order

1. **Start with Phase 2** (Fix Grid) - Most visible impact, user reported issue
2. **Then Phase 1** (Simplify Flow) - Makes debugging easier
3. **Then Phase 3** (Shape Outline) - Polish
4. **Finally Phase 4** - Nice to have
