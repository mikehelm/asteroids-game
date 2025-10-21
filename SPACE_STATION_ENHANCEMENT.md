# Space Station Enhancement Implementation Plan

## Overview
Transform the Space Station experience with cinematic effects and smooth animations.

## Requirements
1. **Entrance Effect**: Reverse warp effect when station appears (blur background)
2. **Smooth Auto-Docking**: Ship flies around to the back of the station
3. **Bonus Ejection**: 5 random bonus items float out slowly in different directions
4. **Black Hole Exit**: Warp effect that sucks ship in with a flash

## Implementation Status

### ✅ Completed
1. **Space Station Effects System** (`src/systems/spaceStationEffects.ts`)
   - Entrance warp effect data structures
   - Bonus eject generation (5 random items)
   - Black hole effect phases (grow, shrink, flash, done)
   - Update functions for all effects

2. **Enhanced Docking System** (`src/gameLoop/docking.ts`)
   - Three-phase docking plan:
     - Phase 1: Wide arc around back (cubic Bezier, 1200ms)
     - Phase 2: Approach from behind (600ms)
     - Phase 3: Final settle and rotate (400ms)
   - Smooth cubic Bezier curves for natural flight path
   - Ship rotates to face flight direction

### 🚧 TODO
1. **Add Station Effects to GameState** (`src/types.ts`)
   - Add `StationEffectsState` to `GameState` interface
   - Track entrance effect, bonus ejects, and black hole state

2. **Render Entrance Warp Effect**
   - Create reverse warp visual (similar to level-end warp but reversed)
   - Use `ExplosionDistortionManager` for blur effect
   - Render in `drawBackground.ts` or new draw layer

3. **Render Bonus Ejects**
   - Draw 5 bonus items floating away from station
   - Reuse existing bonus rendering code
   - Add glow/sparkle effects
   - Make them collectible by player

4. **Render Black Hole Effect**
   - Draw expanding/contracting black hole
   - Use radial gradient and distortion
   - Pull ship toward center during shrink phase
   - Flash effect at the end

5. **Integrate with Refuel/Reward Docking**
   - Trigger entrance effect when station spawns
   - Start auto-docking when player gets close
   - Eject bonuses after docking completes
   - Trigger black hole effect before undocking
   - Handle ship pull physics during black hole

6. **Update Game Loop**
   - Initialize station effects state
   - Update effects each frame
   - Clean up completed effects
   - Handle player collection of bonus ejects

7. **Sound Effects**
   - Warp-in sound for entrance
   - Bonus eject sounds
   - Black hole whoosh sound
   - Flash/teleport sound

## Technical Notes

### Entrance Effect
- Duration: 1.5 seconds
- Uses reverse radial blur (contracts inward)
- Station appears at center-ish of screen
- Background blurs from edges toward center

### Docking Animation
- Total duration: ~2.2 seconds
- Ship maintains smooth velocity throughout
- Rotation follows flight path naturally
- Ends with ship facing away from station (docked position)

### Bonus Ejects
- 5 items: shield, heal, doubleShooter, missile, fuel
- Speed: 1.5-2.5 px/frame (slow enough to catch)
- Lifetime: 8 seconds
- Spread evenly in circle with slight randomization
- Rotate slowly for visual interest

### Black Hole Effect
- Starts 40px in front of ship
- Grows from 10px to 200px radius (800ms)
- Shrinks back to 0 while pulling ship (400ms)
- Pull strength increases during shrink
- Flash effect (200ms) then done
- Total duration: ~1.4 seconds

## Files Modified
- ✅ `src/systems/spaceStationEffects.ts` (NEW)
- ✅ `src/gameLoop/docking.ts` (ENHANCED)
- 🚧 `src/types.ts` (needs StationEffectsState)
- 🚧 `src/gameLoop/drawLayers/` (new rendering code)
- 🚧 `src/systems/refuelDock.ts` (integrate effects)
- 🚧 `src/systems/rewardDock.ts` (integrate effects)
- 🚧 `src/Game.tsx` (initialize and update effects)

## Next Steps
1. Add `StationEffectsState` to types
2. Create rendering functions for each effect
3. Integrate with existing docking systems
4. Test and tune timing/visuals
5. Add sound effects
