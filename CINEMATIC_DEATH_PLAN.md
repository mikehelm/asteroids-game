# Cinematic Death Sequence Implementation Plan

## Overview
Create a dramatic slow-motion death sequence when the player dies, with camera zoom, explosion, and respawn animation.

## Sequence Breakdown

### Phase 1: Slowdown (0.5s)
- Time scale: 1.0 → 0.2 (slow motion)
- Camera zoom: 1.0 → 2.5x (zoom in on ship)
- Focus on death position

### Phase 2: Replay (1.0s)
- Hold slow motion at 0.2x speed
- Hold zoom at 2.5x
- Show the moment of death in slow motion
- Replay last shot/collision

### Phase 3: Explosion (0.8s)
- Ship explodes in slow motion
- Dramatic particle effects
- Still zoomed in

### Phase 4: Zoom Out (0.6s)
- Camera zoom: 2.5x → 1.0 (zoom out)
- Time scale: 0.2 → 1.0 (speed up)
- Smooth transition back to normal

### Phase 5: Respawn (0.5s) OR Game Over
- **If lives remaining:**
  - New ship spawns from lives HUD position
  - Flies to center
  - Game continues
- **If no lives:**
  - Skip respawn
  - Show game over screen

## Total Duration
- **With respawn:** ~3.4 seconds
- **Game over:** ~2.9 seconds

## Implementation Status

### ✅ Completed
1. **Death Sequence System** (`src/systems/cinematicDeath.ts`)
   - State management for all phases
   - Time scale and zoom calculations
   - Camera offset calculations
   - Phase transitions with easing

### 🚧 TODO
1. **Integrate with Game.tsx**
   - Import death sequence functions
   - Add deathSequenceRef (DONE)
   - Trigger sequence on player death
   - Apply time scale to game updates
   - Apply camera zoom/offset to rendering

2. **Modify Death Detection**
   - Replace immediate respawn with sequence trigger
   - Store killer position for replay
   - Store last shot direction

3. **Apply Time Scale**
   - Multiply deltaTime by timeScale in all updates
   - Slow down:
     - Player movement
     - Bullet movement
     - Asteroid movement
     - Alien movement
     - Particle effects
     - Explosions

4. **Apply Camera Zoom**
   - Calculate camera offset
   - Apply to all draw calls
   - Use ctx.translate() and ctx.scale()

5. **Explosion Enhancement**
   - Trigger large explosion at death position
   - More particles during explosion phase
   - Dramatic visual effects

6. **Respawn Animation**
   - Calculate path from lives HUD to center
   - Animate new ship along path
   - Fade in effect

7. **Game Over Integration**
   - Skip respawn phase if no lives
   - Transition to game over screen
   - Keep dramatic timing

## Technical Notes

### Time Scale Application
```typescript
// In game loop
const timeScale = deathSequenceRef.current?.timeScale ?? 1.0;
const scaledDelta = deltaTime * timeScale;
```

### Camera Transform
```typescript
// In draw function
if (deathSequenceRef.current?.active) {
  const offset = getDeathCameraOffset(deathSequenceRef.current, width, height);
  const zoom = deathSequenceRef.current.cameraZoom;
  
  ctx.save();
  ctx.translate(width/2, height/2);
  ctx.scale(zoom, zoom);
  ctx.translate(-width/2 + offset.x, -height/2 + offset.y);
  
  // ... draw game ...
  
  ctx.restore();
}
```

### Respawn Path
- Start: Lives HUD position (bottom-left area)
- End: Center of screen
- Duration: 0.5 seconds
- Easing: ease-out for smooth arrival

## Files to Modify
- ✅ `src/systems/cinematicDeath.ts` (NEW - DONE)
- 🚧 `src/Game.tsx` (integrate sequence)
- 🚧 `src/gameLoop/update.ts` (apply time scale)
- 🚧 `src/gameLoop/draw.ts` (apply camera transform)

## Next Steps
1. Import death sequence functions in Game.tsx
2. Trigger sequence when player health <= 0
3. Apply time scale to game loop
4. Apply camera transform to rendering
5. Test and tune timing
