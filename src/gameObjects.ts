import { Player, Bullet, Asteroid, Vector2 } from './types';
import { AlienShip, AlienBullet, Explosion, Bonus } from './types';
import { 
  CANVAS_WIDTH, 
  CANVAS_HEIGHT, 
  wrapPosition,
  vectorFromAngle,
  addVectors,
  multiplyVector
} from './utils';

export function createPlayer(): Player {
  return {
    position: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 },
    velocity: { x: 0, y: 0 },
    rotation: 0,
    radius: 12,
    thrust: 0,
    maxSpeed: 8,
    health: 100,
    maxHealth: 100,
    invulnerable: 0,
    mass: 2,
    shieldTime: 0,
    doubleShooter: 0,
    doubleShooterStacks: 0,
    missiles: 3,
    // Fuel defaults
    fuel: 100,
    maxFuel: 100,
    fuelLowThreshold: 25,
    fuelCriticalThreshold: 10,
  };
}

// Small black/gray puff used for asteroid-asteroid bumps (no damage)
export function createBlackPuffExplosion(position: Vector2, intensity: number = 8): Explosion {
  const particles = [];
  const numParticles = intensity + Math.floor(Math.random() * 4); // 8-11 particles by default

  for (let i = 0; i < numParticles; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.5 + Math.random() * 1.5; // slow, subtle
    const velocity = vectorFromAngle(angle, speed);
    // 5% dark yellow accent, otherwise dark gray/black
    const shade = Math.random() < 0.05 ? (Math.random() < 0.5 ? '#8a6f00' : '#a98b00') : (Math.random() < 0.5 ? '#111111' : '#222222');
    particles.push({
      position: { ...position },
      velocity,
      life: 0,
      maxLife: 20 + Math.floor(Math.random() * 30), // short
      size: 1 + Math.random() * 2,
      color: shade,
    });
  }

  return {
    position: { ...position },
    particles,
  };
}

export function createBullet(position: Vector2, angle: number): Bullet {
  const speed = 10;
  const velocity = vectorFromAngle(angle, speed);
  
  return {
    position: { ...position },
    velocity,
    rotation: angle,
    radius: 3,
    life: 0,
    maxLife: 60, // 1 second at 60 FPS
  };
}

export function createAsteroid(size: 'large' | 'medium' | 'small', position?: Vector2, stage: number = 1): Asteroid {
  // Generate position from screen edges if not provided
  let randomPosition: Vector2;
  if (position) {
    randomPosition = position;
  } else {
    // Spawn from random edge of screen
    const edge = Math.floor(Math.random() * 4); // 0=top, 1=right, 2=bottom, 3=left
    const margin = 50; // Distance outside screen
    
    switch (edge) {
      case 0: // Top
        randomPosition = { x: Math.random() * CANVAS_WIDTH, y: -margin };
        break;
      case 1: // Right
        randomPosition = { x: CANVAS_WIDTH + margin, y: Math.random() * CANVAS_HEIGHT };
        break;
      case 2: // Bottom
        randomPosition = { x: Math.random() * CANVAS_WIDTH, y: CANVAS_HEIGHT + margin };
        break;
      default: // Left
        randomPosition = { x: -margin, y: Math.random() * CANVAS_HEIGHT };
        break;
    }
  }

  // Generate direction towards screen center with some randomness
  let angle: number;
  if (position) {
    // If position is manually specified, use random direction
    angle = Math.random() * 2 * Math.PI;
  } else {
    // Calculate angle towards screen center
    const centerX = CANVAS_WIDTH / 2;
    const centerY = CANVAS_HEIGHT / 2;
    const baseAngle = Math.atan2(centerY - randomPosition.y, centerX - randomPosition.x);
    
    // Add some randomness to the angle (±45 degrees)
    const randomness = (Math.random() - 0.5) * (Math.PI / 2);
    angle = baseAngle + randomness;
  }
  
  // Set speed based on size and stage
  let baseSpeed = size === 'large' ? 1.5 : size === 'medium' ? 2 : 2.5;
  
  // Adjust speed based on stage
  if (stage === 1) {
    baseSpeed *= 0.6; // Stage 1: 60% speed (slower)
  } else if (stage === 2) {
    baseSpeed *= 1.0; // Stage 2: normal speed
  } else if (stage >= 3) {
    baseSpeed *= 1.2; // Stage 3+: 20% faster
  }
  
  const velocity = vectorFromAngle(angle, baseSpeed);

  const radius = size === 'large' ? 40 : size === 'medium' ? 25 : 15;
  const mass = size === 'large' ? 20 : size === 'medium' ? 10 : 5;
  const health = size === 'large' ? 3 : size === 'medium' ? 2 : 1;

  // Random rotation speed for each asteroid
  const rotationSpeed = (Math.random() - 0.5) * 0.02; // -0.01 to +0.01 radians per frame
  return {
    position: randomPosition,
    velocity,
    rotation: 0,
    radius,
    size,
    mass,
    health,
    maxHealth: health,
    rotationSpeed,
    // Ensure optional special-asteroid fields are present (explicitly undefined by default)
    special: undefined,
    specialSpawn: undefined,
    glowColor: undefined,
    flipitChance: undefined,
  };
}

