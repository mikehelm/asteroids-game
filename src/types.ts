export interface Vector2 {
  x: number;
  y: number;
}

// Phase C(3a): Docking state for player
export type DockPhase = 'approach' | 'docked';
export interface PlayerDock {
  kind: 'refuel';
  phase: DockPhase;
  startedAt: number; // ms timeline (use frameNow)
  station: 'refuel';
  savedV?: { vx: number; vy: number }; // station's paused velocity
  undockAt?: number; // optional ms timestamp to release after full
  // Optional cinematic sub-phase timings
  arcT0?: number;
  setdownT0?: number;
  egressT0?: number;
  // Manual abort
  abortHoldSince?: number;
}

// Reward docking lifecycle (Phase C3b)
export type RewardDockPhase = 'approach' | 'docked' | 'eject' | 'done';
export interface RewardDock {
  kind: 'reward';
  phase: RewardDockPhase;
  startedAt: number; // ms timeline (use frameNow)
  station: 'reward';
  savedV?: { vx: number; vy: number };
  ejectAt?: number;
  finishedAt?: number;
  // Optional cinematic sub-phase timings
  arcT0?: number;
  setdownT0?: number;
  egressT0?: number;
  // Manual abort
  abortHoldSince?: number;
}

export interface GameObject {
  position: Vector2;
  velocity: Vector2;
  rotation: number;
  radius: number;
}

export interface Player extends GameObject {
  thrust: number;
  maxSpeed: number;
  health: number;
  maxHealth: number;
  invulnerable: number; // Invulnerability frames after taking damage
  mass: number;
  shieldTime: number; // Shield duration in frames
  doubleShooter: number; // Double shooter duration in frames
  doubleShooterStacks?: number; // Stacks for double shooter: 0 = normal, 1 = 2-way, 2 = 4-way
  missiles?: number; // available player missiles
  // Fuel system
  fuel?: number;            // current fuel (0..maxFuel)
  maxFuel?: number;         // capacity
  fuelLowThreshold?: number;      // warn level (e.g., 25% of max)
  fuelCriticalThreshold?: number; // critical level (e.g., 10% of max)
  // Dash/Boost ability
  dashCooldown?: number;    // Frames until next dash available (0 = ready)
  dashActive?: boolean;     // Currently executing a dash
  dashDuration?: number;    // Frames remaining in current dash
  dashDirection?: Vector2;  // Direction vector of current dash
  dashType?: 'forward' | 'backward' | 'left' | 'right'; // Type of dash for special effects
}

export interface Bonus extends GameObject {
  type: 'shield' | 'heal' | 'doubleShooter' | 'missile';
  healAmount?: number; // For heal bonuses
  life: number;
  maxLife: number;
}

export interface Bullet extends GameObject {
  life: number;
  maxLife: number;
}

export interface Asteroid extends GameObject {
  size: 'large' | 'medium' | 'small';
  mass: number;
  health: number;
  maxHealth: number;
  rotationSpeed: number;
  // Special stage asteroid behavior (large only)
  special?: boolean;
  specialSpawn?: 'bonus' | 'alien';
  glowColor?: 'red' | 'green';
  // Optional reward/flip chance associated with special asteroid
  flipitChance?: number;
  // Optional transient edge glow (artifact contact), driven by draw layer using env.frameNow
  edgeGlowUntil?: number;   // ms timestamp until which glow is visible
  edgeGlowAngle?: number;   // radians, center angle of the glow arc
}

