import type { MutableRefObject } from 'react';
import type { GameState } from '../types';
import { logOnce } from '../dev/logger';

export function initGame(opts: {
  CANVAS_WIDTH: number;
  CANVAS_HEIGHT: number;
  spawnW?: number;
  spawnH?: number;
  difficultyRef: MutableRefObject<'easy' | 'medium' | 'hard'>;
  backdropsRef: MutableRefObject<string[]>;
  setBackdrops: (v: string[]) => void;
  setBackdropIndex: (i: number) => void;
  bgImageRef: MutableRefObject<HTMLImageElement | null>;
  bgRawCanvasRef: MutableRefObject<HTMLCanvasElement | null>;
  bgImageDataRef: MutableRefObject<ImageData | null>;
  starsRef: MutableRefObject<Array<{ x: number; y: number; brightness: number; twinkleSpeed: number }>>;
  initialAreaRef: MutableRefObject<number>;
  initialStarCountRef: MutableRefObject<number>;
  introZoomStartRef: MutableRefObject<number>;
  gameStateRef: MutableRefObject<GameState | undefined>;
  setScore: (n: number) => void;
  setGameRunning: (b: boolean) => void;
  setGameStarted: (b: boolean) => void;
  setStage: (n: number) => void;
  WORLD_GRID_SIZE: number;
  createPlayer: typeof import('../gameObjects').createPlayer;
  regenerateStars: typeof import('./starfield').regenerateStars;
  createRefuelStation: typeof import('./worldTargets').createRefuelStation;
  createRewardShip: typeof import('./worldTargets').createRewardShip;
  devLogSpawns: typeof import('./worldTargets').devLogSpawns;
  DEV_MODE: boolean;
}): void {
  const {
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    spawnW,
    spawnH,
    difficultyRef,
    backdropsRef,
    setBackdrops,
    setBackdropIndex,
    bgImageRef,
    bgRawCanvasRef,
    bgImageDataRef,
    starsRef,
    initialAreaRef,
    initialStarCountRef,
    introZoomStartRef,
    gameStateRef,
    setScore,
    setGameRunning,
    setGameStarted,
    setStage,
    WORLD_GRID_SIZE,
    createPlayer,
    regenerateStars,
    createRefuelStation,
    createRewardShip,
    devLogSpawns,
    DEV_MODE,
  } = opts;

  // Resolve spawn dimensions (allow caller to override with live canvas size)
  const SPAWN_W = Math.max(1, Math.floor(spawnW ?? CANVAS_WIDTH));
  const SPAWN_H = Math.max(1, Math.floor(spawnH ?? CANVAS_HEIGHT));

  // Initialize random stars
  initialAreaRef.current = CANVAS_WIDTH * CANVAS_HEIGHT;
  initialStarCountRef.current = 200;
  starsRef.current = regenerateStars(initialStarCountRef.current, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Discover available backdrops (files starting with backdrop_ in images/)
  if (backdropsRef.current.length === 0) {
    try {
      // Note: this file is under src/gameLoop/, while images/ is at project root under images/.
      // Using '../../images/...' ensures we resolve to project/images/* from here.
      const modules = import.meta.glob('../../images/backdrop_*', { eager: true, import: 'default', query: '?url' }) as Record<string, string>;
      const urls = Object.values(modules).filter(Boolean);
      const list = urls.length > 0 ? urls : [];
      setBackdrops(list);
      // Pick a new random backdrop for zoom-in start
      if (list.length > 0) {
        const newIdx = Math.floor(Math.random() * list.length);
        const src = list[newIdx];
        setBackdropIndex(newIdx);
        // Update page background immediately for zoom-in effect
        try {
          document.body.style.backgroundImage = `url('${src}')`;
        } catch { /* ignore */ }
        // Load the image for canvas rendering
        const img = new Image();
        img.src = src;
        img.onload = () => {
          bgImageRef.current = img;
          try {
            const c = document.createElement('canvas');
            c.width = img.naturalWidth; c.height = img.naturalHeight;
            const cx = c.getContext('2d');
            if (cx) {
              cx.drawImage(img, 0, 0);
              bgImageDataRef.current = cx.getImageData(0, 0, c.width, c.height);
            }
            bgRawCanvasRef.current = c;
          } catch { /* ignore */ }
        };
      } else {
        try { document.body.style.backgroundImage = 'none'; } catch { /* ignore */ }
      }
    } catch {
      // If discovery fails, clear background
      try { document.body.style.backgroundImage = 'none'; } catch { /* ignore */ }
    }
  }

  // Restart intro zoom timeline
  introZoomStartRef.current = performance.now();
  gameStateRef.current = {
    player: createPlayer(),
    bullets: [],
    alienBullets: [],
    playerMissiles: [],
    asteroids: [],
    alienShips: [],
    bonuses: [],
    explosions: [],
    missilePopups: [],
    score: 0,
    stage: 1,
    gameRunning: true,
    gameStarted: true,
    keys: {},
    stageStartTime: Date.now(),
    stageWaitTime: 5000, // 5 seconds
    alienSpawnCount: 0,
    levelComplete: false,
    warpEffect: 0,
    alienApproachMusicPlayed: false,
    asteroidsSpawned: false,
    lastBonusSpawn: Date.now(),
    healEffect: 0,
    introPhase: 'ship-entrance',
    introTimer: 0,
    shipScale: 1,
    shipIntroPosition: { x: SPAWN_W / 2, y: SPAWN_H / 2 },
    // Start with 2 lives regardless of difficulty
    lives: 2,
    respawning: false,
    respawnCountdown: 0,
    refuelStation: null,
    rewardShip: null,
    worldTileX: Math.floor(WORLD_GRID_SIZE / 2),
    worldTileY: Math.floor(WORLD_GRID_SIZE / 2),
  } as unknown as GameState;
  // Initial spawn invulnerability & shield for 3 seconds
  gameStateRef.current.player.position = { x: SPAWN_W / 2, y: SPAWN_H / 2 } as any;
  gameStateRef.current.player.velocity = { x: 0, y: 0 } as any;
  (gameStateRef.current.player as any).invulnerable = 180;
  (gameStateRef.current.player as any).shieldTime = 180;

  // Note: Level 1 triple-shooter is handled in the shooting logic to avoid speed penalties.

  if (DEV_MODE) {
    const tx = (gameStateRef.current as any).worldTileX;
    const ty = (gameStateRef.current as any).worldTileY;
    logOnce(`start-tile:${tx},${ty}`, '[start-tile]', { tx, ty });
  }

  // Place a refuel station far off-screen (several tiles away)
  {
    const s = createRefuelStation() as any;
    (gameStateRef.current as any).refuelStation = s;
    if (DEV_MODE) {
      try {
        const speedPxPerSec = Math.hypot(s.vx, s.vy).toFixed(1);
        const tileSeconds = 120 / WORLD_GRID_SIZE;
        logOnce(`station:fuel:${s.tileX},${s.tileY}`, '[station:spawn]', { kind: 'fuel', tile: [s.tileX, s.tileY], pos: { x: s.position?.x, y: s.position?.y }, speedPxPerSec, tileSeconds });
      } catch {}
    }
  }

  // Spawn a reward ship off-screen as well (tiles)
  {
    const r = createRewardShip() as any;
    (gameStateRef.current as any).rewardShip = r;
    if (DEV_MODE) {
      try {
        const speedPxPerSecR = Math.hypot(r.vx, r.vy).toFixed(1);
        const tileSecondsR = 120 / WORLD_GRID_SIZE;
        logOnce(`station:reward:${r.tileX},${r.tileY}`, '[station:spawn]', { kind: 'reward', tile: [r.tileX, r.tileY], pos: { x: r.position?.x, y: r.position?.y }, speedPxPerSec: speedPxPerSecR, tileSeconds: tileSecondsR });
      } catch {}
    }
  }

  devLogSpawns(
    (gameStateRef.current as any).refuelStation as any,
    (gameStateRef.current as any).rewardShip as any,
    DEV_MODE
  );

  setScore(0);
  setGameRunning(true);
  setGameStarted(true);
  // Health reset implicit via createPlayer(); UI reads from player
  setStage(1);
}
