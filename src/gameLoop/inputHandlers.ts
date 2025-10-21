// Keyboard input handlers extracted from Game.tsx (behavior preserved 1:1)

// Use a minimal ref type to avoid importing React in this plain TS module
export type MutableRef<T> = { current: T };
import { suspendTrails } from './trailsControl';

// Lightweight deps contract to avoid heavy coupling/cycles
export type InputDeps = {
  gameStateRef: MutableRef<any /* GameState | undefined */>;
  isPausedRef: MutableRef<boolean>;
  CANVAS_WIDTH: number;
  CANVAS_HEIGHT: number;
  soundSystem: any;
  // optional restart callback wired by Game.tsx
  requestRestart?: () => void;
  // pause toggle callback to properly update React state
  togglePause?: () => void;

  // missile + trails control
  unlimitedMissilesRef: MutableRef<boolean>;
  lastMissileFireAtRef: MutableRef<number>;
  missileBurstCountRef: MutableRef<number>;
  lastMissileEventRef: MutableRef<number>;
  trailsSuspendUntilRef: MutableRef<number>;
  trailsFadeInStartRef: MutableRef<number>;

  // difficulty
  difficultyRef: MutableRef<'easy'|'medium'|'hard'>;

  // helpers used in the inline code
  multiplyVector: (v: {x:number;y:number}, s: number) => {x:number;y:number};
  createBullet: (pos: {x:number;y:number}, angle: number) => any;
  createAlienBullet: (pos: {x:number;y:number}, angle: number) => any;

  // debug HUD toggler from Game.tsx (setShowDebugHud(v=>!v)) -> we provide a flip function hook
  // To preserve behavior, the Game passes a stable toggler that flips state
  toggleDebugHud: () => void;
  
  // Double-tap detection for dash ability
  lastKeyPressTimeRef: MutableRef<{ [key: string]: number }>;
  DOUBLE_TAP_WINDOW_MS: number;
  rotationBeforeFirstPressRef: MutableRef<{ [key: string]: number }>; // Store rotation before first press for correction
};