export function updatePlayer(player: Player, keys: { [key: string]: boolean }, _deltaTime: number): Player {
  void _deltaTime;
  const updated = { ...player };

  // Update invulnerability frames
  if (updated.invulnerable > 0) {
    updated.invulnerable--;
  }

  // Update double shooter time
  if (updated.doubleShooter > 0) {
    updated.doubleShooter--;
    if (updated.doubleShooter === 0) {
      // When timer ends, clear stacks back to 0
      updated.doubleShooterStacks = 0;
    }
  }

  // Rotation
  if (keys['ArrowLeft'] || keys['a'] || keys['A']) {
    updated.rotation -= 0.1;
  }
  if (keys['ArrowRight'] || keys['d'] || keys['D']) {
    updated.rotation += 0.1;
  }

  // Thrust with fuel consumption
  if (keys['ArrowUp'] || keys['w'] || keys['W']) {
    const hasFuel = (updated.fuel ?? 0) > 0;
    if (hasFuel) {
      updated.thrust = 0.3;
      const thrustVector = vectorFromAngle(updated.rotation, updated.thrust);
      updated.velocity = addVectors(updated.velocity, thrustVector);
      // Consume fuel: smaller idle + slightly higher thrust cost
      const idleBurn = 0.0015;
      const thrustBurn = updated.thrust * 0.03;
      const newFuel = Math.max(0, (updated.fuel ?? 0) - (idleBurn + thrustBurn));
      updated.fuel = newFuel;
    } else {
      // No fuel: cannot thrust, apply friction
      updated.thrust = 0;
      updated.velocity = multiplyVector(updated.velocity, 0.98);
    }
  } else {
    updated.thrust = 0;
    // Idle burn + friction
    const idleBurn = 0.0015;
    updated.fuel = Math.max(0, Math.min(updated.maxFuel ?? 100, (updated.fuel ?? 0) - idleBurn));
    updated.velocity = multiplyVector(updated.velocity, 0.98);
  }

  // Limit speed (reduced when double shooter is active)
  const currentMaxSpeed = updated.doubleShooter > 0 ? updated.maxSpeed * 0.5 : updated.maxSpeed;
  const speed = Math.sqrt(updated.velocity.x ** 2 + updated.velocity.y ** 2);
  if (speed > currentMaxSpeed) {
    updated.velocity = multiplyVector(updated.velocity, currentMaxSpeed / speed);
  }

  // Update position
  updated.position = addVectors(updated.position, updated.velocity);
  updated.position = wrapPosition(updated.position);

  return updated;
}

export function updateBullet(bullet: Bullet): Bullet {
  const updated = { ...bullet };
  updated.position = addVectors(updated.position, updated.velocity);
  updated.position = wrapPosition(updated.position);
  updated.life++;
  return updated;
}

