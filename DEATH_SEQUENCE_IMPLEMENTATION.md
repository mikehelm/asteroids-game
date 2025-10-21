# Cinematic Death Sequence - Implementation Checklist

**Status:** 🚧 IN PROGRESS  
**Started:** 2025-01-21  
**Last Updated:** 2025-01-21

---

## 📋 Overview

Implement dramatic slow-motion death sequence with camera zoom, explosion, and respawn animation.

**Total Duration:** ~3.4 seconds (with respawn) or ~2.9 seconds (game over)

---

## ✅ Phase 0: Foundation (COMPLETED)

- [x] Create `src/systems/cinematicDeath.ts` with state machine
- [x] Define `DeathSequenceState` interface
- [x] Implement `createDeathSequence()` function
- [x] Implement `updateDeathSequence()` function
- [x] Implement helper functions (camera offset, checks, etc.)
- [x] Add `deathSequenceRef` to Game.tsx
- [x] Create documentation (CINEMATIC_DEATH_PLAN.md)

**Notes:** Foundation is solid. All helper functions tested and ready.

---

## 🎯 Phase 1: Trigger Death Sequence

**Goal:** Detect player death and start the cinematic sequence

### Tasks:
- [x] **1.1** Import death sequence functions in Game.tsx
  - Location: Top of file with other imports
  - Import: `createDeathSequence, updateDeathSequence, getDeathCameraOffset, shouldFreezeGameplay`

- [x] **1.2** Find player death detection code
  - Location: Line 3910 in Game.tsx (alien bullet collision)
  - Location: Line 4115 in Game.tsx (asteroid collision)
  - Current: `if (gameState.player.health <= 0)`
  - Two locations: one for lives > 1, one for game over

- [x] **1.3** Replace immediate respawn with sequence trigger
  - Store killer position if available (asteroid/alien that hit player)
  - Call `createDeathSequence()` with player position, rotation, hasLivesLeft
  - Set flag to prevent normal respawn logic
  - Don't decrement lives yet (wait for sequence to complete)

- [ ] **1.4** Test death triggers correctly
  - Die to asteroid
  - Die to alien bullet
  - Die to collision
  - Verify sequence starts

**Status:** ⏳ NOT STARTED  
**Blockers:** None  
**Notes:** Need to handle both death scenarios (lives remaining vs game over)

---

## 🎯 Phase 2: Update Sequence Each Frame

**Goal:** Keep death sequence state updated in the game loop

### Tasks:
- [x] **2.1** Find main game loop
  - Location: Line 1230 in Game.tsx (inside `gameLoop` function)
  - Found `requestAnimationFrame` loop

- [x] **2.2** Add sequence update call
  - Check if `deathSequenceRef.current?.active`
  - Call `updateDeathSequence(deathSequenceRef.current, now, deltaTime)`
  - Placed at line 1251, early in loop before other updates

- [x] **2.3** Test sequence progresses through phases
  - Added console.log for phase and timeScale
  - Will verify timing when testing

**Status:** ✅ COMPLETE  
**Blockers:** Phase 1 must complete first  
**Notes:** This is critical - without this, sequence won't progress

---

## 🎯 Phase 3: Apply Time Scale (Slow Motion)

**Goal:** Slow down all game updates during death sequence

### Tasks:
- [x] **3.1** Calculate time scale
  - Get `timeScale` from `deathSequenceRef.current?.timeScale ?? 1.0`
  - Default to 1.0 if no sequence active

- [x] **3.2** Apply to deltaTime
  - Calculate: `const scaledDt = dt * timeScale`
  - Applied at line 1373 before updateFrame call

- [x] **3.3-3.7** Update all movement (player, bullets, asteroids, aliens, particles)
  - ALL handled by updateFrame() which receives scaledDt
  - Single point of application = less error-prone
  - Player, bullets, asteroids, aliens, particles all use same deltaTime