export function createInputHandlers(deps: InputDeps) {
  const {
    gameStateRef,
    isPausedRef,
    CANVAS_WIDTH,
    soundSystem,
    unlimitedMissilesRef,
    lastMissileFireAtRef,
    missileBurstCountRef,
    lastMissileEventRef,
    trailsSuspendUntilRef,
    trailsFadeInStartRef,
    difficultyRef,
    multiplyVector,
    createBullet,
    createAlienBullet,
    toggleDebugHud,
  } = deps;

  const onKeyDown = (e: KeyboardEvent) => {
    if (!gameStateRef.current) return;
    const gs = gameStateRef.current;
    const now = performance.now();
    
    // Double-tap detection for dash ability
    const dashKeys = ['w', 'W', 'a', 'A', 's', 'S', 'd', 'D', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];
    if (dashKeys.includes(e.key) && !isPausedRef.current) {
      const lastPressTime = deps.lastKeyPressTimeRef.current[e.key] || 0;
      const timeSinceLastPress = now - lastPressTime;
      
      // Check if this is a double-tap
      if (timeSinceLastPress < deps.DOUBLE_TAP_WINDOW_MS && timeSinceLastPress > 80) { // min 80ms to avoid single press detection (increased from 50ms)
        // Trigger dash if cooldown is ready
        const player = gs.player;
        const dashCooldown = player.dashCooldown || 0;
        
        if (dashCooldown === 0 && !player.dashActive) {
          // Determine dash type and direction relative to ship facing
          let dashType: 'forward' | 'backward' | 'left' | 'right';
          let relativeAngle = 0; // Angle relative to ship rotation
          
          // Forward: W or ArrowUp
          if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
            dashType = 'forward';
            relativeAngle = 0; // Same direction as ship
          }
          // Backward: S or ArrowDown
          else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
            dashType = 'backward';
            relativeAngle = Math.PI; // Opposite direction
          }
          // Left: A or ArrowLeft
          else if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
            dashType = 'left';
            relativeAngle = -Math.PI / 2; // 90 degrees left
            // Restore rotation from before FIRST press of double-tap
            const originalRotation = deps.rotationBeforeFirstPressRef.current[e.key];
            if (originalRotation !== undefined) {
              player.rotation = originalRotation;
            }
          }
          // Right: D or ArrowRight
          else {
            dashType = 'right';
            relativeAngle = Math.PI / 2; // 90 degrees right
            // Restore rotation from before FIRST press of double-tap
            const originalRotation = deps.rotationBeforeFirstPressRef.current[e.key];
            if (originalRotation !== undefined) {
              player.rotation = originalRotation;
            }
          }
          
          // Calculate actual dash direction in world space
          const dashAngle = player.rotation + relativeAngle;
          const dashDirX = Math.cos(dashAngle);
          const dashDirY = Math.sin(dashAngle);
          
          // Dash parameters vary by type (all speeds reduced by 50%)
          const isForward = dashType === 'forward';
          const DASH_SPEED = isForward ? 9 : 6; // Forward 50% more than others, all reduced by 50%
          const dashDuration = isForward ? 22 : 15; // Longer forward dash
          
          // Activate dash
          player.dashActive = true;
          player.dashDuration = dashDuration;
          player.dashDirection = { x: dashDirX, y: dashDirY };
          player.dashType = dashType;
          player.dashCooldown = 90; // ~1.5s cooldown at 60fps
          player.invulnerable = Math.max(player.invulnerable, dashDuration); // Invuln during dash
          
          // Apply instant velocity boost
          player.velocity.x += dashDirX * DASH_SPEED;
          player.velocity.y += dashDirY * DASH_SPEED;
          
          // Play appropriate dash sound
          if (isForward) {
            try { soundSystem.playTractorRelease?.(); } catch {} // Different sound for forward
          } else {
            try { soundSystem.playWhoosh?.(); } catch {}
          }
          
          // Reset double-tap detection
          deps.lastKeyPressTimeRef.current[e.key] = 0;
          gs.keys[e.key] = true;
          return;
        }
      }
      
      // First press: store rotation and timestamp
      deps.rotationBeforeFirstPressRef.current[e.key] = gs.player.rotation;
      deps.lastKeyPressTimeRef.current[e.key] = now;
    }
    
    gs.keys[e.key] = true;
    // Pause toggle (works even if currently paused)
    if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      // Use callback to properly update React state, fallback to direct toggle
      if (deps.togglePause) {
        deps.togglePause();
      } else {
        isPausedRef.current = !isPausedRef.current;
      }
      return;
    }
    // Restart: immediate if game over, with confirmation if mid-game
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      
      // If game is over, allow direct restart (no confirmation needed)
      if (!gs.gameRunning) {
        try { deps.requestRestart?.(); } catch {}
        return;
      }
      
      // Mid-game restart requires confirmation to prevent accidents
      import('../ui/confirm').then(mod => mod.confirmAction('Restart game?')).then(ok => {
        if (ok) {
          try { deps.requestRestart?.(); } catch {}
        }
      }).catch(() => {});
      return;
    }
    if (e.key === 'h' || e.key === 'H') {
      toggleDebugHud();
    }
    // Ignore gameplay inputs while paused (no firing/missiles)
    if (isPausedRef.current) return;
    // Shooting on space
    if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      const player = gs.player;
      // Level 1: always fire three shots (center and +/- spread), entire level
      if (gs.stage === 1) {
        const spread = 0.10;
        gs.bullets.push(createBullet(player.position, player.rotation));
        gs.bullets.push(createBullet(player.position, player.rotation - spread));
        gs.bullets.push(createBullet(player.position, player.rotation + spread));
        soundSystem.playPlayerShoot();
        return;
      }
      const stacks = Math.max(0, player.doubleShooterStacks || 0);
      if (player.doubleShooter > 0 && stacks >= 2) {
        const spread = 0.12;
        const angles = [
          player.rotation - spread * 1.5,
          player.rotation - spread * 0.5,
          player.rotation + spread * 0.5,
          player.rotation + spread * 1.5,
        ];
        for (const a of angles) gs.bullets.push(createBullet(player.position, a));
      } else if (player.doubleShooter > 0 && stacks >= 1) {
        const spread = 0.12;
        gs.bullets.push(createBullet(player.position, player.rotation - spread));
        gs.bullets.push(createBullet(player.position, player.rotation + spread));
      } else {
        gs.bullets.push(createBullet(player.position, player.rotation));
      }
      soundSystem.playPlayerShoot();
    }
    // Fire player missile on Enter if available (or activate unlimited when near HUD missile counter)
    if (e.key === 'Enter') {
      e.preventDefault();
      const p = gs.player;
      // If player is near the HUD missile counter (top-right), toggle unlimited missiles for testing
      // Define a generous hit box around top-right HUD missiles area
      const hudBoxW = 140, hudBoxH = 64, hudMargin = 16;
      const hudX0 = CANVAS_WIDTH - hudMargin - hudBoxW;
      const hudY0 = hudMargin;
      const px = p.position.x, py = p.position.y;
      const nearHudMissiles = (px >= hudX0 && px <= hudX0 + hudBoxW && py >= hudY0 && py <= hudY0 + hudBoxH);
      if (nearHudMissiles) {
        unlimitedMissilesRef.current = true;
        p.missiles = 9999; // large sentinel; logic below will avoid decrementing when unlimited
        return;
      }
      // Ensure segment-based ammo is initialized (each slot is worth 5 segments)
      const pSegInit = p as any as { missileSegments?: number };
      if (typeof pSegInit.missileSegments !== 'number') {
        pSegInit.missileSegments = Math.max(0, (p.missiles || 0) * 5);
      }
      // Determine if this press is part of a rapid-fire burst (extras)
      const nowPress = performance.now();
      const inBurstWindow = (nowPress - lastMissileFireAtRef.current) < 400; // 0.4s window
      const isExtra = inBurstWindow && missileBurstCountRef.current >= 1;

      // Enforce max 3 simultaneous player missiles in the air (unless unlimited cheat is active)
      if (!unlimitedMissilesRef.current) {
        const activePlayerMissiles = (gs.playerMissiles || []).filter((b: any) => b.owner === 'player').length;
        if (activePlayerMissiles >= 3) return;
      }
      const pSegRead = p as any as { missileSegments?: number };
      const segs: number = pSegRead.missileSegments || 0;
      if (isExtra || unlimitedMissilesRef.current || segs > 0) {
        // Create a missile at player position heading forward
        const missile: any = createAlienBullet(p.position, p.rotation);
        missile.owner = 'player';
        // Extra missiles: simple dumbfire, no lock-on, very low damage
        if (isExtra) {
          missile.homing = false;
          missile.turnRate = 0;
          missile.damageMultiplier = 0.2;
          missile.explosionRadius = 30;
          (missile as any).isExtra = true;
        } else {
          missile.homing = true;
          // Stronger homing for primaries
          missile.turnRate = Math.max(0.12, missile.turnRate || 0.12);
          missile.damageMultiplier = 10; // ensure kill
          missile.explosionRadius = 80;
          (missile as any).isExtra = false;
        }
        // Slightly faster than alien missile
        const baseSpeed = 3.6;
        missile.velocity = multiplyVector({ x: Math.cos(p.rotation), y: Math.sin(p.rotation) }, baseSpeed);
        missile.radius = 4;
        // Primary should try to hit its target for ~5 seconds (~300 frames at 60 FPS)
        missile.maxLife = isExtra ? 220 : 300;
        missile.locked = true;
        missile.lostFrames = 0;
        // Two-phase flight: start straight & slow for 1s, then homing
        (missile as any).bornAt = performance.now();
        (missile as any).phase = 'straight'; // 'straight' -> 'homing'
        (missile as any).straightMs = 1000;
        // Initialize path history only for primary (extras keep simple visuals)
        if (!isExtra) {
          (missile as any).history = [{ x: missile.position.x, y: missile.position.y }];
          (missile as any).lastSmokeAt = performance.now();
        }
        // Distinct target selection at launch: avoid targets already claimed by active player missiles
        try {
          const claimed = new Set<unknown>();
          for (const m of (gs.playerMissiles || [])) {
            const mm = m as any;
            if (mm.owner === 'player' && mm.debugTargetRef) claimed.add(mm.debugTargetRef);
          }
          const candidates: Array<{ type: 'alien'|'asteroid'; obj: any; score: number }> = [];
          // Aliens: missile-type UFOs first (very high score), then other aliens by health, both with distance falloff
          for (const s of gs.alienShips) {
            const dx = s.position.x - p.position.x, dy = s.position.y - p.position.y; const d = Math.hypot(dx, dy) || 1;
            const isMissileType = ('isMissileType' in s) && (s as any).isMissileType === true;
            const base = isMissileType ? 1_000_000 : 500_000 + Math.max(0, s.health || 0) * 1000;
            const score = base - d; // prefer closer for tie-breaks
            candidates.push({ type: 'alien', obj: s, score });
          }
          // Asteroids: only large ones; choose closest
          for (const a of gs.asteroids) {
            if (a.size !== 'large') continue;
            const dx = a.position.x - p.position.x, dy = a.position.y - p.position.y; const d = Math.hypot(dx, dy) || 1;
            const score = 100_000 - d; // prefer closer large asteroids
            candidates.push({ type: 'asteroid', obj: a, score });
          }
          const best = candidates.filter(c => !claimed.has(c.obj)).sort((a,b)=>b.score-a.score)[0];
          if (best) {
            const mx = missile as any;
            mx.debugTargetRef = best.obj;
            mx.debugTargetType = best.type;
            mx.debugTargetX = best.obj.position.x;
            mx.debugTargetY = best.obj.position.y;
          }
        } catch {}
        // Determine accuracy based on difficulty (primary more accurate ~90%)
        // Use current difficulty via ref to avoid hook dependency churn
        const diff = difficultyRef.current === 'easy' ? -1 : (difficultyRef.current === 'hard' ? 1 : 0); // -1 easy, 0 med, +1 hard
        const primaryAcc = 1.0; // always lock when a valid target exists
        const baseAcc = diff < 0 ? 0.8 : diff > 0 ? 0.5 : 0.7;
        const accChance = isExtra ? baseAcc : primaryAcc;
        const miss = Math.random() > accChance;
        if (isExtra) {
          // extras already dumbfire; nothing to set
        } else {
          if (miss) {
            // Primary rare miss -> no lock, fly straight
            missile.homing = false;
            const mx = missile as any;
            mx.debugTargetRef = undefined;
            mx.debugTargetType = undefined;
            mx.debugTargetX = undefined;
            mx.debugTargetY = undefined;
          } else {
            // Accurate primary: no offset; chase true target position
            missile.targetOffsetX = 0; missile.targetOffsetY = 0;
          }
        }
        // Re-check cap just before adding (belt and suspenders)
        if (!unlimitedMissilesRef.current) {
          const activeNow = (gs.playerMissiles || []).filter((b: any) => b.owner === 'player').length;
          if (activeNow >= 3) return;
        }
        gs.playerMissiles!.push(missile);
        // Ammo consumption: only primary consumes ammo (one segment per shot)
        if (!unlimitedMissilesRef.current && !isExtra) {
          const pSegWrite = p as any as { missileSegments?: number };
          pSegWrite.missileSegments = Math.max(0, (pSegWrite.missileSegments || 0) - 1);
        }
        soundSystem.playMissileLaunch();
        // Suspend motion trails while missile and ensuing effects are active (at least 1s)
        suspendTrails({
          trailsSuspendUntilRef,
          trailsFadeInStartRef,
          // not used by suspendTrails but required by type; provide inert placeholders
          trailsEnabledRef: { current: true },
          trailsStrengthRef: { current: 0 },
          lastMissileEventRef,
        }, performance.now() + 1000);
        lastMissileEventRef.current = performance.now();
        // Track burst window and count
        if (inBurstWindow) {
          missileBurstCountRef.current = Math.min(6, missileBurstCountRef.current + 1);
        } else {
          missileBurstCountRef.current = 1; // primary
        }
        lastMissileFireAtRef.current = nowPress;
      }
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (!gameStateRef.current) return;
    gameStateRef.current.keys[e.key] = false;
  };

  return { onKeyDown, onKeyUp };
}