export function updateAsteroid(asteroid: Asteroid): Asteroid {
  const updated = { ...asteroid };
  
  // Asteroids move in straight lines at constant velocity
  updated.position = addVectors(updated.position, updated.velocity);
  updated.position = wrapPosition(updated.position);
  
  // Add slow rotation
  updated.rotation += updated.rotationSpeed;
  
  return updated;
}

export function splitAsteroid(asteroid: Asteroid, bulletVelocity?: Vector2): Asteroid[] {
  if (asteroid.size === 'small') {
    return []; // Small asteroids don't split
  }

  const newSize = asteroid.size === 'large' ? 'medium' : 'small';
  const fragments: Asteroid[] = [];

  // Create 2 fragments that fly off based on impact physics (was 2-3; simplified)

  for (let i = 0; i < 2; i++) {
    // Calculate fragment velocity based on impact physics
    let fragmentAngle;
    
    if (bulletVelocity) {
      // Base angle from bullet direction
      const bulletAngle = Math.atan2(bulletVelocity.y, bulletVelocity.x);
      // Add some spread and randomness
      const spread = Math.PI / 3; // 60 degree spread
      fragmentAngle = bulletAngle + (i - 0.5) * spread + (Math.random() - 0.5) * 0.5;
    } else {
      // Fallback to random direction
      fragmentAngle = Math.random() * 2 * Math.PI;
    }
    
    // Fragment speed is faster than parent + some randomness
    const baseSpeed = asteroid.size === 'large' ? 2.5 : 3;
    const speed = baseSpeed + Math.random() * 1.5;
    const velocity = vectorFromAngle(fragmentAngle, speed);
    
    const fragment = createAsteroid(newSize, { ...asteroid.position });
    fragment.velocity = velocity;
    fragments.push(fragment);
  }

  return fragments;
}

export function createAlienShip(
  difficulty: number = 1,
  speedMultiplier: number = 1.0
): AlienShip & { approachSide: 'top' | 'right' | 'bottom' | 'left' } {
  // Spawn from random edge of screen
  const edge = Math.floor(Math.random() * 4); // 0=top, 1=right, 2=bottom, 3=left
  let position: Vector2;
  let approachSide: 'top' | 'right' | 'bottom' | 'left';
  
  switch (edge) {
    case 0: // Top
      position = { x: Math.random() * CANVAS_WIDTH, y: -50 };
      approachSide = 'top';
      break;
    case 1: // Right
      position = { x: CANVAS_WIDTH + 50, y: Math.random() * CANVAS_HEIGHT };
      approachSide = 'right';
      break;
    case 2: // Bottom
      position = { x: Math.random() * CANVAS_WIDTH, y: CANVAS_HEIGHT + 50 };
      approachSide = 'bottom';
      break;
    default: // Left
      position = { x: -50, y: Math.random() * CANVAS_HEIGHT };
      approachSide = 'left';
      break;
  }

  // Base stats that scale with difficulty
  const baseSpeed = 1.5;
  const baseFireRate = 90; // frames between shots (lower = faster)
  
  const alienShip: AlienShip & { approachSide: 'top' | 'right' | 'bottom' | 'left' } = {
    position,
    velocity: { x: 0, y: 0 },
    rotation: 0,
    radius: 15,
    health: 3 + difficulty,
    maxHealth: 3 + difficulty,
    speed: (baseSpeed + (difficulty * 0.3)) * speedMultiplier,
    fireRate: Math.max(30, baseFireRate - (difficulty * 10)),
    lastShot: 0,
    targetAngle: 0,
    difficulty,
    shotCount: 0,
    approachSide,
  };

  return alienShip;
}

export function createAlienBullet(position: Vector2, angle: number): AlienBullet {
  const speed = 6;
  const velocity = vectorFromAngle(angle, speed);
  
  return {
    position: { ...position },
    velocity,
    rotation: angle,
    radius: 2,
    life: 0,
    maxLife: 120, // 2 seconds at 60 FPS
  };
}