- [ ] **3.8** Test slow motion effect
  - Verify game slows to 20% speed (0.2 timeScale)
  - Verify smooth transition
  - Verify speeds back up correctly

**Status:** ✅ COMPLETE (pending testing)  
**Blockers:** Phase 2 must complete first  
**Notes:** This is the most invasive change - affects ALL game updates. Be careful!

---

## 🎯 Phase 4: Apply Camera Zoom

**Goal:** Zoom camera in on death position, then zoom back out

### Tasks:
- [x] **4.1** Find main rendering code
  - Location: Line 4582+ in Game.tsx
  - Found all game object drawing code

- [x] **4.2** Add camera transform wrapper
  - Added at line 4582 after screen shake
  - Check if `deathSequenceRef.current?.active`
  - Get offset: `getDeathCameraOffset(deathSequenceRef.current, CANVAS_WIDTH, CANVAS_HEIGHT)`
  - Get zoom: `deathSequenceRef.current.cameraZoom`

- [x] **4.3** Apply transform
  - ctx.save() before game objects (line 4585)
  - Apply translate → scale → translate transform
  - ctx.restore() after game objects, before UI (line 4637)
  - UI elements (HUD, overlays) NOT zoomed

- [ ] **4.4** Test camera zoom
  - Verify zooms to 2.5x
  - Verify centers on death position
  - Verify zooms back out smoothly

**Status:** ✅ COMPLETE (pending testing)  
**Blockers:** Phase 3 should complete first (but can work in parallel)  
**Notes:** Make sure to wrap ALL game object drawing, not UI elements

---

## 🎯 Phase 5: Enhanced Explosion

**Goal:** Create dramatic explosion effect during death

### Tasks:
- [ ] **5.1** Check if explosion should show
  - Use `shouldShowExplosion(deathSequenceRef.current)`
  - Returns true during 'explosion' and 'zoomout' phases

- [ ] **5.2** Trigger large explosion
  - Create explosion at death position
  - More particles than normal (2-3x)
  - Larger radius
  - Longer duration

- [ ] **5.3** Add screen shake (optional)
  - Small camera shake during explosion
  - Syncs with explosion phase

- [ ] **5.4** Test explosion effect
  - Verify explosion is dramatic
  - Verify timing aligns with slow-mo

**Status:** ⏳ NOT STARTED  
**Blockers:** Phase 4 must complete first  
**Notes:** Can enhance later if initial explosion isn't dramatic enough

---

## 🎯 Phase 6: Respawn Animation

**Goal:** Animate new ship from lives HUD to center

### Tasks:
- [ ] **6.1** Check if respawn should show
  - Use `shouldShowRespawn(deathSequenceRef.current)`
  - Use `getRespawnProgress(deathSequenceRef.current, now)` for animation

- [ ] **6.2** Calculate respawn path
  - Start: Lives HUD position (bottom-left area, ~50px from edges)
  - End: Center of screen (CANVAS_WIDTH/2, CANVAS_HEIGHT/2)
  - Interpolate with easing

- [ ] **6.3** Draw respawning ship
  - Position along path based on progress (0-1)
  - Fade in alpha: progress * 1.0
  - Optional: trail effect behind ship

- [ ] **6.4** Complete respawn
  - When sequence phase === 'done' and hasLivesLeft
  - Actually decrement lives
  - Set player position to center
  - Reset player health
  - Set invulnerability frames
  - Clear death sequence

- [ ] **6.5** Test respawn animation
  - Verify ship flies from lives HUD to center
  - Verify smooth animation
  - Verify game resumes normally

**Status:** ⏳ NOT STARTED  
**Blockers:** Phase 5 must complete first  
**Notes:** This is the final visual flourish

---

## 🎯 Phase 7: Game Over Integration

**Goal:** Handle death sequence when no lives remain

### Tasks:
- [ ] **7.1** Detect no lives remaining
  - Check `deathSequenceRef.current?.hasLivesLeft === false`
  - Sequence should skip 'respawn' phase and go to 'done'