export interface AlienShip extends GameObject {
  health: number;
  maxHealth: number;
  speed: number;
  fireRate: number;
  lastShot: number;
  targetAngle: number;
  difficulty: number; // Increases with each spawn
  shotCount: number; // Track shots for laser timing
  aliveFrames?: number; // frames since spawn (for timing behaviors)
  // Spawn timing (ms) so we can trigger long-lived behavior
  spawnAt?: number;
  // Optional delay before the alien becomes active (frames)
  wakeupTime?: number;
  // Temporary timer after getting knocked by an asteroid
  knockedTimer?: number;
  // Steering variety: lateral bias and rethink timers
  sideBias?: number;         // -1 or +1, preferred orbit direction
  rethinkTimer?: number;     // frames until next behavior change
  waypoint?: Vector2 | null; // temporary waypoint to visit
  waypointTimer?: number;    // frames to keep waypoint active
  // Missile-focused alien variant
  isMissileType?: boolean;
  // Missile lock timeline (frames remaining before launch). When undefined or 0, not locking.
  lockCountdown?: number;
  // After lock completes and missile is launched, keep a persistent target on player
  lockLatched?: boolean;
  lockLatchedTimer?: number; // frames to keep latched reticle (e.g., missile flight time)
  // Doom sequence if not killed in time: 0=idle,1=to-center,2=vibrate,3=shrink,4=done
  doomStage?: number;
  doomTimer?: number; // frames remaining for current stage
  // Science vessel thief properties
  isScienceVessel?: boolean; // True if this is a science vessel thief
  scienceRole?: 'primary' | 'secondary'; // Role in multi-vessel coordination
  scienceState?: 'approaching' | 'docking' | 'fleeing' | 'patrolling' | 'hiding'; // Current AI state
  scienceTargetAsteroid?: Asteroid | null; // Which Flipit asteroid to steal from
  scienceDockProgress?: number; // 0-100, scan completion percentage
  scienceDockStartTime?: number; // When docking started (performance.now())
  scienceStealAttempted?: boolean; // Prevent multiple steal attempts
}

export interface Explosion {
  position: Vector2;
  // Optional discriminator for specialized draw behavior; generic explosions omit this
  kind?: string;
  particles: Array<{
    position: Vector2;
    velocity: Vector2;
    life: number;
    maxLife: number;
    size: number;
    color: string;
  }>;
}

export interface AlienBullet extends GameObject {
  life: number;
  maxLife: number;
  // Optional homing missile fields
  homing?: boolean;
  turnRate?: number;          // radians per frame steering limit
  damageMultiplier?: number;  // damage scaling on hit
  explosionRadius?: number;   // px for visual explosion size
  targetOffsetX?: number;     // to reduce perfect hit rate
  targetOffsetY?: number;
  // Locking state and fail-safe
  locked?: boolean;           // launched after confirmed lock
  lostFrames?: number;        // frames spent off target
  selfDestruct?: number;      // frames until forced explosion
  // Player missile metadata
  owner?: 'alien' | 'player';
}

// PlayerMissile extends AlienBullet with a few convenience fields used in Game.tsx
export type PlayerMissileExt = AlienBullet & {
  isExtra?: boolean;
  bornAt?: number;
  phase?: 'straight' | 'homing';
  straightMs?: number;
  history?: Array<{ x: number; y: number }>;
  lastSmokeAt?: number;
  debugTargetRef?: unknown;
  debugTargetType?: 'alien' | 'asteroid';
  debugTargetX?: number;
  debugTargetY?: number;
};

// Visual-only debris particle emitted when asteroids shatter
export interface VisualDebris {
  position: Vector2;
  velocity: Vector2;
  life: number;           // frames elapsed
  maxLife: number;        // frames to live
  size: number;           // base size (pixels)
  color: string;          // match asteroid color
  kind: 'chunk' | 'dust'; // chunk = small polygon, dust = small circle
  rotation?: number;      // for chunks
  rotationSpeed?: number; // for chunks
  // Optional artifact accent: dark-red edge stroke for chunks
  edgeColor?: string;
}