export function updateAlienShip(alienShip: AlienShip, playerPosition: Vector2, _frameCount: number, asteroids: Asteroid[]): AlienShip {
  void _frameCount;
  const updated = { ...alienShip };

  // Initialize behavior fields if missing
  if (updated.sideBias === undefined) {
    updated.sideBias = Math.random() < 0.5 ? -1 : 1; // prefer left/right orbit
  }
  if (updated.rethinkTimer === undefined) {
    updated.rethinkTimer = 120 + Math.floor(Math.random() * 180); // 2-5s
  }
  if (updated.waypointTimer && updated.waypointTimer > 0) {
    updated.waypointTimer -= 1;
    if (updated.waypointTimer <= 0) updated.waypoint = null;
  }

  // Decrement knocked timer if active
  if (updated.knockedTimer && updated.knockedTimer > 0) {
    updated.knockedTimer -= 1;
  }

  // Desired direction towards player
  const toPlayerX = playerPosition.x - updated.position.x;
  const toPlayerY = playerPosition.y - updated.position.y;
  const distToPlayer = Math.hypot(toPlayerX, toPlayerY) || 1;
  const dirPX = toPlayerX / distToPlayer;
  const dirPY = toPlayerY / distToPlayer;

  // Periodically rethink behavior: flip side bias or set a temporary waypoint
  updated.rethinkTimer!--;
  if (updated.rethinkTimer! <= 0) {
    const roll = Math.random();
    if (roll < 0.35) {
      // Flip orbit side
      updated.sideBias = (updated.sideBias ?? 1) * -1;
    } else if (roll < 0.8) {
      // Choose a waypoint offset around the player (orbiting point), expires in ~2-4s
      const radius = 120 + Math.random() * 200;
      const theta = Math.atan2(dirPY, dirPX) + (updated.sideBias ?? 1) * (Math.PI / 2) * (0.6 + Math.random() * 0.6);
      const wx = playerPosition.x + Math.cos(theta) * radius;
      const wy = playerPosition.y + Math.sin(theta) * radius;
      updated.waypoint = { x: wx, y: wy };
      updated.waypointTimer = 120 + Math.floor(Math.random() * 120);
    } else {
      // Roam: pick a random point somewhere on screen
      const wx = Math.random() * CANVAS_WIDTH;
      const wy = Math.random() * CANVAS_HEIGHT;
      updated.waypoint = { x: wx, y: wy };
      updated.waypointTimer = 90 + Math.floor(Math.random() * 90);
    }
    updated.rethinkTimer = 120 + Math.floor(Math.random() * 180);
  }

  // Obstacle avoidance: compute repulsion from nearby asteroids and side-steer if ahead
  let avoidX = 0;
  let avoidY = 0;
  const lookAhead = 140; // how far ahead to check
  const avoidRadius = 90; // start avoiding within this distance (center to center minus asteroid radius factor)
  const fwdX = Math.cos(updated.rotation);
  const fwdY = Math.sin(updated.rotation);

  for (const a of asteroids) {
    const ax = a.position.x - updated.position.x;
    const ay = a.position.y - updated.position.y;
    const d = Math.hypot(ax, ay);
    if (d < 1) continue;
    // If asteroid is somewhat in front
    const ahead = (ax * fwdX + ay * fwdY) / d; // cosine of angle between forward and to-asteroid
    if (ahead > 0.2) {
      // Project distance along forward
      const proj = ax * fwdX + ay * fwdY;
      if (proj > 0 && proj < lookAhead) {
        // Side steering: steer perpendicular away from asteroid centerline
        const side = ax * (-fwdY) + ay * (fwdX); // positive => steer one way
        const steerDir = side >= 0 ? 1 : -1;
        const weight = (lookAhead - proj) / lookAhead; // stronger when closer ahead
        avoidX += (-fwdY) * steerDir * weight * 0.8;
        avoidY += (fwdX) * steerDir * weight * 0.8;
      }
    }
    // Radial avoidance if simply too close regardless of ahead/behind
    const safeDist = a.radius + avoidRadius;
    if (d < safeDist) {
      const w = (safeDist - d) / safeDist; // 0..1
      avoidX += -(ax / d) * w;
      avoidY += -(ay / d) * w;
    }
  }

  // Compute base steering toward either waypoint (if any) or player with lateral bias
  let baseX: number;
  let baseY: number;
  if (updated.waypoint) {
    const wx = updated.waypoint.x - updated.position.x;
    const wy = updated.waypoint.y - updated.position.y;
    const wmag = Math.hypot(wx, wy) || 1;
    baseX = wx / wmag; baseY = wy / wmag;
    // If very close to waypoint, clear it early
    if (wmag < 25) { updated.waypoint = null; updated.waypointTimer = 0; }
  } else {
    // Orbiting flavor: add a small lateral component around the player
    const latX = -dirPY; // perpendicular left
    const latY = dirPX;
    const lateral = 0.35 * (updated.sideBias ?? 1);
    baseX = dirPX * 0.9 + latX * lateral;
    baseY = dirPY * 0.9 + latY * lateral;
    const bmag = Math.hypot(baseX, baseY) || 1; baseX /= bmag; baseY /= bmag;
  }

  // Blend base and avoidance vectors
  let steerX = baseX;
  let steerY = baseY;
  if (avoidX !== 0 || avoidY !== 0) {
    // If knocked recently, prioritize avoidance less
    const avoidScale = (updated.knockedTimer && updated.knockedTimer > 0) ? 0.6 : 1.0;
    steerX = baseX + avoidX * avoidScale;
    steerY = baseY + avoidY * avoidScale;
    const sMag = Math.hypot(steerX, steerY) || 1;
    steerX /= sMag; steerY /= sMag;
  }

  // Smoothly rotate towards steering direction
  const desiredAngle = Math.atan2(steerY, steerX);
  let angleDiff = desiredAngle - updated.rotation;
  while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
  while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

  // Less agile if recently knocked
  const turnSpeed = (updated.knockedTimer && updated.knockedTimer > 0) ? 0.035 : 0.06;
  updated.rotation += angleDiff * turnSpeed;

  // Thrust towards steer direction
  const thrustVector = vectorFromAngle(updated.rotation, updated.speed);
  const thrustGain = (updated.knockedTimer && updated.knockedTimer > 0) ? 0.08 : 0.12;
  updated.velocity = addVectors(updated.velocity, multiplyVector(thrustVector, thrustGain));

  // Drag keeps velocity controlled
  updated.velocity = multiplyVector(updated.velocity, 0.96);

  // Update position with wrap
  updated.position = addVectors(updated.position, updated.velocity);
  updated.position = wrapPosition(updated.position);

  return updated;
}