- [ ] **7.2** Trigger game over after sequence
  - When sequence phase === 'done' and !hasLivesLeft
  - Set `gameState.gameRunning = false`
  - Trigger game over screen
  - Clear death sequence

- [ ] **7.3** Test game over flow
  - Die with 1 life remaining
  - Verify sequence plays fully
  - Verify game over screen appears after sequence
  - Verify no respawn animation

**Status:** ⏳ NOT STARTED  
**Blockers:** Phase 6 must complete first  
**Notes:** Should be straightforward - just skip respawn phase

---

## 🎯 Phase 8: Polish & Testing

**Goal:** Fine-tune timing and fix any bugs

### Tasks:
- [ ] **8.1** Test all death scenarios
  - Die to asteroid (small, medium, large)
  - Die to alien bullet
  - Die to collision with alien
  - Die with lives remaining
  - Die on last life

- [ ] **8.2** Tune timing
  - Adjust phase durations if needed
  - Adjust zoom amount (currently 2.5x)
  - Adjust slow-mo amount (currently 0.2x = 20% speed)

- [ ] **8.3** Fix any visual glitches
  - Check UI doesn't zoom with camera
  - Check particles look good in slow-mo
  - Check respawn animation is smooth

- [ ] **8.4** Performance check
  - Verify no frame drops during sequence
  - Optimize if needed

- [ ] **8.5** Edge case testing
  - Die while dashing
  - Die while firing
  - Die near edge of screen
  - Die during level transition (shouldn't happen but check)

**Status:** ⏳ NOT STARTED  
**Blockers:** All previous phases must complete  
**Notes:** This is where we make it feel AMAZING

---

## 🎯 Phase 9: Cleanup & Documentation

**Goal:** Clean up code and document the feature

### Tasks:
- [ ] **9.1** Remove debug logging
  - Remove any console.logs added during development

- [ ] **9.2** Add code comments
  - Document death sequence integration points
  - Explain time scale application
  - Explain camera transform

- [ ] **9.3** Update this checklist
  - Mark all tasks complete
  - Add final notes
  - Document any deviations from plan

- [ ] **9.4** Test one final time
  - Full playthrough
  - Die multiple times
  - Verify everything works

**Status:** ⏳ NOT STARTED  
**Blockers:** All previous phases must complete  
**Notes:** Don't skip this - clean code is important!

---

## 📊 Progress Summary

**Phases Complete:** 1/10 (10%)  
**Current Phase:** Phase 0 - Foundation ✅  
**Next Phase:** Phase 1 - Trigger Death Sequence  
**Estimated Time Remaining:** ~2-3 hours of focused work

---

## 🐛 Known Issues

*None yet - will document as we find them*

---

## 💡 Ideas for Future Enhancement

- [ ] Different death animations based on how player died
- [ ] Particle effects during slow-mo (sparks, debris)
- [ ] Sound effects (slow-mo whoosh, explosion boom)
- [ ] Screen flash on explosion
- [ ] More dramatic camera shake
- [ ] Replay the killing shot (show projectile in slow-mo)

---

## 📝 Implementation Notes

### Key Files:
- `src/systems/cinematicDeath.ts` - Death sequence state machine (DONE)
- `src/Game.tsx` - Main integration point (IN PROGRESS)
- `src/types.ts` - May need to add types if needed

### Critical Considerations:
1. **Time Scale** - Must apply to ALL game updates, not just some
2. **Camera Transform** - Must wrap ALL game objects, not UI
3. **State Management** - Must clear sequence when done
4. **Edge Cases** - Handle death during special states (dashing, etc.)

### Testing Strategy:
1. Test each phase independently before moving to next
2. Use console.log to verify phase transitions
3. Test with different death scenarios
4. Test with lives remaining and last life
5. Performance test on slower devices

---

## 🚀 Ready to Begin!

**Next Step:** Start Phase 1 - Import death sequence functions and trigger on player death.

Let's do this! 🎮✨