export interface GameState {
  player: Player;
  bullets: Bullet[];
  alienBullets: AlienBullet[];
  playerMissiles?: AlienBullet[]; // reuse AlienBullet schema for player missiles (homing)
  asteroids: Asteroid[];
  alienShips: AlienShip[];
  bonuses: Bonus[];
  explosions: Explosion[];
  // Visual missile gain popups that fly to the HUD and then apply the increment
  missilePopups?: Array<{
    id: number;
    amount: number; // usually 1 when split into icons
    start: number; // ms timestamp
    x: number;
    y: number;
    phase: 'hover' | 'fly';
    applied?: boolean;
    // HUD targeting
    slotIndex?: number; // target HUD slot (0..4)
    targetX?: number;
    targetY?: number;
    scale?: number; // visual scale, shrinks during flight
  }>;
  score: number;
  stage: number;
  gameRunning: boolean;
  gameStarted: boolean;
  keys: { [key: string]: boolean };
  stageStartTime: number;
  stageWaitTime: number;
  alienSpawnCount: number;
  visualDebris?: VisualDebris[];
  levelComplete: boolean;
  warpEffect: number; // 0 = no warp, 1 = full warp
  alienApproachMusicPlayed: boolean;
  asteroidsSpawned: boolean;
  lastBonusSpawn: number;
  healEffect: number; // 0 = no heal effect, 1 = full heal effect
  introPhase: 'none' | 'ship-entrance' | 'health-fill' | 'complete';
  introTimer: number;
  shipScale: number;
  shipIntroPosition: Vector2;
  lives: number; // remaining lives
  respawning: boolean; // true during 3-2-1 countdown
  respawnCountdown: number; // frames until active (e.g., 180 for 3s)
  // Current artifact/reward info from last scan (persists across docks, resets per level)
  currentArtifact?: {
    type: 'Flipit' | 'unknown'; // Will expand with more reward types
    baseChance: number; // Base percentage (before stage multiplier)
    finalChance: number; // After stage multiplier
    scannedAt: number; // Timestamp when scanned
  };
  // World tiling: which off-screen area the player occupies (0,0) is start tile
  worldTileX?: number;
  worldTileY?: number;
  // Off-screen special vehicles bound to specific world tiles
  refuelStation?: RefuelStation | null;
  rewardShip?: RewardShip | null;
  // Phase C(3a/3b): lightweight docking state (refuel or reward)
  dock?: PlayerDock | RewardDock;
}

// Tractor beam phases for discriminated union state
export type TractorBeamPhase = 'approaching' | 'locking' | 'attached' | 'displaying' | 'pushing' | 'idle';

// Transient tractor beam state used during Flipit sequences
export interface TractorBeamState {
  active: boolean;
  phase: TractorBeamPhase;
  targetAsteroid: Asteroid | null;
  startTime?: number;
  attachStartTime?: number;
  displayStartTime?: number;
  pushStartTime?: number;
  orbitAngle: number;
  orbitRadius: number;
  flipitChance?: number;
  // Floating text anchor/velocity and timing for hold/fade
  textAnchorX?: number;
  textAnchorY?: number;
  textVelX?: number;
  textVelY?: number;
  textHoldUntil?: number;
  textFadeUntil?: number;
}

// World tile-bound helper types
export interface RefuelStation {
  tileX: number;
  tileY: number;
  position: Vector2;
  // Phase C(2): very slow drift lifecycle (optional to avoid ripple effects)
  vx?: number; // px/s
  vy?: number; // px/s
  active?: boolean; // default true when present
  cooldownUntil?: number; // ms timestamp when eligible to respawn
}

export interface RewardShip {
  tileX: number;
  tileY: number;
  position: Vector2;
  velocity?: Vector2;
  escortTimer?: number;
  departTimer?: number;
  // Phase C(2): match refuel station lifecycle fields for drift/respawn
  vx?: number; // px/s
  vy?: number; // px/s
  active?: boolean;
  cooldownUntil?: number;
}

// Minimal track info shape used by UI and sounds API
export interface TrackInfo {
  name: string;
  url: string;
}