export function updateAlienBullet(bullet: AlienBullet): AlienBullet {
  const updated = { ...bullet };
  updated.position = addVectors(updated.position, updated.velocity);
  updated.position = wrapPosition(updated.position);
  updated.life++;
  return updated;
}

export function createExplosion(position: Vector2): Explosion {
  const particles = [];
  const numParticles = 15 + Math.floor(Math.random() * 10); // 15-25 particles
  
  for (let i = 0; i < numParticles; i++) {
    const angle = (Math.PI * 2 * i) / numParticles + (Math.random() - 0.5) * 0.5;
    const speed = 2 + Math.random() * 4;
    const velocity = vectorFromAngle(angle, speed);
    
    particles.push({
      position: { ...position },
      velocity,
      life: 0,
      maxLife: 30 + Math.floor(Math.random() * 30), // 0.5-1 second
      size: 2 + Math.random() * 3,
      color: Math.random() > 0.5 ? '#ff6600' : '#ffaa00', // Orange/yellow debris
    });
  }
  
  return {
    position: { ...position },
    particles,
  };
}

export function createAlienExplosion(position: Vector2): Explosion {
  const particles = [];
  const numParticles = 75 + Math.floor(Math.random() * 50); // 75-125 particles (5x more)
  
  for (let i = 0; i < numParticles; i++) {
    const angle = Math.random() * 2 * Math.PI; // Random directions
    const speed = 3 + Math.random() * 8; // Faster, more varied speeds
    const velocity = vectorFromAngle(angle, speed);
    
    // Different types of debris
    const debrisType = Math.random();
    let color, size, maxLife;
    
    if (debrisType < 0.3) {
      // Large metal chunks
      color = '#888888';
      size = 4 + Math.random() * 6;
      maxLife = 120 + Math.floor(Math.random() * 60); // 2-3 seconds
    } else if (debrisType < 0.6) {
      // Bright energy fragments
      color = Math.random() > 0.5 ? '#00ff88' : '#0088ff';
      size = 3 + Math.random() * 4;
      maxLife = 90 + Math.floor(Math.random() * 90); // 1.5-3 seconds
    } else {
      // Fire/explosion particles
      color = Math.random() > 0.5 ? '#ff6600' : '#ffaa00';
      size = 2 + Math.random() * 5;
      maxLife = 60 + Math.floor(Math.random() * 120); // 1-3 seconds
    }
    
    particles.push({
      position: { ...position },
      velocity,
      life: 0,
      maxLife,
      size,
      color,
    });
  }
  
  return {
    position: { ...position },
    particles,
  };
}

export function createBonus(): Bonus {
  // Random bonus type (equal chance for all three types)
  const rand = Math.random();
  // Weighted: 35% doubleShooter, 25% shield, 25% heal, 15% missile
  let bonusType: 'shield' | 'heal' | 'doubleShooter' | 'missile';
  if (rand < 0.35) bonusType = 'doubleShooter';
  else if (rand < 0.60) bonusType = 'shield';
  else if (rand < 0.85) bonusType = 'heal';
  else bonusType = 'missile';
  
  // Spawn from random edge of screen
  const edge = Math.floor(Math.random() * 4); // 0=top, 1=right, 2=bottom, 3=left
  let position: Vector2;
  let velocity: Vector2;
  
  const speed = 1.0; // Slower consistent speed for all bonus types
  
  switch (edge) {
    case 0: // Top
      position = { x: Math.random() * CANVAS_WIDTH, y: -30 };
      velocity = { x: (Math.random() - 0.5) * 0.3, y: speed };
      break;
    case 1: // Right
      position = { x: CANVAS_WIDTH + 30, y: Math.random() * CANVAS_HEIGHT };
      velocity = { x: -speed, y: (Math.random() - 0.5) * 0.3 };
      break;
    case 2: // Bottom
      position = { x: Math.random() * CANVAS_WIDTH, y: CANVAS_HEIGHT + 30 };
      velocity = { x: (Math.random() - 0.5) * 0.3, y: -speed };
      break;
    default: // Left
      position = { x: -30, y: Math.random() * CANVAS_HEIGHT };
      velocity = { x: speed, y: (Math.random() - 0.5) * 0.3 };
      break;
  }
  
  const bonus: Bonus = {
    position,
    velocity,
    rotation: 0,
    radius: bonusType === 'missile' ? 22 : 18, // missile bonuses are a bit larger
    type: bonusType,
    life: 0,
    maxLife: 2400, // 40 seconds at 60 FPS to cross screen (longer due to slower speed)
  };
  
  if (bonusType === 'heal') {
    // Random heal amount between 20% and 100%
    bonus.healAmount = Math.floor(Math.random() * 81) + 20; // 20-100
  }
  
  return bonus;
}

export function updateBonus(bonus: Bonus): Bonus {
  const updated = { ...bonus };
  updated.position = addVectors(updated.position, updated.velocity);
  updated.life++;
  
  // Gentle floating animation
  updated.rotation += 0.02;
  
  return updated;
}

export function updateExplosion(explosion: Explosion): Explosion {
  const updated = { ...explosion };
  
  updated.particles = updated.particles
    .map(particle => ({
      ...particle,
      position: addVectors(particle.position, particle.velocity),
      velocity: multiplyVector(particle.velocity, 0.98), // Slight drag
      life: particle.life + 1,
    }))
    .filter(particle => particle.life < particle.maxLife);
  
  return updated;
}