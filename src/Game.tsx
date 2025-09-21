import React, { useRef, useEffect, useState, useCallback } from 'react';
import { startGridScan, advanceGridScanDt, advanceGridRetractDt, isGridComplete } from './tractorBeam/state';
import { beamUi } from './config/beamUi';
import mwcLogo from '../images/Made With Chat Logo.png';
import { GameState, Player, Bullet, AlienShip, AlienBullet, Explosion, Bonus, Asteroid, VisualDebris, PlayerMissileExt } from './types';
import { createPlayer } from './gameObjects';
import { soundSystem } from './sounds';
import { 
  CANVAS_WIDTH, 
  CANVAS_HEIGHT, 
  setCanvasSize,
  checkCollision,
  calculateGravitationalForce,
  vectorMagnitude,
  subtractVectors,
  normalizeVector,
  addVectors,
  multiplyVector
} from './utils';
import {
  createBullet,
  createAlienShip,
  createAlienBullet,
  updatePlayer,
  updateBullet,
  updateAlienShip,
  updateAlienBullet,
  updateAsteroid,
  splitAsteroid,
  createAsteroid,
  createExplosion,
  updateExplosion,
  createAlienExplosion,
  createBonus,
  updateBonus,
  createBlackPuffExplosion,
} from './gameObjects';
import { ExplosionDistortionManager } from './effects/ExplosionDistortion';
import TitleBanner from './ui/TitleBanner';
import MusicDock from './ui/MusicDock';
import InfoPopup from './ui/InfoPopup';
import DebugPanel from './ui/DebugPanel';
import { emitUiEvent } from './events';
import {
  initTractorBeamState,
  renderTractorOverlay,
  renderFlipit,
} from './tractorBeam';
import { DEV_SUMMARY_FRAMES, DEBUG_PANEL_MAX, DEFAULT_BG_BRIGHTNESS } from './constants';
import { update as updateFrame } from './gameLoop/update';
import {
  draw as drawFrame,
  drawBackground,
  drawStars,
  drawDebris as drawDebrisMod,
  drawExplosions as drawExplosionsMod,
  drawPlayer as drawPlayerMod,
  drawAsteroids as drawAsteroidsMod,
  drawAliens as drawAliensMod,
  drawBullets as drawBulletsMod,
  drawBonuses as drawBonusesMod,
} from './gameLoop/draw';

// ===== Lightweight Dev Logger (env-guarded) =====
type NodeProc = { env?: { GAME_MODE?: string } };
const nodeGameMode: string | undefined =
  ('process' in globalThis ? (globalThis as unknown as { process?: NodeProc }).process?.env?.GAME_MODE : undefined);

const __DEV_MODE__ =
  ((import.meta.env?.VITE_ENV as string | undefined) ?? 'local') !== 'prod' &&
  nodeGameMode !== 'production';

let __frameCounter = 0;

if (__DEV_MODE__) {
  // Should print once on reload if dev mode is ON
  // (VITE_ENV and GAME_MODE resolved at build/runtime)
  // If you don't see this in DevTools Console, the guard is false.
  console.log('Dev logger active', {
    VITE_ENV: import.meta.env?.VITE_ENV,
    GAME_MODE: nodeGameMode,
  });
}
// ===============================================

// Local narrow helper types moved to src/types.ts (PlayerMissileExt)
type TractionAug = ReturnType<typeof initTractorBeamState> & {
  gameState?: { stage?: number };
  decodeExplosionsFired?: boolean;
  textHoldUntil?: number;
  textFadeUntil?: number;
  textDropStart?: number;
};

const Game: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gameStateRef = useRef<GameState>();
  const animationFrameRef = useRef<number>();
  // Distortion manager for background warps
  const distortionRef = useRef<ExplosionDistortionManager | null>(null);
  const starsRef = useRef<Array<{x: number, y: number, brightness: number, twinkleSpeed: number}>>([]);
  // Starfield scaling helpers
  const initialAreaRef = useRef<number>(CANVAS_WIDTH * CANVAS_HEIGHT);
  const initialStarCountRef = useRef<number>(200);
  // Dev: in-app debug lines buffer (env-gated usage)
  const debugLinesRef = useRef<string[]>([]);

  const regenerateStars = useCallback((count: number) => {
    const arr: Array<{x:number;y:number;brightness:number;twinkleSpeed:number}> = [];
    for (let i = 0; i < count; i++) {
      arr.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT,
        brightness: 0.3 + Math.random() * 0.7,
        twinkleSpeed: 0.02 + Math.random() * 0.03,
      });
    }
    starsRef.current = arr;
  }, []);

  const ensureStarsForCanvas = useCallback(() => {
    const area = CANVAS_WIDTH * CANVAS_HEIGHT;
    const ratio = Math.max(0.25, area / Math.max(1, initialAreaRef.current));
    const target = Math.max(150, Math.round(initialStarCountRef.current * ratio));
    if (Math.abs((starsRef.current?.length || 0) - target) > Math.max(25, target * 0.15)) {
      regenerateStars(target);
    }
  }, [regenerateStars]);
  // Backdrops and current index
  const [backdrops, setBackdrops] = useState<string[]>([]);
  const [backdropIndex, setBackdropIndex] = useState<number>(0);
  const musicAutoStartedRef = useRef<boolean>(false);
  const armNextTrackOnShotRef = useRef<boolean>(false);
  const baseCanvasRef = useRef<{w: number, h: number}>({ w: CANVAS_WIDTH, h: CANVAS_HEIGHT });
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  // Warp particle system (for immersive fly-through effect)
  const warpParticlesRef = useRef<Array<{ x: number; y: number; vx: number; vy: number; life: number; maxLife: number; prevX: number; prevY: number }>>([]);
  const bgRawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgImageDataRef = useRef<ImageData | null>(null);
  const bgOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const START_ZOOM_EXTRA = 0.2; // +20% initial zoom
  const INTRO_ZOOM_DUR_MS = 2000; // ease out over 2s
  const introZoomStartRef = useRef<number>(performance.now());
  const bgZoomExtraRef = useRef<number>(0); // clamp-only extra beyond intro
  // Background tuning controls (defaults updated per user: opacity 25%, contrast 100%, brightness 40%)
  const [bgOpacity, setBgOpacity] = useState(0.25);
  const [bgContrast, setBgContrast] = useState(1.0);
  const [bgBrightness, setBgBrightness] = useState(0.4);
  const [bgToolsOpen, setBgToolsOpen] = useState(false);
  // Effects selection: choose which groups are affected by the Effects sliders
  const [effectsApply, setEffectsApply] = useState({
    background: true,
    stars: false,
    distantStars: false,
    warpTrails: false,
  });
  // Motion trails control (frame accumulation fade)
  const [trailsEnabled, setTrailsEnabled] = useState<boolean>(true);
  // Strength is the per-frame fade amount. 0.08 = subtle (long tail), 0.25 = capped strong
  const [trailsStrength, setTrailsStrength] = useState<number>(0.20);
  // Performance mode default ON per user: reduces expensive effects during heavy scenes
  const [perfMode, setPerfMode] = useState<boolean>(true);
  // Per-item selection (scaffolding for per-item buffers)
  const [trailsTargets, setTrailsTargets] = useState<{ player: boolean; ufos: boolean; asteroids: boolean }>({
    player: true,
    ufos: true,
    asteroids: true,
  });
  // Refs mirrored for use inside animation loop
  const bgOpacityRef = useRef(bgOpacity);
  const bgContrastRef = useRef(bgContrast);
  const bgBrightnessRef = useRef(bgBrightness);
  const effectsApplyRef = useRef(effectsApply);
  const trailsEnabledRef = useRef(trailsEnabled);
  const trailsStrengthRef = useRef(trailsStrength);
  const trailsTargetsRef = useRef(trailsTargets);
  // Suspend trails during missile launch/explosion, then fade back in
  const trailsSuspendUntilRef = useRef<number>(0);
  const trailsFadeInStartRef = useRef<number>(0);
  // Recent missile activity (launch/explosion) timestamp for temporary perf spike handling
  const lastMissileEventRef = useRef<number>(0);
  // Mirror perf mode for loop
  const perfModeRef = useRef(perfMode);
  // Test cheat: unlimited missiles when activated near HUD missile counter
  const unlimitedMissilesRef = useRef<boolean>(false);
  // Burst control for missiles: track rapid-fire extras after a primary
  const lastMissileFireAtRef = useRef<number>(0);
  const missileBurstCountRef = useRef<number>(0);
  const prevStageRef = useRef<number>(1);
  const prevAlienCountRef = useRef<number>(0);
  
  // InfoPopup state and pause behavior
  const [infoOpen, setInfoOpen] = useState(false);
  const uiPausedRef = useRef(false);
  const gameStartTimeRef = useRef<number>(0);
  const autoPopupShownRef = useRef(false);

  // Link infoOpen to UI pause (render still continues)
  useEffect(() => {
    uiPausedRef.current = infoOpen;
  }, [infoOpen]);

  // Persist "shown once per session" in sessionStorage to avoid re-showing on music changes or restarts
  useEffect(() => {
    try {
      const s = sessionStorage.getItem('flipit.infoPopupShown');
      autoPopupShownRef.current = s === '1';
    } catch {}
  }, []);

  // When the popup opens (either auto or manual), mark as shown for this session
  useEffect(() => {
    if (infoOpen) {
      autoPopupShownRef.current = true;
      try { sessionStorage.setItem('flipit.infoPopupShown', '1'); } catch {}
    }
  }, [infoOpen]);
  
  useEffect(() => { bgOpacityRef.current = bgOpacity; }, [bgOpacity]);
  useEffect(() => { bgContrastRef.current = bgContrast; }, [bgContrast]);
  useEffect(() => { bgBrightnessRef.current = bgBrightness; }, [bgBrightness]);
  useEffect(() => { effectsApplyRef.current = effectsApply; }, [effectsApply]);
  // Init distortion manager once
  useEffect(() => {
    if (!distortionRef.current) {
      distortionRef.current = new ExplosionDistortionManager();
      distortionRef.current.setMode('simple');
      distortionRef.current.setSize01(0.5); // smaller default radius
      distortionRef.current.setDepth01(0.7);
    }
  }, []);
  useEffect(() => { trailsEnabledRef.current = trailsEnabled; }, [trailsEnabled]);
  useEffect(() => { trailsStrengthRef.current = trailsStrength; }, [trailsStrength]);
  useEffect(() => { trailsTargetsRef.current = trailsTargets; }, [trailsTargets]);
  useEffect(() => { perfModeRef.current = perfMode; }, [perfMode]);
  useEffect(() => { uiPausedRef.current = infoOpen; }, [infoOpen]);
  // Local state for current canvas dimensions (do NOT shadow utils.setCanvasSize)
  const [canvasSize, setCanvasDims] = useState<{w: number, h: number}>({ w: CANVAS_WIDTH, h: CANVAS_HEIGHT });
  const [isFitted, setIsFitted] = useState(false);
  // Remember initial canvas size to restore "Original Size"
  const initialCanvasRef = useRef<{ w: number; h: number }>({ w: CANVAS_WIDTH, h: CANVAS_HEIGHT });
  const [, setScore] = useState(0);

  // Locked distortion settings (Size: 5%, Depth: 100%, Enabled: true)
  const distortionEnabled = true;
  const distortionSize = 5;
  const distortionDepth = 100;
  
  // Action notes box state
  const [actionNotes, setActionNotes] = useState<string[]>([
    "Game initialized",
    "Waiting for player action..."
  ]);
  
  // Debug panel state
  const [debugPanelOpen, setDebugPanelOpen] = useState(false);

  // Traction beam state
  const tractionBeamRef = useRef<{
    active: boolean;
    targetAsteroid: Asteroid | null;
    phase: 'approaching' | 'locking' | 'attached' | 'displaying' | 'pushing';
    startTime: number;
    lockStartTime: number;
    lockLerpStartTime: number;
    lockLerpDurationMs: number;
    attachStartTime: number;
    displayStartTime: number;
    pushStartTime: number;
    flipitChance: number;
    orbitAngle: number;
    orbitRadius: number;
    slowMotionActive: boolean;
    originalAsteroidVelocity: { x: number; y: number } | null;
    postPushSpinVel?: number;
    postPushSpinUntil?: number;
    forceFieldUntil?: number;
    skippedLockMs?: number;
    // Gravity and escape window
    fightWindowUntil?: number;
    fightAllowed?: boolean;
    gravityCapture?: boolean;
    // Behind-entry occlusion sequence
    behindEntry?: { startTime: number; durationMs: number; inProgress: boolean };
    // On-top entry sequence (replaces behind-entry)
    onTopEntry?: { startTime: number; durationMs: number; inProgress: boolean };
    _occludeShip?: boolean;
    _orbitExtendMs?: number;
    // Decode UI timings
    decodeStartTime?: number;
    decodeDoneTime?: number;
  }>({
    active: false,
    targetAsteroid: null,
    phase: 'approaching',
    startTime: 0,
    lockStartTime: 0,
    lockLerpStartTime: 0,
    lockLerpDurationMs: 0,
    attachStartTime: 0,
    displayStartTime: 0,
    pushStartTime: 0,
    flipitChance: 0,
    orbitAngle: 0,
    orbitRadius: 0,
    slowMotionActive: false,
    originalAsteroidVelocity: null,
    postPushSpinVel: undefined,
    postPushSpinUntil: undefined,
    forceFieldUntil: undefined,
    skippedLockMs: undefined,
    fightWindowUntil: undefined,
    fightAllowed: undefined,
    gravityCapture: undefined,
    behindEntry: undefined,
    onTopEntry: undefined,
    _occludeShip: undefined,
    _orbitExtendMs: undefined,
    decodeStartTime: undefined,
    decodeDoneTime: undefined
  });
  useEffect(() => {
    if (!distortionRef.current) return;
    distortionRef.current.setMode(distortionEnabled ? 'simple' : 'off');
    distortionRef.current.setSize01(Math.max(0, Math.min(1, distortionSize / 100)));
    distortionRef.current.setDepth01(Math.max(0, Math.min(1, distortionDepth / 100)));
  }, [distortionEnabled, distortionSize, distortionDepth]);
  const [, setGameRunning] = useState(false);
  // Removed unused health state; HUD reads directly from game state
  const [, setStage] = useState(1);
  const [, setGameStarted] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(isMuted);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  const [musicTracks, setMusicTracks] = useState<Array<{ name: string; url: string }>>([]);
  const [musicIndex, setMusicIndex] = useState(0);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [musicVol, setMusicVol] = useState(0.9);
  const [sfxVol, setSfxVol] = useState(0.3);
  const [preferredSfxVol, setPreferredSfxVol] = useState(0.3);
  const [sfxPausedOverride, setSfxPausedOverride] = useState(false);
  const [musicUserPaused, setMusicUserPaused] = useState(false);
  const musicUserPausedRef = useRef(musicUserPaused);
  useEffect(() => { musicUserPausedRef.current = musicUserPaused; }, [musicUserPaused]);
  // Music resume persistence
  const MUSIC_RESUME_KEY = 'flipit_music_resume_v1';
  // Gravity well & tractor-beam encounter tuning
  const GRAV_WELL_RADIUS_BASE = 120;            // + asteroid.radius for capture radius
  const GRAV_WELL_STRENGTH   = 0.00012;         // tuned accel, clamped
  const GRAV_WELL_MAX_ACCEL  = 0.035;           // safety cap (pixels/ms^2)
  const ESCAPE_SPEED_THRESH  = 0.55;            // speed to ignore capture
  const FIGHT_WINDOW_MS      = 1800;            // time to “fight” gravity
  const FIGHT_ESCAPE_PROB    = 0.5;             // 50% chance to allow fighting

  // Orbit timings (compensate for skipped lock pause)
  // const ORBIT_EXTEND_MS      = 1000; // unused
  // Side/front capture tuning
  const CAPTURE_RADIUS_EXTRA  = 140;   // added to asteroid.radius
  const GRAV_ACCEL_BASE       = 0.00022; // px/ms^2, tuned
  const GRAV_ACCEL_MAX        = 0.05;    // clamp
  const FAST_FLYBY_SPEED      = 0.95;    // px/ms: ignore gravity above this
  const NEAR_SPEED_MIN        = 0.40;    // “near-speed” lower bound
  const NEAR_SPEED_MAX        = 0.80;    // “near-speed” upper bound
  const FRONT_CONE_DEG        = 35;      // angle cone for front-capture
  // Decode UI timings
  // const DECODE_DURATION_MS   = 1200;            // unused (beamUi.DECODE_DURATION_MS used instead)
  // const MULTIPLIER_DELAY_MS  = 300;             // unused (beamUi.MULTIPLIER_DELAY_MS used instead)
  // const CLEANUP_FADE_MS      = 600;             // unused
  // (Dev HUD/toasts removed)
  const resumeInfoRef = useRef<{ index: number; offsetSec: number } | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showSongList, setShowSongList] = useState(false);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('easy');
  // Stable refs for values used inside callbacks to avoid unnecessary deps
  // We mirror difficulty into a ref for use inside stable callbacks (e.g., key handlers, gameLoop)
  // to avoid expanding dependency arrays and re-creating those callbacks every state change.
  const difficultyRef = useRef(difficulty);
  useEffect(() => { difficultyRef.current = difficulty; }, [difficulty]);
  // Background tools dropdown
  // Debug HUD
  const [showDebugHud, setShowDebugHud] = useState(false);
  // SFX rate limiters
  const lastDockPingAtRef = useRef<number>(0);
  const lastTractorWhooshAtRef = useRef<number>(0);
  const dockingActiveRef = useRef<boolean>(false);
  // Level-end audio ducking (music down, SFX up)
  const duckPhaseRef = useRef<'none' | 'boost' | 'restore'>('none');
  const duckT0Ref = useRef<number>(0);
  const duckRestoreT0Ref = useRef<number>(0);
  const musicVolOrigRef = useRef<number>(0.9);
  const sfxVolOrigRef = useRef<number>(0.3);
  const DUCK_HOLD_MS = 6000; // 6 seconds (extended per request)
  const RESTORE_MS = 2000;   // 2 seconds

  // Helper: directly set the canvas pixel size and remember base dims
  const setCanvasPixelSize = ({ w, h }: { w: number; h: number }) => {
    const c = canvasRef.current;
    if (c) {
      c.width = w;
      c.height = h;
    }
    baseCanvasRef.current = { w, h };
    // keep a React state copy for UI if needed
    setCanvasDims({ w, h });
  };

  // Safely start music without double-starting the same track
  const safePlayMusic = (index?: number) => {
    const ms = soundSystem.getMusicState();
    const targetIdx = typeof index === 'number' ? index : ms.index;
    // If already playing this exact index, do nothing
    if (ms.isPlaying && ms.index === targetIdx) return;
    if (typeof index === 'number') soundSystem.playMusic(index);
    else soundSystem.playMusic();
    setMusicPlaying(true);
    setMusicUserPaused(false);
  };

  const handlePrevTrack = () => {
    const ms = soundSystem.getMusicState();
    const count = ms.trackCount;
    if (count <= 0) return;
    const nextIdx = (ms.index - 1 + count) % count;
    setMusicIndex(nextIdx);
    safePlayMusic(nextIdx);
  };

  const handleNextTrack = () => {
    const ms = soundSystem.getMusicState();
    const count = ms.trackCount;
    if (count <= 0) return;
    const nextIdx = (ms.index + 1) % count;
    setMusicIndex(nextIdx);
    safePlayMusic(nextIdx);
  };

  // (Target rings removed per user request)

  // Small helper to compute stereo pan from an on-screen x position (-1..1)
  const panFromX = (x: number) => {
    return Math.max(-1, Math.min(1, (x - CANVAS_WIDTH / 2) / (CANVAS_WIDTH / 2)));
  };

  // Compute width/height that fit within max bounds while preserving aspect ratio
  const computeFitSize = (baseW: number, baseH: number, maxW: number, maxH: number) => {
    const scale = Math.min(maxW / baseW, maxH / baseH);
    const w = Math.max(100, Math.floor(baseW * scale));
    const h = Math.max(100, Math.floor(baseH * scale));
    return { w, h };
  };

  // Apply non-fullscreen fit-to-window sizing
  const applyFitSizing = useCallback(() => {
    const margin = 48; // px around canvas inside page
    const controlsReserve = 200; // reserve some vertical space for UI below
    const maxW = Math.max(100, window.innerWidth - margin * 2);
    const maxH = Math.max(100, window.innerHeight - controlsReserve - margin);
    const { w: bw, h: bh } = initialCanvasRef.current;
    const { w, h } = computeFitSize(bw || CANVAS_WIDTH, bh || CANVAS_HEIGHT, maxW, maxH);
    setCanvasSize(w, h);
    setCanvasPixelSize({ w, h });
    // Adjust star density for new canvas area
    ensureStarsForCanvas();
  }, [ensureStarsForCanvas]);

  // Music track change handler for dropdown (state updates handled in UI component)

  // Level-end background crossfade
  const levelEndStartRef = useRef<number>(0);
  const fadeInStartRef = useRef<number>(0);
  const fadeInActiveRef = useRef<boolean>(false);
  const gameOverStartRef = useRef<number | null>(null);

  const triggerLevelEndDucking = () => {
    if (duckPhaseRef.current !== 'none') return;
    if (isMuted) return;
    // Snapshot current intended volumes
    musicVolOrigRef.current = musicVol;
    sfxVolOrigRef.current = preferredSfxVol;
    duckPhaseRef.current = 'boost';
    duckT0Ref.current = performance.now();
    // Immediate change
    const musicDuck = 0.08; // very low music
    const sfxBoost = 0.7;   // 70% SFX during hold
    soundSystem.setMusicVolume(musicDuck);
    soundSystem.setSfxVolume(sfxBoost);
  };

  // Bottom-left background tools dropdown
  interface BackgroundDropdownProps {
    open: boolean;
    onToggle: () => void;
    onNextBackground: () => void;
    bgOpacity: number;
    bgContrast: number;
    bgBrightness: number;
    setBgOpacity: (v: number) => void;
    setBgContrast: (v: number) => void;
    setBgBrightness: (v: number) => void;
    effectsApply: { background: boolean; stars: boolean; distantStars: boolean; warpTrails: boolean };
    setEffectsApply: (fn: (prev: { background: boolean; stars: boolean; distantStars: boolean; warpTrails: boolean }) => { background: boolean; stars: boolean; distantStars: boolean; warpTrails: boolean }) => void;
    trailsEnabled: boolean;
    setTrailsEnabled: (v: boolean) => void;
    trailsStrength: number;
    setTrailsStrength: (v: number) => void;
    trailsTargets: { player: boolean; ufos: boolean; asteroids: boolean };
    setTrailsTargets: (fn: (prev: { player: boolean; ufos: boolean; asteroids: boolean }) => { player: boolean; ufos: boolean; asteroids: boolean }) => void;
  }
  const BackgroundDropdown: React.FC<BackgroundDropdownProps> = ({
    open,
    onToggle,
    onNextBackground,
    bgOpacity,
    bgContrast,
    bgBrightness,
    setBgOpacity,
    setBgContrast,
    setBgBrightness,
    effectsApply,
    setEffectsApply,
    trailsEnabled,
    setTrailsEnabled,
    trailsStrength,
    setTrailsStrength,
    trailsTargets,
    setTrailsTargets,
  }) => {
    return (
      <div className="fixed right-4 top-1/2 -translate-y-1/2 z-40">
        <button
          type="button"
          onClick={onToggle}
          className="px-3 py-1.5 text-xs rounded bg-cyan-700 hover:bg-cyan-600 text-white border border-cyan-400 shadow"
        >
          {open ? 'Effects / CPU usage ▾' : 'Effects / CPU usage ▸'}
        </button>
        {open && (
          <div className="mt-2 w-72 p-3 rounded bg-gray-900/95 border border-cyan-700 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-cyan-300">Effects / CPU usage</div>
              <button onClick={onNextBackground} className="px-2 py-0.5 text-xs rounded bg-cyan-700 hover:bg-cyan-600 border border-cyan-400">Change</button>
            </div>
            <div className="space-y-2 mb-2">
              <div className="text-xs text-gray-300 font-semibold">Affect these items:</div>
              <label className="flex items-center gap-2 text-xs text-gray-200">
                <input type="checkbox" checked={effectsApply.background} onChange={(e)=>setEffectsApply(p=>({...p, background: e.target.checked}))} /> Background
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-200">
                <input type="checkbox" checked={effectsApply.stars} onChange={(e)=>setEffectsApply(p=>({...p, stars: e.target.checked}))} /> Stars
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-200">
                <input type="checkbox" checked={effectsApply.distantStars} onChange={(e)=>setEffectsApply(p=>({...p, distantStars: e.target.checked}))} /> Distant stars
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-200">
                <input type="checkbox" checked={effectsApply.warpTrails} onChange={(e)=>setEffectsApply(p=>({...p, warpTrails: e.target.checked}))} /> Warp trails
              </label>
            </div>
            <div className="space-y-1 mb-3 pt-2 border-t border-cyan-800/50">
              <label className="flex items-center gap-2 text-xs text-gray-200">
                <input type="checkbox" checked={trailsEnabled} onChange={(e)=>setTrailsEnabled(e.target.checked)} /> Motion trails (frame accumulation)
              </label>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 pl-5">
                <label className="flex items-center gap-2 text-xs text-gray-200">
                  <input type="checkbox" checked={trailsTargets.player} onChange={(e)=>setTrailsTargets(p=>({...p, player: e.target.checked}))} disabled={!trailsEnabled} /> Player
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-200">
                  <input type="checkbox" checked={trailsTargets.ufos} onChange={(e)=>setTrailsTargets(p=>({...p, ufos: e.target.checked}))} disabled={!trailsEnabled} /> UFOs
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-200">
                  <input type="checkbox" checked={trailsTargets.asteroids} onChange={(e)=>setTrailsTargets(p=>({...p, asteroids: e.target.checked}))} disabled={!trailsEnabled} /> Asteroids
                </label>
              </div>
              <label className="block text-xs text-gray-300">
                Trail length: {Math.round(trailsStrength * 100)}%
                <input
                  className="w-full"
                  type="range"
                  min={0.08}
                  max={0.45}
                  step={0.01}
                  value={trailsStrength}
                  onChange={(e)=>setTrailsStrength(parseFloat(e.target.value))}
                  disabled={!trailsEnabled}
                />
              </label>
            </div>
            <label className="block text-xs text-gray-300">
              Opacity: {Math.round(bgOpacity * 100)}%
              <input
                className="w-full"
                type="range"
                min={0}
                max={1.0}
                step={0.01}
                value={bgOpacity}
                onChange={(e) => setBgOpacity(parseFloat(e.target.value))}
              />
            </label>
            <label className="block text-xs text-gray-300">
              Contrast: {Math.round(bgContrast * 100)}%
              <input
                className="w-full"
                type="range"
                min={0}
                max={2.0}
                step={0.01}
                value={bgContrast}
                onChange={(e) => setBgContrast(parseFloat(e.target.value))}
              />
            </label>
            <label className="block text-xs text-gray-300">
              Brightness: {Math.round(bgBrightness * 100)}%
              <input
                className="w-full"
                type="range"
                min={0}
                max={1.0}
                step={0.01}
                value={bgBrightness}
                onChange={(e) => setBgBrightness(parseFloat(e.target.value))}
              />
            </label>
          </div>
        )}
      </div>
    );
  };

  // Draw Refuel Station and handle docking/refill (world-tiling: only when in same tile)
  const drawRefuelStation = (ctx: CanvasRenderingContext2D, gameState: GameState) => {
    const st = gameState.refuelStation;
    if (!st || !st.position) return;
    // Only draw when player is in the same world tile
    if (gameState.worldTileX !== st.tileX || gameState.worldTileY !== st.tileY) return;
    const { player } = gameState;
    const sx = st.position.x;
    const sy = st.position.y;

    // Station visual: ring + pylon + light
    ctx.save();
    ctx.translate(sx, sy);
    // Outer glow
    ctx.shadowColor = '#88ffcc';
    ctx.shadowBlur = 18;
    ctx.strokeStyle = '#88ffcc';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.stroke();
    // Inner ring
    ctx.shadowBlur = 10;
    ctx.strokeStyle = '#66d9aa';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.stroke();
    // Rotating tick marks (flair)
    const t = performance.now() * 0.004;
    ctx.save();
    ctx.rotate(t);
    ctx.strokeStyle = '#caffee';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      ctx.rotate((Math.PI * 2) / 6);
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(18, 0);
      ctx.stroke();
    }
    ctx.restore();
    // Pylon
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#3a6355';
    ctx.fillRect(-3, -22, 6, 12);
    // Beacon
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() * 0.006);
    ctx.fillStyle = `rgba(136,255,204,${pulse})`;
    ctx.beginPath();
    ctx.arc(0, -24, 4, 0, Math.PI * 2);
    ctx.fill();

    // Docking/refill
    const dx = sx - player.position.x;
    const dy = sy - player.position.y;
    const dist = Math.hypot(dx, dy);
    const canDock = dist < 30;
    if (canDock) {
      // SFX: on first engage, play soft ping and a whoosh (rate-limited)
      const nowTs = performance.now();
      if (!dockingActiveRef.current) {
        dockingActiveRef.current = true;
        if (nowTs - lastDockPingAtRef.current > 600) {
          soundSystem.playDockPing();
          lastDockPingAtRef.current = nowTs;
        }
        if (nowTs - lastTractorWhooshAtRef.current > 800) {
          soundSystem.playTractorWhoosh();
          lastTractorWhooshAtRef.current = nowTs;
        }
        // Play refuel energy cue once on engage
        soundSystem.playRefuelEnergy();
      }
      const maxFuel = player.maxFuel ?? 100;
      const curFuel = player.fuel ?? 0;
      if (curFuel < maxFuel) {
        // Refill gradually
        const refillRate = 1.2; // units per frame (faster)
        player.fuel = Math.min(maxFuel, curFuel + refillRate);
        // Slight slowdown while docked
        player.velocity = multiplyVector(player.velocity, 0.92);
        // Docking hint ring
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 24, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    } else {
      dockingActiveRef.current = false;
    }
    ctx.restore();

    // Player docking glow overlay
    if (canDock) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = 'rgba(136,255,204,0.45)';
      ctx.beginPath();
      ctx.arc(player.position.x, player.position.y, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // Tractor beam (soft gradient line)
      const bx0 = sx, by0 = sy;
      const bx1 = player.position.x, by1 = player.position.y;
      const grad = ctx.createLinearGradient(bx0, by0, bx1, by1);
      grad.addColorStop(0, 'rgba(136,255,204,0.45)');
      grad.addColorStop(1, 'rgba(136,255,204,0.0)');
      ctx.save();
      ctx.strokeStyle = grad;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(bx0, by0);
      ctx.lineTo(bx1, by1);
      ctx.stroke();
      ctx.restore();
    }
  };

  // Toggle non-fullscreen Fit-to-Window
  const toggleFitToWindow = () => {
    if (!isFitted) {
      // Apply aspect-fit sizing computed from initial canvas size
      setIsFitted(true);
      applyFitSizing();
    } else {
      // Restore initial size from app start
      const { w, h } = initialCanvasRef.current;
      setCanvasSize(w, h);
      setCanvasPixelSize({ w, h });
      setIsFitted(false);
      // Restore star density to initial
      regenerateStars(initialStarCountRef.current);
    }
  };

  // Draw Reward Ship and handle docking reward / escort behavior (world-tiling)
  const drawRewardShip = (ctx: CanvasRenderingContext2D, gameState: GameState) => {
    const rw = gameState.rewardShip;
    if (!rw || !rw.position) return;
    // Only when in same tile
    if (gameState.worldTileX !== rw.tileX || gameState.worldTileY !== rw.tileY) return;
    const { player } = gameState;
    const sx = rw.position.x;
    const sy = rw.position.y;
    // Escort behavior update
    if (rw.escortTimer && rw.escortTimer > 0) {
      rw.escortTimer -= 1;
      // Desired offset: hover to the right of player and slightly back
      const offsetR = 42;
      const theta = player.rotation;
      const ox = Math.cos(theta) * 18 + Math.cos(theta + Math.PI / 2) * offsetR;
      const oy = Math.sin(theta) * 18 + Math.sin(theta + Math.PI / 2) * offsetR;
      const targetX = player.position.x + ox;
      const targetY = player.position.y + oy;
      const toTargetX = targetX - (rw.position.x);
      const toTargetY = targetY - (rw.position.y);
      rw.velocity = rw.velocity || { x: 0, y: 0 };
      rw.velocity.x = rw.velocity.x * 0.9 + toTargetX * 0.06;
      rw.velocity.y = rw.velocity.y * 0.9 + toTargetY * 0.06;
      // Move
      rw.position.x += rw.velocity.x;
      rw.position.y += rw.velocity.y;
      // Sparkle trail: tiny fading dots behind escort ship
      ctx.save();
      ctx.globalAlpha = 0.6;
      const ang = Math.atan2(rw.velocity.y, rw.velocity.x);
      for (let i = 0; i < 3; i++) {
        const r = 6 + Math.random() * 10;
        const jitter = (Math.random() - 0.5) * 6;
        const trailX = sx - Math.cos(ang) * r + jitter;
        const trailY = sy - Math.sin(ang) * r + jitter;
        const size = 1 + Math.random() * 1.5;
        ctx.fillStyle = 'rgba(207,227,255,0.7)';
        ctx.beginPath(); ctx.arc(trailX, trailY, size, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    } else if (rw.departTimer && rw.departTimer > 0) {
      rw.departTimer -= 1;
      // Move outward from center
      const cx = CANVAS_WIDTH / 2, cy = CANVAS_HEIGHT / 2;
      const vx = (sx - cx) * 0.02;
      const vy = (sy - cy) * 0.02;
      rw.position.x += vx;
      rw.position.y += vy;
      if (rw.departTimer <= 0) {
        gameState.rewardShip = null;
      }
    }

    ctx.save();
    ctx.translate(sx, sy);
    // Silhouette with shimmer
    const t = performance.now() * 0.003;
    ctx.shadowColor = '#cfe3ff';
    ctx.shadowBlur = 14 + 6 * Math.sin(t * 0.8);
    ctx.strokeStyle = '#cfe3ff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-14, 6);
    ctx.lineTo(0, -10);
    ctx.lineTo(14, 6);
    ctx.lineTo(9, 6);
    ctx.lineTo(0, -2);
    ctx.lineTo(-9, 6);
    ctx.closePath();
    ctx.stroke();
    // Dots
    ctx.fillStyle = 'rgba(207,227,255,0.9)';
    ctx.beginPath(); ctx.arc(-6, 2, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(6, 2, 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Docking check
    const dx = sx - player.position.x;
    const dy = sy - player.position.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 28) {
      // Grant varied reward
      const roll = Math.random();
      if (roll < 0.4) {
        // Missiles +1 (cap 5)
        const have = Math.max(0, player.missiles || 0);
        player.missiles = Math.min(5, have + 1);
      } else if (roll < 0.7) {
        // Double shooter buff
        player.doubleShooter = Math.min(900, (player.doubleShooter || 0) + 300);
        player.doubleShooterStacks = Math.min(2, (player.doubleShooterStacks || 0) + 1);
      } else if (roll < 0.85) {
        // Heal
        player.health = Math.min(player.maxHealth, player.health + 20);
        healthBrightUntilRef.current = performance.now() + 800;
      } else {
        // Score
        gameState.score += 300;
        scoreDropUntilRef.current = performance.now() + 800;
      }
      // Enter escort mode then depart
      if (gameState.rewardShip) {
        gameState.rewardShip.escortTimer = 240; // ~4s escort
        gameState.rewardShip.departTimer = 180; // departure countdown after escort
      }

      // Docking overlay
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = 'rgba(207,227,255,0.55)';
      ctx.beginPath();
      ctx.arc(player.position.x, player.position.y, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };

  // Keyboard handlers
  // Keyboard down: stable callback. We read difficulty via difficultyRef to avoid expanding deps.
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!gameStateRef.current) return;
    const gs = gameStateRef.current;
    gs.keys[e.key] = true;
    if (e.key === 'h' || e.key === 'H') {
      setShowDebugHud(v => !v);
    }
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
      const pSegInit = p as Player & { missileSegments?: number };
      if (typeof pSegInit.missileSegments !== 'number') {
        pSegInit.missileSegments = Math.max(0, (p.missiles || 0) * 5);
      }
      // Determine if this press is part of a rapid-fire burst (extras)
      const nowPress = performance.now();
      const inBurstWindow = (nowPress - lastMissileFireAtRef.current) < 400; // 0.4s window
      const isExtra = inBurstWindow && missileBurstCountRef.current >= 1;

      // Enforce max 3 simultaneous player missiles in the air (unless unlimited cheat is active)
      if (!unlimitedMissilesRef.current) {
        const activePlayerMissiles = (gs.playerMissiles || []).filter(b => b.owner === 'player').length;
        if (activePlayerMissiles >= 3) return;
      }
      const pSegRead = p as Player & { missileSegments?: number };
      const segs: number = pSegRead.missileSegments || 0;
      if (isExtra || unlimitedMissilesRef.current || segs > 0) {
        // Create a missile at player position heading forward
        const missile: AlienBullet = createAlienBullet(p.position, p.rotation);
        missile.owner = 'player';
        // Extra missiles: simple dumbfire, no lock-on, very low damage
        if (isExtra) {
          missile.homing = false;
          missile.turnRate = 0;
          missile.damageMultiplier = 0.2;
          missile.explosionRadius = 30;
          (missile as PlayerMissileExt).isExtra = true;
        } else {
          missile.homing = true;
          // Stronger homing for primaries
          missile.turnRate = Math.max(0.12, missile.turnRate || 0.12);
          missile.damageMultiplier = 10; // ensure kill
          missile.explosionRadius = 80;
          (missile as PlayerMissileExt).isExtra = false;
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
        (missile as PlayerMissileExt).bornAt = performance.now();
        (missile as PlayerMissileExt).phase = 'straight'; // 'straight' -> 'homing'
        (missile as PlayerMissileExt).straightMs = 1000;
        // Initialize path history only for primary (extras keep simple visuals)
        if (!isExtra) {
          (missile as PlayerMissileExt).history = [{ x: missile.position.x, y: missile.position.y }];
          (missile as PlayerMissileExt).lastSmokeAt = performance.now();
        }
        // Distinct target selection at launch: avoid targets already claimed by active player missiles
        try {
          const claimed = new Set<unknown>();
          for (const m of (gs.playerMissiles || [])) {
            const mm = m as PlayerMissileExt;
            if (mm.owner === 'player' && mm.debugTargetRef) claimed.add(mm.debugTargetRef);
          }
          const candidates: Array<{ type: 'alien'|'asteroid'; obj: AlienShip | Asteroid; score: number }> = [];
          // Aliens: missile-type UFOs first (very high score), then other aliens by health, both with distance falloff
          for (const s of gs.alienShips) {
            const dx = s.position.x - p.position.x, dy = s.position.y - p.position.y; const d = Math.hypot(dx, dy) || 1;
            const isMissileType = ('isMissileType' in s) && (s as unknown as { isMissileType?: boolean }).isMissileType === true;
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
            const mx = missile as PlayerMissileExt;
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
            const mx = missile as PlayerMissileExt;
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
          const activeNow = (gs.playerMissiles || []).filter(b => b.owner === 'player').length;
          if (activeNow >= 3) return;
        }
        gs.playerMissiles!.push(missile);
        // Ammo consumption: only primary consumes ammo (one segment per shot)
        if (!unlimitedMissilesRef.current && !isExtra) {
          const pSegWrite = p as Player & { missileSegments?: number };
          pSegWrite.missileSegments = Math.max(0, (pSegWrite.missileSegments || 0) - 1);
        }
        soundSystem.playMissileLaunch();
        // Suspend motion trails while missile and ensuing effects are active
        trailsSuspendUntilRef.current = performance.now() + 1000; // at least 1s
        trailsFadeInStartRef.current = 0; // reset fade-in
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
  }, []);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (!gameStateRef.current) return;
    gameStateRef.current.keys[e.key] = false;
  }, []);

  // Small dust-only debris (for hit impacts)
  const spawnSmallDebris = (asteroid: Asteroid, count: number) => {
    if (!gameState.visualDebris) gameState.visualDebris = [];
    const baseColor = (() => {
      if (asteroid.size === 'large') return '#777777';
      if (asteroid.size === 'medium') return '#999999';
      return '#bbbbbb';
    })();
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 1.8;
      const vx = Math.cos(angle) * speed + asteroid.velocity.x * 0.2;
      const vy = Math.sin(angle) * speed + asteroid.velocity.y * 0.2;
      const maxLife = 100 + Math.floor(Math.random() * 80);
      gameState.visualDebris.push({
        position: { x: asteroid.position.x, y: asteroid.position.y },
        velocity: { x: vx, y: vy },
        life: 0,
        maxLife,
        size: 1 + Math.random() * 2,
        color: baseColor,
        kind: 'dust',
        rotation: 0,
        rotationSpeed: 0,
      });
    }
  };
  // Intro/tier helpers
  const lastIntroStepRef = useRef<number>(0);
  // Pause control (game auto-start behavior remains unchanged)
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  // Music UX toggles (UI only)
  // Removed unused music UX toggles to satisfy lint (no functional change)
  // Risqué music opt-in
  const [showRisqueModal, setShowRisqueModal] = useState(false);
  const [risqueAgreeChecked, setRisqueAgreeChecked] = useState(false);
  const [risqueAnswer, setRisqueAnswer] = useState('');
  const risqueAnswerValid = /^\s*(y|yes)\s*$/i.test(risqueAnswer);
  const [risquePromptFlash, setRisquePromptFlash] = useState(false);

  // Helper to present cleaner song titles (strip leading numbers or S# prefixes)
  const formatTrackName = useCallback((raw: string) => {
    // Remove leading patterns like '01 ', '1_', 'S1 -', 's12.' and common separators
    const stripped = raw.replace(/^\s*(?:[0-9]+|[sS][0-9]+)[\s._-]*/,'').trim();
    return stripped || raw;
  }, []);
  
  // Initialize gameState with useState
  const [gameState] = useState<GameState>(() => ({
    player: createPlayer(),
    bullets: [],
    alienBullets: [],
    asteroids: [],
    alienShips: [],
    bonuses: [],
    score: 0,
    stage: 1,
    gameRunning: false,
    gameStarted: false,
    keys: {},
    stageStartTime: 0,
    stageWaitTime: 0,
    alienSpawnCount: 0,
    visualDebris: [],
    explosions: [],
    levelComplete: false,
    warpEffect: 0,
    alienApproachMusicPlayed: false,
    asteroidsSpawned: false,
    lastBonusSpawn: 0,
    healEffect: 0,
    introPhase: 'none',
    introTimer: 0,
    shipScale: 1,
    shipIntroPosition: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 },
    lives: (difficulty === 'easy') ? 5 : 3,
    respawning: true,
    respawnCountdown: 180, // 3 seconds at 60 FPS
  }));

  // Visual debris helpers
  const spawnAsteroidDebris = (asteroid: Asteroid) => {
    if (!gameState.visualDebris) gameState.visualDebris = [];
    // Double the random debris count
    const count = 2 + Math.floor(Math.random() * 16); // 2-18 pieces
    const baseColor = (() => {
      // Match asteroid color family by size
      if (asteroid.size === 'large') return '#666666';
      if (asteroid.size === 'medium') return '#888888';
      return '#aaaaaa';
    })();
    for (let i = 0; i < count; i++) {
      const kind: 'chunk' | 'dust' = Math.random() < 0.65 ? 'dust' : 'chunk';
      const angle = Math.random() * Math.PI * 2;
      // Increase speed so debris travels farther before fade
      const speed = (kind === 'dust' ? 2.0 : 3.2) + Math.random() * (kind === 'dust' ? 2.2 : 3.0);
      const vx = Math.cos(angle) * speed + asteroid.velocity.x * 0.25;
      const vy = Math.sin(angle) * speed + asteroid.velocity.y * 0.25;
      const size = kind === 'dust' ? (1 + Math.random() * 2) : (2 + Math.random() * 4);
      // Double lifetime so pieces go much farther before disappearing
      const maxLife = 240 + Math.floor(Math.random() * 240); // 4-8s
      const d: VisualDebris = {
        position: { x: asteroid.position.x, y: asteroid.position.y },
        velocity: { x: vx, y: vy },
        life: 0,
        maxLife,
        size,
        color: baseColor,
        kind,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.1,
      };
      gameState.visualDebris.push(d);
    }
  };

  const updateVisualDebris = () => {
    if (!gameState.visualDebris) return;
    const arr = gameState.visualDebris;
    for (let i = arr.length - 1; i >= 0; i--) {
      const d = arr[i];
      // Update position
      d.position.x += d.velocity.x;
      d.position.y += d.velocity.y;
      // Reduce drag so debris holds velocity longer
      d.velocity.x *= 0.995;
      d.velocity.y *= 0.995;
      if (typeof d.rotation === 'number' && typeof d.rotationSpeed === 'number') {
        d.rotation += d.rotationSpeed;
      }
      d.life++;
      // Remove if out of life or well off-screen (no wrap)
      const off = d.position.x < -60 || d.position.x > CANVAS_WIDTH + 60 || d.position.y < -60 || d.position.y > CANVAS_HEIGHT + 60;
      if (d.life >= d.maxLife || off) {
        arr.splice(i, 1);
      }
    }
  };

  const drawVisualDebris = (ctx: CanvasRenderingContext2D) => {
    if (!gameState.visualDebris || gameState.visualDebris.length === 0) return;
    for (const d of gameState.visualDebris) {
      const t = d.life / d.maxLife;
      const alpha = Math.max(0, 1 - t); // fade out
      ctx.save();
      ctx.globalAlpha = alpha * 0.9;
      ctx.translate(d.position.x, d.position.y);
      if (d.kind === 'chunk') {
        ctx.rotate(d.rotation ?? 0);
        ctx.fillStyle = d.color;
        // Draw small irregular quad/triangle
        ctx.beginPath();
        const s = d.size;
        ctx.moveTo(-s, -s * 0.6);
        ctx.lineTo(s * 0.8, -s * 0.4);
        ctx.lineTo(s, s * 0.5);
        ctx.lineTo(-s * 0.5, s * 0.7);
        ctx.closePath();
        ctx.fill();
      } else {
        // dust
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.arc(0, 0, d.size * (0.8 + 0.4 * Math.random()), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  };

  // Song title overlay animation (typing + fade + float)
  const titleOverlaysRef = useRef<Array<{ id: number; text: string; start: number }>>([]);
  const nextTitleIdRef = useRef<number>(1);
  // Prevent double title at song start (some code paths notify twice: select + play)
  const lastTitleInfoRef = useRef<{ index: number; ts: number } | null>(null);
  // Window in which we suppress listener-driven title enqueues (used for first start)
  const suppressTitleUntilRef = useRef<number>(0);


  const queueQuip = useCallback((text: string, delayMs = 0) => {
    window.setTimeout(() => {
      titleOverlaysRef.current.push({ id: nextTitleIdRef.current++, text, start: performance.now() });
    }, delayMs);
  }, []);

  // Periodically persist playback info while playing; also on tab hide/unload
  useEffect(() => {
    const save = () => {
      try {
        const info = soundSystem.getPlaybackInfo();
        // Only persist if actively playing or we have a non-zero offset
        if (info.isPlaying || info.offsetSec > 0) {
          const data = { index: info.index, offsetSec: info.offsetSec };
          localStorage.setItem(MUSIC_RESUME_KEY, JSON.stringify(data));
          resumeInfoRef.current = data;
        }
      } catch { /* ignore */ }
    };
    const id = window.setInterval(save, 3000);
    const vis = () => { if (document.visibilityState === 'hidden') save(); };
    const beforeUnload = () => save();
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, []);

  useEffect(() => {
    // Single handler: keep UI index in sync and show the title after 2s
    soundSystem.setOnMusicTrackChange((index: number) => {
      setMusicIndex(index);
      const now = performance.now();
      // Suppress during guarded window (e.g., first-start manual enqueue)
      if (now < suppressTitleUntilRef.current) {
        return;
      }
      const last = lastTitleInfoRef.current;
      // Debounce duplicate notifications for the same index within 1.5s
      if (last && last.index === index && (now - last.ts) < 1500) {
        return;
      }
      lastTitleInfoRef.current = { index, ts: now };
      window.setTimeout(() => {
        // Only show if music is actually playing this track after 2s
        const ms = soundSystem.getMusicState();
        if (!ms.isPlaying || ms.index !== index) return;
        const tracks = soundSystem.getMusicTracks();
        const t = tracks?.[index];
        if (!t) return;
        const formatted = formatTrackName(t.name);
        if (!formatted) return;
        // Skip if a same-title overlay already exists and started recently (<4s)
        const now2 = performance.now();
        const dup = titleOverlaysRef.current.some(o => o.text === `♪ ${formatted}` && (now2 - o.start) < 4000);
        if (dup) return;
        titleOverlaysRef.current.push({
          id: nextTitleIdRef.current++,
          text: `♪ ${formatted}`,
          start: performance.now()
        });
      }, 2000);
    });
    return () => {
      soundSystem.setOnMusicTrackChange(null);
    };
  }, [formatTrackName]);
  const alienMusicControlRef = useRef<{ stop: () => void } | null>(null);
  const bonusAmbientControlRef = useRef<{ stop: () => void } | null>(null);
  // Bad UFO music control
  const badUfoActiveRef = useRef<boolean>(false);
  const badUfoLoopCtlRef = useRef<{ stop: () => void } | null>(null);
  const musicFadeResumeFramesRef = useRef<number>(0);
  // Remember where the music was when bad UFO scene begins
  const badUfoMusicMemRef = useRef<{ index: number; offsetSec: number } | null>(null);
  // Cooldown tracking for asteroid-asteroid bounce SFX
  const asteroidBounceCooldownRef = useRef<WeakMap<Asteroid, number>>(new WeakMap());
  // Directional alien incoming cue control
  const alienIncomingCtlRef = useRef<{ setPan: (p: number) => void; stop: () => void } | null>(null);
  // Player death burst scheduler: 10 explosions over 2 seconds
  const deathBurstsRef = useRef<{ pos: { x: number; y: number } | null; remaining: number; spawned: number }>({ pos: null, remaining: 0, spawned: 0 });

  // HUD highlight timers and previous values
  const prevHealthRef = useRef<number>(createPlayer().maxHealth);
  const prevLivesRef = useRef<number>(3);
  const prevScoreRef = useRef<number>(0);
  const healthBrightUntilRef = useRef<number>(0);
  const healthDropUntilRef = useRef<number>(0);
  const livesBrightUntilRef = useRef<number>(0);
  const scoreDropUntilRef = useRef<number>(0);
  // Fuel HUD helpers
  const prevFuelRef = useRef<number>(createPlayer().maxFuel || 100);
  const refuelToastUntilRef = useRef<number>(0);
  const lastFuelWarnLevelRef = useRef<'normal' | 'low' | 'critical'>('normal');
  const lastFuelBeepTsRef = useRef<number>(0);

  // Keep a ref for backdrops to avoid adding it to initGame deps
  // We also mirror backdrops into a ref so initGame can read it without depending on backdrops state,
  // keeping initGame stable (empty deps) and avoiding unnecessary re-creations.
  const backdropsRef = useRef<string[]>([]);
  useEffect(() => { backdropsRef.current = backdrops; }, [backdrops]);

  // Initialize game state
  // initGame: intentionally stable (empty deps). It reads state via refs where needed.
  const initGame = useCallback(() => {
    // Set game start time for auto-popup
    gameStartTimeRef.current = performance.now();
    autoPopupShownRef.current = false;
    
    // Initialize random stars
    initialAreaRef.current = CANVAS_WIDTH * CANVAS_HEIGHT;
    initialStarCountRef.current = 200;
    regenerateStars(initialStarCountRef.current);

    // Discover available backdrops (files starting with backdrop_ in images/)
    // Use ref to avoid coupling initGame to backdrop state changes
    if (backdropsRef.current.length === 0) {
      try {
        const modules = import.meta.glob('../images/backdrop_*', { eager: true, as: 'url' }) as Record<string, string>;
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
    if (alienMusicControlRef.current) {
      alienMusicControlRef.current.stop();
      alienMusicControlRef.current = null;
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
      shipIntroPosition: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 },
      // Lives depend on difficulty; read via ref to keep initGame stable
      lives: (difficultyRef.current === 'easy') ? 5 : 3,
      respawning: false,
      respawnCountdown: 0,
      refuelStation: null,
      rewardShip: null,
      worldTileX: 0,
      worldTileY: 0,
    } as unknown as GameState;
    // Initial spawn invulnerability & shield for 3 seconds
    gameStateRef.current.player.position = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
    gameStateRef.current.player.velocity = { x: 0, y: 0 };
    gameStateRef.current.player.invulnerable = 180;
    gameStateRef.current.player.shieldTime = 180;

    // Note: Level 1 triple-shooter is handled in the shooting logic to avoid speed penalties.

    // Place a refuel station far off-screen (several tiles away)
    {
      const dxTiles = (Math.random() < 0.5 ? -1 : 1) * (5 + Math.floor(Math.random() * 4)); // 5..8 tiles
      const dyTiles = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.floor(Math.random() * 4)); // 4..7 tiles
      const localX = Math.random() * CANVAS_WIDTH;
      const localY = Math.random() * CANVAS_HEIGHT;
      gameStateRef.current.refuelStation = { tileX: dxTiles, tileY: dyTiles, position: { x: localX, y: localY } };
    }

    // Spawn a reward ship off-screen as well (tiles)
    {
      const dxTiles = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 3)); // 1..3 tiles
      const dyTiles = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 3)); // 1..3 tiles
      const localX = Math.random() * CANVAS_WIDTH;
      const localY = Math.random() * CANVAS_HEIGHT;
      gameStateRef.current.rewardShip = { tileX: dxTiles, tileY: dyTiles, position: { x: localX, y: localY } };
    }
    
    setScore(0);
    setGameRunning(true);
    setGameStarted(true);
    // Health reset implicit via createPlayer(); UI reads from player
    setStage(1);
    lastIntroStepRef.current = 0;
  }, []);

  // Handle initial click: restart if game over and prime music playback/select
  const handleClick = useCallback(() => {
    // If game over, clicking restarts (also allow starting music on same click)
    if (gameStateRef.current && !gameStateRef.current.gameRunning) {
      initGame();
    }
    // Auto-start background music on first user interaction to satisfy autoplay policies
    try {
      if (!musicAutoStartedRef.current) {
        const tracks = soundSystem.getMusicTracks();
        if (tracks && tracks.length > 0) {
          // Keep currently selected index; if out of range, clamp to 0
          const idx = Math.max(0, Math.min(musicIndex, tracks.length - 1));
          setMusicIndex(idx);
          if (!isMuted) {
            // Clear any pre-queued song-title overlays
            titleOverlaysRef.current = titleOverlaysRef.current.filter(o => !o.text.startsWith('♪'));
            // Suppress listener-driven enqueues for ~2.5s and enqueue manually after 2s
            suppressTitleUntilRef.current = performance.now() + 2500;
            safePlayMusic(idx);
            window.setTimeout(() => {
              const ms = soundSystem.getMusicState();
              if (!ms.isPlaying) return;
              const list = soundSystem.getMusicTracks();
              const t = list?.[ms.index];
              if (!t) return;
              const formatted = formatTrackName(t.name);
              if (!formatted) return;
              // Avoid duplicate same-title if already present recently
              const now3 = performance.now();
              const txt = `♪ ${formatted}`;
              const dup = titleOverlaysRef.current.some(o => o.text === txt && (now3 - o.start) < 4000);
              if (!dup) {
                titleOverlaysRef.current.push({ id: nextTitleIdRef.current++, text: txt, start: now3 });
                // Prime dedupe guard so a subsequent listener notify won't enqueue again immediately
                lastTitleInfoRef.current = { index: ms.index, ts: now3 };
              }
            }, 2000);
          } else {
            // If muted, just select track without playing to keep index in sync
            soundSystem.selectMusicTrack(idx);
          }
          musicAutoStartedRef.current = true;
        }
      }
    } catch { /* ignore */ }
    // Otherwise this primes audio context
  }, [initGame, isMuted, musicIndex, formatTrackName]);

  // Load music tracks initially (safe-only by default)
  useEffect(() => {
    // Ensure default is safe-only list
    if (typeof (soundSystem as unknown as { setRisqueEnabled?: (e: boolean) => void }).setRisqueEnabled === 'function') {
      (soundSystem as unknown as { setRisqueEnabled: (e: boolean) => void }).setRisqueEnabled(false);
    }
    const tracks = soundSystem.getMusicTracks();
    setMusicTracks(tracks);
    if (tracks.length > 0) {
      setMusicIndex(0);
    }
    // Attempt to restore last session
    try {
      const raw = localStorage.getItem(MUSIC_RESUME_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { index: number; offsetSec: number };
        if (typeof parsed.index === 'number' && typeof parsed.offsetSec === 'number') {
          resumeInfoRef.current = { index: parsed.index, offsetSec: Math.max(0, parsed.offsetSec) };
          // Set resume point without starting; adjust UI selection to saved index if valid
          soundSystem.setResumePoint(parsed.index, parsed.offsetSec);
          if (parsed.index >= 0 && parsed.index < tracks.length) {
            setMusicIndex(parsed.index);
          }
        }
      }
    } catch { /* ignore */ }
  }, []);

  // startGame removed; game auto-start remains unchanged by initGame() usage elsewhere

  // Input handling
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  // Dev-only: hotkey to push a manual debug line into DebugPanel
  useEffect(() => {
    if (!__DEV_MODE__) return;
    const onDevKey = (e: KeyboardEvent) => {
      // Backtick ` or 'd' key will dump a quick summary line
      if (e.key === '`' || e.key === 'd' || e.key === 'D') {
        const gs = gameStateRef.current;
        const tractorPhase = (gs as unknown as { tractorBeam?: { phase?: string } })?.tractorBeam?.phase ?? 'idle';
        const bg = (gs as unknown as { bgBrightness?: number })?.bgBrightness ?? 0.4;
        const summary = `[manual] f=${__frameCounter} ast=${gs?.asteroids?.length ?? 0} bul=${gs?.bullets?.length ?? 0} deb=${gs?.visualDebris?.length ?? 0} exp=${gs?.explosions?.length ?? 0} phase=${tractorPhase} bg=${bg}`;
        const arr = debugLinesRef.current; arr.push(summary); if (arr.length > 200) arr.splice(0, arr.length - 200);
      }
    };
    window.addEventListener('keydown', onDevKey);
    return () => { window.removeEventListener('keydown', onDevKey); };
  }, []);

  // Difficulty settings helper
  const getDifficultySettings = useCallback(() => {
    if (difficulty === 'easy') {
      return {
        asteroidCountDelta: -1, // fewer asteroids
        speedMultiplier: 0.8,
        alienDifficultyOffset: -1,
        damageScale: 0.75,
        bonusIntervalMs: 10000, // doubled bonus spawn rate (was 20000)
        alienSpeedMultiplier: 0.8, // 20% slower UFOs
        alienSpawnDelayMultiplier: 1.2, // 20% slower UFO spawn timer
      } as const;
    }
    if (difficulty === 'hard') {
      return {
        asteroidCountDelta: +1, // more asteroids
        speedMultiplier: 1.3,
        alienDifficultyOffset: +1,
        damageScale: 1.5,
        bonusIntervalMs: 40000,
        alienSpeedMultiplier: 1.0, // normal UFO speed
        alienSpawnDelayMultiplier: 1.0, // normal UFO spawn timer
      } as const;
    }
    // medium (current defaults)
    return {
      asteroidCountDelta: 0,
      speedMultiplier: 1.0,
      alienDifficultyOffset: 0,
      damageScale: 1.0,
      bonusIntervalMs: 30000,
      alienSpeedMultiplier: 1.0, // normal UFO speed
      alienSpawnDelayMultiplier: 1.0, // normal UFO spawn timer
    } as const;
  }, [difficulty]);

  // Function to create asteroids for a specific stage with difficulty applied
  const createStageAsteroids = (stageNumber: number): Asteroid[] => {
    const asteroids: Asteroid[] = [];
    const settings = getDifficultySettings();
    
    if (stageNumber === 1) {
      // Stage 1: Start with 4 large asteroids
      asteroids.push(createAsteroid('large', undefined, stageNumber));
      asteroids.push(createAsteroid('large', undefined, stageNumber));
      asteroids.push(createAsteroid('large', undefined, stageNumber));
      asteroids.push(createAsteroid('large', undefined, stageNumber));
    } else if (stageNumber === 2) {
      // Stage 2: Current difficulty
      asteroids.push(createAsteroid('large', undefined, stageNumber));
      asteroids.push(createAsteroid('large', undefined, stageNumber));
      asteroids.push(createAsteroid('large', undefined, stageNumber));
      asteroids.push(createAsteroid('medium', undefined, stageNumber));
      asteroids.push(createAsteroid('medium', undefined, stageNumber));
    } else if (stageNumber === 3) {
      // Stage 3: More asteroids, faster
      asteroids.push(createAsteroid('large', undefined, stageNumber));
      asteroids.push(createAsteroid('large', undefined, stageNumber));
      asteroids.push(createAsteroid('large', undefined, stageNumber));
      asteroids.push(createAsteroid('large', undefined, stageNumber));
      asteroids.push(createAsteroid('medium', undefined, stageNumber));
      asteroids.push(createAsteroid('medium', undefined, stageNumber));
      asteroids.push(createAsteroid('medium', undefined, stageNumber));
    } else {
      // Stage 4+: Even more asteroids
      const largeCount = Math.min(3 + stageNumber, 8); // Cap at 8 large asteroids
      const mediumCount = Math.min(2 + stageNumber, 6); // Cap at 6 medium asteroids
      
      for (let i = 0; i < largeCount; i++) {
        asteroids.push(createAsteroid('large', undefined, stageNumber));
      }
      for (let i = 0; i < mediumCount; i++) {
        asteroids.push(createAsteroid('medium', undefined, stageNumber));
      }
    }

    // Apply asteroid count delta (ensure non-negative length)
    if (settings.asteroidCountDelta < 0) {
      for (let i = 0; i < Math.abs(settings.asteroidCountDelta); i++) {
        if (asteroids.length > 0) asteroids.pop();
      }
    } else if (settings.asteroidCountDelta > 0) {
      for (let i = 0; i < settings.asteroidCountDelta; i++) {
        asteroids.push(createAsteroid('medium', undefined, stageNumber));
      }
    }

    // Apply speed multiplier
    if (settings.speedMultiplier !== 1) {
      for (const a of asteroids) {
        a.velocity = multiplyVector(a.velocity, settings.speedMultiplier);
      }
    }
    // Choose one large asteroid to be special: triple health, ominous look, special spawn
    const largeIndices = asteroids
      .map((a, idx) => ({ a, idx }))
      .filter(({ a }) => a.size === 'large')
      .map(({ idx }) => idx);
    if (largeIndices.length > 0) {
      const pick = largeIndices[Math.floor(Math.random() * largeIndices.length)];
      const special = asteroids[pick];
      special.special = true;
      special.glowColor = Math.random() < 0.5 ? 'green' : 'red';
      special.specialSpawn = Math.random() < 0.5 ? 'bonus' : 'alien';
      // Generate and lock the Flipit chance for this asteroid (1% to 10%)
      special.flipitChance = 0.01 + Math.random() * 0.09;
      // Triple health for the special rock
      special.health = special.maxHealth * 3;
      special.maxHealth = special.health;
    }
    return asteroids;
  };

  // Map ship look to health percentage (0-100): 0-20 => T1, 20-40 => T2, 40-60 => T3, 60-80 => T4, 80-100 => T5
  const computeHealthTier = (health: number, maxHealth: number): number => {
    const pct = maxHealth > 0 ? Math.max(0, Math.min(100, (health / maxHealth) * 100)) : 0;
    if (pct >= 80) return 5;
    if (pct >= 60) return 4;
    if (pct >= 40) return 3;
    if (pct >= 20) return 2;
    return 1;
  };

  // Draw functions
  const drawPlayer = (ctx: CanvasRenderingContext2D, gameState: GameState) => {
    const { player } = gameState;
    // Determine current visible tier: show intro tiers during intro, else by health
    let visibleTier = computeHealthTier(player.health, player.maxHealth);
    if (gameState.introPhase === 'ship-entrance') {
      // Timeline: 0-1.0s => 5, 1.0-1.5s => 4, 1.5-2.0s => 3, 2.0-2.5s => 2, then normal
      const t = gameState.introTimer / 1000;
      if (t < 1.0) visibleTier = 5; else if (t < 1.5) visibleTier = 4; else if (t < 2.0) visibleTier = 3; else if (t < 2.5) visibleTier = 2;
      let step = 0; if (t < 1.0) step = 5; else if (t < 1.5) step = 4; else if (t < 2.0) step = 3; else if (t < 2.5) step = 2; else step = 1;
      if (step !== lastIntroStepRef.current) {
        if (step <= 4 && step >= 1) soundSystem.playTierChangeCue();
        lastIntroStepRef.current = step;
      }
    } else if (gameState.introPhase === 'health-fill') {
      // During health fill, tier reflects the rising health
      visibleTier = computeHealthTier(player.health, player.maxHealth);
    }

    // Draw shield effect first (behind player)
    if (player.shieldTime > 0) {
      ctx.save();
      ctx.translate(player.position.x, player.position.y);
      
      // Shield glow effect
      const shieldAlpha = player.shieldTime < 60 ? (player.shieldTime / 60) * 0.6 : 0.6; // Fade in last second
      const time = Date.now() * 0.005;
      const pulseIntensity = 0.8 + Math.sin(time) * 0.2;
      
      // Outer glow
      ctx.fillStyle = `rgba(0, 170, 255, ${shieldAlpha * 0.3 * pulseIntensity})`;
      ctx.beginPath();
      ctx.arc(0, 0, 35, 0, 2 * Math.PI);
      ctx.fill();
      
      // Shield hexagon
      ctx.strokeStyle = `rgba(0, 200, 255, ${shieldAlpha * pulseIntensity})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * 2 * Math.PI + time * 0.5; // Slow rotation
        const x = Math.cos(angle) * 25;
        const y = Math.sin(angle) * 25;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      
      // Inner energy pattern
      ctx.strokeStyle = `rgba(255, 255, 255, ${shieldAlpha * 0.8 * pulseIntensity})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * 2 * Math.PI - time * 0.3; // Counter rotation
        const x = Math.cos(angle) * 18;
        const y = Math.sin(angle) * 18;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      
      ctx.restore();
    }
    
    ctx.save();
    // Apply intro drop-in: scale 1.6->1.0 and slide -40px->0 over 2.5s
    let scale = 1;
    let offsetY = 0;
    if (gameState.introPhase === 'ship-entrance') {
      const t = Math.min(2500, gameState.introTimer);
      const k = 1 - (t / 2500);
      scale = 1.0 + k * 0.6;
      offsetY = -40 * k;
    }
    ctx.translate(player.position.x, player.position.y + offsetY);
    // Dim ship during behind-entry occlusion
    if (tractionBeamRef.current?._occludeShip) {
      ctx.globalAlpha *= 0.5;
    }
    ctx.rotate(player.rotation);
    ctx.scale(scale, scale);

    // Draw ship per tier
    const isFlashing = player.invulnerable > 0 && Math.floor(player.invulnerable / 5) % 2 === 0;
    const baseStroke = isFlashing ? '#ff0000' : '#00ffff';

    const drawTier1 = () => {
      ctx.strokeStyle = baseStroke;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(15, 0);
      ctx.lineTo(-10, -8);
      ctx.lineTo(-5, 0);
      ctx.lineTo(-10, 8);
      ctx.closePath();
      ctx.stroke();
    };

    const drawTier2 = () => {
      ctx.strokeStyle = '#7ffcff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(15, 0);
      ctx.lineTo(-10, -8);
      ctx.lineTo(-5, 0);
      ctx.lineTo(-10, 8);
      ctx.closePath();
      ctx.stroke();
    };

    const drawTier3 = () => {
      const time = Date.now() * 0.0006;
      const hue = Math.floor((time * 60) % 360);
      ctx.fillStyle = `hsl(${hue}, 80%, 55%)`;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(15, 0);
      ctx.lineTo(-10, -8);
      ctx.lineTo(-5, 0);
      ctx.lineTo(-10, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };

    const drawTier4 = () => {
      const time = Date.now() * 0.0006;
      const hue = Math.floor((time * 60) % 360);
      ctx.fillStyle = `hsl(${hue}, 80%, 55%)`;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      // body
      ctx.beginPath();
      ctx.moveTo(15, 0);
      ctx.lineTo(-10, -8);
      ctx.lineTo(-5, 0);
      ctx.lineTo(-10, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // side turrets
      ctx.fillStyle = '#cccccc';
      ctx.strokeStyle = '#999999';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.rect(-6, -10, 4, 6); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.rect(-6, 4, 4, 6); ctx.fill(); ctx.stroke();
      // barrels
      ctx.strokeStyle = '#dddddd';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-2, -7); ctx.lineTo(8, -7);
      ctx.moveTo(-2, 7); ctx.lineTo(8, 7);
      ctx.stroke();
    };

    const drawTier5 = () => {
      // Procedural detailed ship, centered around (0,0)
      // Apply a tiny alignment tweak so visual centroid matches bullet origin
      ctx.save();
      ctx.translate(-2, 0); // slight left shift to center mass
      ctx.fillStyle = '#88e0ff';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(2, -10);
      ctx.lineTo(-12, -6);
      ctx.lineTo(-6, 0);
      ctx.lineTo(-12, 6);
      ctx.lineTo(2, 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // canopy
      ctx.fillStyle = '#1b2a41';
      ctx.beginPath();
      ctx.ellipse(4, 0, 6, 4, 0, 0, 2 * Math.PI);
      ctx.fill();
      // fins
      ctx.fillStyle = '#66d0ff';
      ctx.beginPath(); ctx.moveTo(-8, -9); ctx.lineTo(-2, -4); ctx.lineTo(-12, -2); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-8, 9);  ctx.lineTo(-2, 4);  ctx.lineTo(-12, 2);  ctx.closePath(); ctx.fill();
      // nose detail
      ctx.strokeStyle = '#dff6ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(17, 0); ctx.stroke();
      ctx.restore();
    };

    switch (visibleTier) {
      case 1: drawTier1(); break;
      case 2: drawTier2(); break;
      case 3: drawTier3(); break;
      case 4: drawTier4(); break;
      case 5: drawTier5(); break;
      default: drawTier1();
    }
    
    // Draw thrust
    if (player.thrust > 0) {
      ctx.strokeStyle = '#ff6600';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-5, 0);
      ctx.lineTo(-15, -3);
      ctx.lineTo(-12, 0);
      ctx.lineTo(-15, 3);
      ctx.closePath();
      ctx.stroke();
    }
    
    ctx.restore();
  };

  const drawBullets = (ctx: CanvasRenderingContext2D, bullets: Bullet[]) => {
    ctx.fillStyle = '#ffff00';
    bullets.forEach(bullet => {
      ctx.beginPath();
      ctx.arc(bullet.position.x, bullet.position.y, bullet.radius, 0, 2 * Math.PI);
      ctx.fill();
    });
  };
  const drawAlienShips = (ctx: CanvasRenderingContext2D, alienShips: AlienShip[]) => {
    alienShips.forEach(ship => {
      ctx.save();
      // Doom sequence visuals for missile-type
      const missileType = !!ship.isMissileType;
      const doomStage = (ship as AlienShip).doomStage || 0;
      const doomTimer = (ship as AlienShip).doomTimer || 0;
      // Vibrate jitter during stage 2
      let jitterX = 0, jitterY = 0;
      if (missileType && doomStage === 2) {
        jitterX = (Math.random() - 0.5) * 6;
        jitterY = (Math.random() - 0.5) * 6;
      }
      ctx.translate(ship.position.x + jitterX, ship.position.y + jitterY);
      // Shrink during stage 3
      let baseScale = missileType ? 2.0 : 1.0;
      if (missileType && doomStage === 3) {
        const t = Math.max(0.05, (doomTimer || 1) / 60);
        baseScale *= t;
      }
      const scale = baseScale;
      ctx.scale(scale, scale);

      // Saucer body
      // Disable heavy shadow glows to avoid large-area wash; shading remains via fills/strokes
      if (missileType && doomStage === 2) {
        ctx.shadowColor = '#ff6b3a';
        ctx.shadowBlur = 0;
      } else if (missileType && doomStage === 3) {
        ctx.shadowColor = '#ffd8b0';
        ctx.shadowBlur = 0;
      } else {
        ctx.shadowBlur = 0;
      }
      ctx.fillStyle = missileType ? '#222326' : '#444444';
      ctx.strokeStyle = missileType ? '#ff6b3a' : '#666666';
      ctx.lineWidth = missileType ? 2.5 : 2;
      ctx.beginPath();
      ctx.ellipse(0, 2, 20, 8, 0, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      // Top dome (pulse for missile type)
      const pulse = missileType ? (0.85 + 0.15 * Math.sin(Date.now() * 0.006)) : 1;
      ctx.fillStyle = missileType ? `rgba(255,120,60,${0.5 * pulse})` : '#555555';
      ctx.strokeStyle = missileType ? '#ffb46b' : '#777777';
      ctx.lineWidth = missileType ? 1.8 : 1.5;
      ctx.beginPath();
      ctx.ellipse(0, -6, 10, 6, 0, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      // Lower orb/glow
      ctx.fillStyle = missileType ? (doomStage >= 2 ? 'rgba(255, 68, 68, 0.7)' : 'rgba(255, 68, 68, 0.4)') : 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.arc(0, 8, 6, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();

      // Health bar above ship (scale width by scale)
      const healthPercentage = ship.health / ship.maxHealth;
      const barWidth = 20 * scale;
      const barHeight = 3;
      ctx.fillStyle = '#333333';
      ctx.fillRect(ship.position.x - barWidth / 2, ship.position.y - ship.radius - 10, barWidth, barHeight);
      ctx.fillStyle = healthPercentage > 0.5 ? '#00ff00' : '#ff0000';
      ctx.fillRect(
        ship.position.x - barWidth / 2,
        ship.position.y - ship.radius - 10,
        barWidth * healthPercentage,
        barHeight
      );
    });
  };
  const drawAlienBullets = (ctx: CanvasRenderingContext2D, bullets: AlienBullet[]) => {
  bullets.forEach(bullet => {
    const isMissile = !!bullet.homing;
    const ang = Math.atan2(bullet.velocity.y, bullet.velocity.x);
    if (isMissile) {
      const isPlayer = bullet.owner === 'player';
      ctx.save();
      if (isPlayer) {
        // White missile head without costly glow
        ctx.shadowColor = '#000000';
        ctx.beginPath();
        ctx.arc(bullet.position.x, bullet.position.y, Math.max(3, bullet.radius + 1), 0, 2 * Math.PI);
        ctx.fill();
        const isExtra = !!(bullet as any).isExtra;
        if (isExtra) {
          // Simple minimal tail for extras: short faint line, no flame/smoke
          const len = 14;
          const tailX = bullet.position.x - Math.cos(ang) * len;
          const tailY = bullet.position.y - Math.sin(ang) * len;
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          ctx.moveTo(bullet.position.x, bullet.position.y);
          ctx.lineTo(tailX, tailY);
          ctx.stroke();
        } else {
          // Primary: flame + spotty smoke along the historical path
          {
            ctx.save();
            ctx.translate(bullet.position.x, bullet.position.y);
            ctx.rotate(ang);
            const flameLen = 14 + Math.sin(performance.now() * 0.02) * 2;
            const flameWidth = 6;
            // Outer red
            let grad = ctx.createLinearGradient(0, 0, -flameLen, 0);
            grad.addColorStop(0, 'rgba(255, 180, 0, 0.95)');
            grad.addColorStop(0.6, 'rgba(255, 90, 0, 0.55)');
            grad.addColorStop(1, 'rgba(255, 0, 0, 0.0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-flameLen, flameWidth * 0.5);
            ctx.lineTo(-flameLen, -flameWidth * 0.5);
            ctx.closePath();
            ctx.fill();
            // Inner bright yellow core
            const coreLen = flameLen * 0.7;
            const coreW = flameWidth * 0.35;
            grad = ctx.createLinearGradient(0, 0, -coreLen, 0);
            grad.addColorStop(0, 'rgba(255, 255, 160, 0.95)');
            grad.addColorStop(1, 'rgba(255, 200, 0, 0.0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-coreLen, coreW * 0.5);
            ctx.lineTo(-coreLen, -coreW * 0.5);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
          const hist = (bullet as any).history as Array<{x:number,y:number}> || [];
          if (hist.length >= 2) {
            const gap = 3;
            const end = Math.max(1, hist.length - gap);
            for (let i = 0; i < end; i += 2) {
              const t = i / end;
              const size = 3.2 * (1 - t) + Math.random() * 0.8;
              const alpha = Math.max(0, 0.22 * (1 - t) + (Math.random() - 0.5) * 0.04);
              ctx.fillStyle = `rgba(235,240,255,${alpha})`;
              const jitterX = (Math.random() - 0.5) * 0.9;
              const jitterY = (Math.random() - 0.5) * 0.9;
              ctx.beginPath();
              ctx.arc(hist[i].x + jitterX, hist[i].y + jitterY, size * 0.6, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
      // no special restore here (this block was unrelated to warp trails)
    } else {
      // Non-missile bullet visual
      ctx.fillStyle = '#ff0066';
      ctx.beginPath();
      ctx.arc(bullet.position.x, bullet.position.y, bullet.radius, 0, 2 * Math.PI);
      ctx.fill();
    }
  });
};

  const drawExplosions = (ctx: CanvasRenderingContext2D, explosions: Explosion[]) => {
    explosions.forEach(explosion => {
      explosion.particles.forEach(particle => {
        ctx.save();
        // Cap alpha to prevent additive white-out when many particles overlap
        const baseA = 1 - (particle.life / particle.maxLife);
        ctx.globalAlpha = Math.min(0.35, baseA);
        ctx.fillStyle = particle.color;
        
        // Draw particles with varying sizes
        const currentSize = particle.size * (1 - (particle.life / particle.maxLife) * 0.5); // Shrink over time
        ctx.fillRect(
          particle.position.x - currentSize/2, 
          particle.position.y - currentSize/2, 
          currentSize, 
          currentSize
        );
        ctx.restore();
      });
    });
  };

  const drawBonuses = (ctx: CanvasRenderingContext2D, bonuses: Bonus[]) => {
  bonuses.forEach(bonus => {
    ctx.save();
    ctx.translate(bonus.position.x, bonus.position.y);
    
    if (bonus.type === 'shield') {
        // Draw shield bonus - blue glowing hexagon with shield symbol
        const time = Date.now() * 0.003;
        const glowIntensity = 0.7 + Math.sin(time) * 0.3;
        
        // Outer glow
        ctx.fillStyle = `rgba(0, 150, 255, ${glowIntensity * 0.3})`;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * 2 * Math.PI;
          const x = Math.cos(angle) * 30;
          const y = Math.sin(angle) * 30;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        
        // Core hexagon
        ctx.fillStyle = 'rgba(0, 120, 255, 0.9)';
        ctx.strokeStyle = 'rgba(200, 230, 255, 0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * 2 * Math.PI;
          const x = Math.cos(angle) * 20;
          const y = Math.sin(angle) * 20;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Shield emblem
        ctx.fillStyle = '#e6f7ff';
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(8, -2);
        ctx.lineTo(6, 8);
        ctx.lineTo(-6, 8);
        ctx.lineTo(-8, -2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // muzzle flashes
        ctx.fillStyle = '#ffff66';
        ctx.beginPath(); ctx.arc(10, 0, 3, 0, 2 * Math.PI); ctx.fill();
        ctx.beginPath(); ctx.arc(-10, 0, 3, 0, 2 * Math.PI); ctx.fill();
      } else if (bonus.type === 'missile') {
      // Missile bonus: larger white missile icon with glow
      const time = Date.now() * 0.004;
      const pulse = 0.6 + 0.4 * Math.sin(time);
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 16 * pulse;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      // Draw a simple missile body
      ctx.save();
      ctx.rotate((Math.PI / 8) * Math.sin(time * 0.4));
      // nose
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-10, -6);
      ctx.lineTo(-10, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // fins
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(-12, -2); ctx.lineTo(-4, -2); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-6, 8); ctx.lineTo(-12, 2); ctx.lineTo(-4, 2); ctx.closePath(); ctx.fill();
      // small trail puff
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath(); ctx.arc(-14, 0, 4 + 2 * pulse, 0, 2 * Math.PI); ctx.fill();
      ctx.restore();
    } else {
      // unknown: no-op
    }
    
    ctx.restore();
  });
};
  const drawAsteroids = (ctx: CanvasRenderingContext2D, gameState: GameState) => {
    gameState.asteroids.forEach(asteroid => {
      ctx.save();
      ctx.translate(asteroid.position.x, asteroid.position.y);
      ctx.rotate(asteroid.rotation);
      // Detailed procedural asteroid with cached irregular shape, shading and craters
      const r = asteroid.radius;
      const anyAst = asteroid as Asteroid & { shapePoints?: Array<{x:number,y:number}>; baseFill?: string; strokeColor?: string; craters?: Array<{x:number,y:number,r:number}> };
      if (!anyAst.shapePoints) {
        const points = 14; // richer silhouette
        const arr: Array<{x:number,y:number}> = [];
        // Create stable random-ish offsets using a deterministic function of index and radius
        const jitter = (i: number) => {
          // pseudo-random in [-0.2,0.2]
          const s = Math.sin(i * 12.9898 + r * 78.233) * 43758.5453;
          return (s - Math.floor(s)) * 0.4 - 0.2;
        };
        for (let i = 0; i < points; i++) {
          const ang = (i / points) * Math.PI * 2;
          const rr = r * (0.85 + jitter(i));
          arr.push({ x: Math.cos(ang) * rr, y: Math.sin(ang) * rr });
        }
        anyAst.shapePoints = arr;
      }
      // Body fill
      ctx.beginPath();
      anyAst.shapePoints.forEach((p: {x:number,y:number}, i: number) => {
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      // Determine special "crystallized black glass" large asteroid vs regular
      const isCrystal = asteroid.size === 'large' && !!asteroid.special;
      // We no longer make all large asteroids metallic; only the special one is crystalline
      // Base color: special crystal uses near-black; others use darker randomized gray (cached)
      if (!anyAst.baseFill) {
        if (isCrystal) {
          // Deep almost-black with a cold tint
          anyAst.baseFill = '#0b0d11';
          anyAst.strokeColor = '#1a1f29';
        } else {
          // Deterministic pseudo-random in 0..1
          const seed = asteroid.position.x * 0.131 + asteroid.position.y * 0.173 + r * 0.219;
          const n = Math.sin(seed * 12.9898) * 43758.5453;
          const t = n - Math.floor(n);
          const veryDark = t < 0.3; // ~30% are much darker
          let gray: number;
          if (asteroid.size === 'large') {
            // Large regular: rock-like but darker
            gray = 45 + Math.floor(t * 35); // 45..80
          } else if (veryDark) {
            gray = 55 + Math.floor(t * 30); // 55..85
          } else {
            gray = 80 + Math.floor(t * 40); // 80..120
          }
          const hex = gray.toString(16).padStart(2, '0');
          anyAst.baseFill = `#${hex}${hex}${hex}`;
          const strokeG = Math.min(255, gray + 35);
          anyAst.strokeColor = `#${strokeG.toString(16).padStart(2, '0').repeat(3)}`;
        }
      }
      ctx.fillStyle = anyAst.baseFill;
      ctx.fill();
      // Edge stroke
      ctx.strokeStyle = anyAst.strokeColor || '#b5b5b5';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Lighting: soft rim light on top-left
      {
        const grad = ctx.createRadialGradient(-r * 0.4, -r * 0.4, r * 0.2, 0, 0, r * 1.2);
        grad.addColorStop(0, isCrystal ? 'rgba(180,210,255,0.30)' : 'rgba(255,255,255,0.22)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        anyAst.shapePoints.forEach((p: {x:number,y:number}, i: number) => {
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.fill();
      }

      // Additional 3D shading for regular (non-crystal) asteroids: directional shadow + subtle highlight
      if (!isCrystal) {
        // Directional shadow from top-left to bottom-right
        const lg = ctx.createLinearGradient(-r, -r, r, r);
        lg.addColorStop(0.55, 'rgba(0,0,0,0)');
        lg.addColorStop(1.0, 'rgba(0,0,0,0.28)');
        ctx.fillStyle = lg;
        ctx.beginPath();
        anyAst.shapePoints.forEach((p: {x:number,y:number}, i: number) => {
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.fill();

        // Soft highlight towards the light direction (top-left)
        const hg = ctx.createRadialGradient(-r * 0.5, -r * 0.5, r * 0.1, -r * 0.2, -r * 0.2, r * 0.9);
        hg.addColorStop(0, 'rgba(255,255,255,0.08)');
        hg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = hg;
        ctx.beginPath();
        anyAst.shapePoints.forEach((p: {x:number,y:number}, i: number) => {
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.fill();
      }
      
      // Crystalline reflective look for the special large asteroid
      if (isCrystal) {
        ctx.save();
        // Facet lines: faint cool strokes from edges toward center
        ctx.globalAlpha = 0.22;
        ctx.strokeStyle = 'rgba(160,200,255,0.45)';
        ctx.lineWidth = 1.2;
        for (let i = 0; i < anyAst.shapePoints.length; i += 2) {
          const p = anyAst.shapePoints[i];
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x * 0.3, p.y * 0.3);
          ctx.stroke();
        }
        // Sharp specular streaks
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = 'rgba(200,230,255,0.95)';
        ctx.lineWidth = 1.4;
        const streaks = 4;
        for (let i = 0; i < streaks; i++) {
          const ang = -Math.PI / 5 + (i - 1.5) * 0.22;
          const len = r * (1.0 + i * 0.15);
          ctx.beginPath();
          ctx.moveTo(-Math.cos(ang) * len * 0.4, -Math.sin(ang) * len * 0.4);
          ctx.lineTo(Math.cos(ang) * len * 0.4, Math.sin(ang) * len * 0.4);
          ctx.stroke();
        }
        // Bright glints
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = 'rgba(220,240,255,0.98)';
        for (let i = 0; i < 3; i++) {
          const gx = (-0.25 + i * 0.22) * r;
          const gy = (-0.28 + i * 0.18) * r;
          ctx.beginPath();
          ctx.arc(gx, gy, Math.max(1.8, r * 0.035), 0, Math.PI * 2);
          ctx.fill();
        }
        // Subtle inner cold glow for glassy depth
        const core = ctx.createRadialGradient(-r * 0.1, -r * 0.15, 0, 0, 0, r * 1.0);
        core.addColorStop(0, 'rgba(90,110,140,0.10)');
        core.addColorStop(1, 'rgba(90,110,140,0)');
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = core;
        ctx.beginPath();
        anyAst.shapePoints.forEach((p: {x:number,y:number}, i: number) => {
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      
      // Craters: randomized count 1..6, cached for stability
      const craters = anyAst.craters || (() => {
        const list: Array<{x:number,y:number,r:number}> = [];
        let seed = asteroid.position.x * 0.311 + asteroid.position.y * 0.197 + r * 0.421;
        const rand = () => {
          const v = Math.sin(seed * 12.9898) * 43758.5453;
          seed = v;
          return v - Math.floor(v);
        };
        const count = 1 + Math.floor(rand() * 6); // 1..6
        for (let i = 0; i < count; i++) {
          const ang = rand() * Math.PI * 2;
          const rad = rand() * 0.45 + 0.05; // 0.05..0.5 of radius from center
          const cx = Math.cos(ang) * r * rad * 1.6;
          const cy = Math.sin(ang) * r * rad * 1.6;
          const rr = r * (0.06 + rand() * 0.08); // size varies
          list.push({ x: cx, y: cy, r: rr });
        }
        anyAst.craters = list;
        return list;
      })();
      craters.forEach((c: {x:number,y:number,r:number}) => {
        // dark crater base
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        ctx.fill();
        // inner highlight arc
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(c.x - c.r * 0.25, c.y - c.r * 0.25, c.r * 0.65, Math.PI * 0.1, Math.PI * 1.1);
        ctx.stroke();
      });
      
      // Small sparkly highlights
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      for (let i = 0; i < 3; i++) {
        const ang = i * 2 + 0.6;
        const rr = r * (0.25 + 0.12 * i);
        ctx.beginPath();
        ctx.arc(Math.cos(ang) * rr - r * 0.15, Math.sin(ang) * rr - r * 0.15, r * 0.06, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
  };
  
  const drawUI = (ctx: CanvasRenderingContext2D, gameState: GameState) => {
    const now = performance.now();
    const baseAlpha = 0.5;
    ctx.save();
    ctx.globalAlpha = baseAlpha;
    ctx.fillStyle = (now < scoreDropUntilRef.current) ? '#ff5555' : '#ffffff';
    ctx.fillText(`Score: ${gameState.score}`, 20, 40);
    ctx.restore();

  // Stage label, dim
  ctx.save();
  ctx.globalAlpha = baseAlpha;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`Stage: ${gameState.stage}`, 20, 70);
  ctx.restore();

  // Missile counter (top-right): 5 small rocket icons, each represents 5 missiles
  {
    const maxRockets = 5;
    const rocketSize = 12; // smaller rockets
    const rocketGap = 6; // gap between rockets
    const x0 = CANVAS_WIDTH - (maxRockets * (rocketSize + rocketGap)) - 20;
    const y0 = 50; // moved lower
    
    // Get missile count and calculate rocket states
    const pSeg = gameState.player as Player & { missileSegments?: number };
    const totalMissiles = Math.max(0, pSeg.missileSegments || 0);
    
    ctx.save();
    ctx.globalAlpha = 0.95;
    
    for (let r = 0; r < maxRockets; r++) {
      const x = x0 + r * (rocketSize + rocketGap);
      const y = y0;
      
      // Each rocket represents 5 missiles
      const missileStart = r * 5;
      const missilesInThisRocket = Math.max(0, Math.min(5, totalMissiles - missileStart));
      
      // Calculate opacity: full bright if 5, dimmer as count decreases
      const opacity = missilesInThisRocket > 0 ? (0.3 + 0.7 * (missilesInThisRocket / 5)) : 0.1;
      
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.translate(x + rocketSize/2, y + rocketSize/2);
      
      // Draw small rocket shape
      ctx.strokeStyle = '#88cfff';
      ctx.fillStyle = missilesInThisRocket > 0 ? '#cfeeff' : 'rgba(207,238,255,0.2)';
      ctx.lineWidth = 1;
      
      // Simple rocket shape
      ctx.beginPath();
      ctx.moveTo(0, -rocketSize/2); // tip
      ctx.lineTo(-rocketSize/4, rocketSize/4); // left side
      ctx.lineTo(-rocketSize/6, rocketSize/4); // left fin inner
      ctx.lineTo(-rocketSize/6, rocketSize/2); // left fin
      ctx.lineTo(rocketSize/6, rocketSize/2); // right fin
      ctx.lineTo(rocketSize/6, rocketSize/4); // right fin inner
      ctx.lineTo(rocketSize/4, rocketSize/4); // right side
      ctx.closePath();
      
      ctx.fill();
      ctx.stroke();
      
      ctx.restore();
    }
    ctx.restore();
  }

  // Fuel meter (bottom-left)
  {
    const fuel = gameState.player.fuel ?? 0;
    const maxFuel = gameState.player.maxFuel ?? 100;
    const low = gameState.player.fuelLowThreshold ?? Math.floor(maxFuel * 0.25);
    const crit = gameState.player.fuelCriticalThreshold ?? Math.floor(maxFuel * 0.1);
    const pct = Math.max(0, Math.min(1, fuel / maxFuel));
    const x = 20, y = CANVAS_HEIGHT - 40, w = 200, h = 14;
    // Flashing when low/crit
    const isCrit = fuel <= crit;
    const isLow = fuel <= low;
    const flash = isCrit ? (0.5 + 0.5 * Math.sin(now * 0.02)) : (isLow ? (0.7 + 0.3 * Math.sin(now * 0.015)) : 1.0);
    ctx.save();
    // Border
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    // Background
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#222';
    ctx.fillRect(x, y, w, h);
    // Fill
    const color = isCrit ? `rgba(255,50,50,${flash})` : isLow ? `rgba(255,190,60,${flash})` : 'rgba(80,255,120,0.95)';
    ctx.fillStyle = color;
    ctx.globalAlpha = 1.0;
    ctx.fillRect(x, y, w * pct, h);
    // Label
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('FUEL', x, y - 6);
    ctx.restore();

    // Low-fuel beep with rate limiting on threshold crossings
    let level: 'normal' | 'low' | 'critical' = 'normal';
    if (fuel <= crit) level = 'critical'; else if (fuel <= low) level = 'low';
    if (level !== lastFuelWarnLevelRef.current) {
      // Transition
      const cooldownMs = 1500;
      if (now - lastFuelBeepTsRef.current > cooldownMs) {
        try {
          const ss = soundSystem as unknown as { playLowFuelBeep?: (lvl: 'critical' | 'low') => void; playUiBeep?: () => void };
          if (level === 'critical' && typeof ss.playLowFuelBeep === 'function') ss.playLowFuelBeep('critical');
          else if (level === 'low' && typeof ss.playLowFuelBeep === 'function') ss.playLowFuelBeep('low');
          else if (typeof ss.playUiBeep === 'function') ss.playUiBeep();
        } catch { /* ignore */ }
        lastFuelBeepTsRef.current = now;
      }
      lastFuelWarnLevelRef.current = level;
    }

    // Refueled toast
    if (fuel >= maxFuel && prevFuelRef.current < maxFuel) {
      refuelToastUntilRef.current = now + 1200;
    }
    prevFuelRef.current = fuel;
    if (refuelToastUntilRef.current > now) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#c8ffe6';
      ctx.font = 'bold 14px Arial';
      ctx.fillText('REFUELED!', x + w + 16, y + 10);
      ctx.restore();
    }
  }

  // Traction beam and Flipit Reward display
  {
    const traction = tractionBeamRef.current;
    const tractionAugGuard = traction as TractionAug;
    if (traction.active || (tractionAugGuard.textHoldUntil != null && performance.now() < tractionAugGuard.textHoldUntil)) {
      const now = performance.now();
      // Provide current stage snapshot for render (non-behavioral)
      const tractionAug = traction as TractionAug;
      tractionAug.gameState = { stage: gameState.stage };
      // Use tractor beam render helpers
      renderTractorOverlay(ctx, traction, now);
      renderFlipit(ctx, traction, now, CANVAS_WIDTH, CANVAS_HEIGHT);

      // ---- Decode explosion trigger (one-shot) ----
      {
        const t = tractionBeamRef.current;
        if (t.phase === 'displaying' && t.decodeStartTime) {
          const combinedStart = t.decodeStartTime + beamUi.DECODE_DURATION_MS + beamUi.MULTIPLIER_DELAY_MS + 400;
          const tAug = t as TractionAug;
          if (!tAug.decodeExplosionsFired && now >= combinedStart) {
            tAug.decodeExplosionsFired = true;

            ctx.save();
            ctx.font = 'bold 22px Arial';
            const cx = CANVAS_WIDTH / 2;
            const cy = CANVAS_HEIGHT / 2 - 40;

            const pctStr = `${(t.flipitChance * 100).toFixed(1)}%`;
            const stage = gameState.stage;
            const multStr = `×${stage}`;

            const pctW = ctx.measureText(pctStr).width;
            const multW = ctx.measureText(multStr).width;

            const pctX = cx;
            const multX = pctX + pctW / 2 + beamUi.GAP_PCT_TO_MULT + multW / 2;
            const y = cy;

            // Small black puffs along the LEFT text (percent) from left→right
            const leftStart = pctX - pctW / 2;
            const samples = Math.max(3, Math.round(pctW / 40));
            for (let i = 0; i < samples; i++) {
              const sx = leftStart + (i / Math.max(1, samples - 1)) * pctW;
              gameState.explosions.push(createBlackPuffExplosion({ x: sx, y }, 6 + (i % 3)));
            }

            // Multiplier burst at its center
            const mx = multX;
            for (let k = 0; k < 12; k++) {
              gameState.explosions.push(createBlackPuffExplosion({ x: mx, y }, 8));
            }

            ctx.restore();
          }
        }
      }
    }
  }

  // Black frame border and off-screen indicators (framework)
  {
    // Draw black frame border (thin)
    const border = 2;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = border;
    ctx.strokeRect(border * 0.5, border * 0.5, CANVAS_WIDTH - border, CANVAS_HEIGHT - border);
    ctx.restore();

    // Helper to draw directional indicator toward a world-tiled target
    const drawIndicator = (
      target: { tileX: number; tileY: number; position: { x: number; y: number } },
      kind: 'fuel' | 'reward'
    ) => {
      const px = gameState.player.position.x;
      const py = gameState.player.position.y;
      const curTX = gameState.worldTileX ?? 0;
      const curTY = gameState.worldTileY ?? 0;
      const dTX = target.tileX - curTX;
      const dTY = target.tileY - curTY;
      // Chebyshev tile distance (1..9 clamp)
      const tileDist = Math.max(Math.abs(dTX), Math.abs(dTY));
      const wraps = Math.max(1, Math.min(9, tileDist));
      // Direction angle: if target is in another tile, use tile vector; otherwise use in-tile local vector
      const ang = (tileDist > 0)
        ? Math.atan2(dTY, dTX)
        : Math.atan2(target.position.y - py, target.position.x - px);

      // Compute intersection with inner rect (frame minus margin)
      const margin = border * 0.5 + 6;
      const xMin = margin, xMax = CANVAS_WIDTH - margin;
      const yMin = margin, yMax = CANVAS_HEIGHT - margin;

      // Ray from center towards angle; find first intersection with rectangle
      // Parametric form: p + t*v where v = (cos, sin), t > 0
      const vx = Math.cos(ang), vy = Math.sin(ang);
      let t = Infinity;
      let ax = CANVAS_WIDTH / 2, ay = CANVAS_HEIGHT / 2;
      // Intersect with vertical lines x = xMin/xMax
      if (Math.abs(vx) > 1e-5) {
        const t1 = (xMin - ax) / vx;
        const y1 = ay + t1 * vy;
        if (t1 > 0 && y1 >= yMin && y1 <= yMax && t1 < t) t = t1;
        const t2 = (xMax - ax) / vx;
        const y2 = ay + t2 * vy;
        if (t2 > 0 && y2 >= yMin && y2 <= yMax && t2 < t) t = t2;
      }
      // Intersect with horizontal lines y = yMin/yMax
      if (Math.abs(vy) > 1e-5) {
        const t3 = (yMin - ay) / vy;
        const x3 = ax + t3 * vx;
        if (t3 > 0 && x3 >= xMin && x3 <= xMax && t3 < t) t = t3;
        const t4 = (yMax - ay) / vy;
        const x4 = ax + t4 * vx;
        if (t4 > 0 && x4 >= xMin && x4 <= xMax && t4 < t) t = t4;
      }
      if (!isFinite(t) || t === Infinity) return;
      ax = ax + vx * t;
      ay = ay + vy * t;

      // Draw mini icon at (ax, ay) rotated to face inward (opposite of ang)
      // Distance digit already computed above from tiles (Chebyshev)
      ctx.save();
      ctx.translate(ax, ay);
      // Small station or reward icon
      ctx.save();
      ctx.rotate(ang);
      if (kind === 'fuel') {
        // Mini station ring + pylon thumbnail
        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = '#88ffcc';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#66d9aa';
        ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#3a6355';
        ctx.fillRect(-1.5, -12, 3, 6);
      } else {
        // Reward ship mini silhouette
        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = '#cfe3ff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-7, 3);
        ctx.lineTo(0, -6);
        ctx.lineTo(7, 3);
        ctx.lineTo(5, 3);
        ctx.lineTo(0, -1);
        ctx.lineTo(-5, 3);
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();

      // Arrow triangle pointing inward
      ctx.save();
      ctx.rotate(ang);
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-12, -7);
      ctx.lineTo(-12, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Distance digit offset inward from border
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const offX = -18 * Math.cos(ang);
      const offY = -18 * Math.sin(ang);
      ctx.fillText(String(wraps), ax + offX, ay + offY);
      ctx.restore();
      ctx.restore();
    };

    // Render indicators if targets exist
    if (gameState.refuelStation && gameState.refuelStation.position) {
      drawIndicator(gameState.refuelStation, 'fuel');
    }
    if (gameState.rewardShip && gameState.rewardShip.position) {
      drawIndicator(gameState.rewardShip, 'reward');
    }

    // Optional Debug HUD
    if (showDebugHud) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(8, CANVAS_HEIGHT - 88, 260, 80);
      ctx.fillStyle = '#88ffcc';
      ctx.font = '12px monospace';
      const tx = gameState.worldTileX ?? 0;
      const ty = gameState.worldTileY ?? 0;
      const st = gameState.refuelStation;
      const dtx = st ? st.tileX - tx : 0;
      const dty = st ? st.tileY - ty : 0;
      const vel = gameState.player.velocity;
      const keys = Object.keys(gameState.keys).filter(k => gameState.keys[k]).join('');
      ctx.fillText(`Tile: (${tx}, ${ty})`, 14, CANVAS_HEIGHT - 68);
      ctx.fillText(`To Station: dT=(${dtx}, ${dty})`, 14, CANVAS_HEIGHT - 52);
      ctx.fillText(`Vel: (${vel.x.toFixed(2)}, ${vel.y.toFixed(2)})`, 14, CANVAS_HEIGHT - 36);
      ctx.fillText(`Keys: ${keys}`, 14, CANVAS_HEIGHT - 20);
      ctx.restore();
    }
}

// Draw missile popups as mini missile icons flying to HUD slots
if (gameState.missilePopups && gameState.missilePopups.length > 0) {
  for (const p of gameState.missilePopups) {
    const age = Date.now() - p.start;
    const alpha = p.phase === 'hover' ? 1.0 : Math.max(0.6, 1.0 - age / 1600);
    const sc = typeof p.scale === 'number' ? p.scale! : 1.0;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(sc, sc);
    ctx.globalAlpha = alpha;
    // Draw white missile glyph (matching HUD glyph)
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 8;
    ctx.lineWidth = 2;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-8, -5);
    ctx.lineTo(-8, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-11, 0, 3, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

// Lives indicator top-right
const livesText = `Lives: ${gameState.lives}`;
const metrics = ctx.measureText(livesText);
ctx.save();
ctx.globalAlpha = (now < livesBrightUntilRef.current) ? 1.0 : baseAlpha;
// Draw lives text (placeholder for iconography)
ctx.fillStyle = '#ffffff';
ctx.fillText(livesText, CANVAS_WIDTH - metrics.width - 20, 40);
ctx.restore();

// Health bar
const healthBarWidth = 200;
const healthBarHeight = 20;
const healthPercentage = gameState.player.health / gameState.player.maxHealth;

// Health bar (dim by default); brighten on heal; red flash on drop (stays dim)
const healthBright = now < healthBrightUntilRef.current;
const healthDrop = now < healthDropUntilRef.current;
ctx.save();
ctx.globalAlpha = healthBright ? 1.0 : baseAlpha;
// Background bar
ctx.fillStyle = '#333333';
ctx.fillRect(20, 90, healthBarWidth, healthBarHeight);
// Foreground bar
if (healthDrop) {
  ctx.fillStyle = '#ff3333';
} else {
  // Normal green-ish health color
  const pct = Math.max(0, Math.min(1, healthPercentage));
  ctx.fillStyle = pct > 0.5 ? '#00ff66' : '#ffcc00';
}
ctx.fillRect(20, 90, healthBarWidth * Math.max(0, Math.min(1, healthPercentage)), healthBarHeight);
ctx.restore();

ctx.globalAlpha = healthBright ? 1.0 : baseAlpha;
// Background bar
ctx.fillStyle = '#333333';
ctx.fillRect(20, 90, healthBarWidth, healthBarHeight);
// Foreground bar
if (healthDrop) {
  ctx.fillStyle = '#ff3333';
} else {
  // Normal green-ish health color
  const pct = Math.max(0, Math.min(1, healthPercentage));
  ctx.fillStyle = pct > 0.5 ? '#00ff66' : '#ffcc00';
}
ctx.fillRect(20, 90, healthBarWidth * Math.max(0, Math.min(1, healthPercentage)), healthBarHeight);
ctx.restore();

const isHealing = gameState.healEffect > 0;
const healGlowIntensity = isHealing ? (gameState.healEffect / 120) : 0;

// Health bar background
ctx.fillStyle = '#333333';
ctx.fillRect(20, 90, healthBarWidth, healthBarHeight);

// Heal effect glow background
if (isHealing) {
  ctx.shadowColor = '#00ff00';
  ctx.shadowBlur = 20 * healGlowIntensity;
  ctx.fillStyle = `rgba(0, 255, 0, ${0.3 * healGlowIntensity})`;
  ctx.fillRect(15, 85, healthBarWidth + 10, healthBarHeight + 10);
  ctx.shadowBlur = 0;
}

// Health bar fill
let healthColor = healthPercentage > 0.5 ? '#00ff00' : healthPercentage > 0.25 ? '#ffff00' : '#ff0000';
if (isHealing) {
  healthColor = `rgba(0, 255, 0, ${0.8 + 0.2 * healGlowIntensity})`;
}
ctx.fillStyle = healthColor;
ctx.fillRect(20, 90, healthBarWidth * healthPercentage, healthBarHeight);

// Health bar border
ctx.strokeStyle = '#ffffff';
// Removed duplicated UI block
  // Missile lock reticles: seeking (during countdown) and latched (after launch)
  const locking = gameState.alienShips.find(a => (a as AlienShip).isMissileType && (a as AlienShip).lockCountdown && (a as AlienShip).lockCountdown! > 0) as AlienShip | undefined;
  const latched = gameState.alienShips.find(a => (a as AlienShip).isMissileType && (a as AlienShip).lockLatched) as AlienShip | undefined;
  if (locking) {
    // Seeking circle: large ring that orbits around player and converges as lockCountdown approaches zero
    const now = performance.now();
    const lc = Math.max(0, Math.min(90, locking.lockCountdown || 0));
    const tNorm = lc / 90; // 1 -> 0 as it approaches lock
    const orbitR = 30 * tNorm; // wander radius around player
    const ringR = 80 * tNorm + 28; // ring radius shrinks toward ~28px
    const ang = now * 0.006; // slow orbit
    const jitter = Math.sin(now * 0.013) * 0.6;
    const cx = gameState.player.position.x + Math.cos(ang + jitter) * orbitR;
    const cy = gameState.player.position.y + Math.sin(ang - jitter) * orbitR;
    ctx.save();
    ctx.shadowColor = '#ffa43a';
    ctx.shadowBlur = 16;
    ctx.strokeStyle = '#ff9c2e';
    ctx.lineWidth = 3;
    // Single converging ring
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, 2 * Math.PI);
    ctx.stroke();
    // Small animated gaps to suggest targeting
    ctx.lineWidth = 4;
    const segs = 4;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2 + (now * 0.002);
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, a0, a0 + 0.25);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (latched) {
    // Latched target: crosshair stuck on the player's position until missile resolves
    const cx = gameState.player.position.x;
    const cy = gameState.player.position.y;
    const base = 24;
    const glow = 18;
    ctx.save();
    ctx.shadowColor = '#ff5a2e';
    ctx.shadowBlur = glow;
    ctx.strokeStyle = '#ff713a';
    ctx.lineWidth = 3;
    // Small inner circle
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, 2 * Math.PI);
    ctx.stroke();
    // Crosshair ticks
    ctx.beginPath();
    ctx.moveTo(cx - base, cy); ctx.lineTo(cx - base + 10, cy);
    ctx.moveTo(cx + base, cy); ctx.lineTo(cx + base - 10, cy);
    ctx.moveTo(cx, cy - base); ctx.lineTo(cx, cy - base + 10);
    ctx.moveTo(cx, cy + base); ctx.lineTo(cx, cy + base - 10);
    ctx.stroke();
    ctx.restore();
  }
  // Top-center quip overlays (skip song titles - they're handled in bottom area)
  if (titleOverlaysRef.current && titleOverlaysRef.current.length > 0) {
    // Find the first non-song overlay to render at the top; do not remove song titles here
    const idx = titleOverlaysRef.current.findIndex(o => !o.text.startsWith('♪'));
    if (idx >= 0) {
      const overlay = titleOverlaysRef.current[idx];
      const elapsed = performance.now() - overlay.start;
      const hold = 2500; // 2.5s hold
      const fade = 1200; // 1.2s fade
      const total = hold + fade;
      let alpha = 1;
      if (elapsed > hold) {
        const t = Math.min(1, (elapsed - hold) / fade);
        alpha = 1 - t;
      }
      if (elapsed > total) {
        // Remove only the quip we rendered
        titleOverlaysRef.current.splice(idx, 1);
      } else {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'center';
        ctx.shadowColor = '#66ccff';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#cfeeff';
        ctx.font = '20px Arial';
        ctx.fillText(overlay.text, CANVAS_WIDTH / 2, 64);
        ctx.restore();
      }
    }
  }
  };

  // Game loop
  const gameLoop = useCallback(() => {
    if (!gameStateRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gameState = gameStateRef.current;

    // Dev: log every ~30 frames (guarded, no-op in production)
    if (__DEV_MODE__ && (++__frameCounter % 30 === 0)) {
      const gs = gameStateRef.current as any;
      const tractorPhase = gs?.tractorBeam?.phase ?? 'idle';

      console.log({
        frame: __frameCounter,
        asteroidCount: gs?.asteroids?.length ?? 0,
        bulletCount: gs?.bullets?.length ?? 0,
        debrisCount: gs?.visualDebris?.length ?? 0,
        explosionsCount: gs?.explosions?.length ?? 0,
        tractorPhase,
        bgBrightness: gs?.bgBrightness ?? DEFAULT_BG_BRIGHTNESS,
      });
    }

    // Skip gameplay updates if UI is paused (InfoPopup open), but continue rendering
    if (uiPausedRef.current) {
      // Still render the current frame but skip all game state updates
      drawUI(ctx, gameState);
      // Dev: add a lightweight summary roughly every 30 seconds (60fps * 30s = 1800 frames)
    if (__DEV_MODE__) {
      __frameCounter++;
      if (__frameCounter % 1800 === 0) {
        const gs = gameStateRef.current;
        const tractorPhase = gs?.tractorBeam?.phase ?? 'idle';
        const summary = `f=${__frameCounter} ast=${gs?.asteroids?.length ?? 0} bul=${gs?.bullets?.length ?? 0} deb=${gs?.visualDebris?.length ?? 0} exp=${gs?.explosions?.length ?? 0} phase=${tractorPhase} bg=${(gs as any)?.bgBrightness ?? 0.4}`;
        // Mirror to console for parity with existing logs
        // eslint-disable-next-line no-console
        console.log('[summary]', summary);
        // Push to in-app panel buffer (cap 200)
        const arr = debugLinesRef.current;
        arr.push(summary);
        if (arr.length > 200) arr.splice(0, arr.length - 200);
      }
    }

    animationFrameRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    // Auto-open popup 2 seconds after game starts (only once per game session)
    if (!autoPopupShownRef.current && gameStartTimeRef.current > 0 && gameState.gameRunning) {
      const elapsed = performance.now() - gameStartTimeRef.current;
      if (elapsed >= 2000) { // 2 seconds
        autoPopupShownRef.current = true;
        setInfoOpen(true);
      }
    }

    // Draw a tiny floating control for Distortion toggle (top-left under score)
    // Note: kept lightweight; UI paint happens later in drawUI via React

    // Emit scheduled player-death explosions (10 over 2s)
    if (deathBurstsRef.current.remaining > 0 && deathBurstsRef.current.pos) {
      const total = 120; // 2 seconds at 60fps
      const elapsed = total - deathBurstsRef.current.remaining;
      const targetCount = Math.min(10, Math.floor((elapsed / total) * 10));
      while (deathBurstsRef.current.spawned < targetCount) {
        const ang = Math.random() * Math.PI * 2;
        const r = 10 + Math.random() * 50;
        const px = deathBurstsRef.current.pos.x + Math.cos(ang) * r;
        const py = deathBurstsRef.current.pos.y + Math.sin(ang) * r;
        const boom = createExplosion({ x: px, y: py });
        gameState.explosions.push(boom);
        deathBurstsRef.current.spawned++;
      }
      deathBurstsRef.current.remaining--;
      if (deathBurstsRef.current.remaining <= 0) {
        deathBurstsRef.current.pos = null;
      }
    }

    // Apply slow motion during traction beam
    const traction = tractionBeamRef.current;
    const slowMotionFactor = traction.slowMotionActive ? 0.5 : 1.0;
    const deltaTime = 16 * slowMotionFactor;

    // Pass A: compute now/dt once and thread to stubbed update/draw
    const frameNow = performance.now();
    const dt = deltaTime;
    const env = {
      VITE_ENV: import.meta.env?.VITE_ENV,
      DEFAULT_BG_BRIGHTNESS,
      refs: {
        bgImageRef,
        bgImageDataRef,
        bgRawCanvasRef,
        bgOffsetRef,
        bgZoomExtraRef,
        perfModeRef,
        lastMissileEventRef,
        trailsEnabledRef,
        trailsSuspendUntilRef,
        trailsFadeInStartRef,
        trailsStrengthRef,
        bgOpacityRef,
        bgContrastRef,
        bgBrightnessRef,
        effectsApplyRef,
        // Stars and warp particles
        starsRef,
        initialAreaRef,
        isPausedRef,
        warpParticlesRef,
        // Entity draw locals for Pass A shim (player now implemented in module)
        drawAsteroidsLocal: drawAsteroids,
        drawAlienShipsLocal: drawAlienShips,
        drawBulletsLocal: drawBullets,
        drawBonusesLocal: drawBonuses,
        fadeInActiveRef,
        fadeInStartRef,
        distortionRef,
        levelEndStartRef,
        INTRO_ZOOM_DUR_MS,
        START_ZOOM_EXTRA,
        DUCK_HOLD_MS,
        backdrops,
        introZoomStartRef,
      },
    } as const;
    // Forward call sites only; no logic moved yet
    updateFrame(gameState, frameNow, dt, env, soundSystem);

    if (gameState.gameRunning && !isPausedRef.current) {
      // Handle respawn countdown: keep ship centered, invulnerable & shielded
      if (gameState.respawning) {
        gameState.player.position = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
        gameState.player.velocity = { x: 0, y: 0 };
        // Ensure shield/invulnerable last the whole countdown
        gameState.player.invulnerable = Math.max(gameState.player.invulnerable, gameState.respawnCountdown);
        gameState.player.shieldTime = Math.max(gameState.player.shieldTime, gameState.respawnCountdown);
        gameState.respawnCountdown = Math.max(0, gameState.respawnCountdown - 1);
        if (gameState.respawnCountdown === 0) {
          gameState.respawning = false;
          // Start health-fill routine on new life
          gameState.introPhase = 'health-fill';
          gameState.introTimer = 0;
          gameState.player.health = 0;
          const fillFrames = 300;
          gameState.player.shieldTime = Math.max(gameState.player.shieldTime, fillFrames);
          gameState.player.invulnerable = Math.max(gameState.player.invulnerable, fillFrames);
        }
      }
      // Run intro sequence timer (5->4->3->2 drop-in) and end after 2.5s
      if (gameState.introPhase === 'ship-entrance') {
        gameState.introTimer += 16; // ~16ms per frame at 60fps
        if (gameState.introTimer >= 2500) {
          // Fire the big ripple right as Stage 1 begins
          try {
            if (distortionRef.current) {
              const cx = gameState.player.position.x;
              const cy = gameState.player.position.y;
              const startR = 60;
              const growTo = Math.hypot(CANVAS_WIDTH, CANVAS_HEIGHT);
              distortionRef.current.spawn({ cx, cy, durationMs: 2000, radiusPx: startR, growToRadiusPx: growTo, strength: 1.1 });
            }
          } catch {}
          // Transition to health-fill phase: health 0 -> 100 over 5s with shield
          gameState.introPhase = 'health-fill';
          gameState.introTimer = 0;
          gameState.player.health = 0;
          // 5 seconds shield/invulnerability
          const fillFrames = 300;
          gameState.player.shieldTime = Math.max(gameState.player.shieldTime, fillFrames);
          gameState.player.invulnerable = Math.max(gameState.player.invulnerable, fillFrames);
          soundSystem.playTierChangeCue();
        }
      } else if (gameState.introPhase === 'health-fill') {
        gameState.introTimer += 16;
        const t = Math.min(5000, gameState.introTimer);
        const pct = t / 5000;
        gameState.player.health = Math.floor(gameState.player.maxHealth * pct);
        if (gameState.introTimer >= 5000) {
          gameState.player.health = gameState.player.maxHealth;
          gameState.introPhase = 'none';
          gameState.introTimer = 0;
        }
      }

      // Check for tractor-beam gravity well and encounter
      const traction = tractionBeamRef.current;
      const now = performance.now();
      
      // On-top entry progression (replaces behind-entry)
      if (traction.onTopEntry?.inProgress && traction.targetAsteroid) {
        const t = Math.min(1, (now - traction.onTopEntry.startTime) / Math.max(1, traction.onTopEntry.durationMs));
        const ease = t * t * (3 - 2 * t);
        const a = traction.targetAsteroid;
        const ax = a.position.x, ay = a.position.y;
        const dx = ax - gameState.player.position.x;
        const dy = ay - gameState.player.position.y;
        const d = Math.hypot(dx, dy) || 1;
        const ux = dx / d, uy = dy / d;
        const surfaceR = (a.radius || 28) + gameState.player.radius + 4;
        const tx = ax - ux * surfaceR;
        const ty = ay - uy * surfaceR;
        gameState.player.position.x = gameState.player.position.x + (tx - gameState.player.position.x) * ease;
        gameState.player.position.y = gameState.player.position.y + (ty - gameState.player.position.y) * ease;
        if (Math.random() < 0.4) {
          if (!gameState.visualDebris) gameState.visualDebris = [];
          const dust = {
            position: { x: tx, y: ty },
            velocity: { x: (Math.random() - 0.5) * 0.15, y: (Math.random() - 0.5) * 0.15 },
            life: 0,
            maxLife: 180,
            size: 1 + Math.random() * 1.5,
            color: '#6cff9a',
            kind: 'dust' as const,
          } satisfies VisualDebris;
          gameState.visualDebris.push(dust);
        }
        if (t >= 1) {
          traction.onTopEntry.inProgress = false;
          // Begin orbit and start grid scan
          traction.active = true;
          traction.phase = 'attached';
          traction.attachStartTime = now;
          (traction as TractionAug).gameState = { stage: gameState.stage };
          traction._orbitExtendMs = (traction._orbitExtendMs ?? 0) + 800;
          startGridScan(traction, now);
          try { soundSystem.playScanTick?.(); } catch { /* ignore */ }
          (traction as TractionAug)._scanTicking = true;
          (traction as TractionAug)._lastScanTick = now;
        }
      } else if (!traction.active) {
        // Gravity well detection and capture
        const specials = gameState.asteroids.filter(a => a.special === true);
        for (const a of specials) {
          const dx = a.position.x - gameState.player.position.x;
          const dy = a.position.y - gameState.player.position.y;
          const dist = Math.hypot(dx, dy);
          const speed = Math.hypot(gameState.player.velocity.x, gameState.player.velocity.y);
          const captureR = GRAV_WELL_RADIUS_BASE + a.radius;
          // Side/front capture conditions for reliable pulls without bouncing
          {
            const shipV = gameState.player.velocity;
            const astV  = a.velocity;
            const shipSpeed = Math.hypot(shipV.x, shipV.y);
            const astSpeed  = Math.hypot(astV.x, astV.y);
            const captureR2 = a.radius + CAPTURE_RADIUS_EXTRA;
            if (shipSpeed < FAST_FLYBY_SPEED && dist < captureR2) {
              const sameDirection = (shipV.x * astV.x + shipV.y * astV.y) > 0;
              const speedSimilar = shipSpeed >= NEAR_SPEED_MIN && shipSpeed <= NEAR_SPEED_MAX;
              const astDirX = astSpeed ? astV.x / astSpeed : 0;
              const astDirY = astSpeed ? astV.y / astSpeed : 0;
              const ahead = ((gameState.player.position.x - a.position.x) * astDirX + (gameState.player.position.y - a.position.y) * astDirY) > 0;
              const catchingUp = (astSpeed - shipSpeed) > 0.08;
              const angShip = Math.atan2(shipV.y, shipV.x);
              const angAst  = Math.atan2(astV.y, astV.x);
              let angleDeg = Math.abs((angShip - angAst) * 180 / Math.PI);
              if (angleDeg > 180) angleDeg = 360 - angleDeg;
              const withinFrontCone = angleDeg <= FRONT_CONE_DEG;
              const sideCapture  = sameDirection && speedSimilar;
              const frontCapture = ahead && catchingUp && withinFrontCone;
              if (sideCapture || frontCapture) {
                // Gravity pull
                const inv = Math.max(dist, a.radius + 20);
                let accel = GRAV_ACCEL_BASE * (captureR2 / inv) * (captureR2 / inv);
                accel = Math.min(accel, GRAV_ACCEL_MAX);
                const ux = dx / (dist || 1), uy = dy / (dist || 1);
                gameState.player.velocity.x += ux * accel * deltaTime;
                gameState.player.velocity.y += uy * accel * deltaTime;
                // Commit to capture when close enough
                if (dist < a.radius + gameState.player.radius + 6) {
                  traction.active = true;
                  traction.targetAsteroid = a;
                  (traction as TractionAug).targetAsteroidIndex = gameState.asteroids.indexOf(a);
                  traction.phase = 'approaching';
                  traction.startTime = now;
                  traction.slowMotionActive = true;
                  traction.originalAsteroidVelocity = { x: a.velocity.x, y: a.velocity.y };
                  // start on-top entry
                  traction.onTopEntry = { startTime: now, durationMs: 500, inProgress: true };
                  traction.forceFieldUntil = Math.max(traction.forceFieldUntil ?? 0, now + 3000);
                  soundSystem.setMusicVolume(0.5);
                  setActionNotes(prev => [...prev, sideCapture ? 'Capture: side' : 'Capture: front']);
                }
              }
            }
          }
          if (dist < captureR && speed < ESCAPE_SPEED_THRESH) {
            // Start gravity capture window
            if (!traction.gravityCapture) {
              traction.gravityCapture = true;
              traction.fightAllowed = Math.random() < FIGHT_ESCAPE_PROB;
              traction.fightWindowUntil = now + FIGHT_WINDOW_MS;
              traction.targetAsteroid = a;
              (traction as any).targetAsteroidIndex = gameState.asteroids.indexOf(a);
              traction.originalAsteroidVelocity = { x: a.velocity.x, y: a.velocity.y };
              traction.forceFieldUntil = Math.max(traction.forceFieldUntil ?? 0, now + 3000);
              try { soundSystem.playTractorWhoosh?.(); } catch {}
              soundSystem.setMusicVolume(0.5);
              setActionNotes(prev => [...prev, 'Gravity capture start']);
            }
            // Apply gravity pull
            const inv = Math.max(dist, a.radius + 20);
            let accel = GRAV_WELL_STRENGTH * (captureR / inv) * (captureR / inv);
            accel = Math.min(accel, GRAV_WELL_MAX_ACCEL);
            const ux = dx / (dist || 1), uy = dy / (dist || 1);
            const canFight = !!traction.fightAllowed && now < (traction.fightWindowUntil ?? 0);
            const thrustingAway = (gameState.player.velocity.x * ux + gameState.player.velocity.y * uy) < 0;
            const fightFactor = canFight && thrustingAway ? 0.45 : 1.0;
            gameState.player.velocity.x += ux * accel * fightFactor * deltaTime;
            gameState.player.velocity.y += uy * accel * fightFactor * deltaTime;
            // Escape condition
            if (canFight && (speed > ESCAPE_SPEED_THRESH || dist > captureR * 1.15)) {
              traction.gravityCapture = false;
              traction.fightWindowUntil = undefined;
              traction.fightAllowed = undefined;
              traction.targetAsteroid = null;
              setActionNotes(prev => [...prev, 'Fight escape success']);
              break;
            }
            // Capture completion -> on-top entry
            const edge = a.radius + gameState.player.radius + 2;
            if (dist < edge) {
              traction.onTopEntry = { startTime: now, durationMs: 500, inProgress: true };
              traction.gravityCapture = false;
              traction.fightWindowUntil = undefined;
              traction.fightAllowed = undefined;
              setActionNotes(prev => [...prev, 'On-top entry']);
            }
            break;
          }
        }
      }

      // Update asteroids BEFORE traction beam physics to ensure correct positioning
      gameState.asteroids = gameState.asteroids.map(updateAsteroid);

      // IMPORTANT: Rebind traction target to the freshly updated asteroid object
      if (traction.active) {
        const idx = (traction as TractionAug).targetAsteroidIndex;
        if (typeof idx === 'number' && idx >= 0 && idx < gameState.asteroids.length) {
          traction.targetAsteroid = gameState.asteroids[idx];
        } else if (traction.targetAsteroid) {
          // Fallback: find the nearest special asteroid to previous target position
          const prev = traction.targetAsteroid.position;
          let best: Asteroid | null = null;
          let bestD = Infinity;
          for (const a of gameState.asteroids) {
            if (!a.special) continue;
            const dx = a.position.x - prev.x, dy = a.position.y - prev.y; const d = Math.hypot(dx, dy);
            if (d < bestD) { bestD = d; best = a; }
          }
          if (best) {
            traction.targetAsteroid = best;
            (traction as TractionAug).targetAsteroidIndex = gameState.asteroids.indexOf(best);
          }
        }
      }

      // Update player (disabled during respawn countdown)
      if (!gameState.respawning) {
        // Capture previous position before update to detect wrap crossings
        const prevX = gameState.player.position.x;
        const prevY = gameState.player.position.y;
        
        // Handle traction beam physics
        if (traction.active && traction.targetAsteroid) {
          const asteroid = traction.targetAsteroid;
          const dx = asteroid.position.x - gameState.player.position.x;
          const dy = asteroid.position.y - gameState.player.position.y;
          const distance = Math.hypot(dx, dy);
          
          if (traction.phase === 'approaching') {
            // Smooth pull toward asteroid for 3 seconds
            const elapsed = now - traction.startTime;
            if (elapsed < 3000) {
              // Rendezvous plan: both slow and come to rest near each other
              const targetDistance = asteroid.radius + 40;
              const dirX = distance > 0 ? dx / distance : 0;
              const dirY = distance > 0 ? dy / distance : 0;
              // Meeting point where the ship should stop (at desired offset from asteroid)
              const meetX = asteroid.position.x - dirX * targetDistance;
              const meetY = asteroid.position.y - dirY * targetDistance;

              // Pull ship toward meeting point (ease-in)
              const pullStrength = 0.12; // stronger so we settle quickly
              gameState.player.position.x += (meetX - gameState.player.position.x) * pullStrength;
              gameState.player.position.y += (meetY - gameState.player.position.y) * pullStrength;

              // Exponential damping to slow both objects
              gameState.player.velocity.x *= 0.80;
              gameState.player.velocity.y *= 0.80;
              asteroid.velocity.x *= 0.92;
              asteroid.velocity.y *= 0.92;
              
              // Check if user accelerates (breaks traction)
              if (gameState.keys.up || gameState.keys.down) {
                traction.active = false;
                traction.slowMotionActive = false;
                // Clear key states to prevent stuck inputs
                gameState.keys = {};
                // Restore asteroid velocity
                if (traction.originalAsteroidVelocity && traction.targetAsteroid) {
                  traction.targetAsteroid.velocity.x = traction.originalAsteroidVelocity.x;
                  traction.targetAsteroid.velocity.y = traction.originalAsteroidVelocity.y;
                }
                // Restore music volume
                soundSystem.setMusicVolume(1.0);
                setActionNotes(prev => [...prev, "Traction beam broken - player accelerated"]);
              }
            } else {
              // Immediately enter attached rotation (skip hard lock hold) and enable brief force field
              traction.orbitRadius = asteroid.radius + 40;
              traction.orbitAngle = Math.atan2(dy, dx);
              // Stop both so there's no follow jitter
              asteroid.velocity.x = 0;
              asteroid.velocity.y = 0;
              gameState.player.velocity.x = 0;
              gameState.player.velocity.y = 0;
              // Force field window ~4s across early orbit
              traction.forceFieldUntil = now + 4000;
              // Compute skipped lock ms (was ~200ms visual hold)
              traction.skippedLockMs = 200;
              // Start a short glide into the orbit ring
              traction.lockLerpStartTime = now;
              traction.lockLerpDurationMs = 250;
              // Enter attached immediately
              traction.phase = 'attached';
              traction.attachStartTime = now;
              (traction as TractionAug).gameState = { stage: gameState.stage };
              try { soundSystem.playTractorWhoosh(); } catch {}
              setActionNotes(prev => [...prev, "Traction beam locked - ship attached, asteroid slowed"]);
            }
          } else if (traction.phase === 'locking') {
            // Smooth lock-in: glide from current ship position into orbit ring
            if (traction.lockLerpStartTime === 0) {
              traction.lockLerpStartTime = now;
              traction.lockLerpDurationMs = 250;
            }
            const lerpT = Math.max(0, Math.min(1, (now - traction.lockLerpStartTime) / Math.max(1, traction.lockLerpDurationMs)));
            const ease = lerpT * lerpT * (3 - 2 * lerpT); // smoothstep
            const orbitX = asteroid.position.x + Math.cos(traction.orbitAngle) * traction.orbitRadius;
            const orbitY = asteroid.position.y + Math.sin(traction.orbitAngle) * traction.orbitRadius;
            gameState.player.position.x = gameState.player.position.x + (orbitX - gameState.player.position.x) * ease;
            gameState.player.position.y = gameState.player.position.y + (orbitY - gameState.player.position.y) * ease;
            gameState.player.velocity.x = asteroid.velocity.x;
            gameState.player.velocity.y = asteroid.velocity.y;
            if (lerpT >= 1) {
              traction.phase = 'attached';
              traction.attachStartTime = now;
              (traction as TractionAug).gameState = { stage: gameState.stage ?? (gameState as unknown as { level?: number }).level ?? 1 };
            }
          } else if (traction.phase === 'attached') {
            // Smooth orbital motion around asteroid
            const orbitSpeed = 0.02; // Slow, stable orbit
            traction.orbitAngle += orbitSpeed;
            
            const orbitX = asteroid.position.x + Math.cos(traction.orbitAngle) * traction.orbitRadius;
            const orbitY = asteroid.position.y + Math.sin(traction.orbitAngle) * traction.orbitRadius;
            
            gameState.player.position.x = orbitX;
            gameState.player.position.y = orbitY;
            gameState.player.velocity.x = asteroid.velocity.x;
            gameState.player.velocity.y = asteroid.velocity.y;
            // Face tangent while orbiting (ease rotation)
            {
              const targetRot = traction.orbitAngle + Math.PI / 2;
              const d = ((targetRot - gameState.player.rotation + Math.PI) % (Math.PI * 2)) - Math.PI;
              gameState.player.rotation = gameState.player.rotation + d * 0.2;
            }
            // Advance scan grid lifecycle (pause-safe using dt)
            advanceGridScanDt(traction, deltaTime);
            advanceGridRetractDt(traction, deltaTime);
            // Scan SFX tick during fill (rate-limited ~5Hz)
            const tAug = traction as TractionAug & { gridScan?: { active: boolean; complete: boolean } };
            const g = tAug.gridScan;
            if (tAug._scanTicking && g && g.active && !g.complete) {
              const last = tAug._lastScanTick || 0;
              if (now - last > 200) {
                try { soundSystem.playScanTick?.(); } catch { /* ignore */ }
                tAug._lastScanTick = now;
              }
            }
            // On completion (enter retracting), fire complete cue once
            if (g && (g as any).complete && (g as any).retracting && !tAug._gridCompleteSignaled) {
              tAug._gridCompleteSignaled = true;
              tAug._scanTicking = false;
              try { soundSystem.playScanComplete?.(); } catch { /* ignore */ }
            }
            
            // Check if user accelerates (breaks attachment)
            if (gameState.keys.up || gameState.keys.down) {
              traction.active = false;
              traction.slowMotionActive = false;
              // Clear key states to prevent stuck inputs
              gameState.keys = {};
              // Restore asteroid velocity
              if (traction.originalAsteroidVelocity && traction.targetAsteroid) {
                traction.targetAsteroid.velocity.x = traction.originalAsteroidVelocity.x;
                traction.targetAsteroid.velocity.y = traction.originalAsteroidVelocity.y;
              }
              // Restore music volume
              soundSystem.setMusicVolume(1.0);
              setActionNotes(prev => [...prev, "Attachment broken - player accelerated"]);
            } else {
              const elapsed = now - traction.attachStartTime;
              const minAttachMs = 1200;
              if (elapsed > minAttachMs && isGridComplete(traction)) {
                // Start displaying Flipit chance
                traction.phase = 'displaying';
                traction.displayStartTime = now;
                traction.decodeStartTime = now;
                // Ensure stage is on traction for render to read
                (traction as TractionAug).gameState = { stage: gameState.stage };
                // stop any scan ticking
                (traction as TractionAug)._scanTicking = false;
                // Use the locked Flipit chance from the asteroid instead of generating new random number
                traction.flipitChance = asteroid.flipitChance ?? 0.05; // fallback to 5% if not set
                try { soundSystem.playRefuelEnergy?.(); } catch { /* ignore */ }
                setActionNotes(prev => [...prev, `Flipit Reward Chance: ${(traction.flipitChance * 100).toFixed(1)}%`]);
              }
            }
          } else if (traction.phase === 'displaying') {
            // Continue smooth orbit during display
            const orbitSpeed = 0.015; // Slightly slower during display
            traction.orbitAngle += orbitSpeed;
            
            const orbitX = asteroid.position.x + Math.cos(traction.orbitAngle) * traction.orbitRadius;
            const orbitY = asteroid.position.y + Math.sin(traction.orbitAngle) * traction.orbitRadius;
            
            gameState.player.position.x = orbitX;
            gameState.player.position.y = orbitY;
            gameState.player.velocity.x = asteroid.velocity.x;
            gameState.player.velocity.y = asteroid.velocity.y;
            // Face tangent while orbiting (ease rotation)
            {
              const targetRot = traction.orbitAngle + Math.PI / 2;
              const d = ((targetRot - gameState.player.rotation + Math.PI) % (Math.PI * 2)) - Math.PI;
              gameState.player.rotation = gameState.player.rotation + d * 0.2;
            }
            
            // Gate consistency: decode + multiplier + extra reveal + final stay
            const { DECODE_DURATION_MS, MULTIPLIER_DELAY_MS, FINAL_STAY_MS } = beamUi;
            const EXTRA_REVEAL_MS = 400;
            const mustStayUntil = (traction.decodeStartTime || traction.displayStartTime) + DECODE_DURATION_MS + MULTIPLIER_DELAY_MS + EXTRA_REVEAL_MS + FINAL_STAY_MS;
            if (now >= mustStayUntil) {
              // Start pushing away
              traction.phase = 'pushing';
              traction.pushStartTime = now;
              // Impact/bounce cue as player is ejected
              try { soundSystem.playBounce(); } catch { /* no-op */ }
              // Start brief post-push spin
              traction.postPushSpinVel = 0.08;
              traction.postPushSpinUntil = now + 900;
              // Prepare dropped Flipit text: anchor at current ship position with slight drift
              const shipX = gameState.player.position.x;
              const shipY = gameState.player.position.y;
              (traction as any).textAnchorX = shipX;
              (traction as any).textAnchorY = shipY - 30; // center of percentage line
              // Seed with a bit of the player's current velocity plus gentle downward drift
              (traction as any).textVelX = (gameState.player.velocity.x || 0) * 0.08;
              (traction as any).textVelY = (gameState.player.velocity.y || 0) * 0.08 + 0.20;
              (traction as any).textDropStart = now;
              // Hold for 3s, then allow an extra 1s fade window
              (traction as any).textHoldUntil = now + 3000;
              (traction as any).textFadeUntil = now + 4000;
              setActionNotes(prev => [...prev, "Pushed away from special asteroid"]);
            }
          } else if (traction.phase === 'pushing') {
            // Smooth push away from asteroid
            const elapsed = now - traction.pushStartTime;
            const pushDurationMs = 800;
            const pushForceBase = 0.65;
            const pushProgress = Math.min(1, elapsed / pushDurationMs);
            const pushForce = pushForceBase * (1 - pushProgress); // Decreasing push force
            
            const pushAngle = traction.orbitAngle;
            gameState.player.velocity.x += Math.cos(pushAngle) * pushForce;
            gameState.player.velocity.y += Math.sin(pushAngle) * pushForce;
            // Brief damped spin while ejecting
            if (traction.postPushSpinUntil && now < traction.postPushSpinUntil && traction.postPushSpinVel) {
              gameState.player.rotation += traction.postPushSpinVel;
              traction.postPushSpinVel *= 0.92;
            }
            
            if (elapsed > pushDurationMs) {
              // End traction beam sequence
              traction.active = false;
              traction.slowMotionActive = false;
              // Clear key states to prevent stuck inputs
              gameState.keys = {};
              // Restore asteroid velocity
              if (traction.originalAsteroidVelocity && traction.targetAsteroid) {
                traction.targetAsteroid.velocity.x = traction.originalAsteroidVelocity.x;
                traction.targetAsteroid.velocity.y = traction.originalAsteroidVelocity.y;
              }
              // Restore music volume
              soundSystem.setMusicVolume(1.0);
              setActionNotes(prev => [...prev, "Traction beam sequence complete"]);
            }
          }
        }
        // Continue brief post-push spin even after beam deactivates
        {
          const tstate = tractionBeamRef.current;
          if (tstate.postPushSpinUntil && now < tstate.postPushSpinUntil && tstate.postPushSpinVel) {
            gameState.player.rotation += tstate.postPushSpinVel;
            tstate.postPushSpinVel *= 0.92;
          }
        }
        // Only update player normally if not attached to asteroid via traction beam
        const tractionState = tractionBeamRef.current;
        const isAttachedToAsteroid = tractionState.active && (tractionState.phase === 'locking' || tractionState.phase === 'attached');
        
        if (!isAttachedToAsteroid) {
          gameState.player = updatePlayer(gameState.player, gameState.keys, deltaTime);
        }
        
        const curX = gameState.player.position.x;
        const curY = gameState.player.position.y;
        // Detect horizontal wrap edges and update world tile
        const edgeTol = 4;
        if (prevX >= CANVAS_WIDTH - edgeTol && curX <= edgeTol) {
          // moved off right -> appeared on left; advanced one tile to the right
          gameState.worldTileX = (gameState.worldTileX ?? 0) + 1;
        } else if (prevX <= edgeTol && curX >= CANVAS_WIDTH - edgeTol) {
          // moved off left -> appeared on right; moved one tile to the left
          gameState.worldTileX = (gameState.worldTileX ?? 0) - 1;
        }
        // Detect vertical wrap edges and update world tile
        if (prevY >= CANVAS_HEIGHT - edgeTol && curY <= edgeTol) {
          // moved off bottom -> appeared on top; advanced one tile down
          gameState.worldTileY = (gameState.worldTileY ?? 0) + 1;
        } else if (prevY <= edgeTol && curY >= CANVAS_HEIGHT - edgeTol) {
          // moved off top -> appeared on bottom; moved one tile up
          gameState.worldTileY = (gameState.worldTileY ?? 0) - 1;
        }
      }

      // If music is stopped and user did not pause and we're not muted,
      // arm the next-track-on-shot so the next shot starts the next song.
      const ms = soundSystem.getMusicState();
      if (!isMutedRef.current && !musicUserPausedRef.current && !ms.isPlaying && musicAutoStartedRef.current) {
        // Only arm next-track-on-shot after music has played at least once.
        armNextTrackOnShotRef.current = true;
      }

      // Thrust sound control: start/ramp while thrust key is held, stop otherwise
      const thrusting = !!(gameState.keys['ArrowUp'] || gameState.keys['w'] || gameState.keys['W']);
      if (thrusting) {
        soundSystem.startThrust();
        const speed = Math.sqrt(gameState.player.velocity.x ** 2 + gameState.player.velocity.y ** 2);
        const intensity = Math.max(0, Math.min(1, speed / gameState.player.maxSpeed));
        soundSystem.setThrustIntensity(intensity > 0.2 ? intensity : 0.2);
      } else {
        soundSystem.stopThrust();
      }

      // Check if it's time to spawn alien ships
      const currentTime = Date.now();
      const timeSinceStageStart = currentTime - gameState.stageStartTime;
      
      // Spawn asteroids after 1 second
      if (timeSinceStageStart >= 1000 && !gameState.asteroidsSpawned) {
        const newAsteroids = createStageAsteroids(gameState.stage);
        gameState.asteroids = newAsteroids;
        gameState.asteroidsSpawned = true;
      }
      
      // Play scary approach music 2 seconds before alien spawn
      if (timeSinceStageStart >= gameState.stageWaitTime - 2000 && !gameState.alienApproachMusicPlayed) {
        // We need to know which side the alien will approach from
        // Create a temporary alien to get the approach side, then remove it
        const settings = getDifficultySettings();
        const tempAlien = createAlienShip(Math.max(1, gameState.stage + settings.alienDifficultyOffset));
        const approachSide = tempAlien.approachSide;
        alienMusicControlRef.current = soundSystem.playAlienApproachMusic(approachSide);
        // Directional alien incoming cue (double-hit) with initial pan
        const initialPan = approachSide === 'left' ? -1 : approachSide === 'right' ? 1 : 0;
        alienIncomingCtlRef.current?.stop?.();
        alienIncomingCtlRef.current = soundSystem.playAlienIncomingDirectional(initialPan);
        gameState.alienApproachMusicPlayed = true;
      }
      
      // Spawn first alien after 5 seconds (adjusted by difficulty)
      const adjustedWaitTime = gameState.stageWaitTime * getDifficultySettings().alienSpawnDelayMultiplier;
      if (timeSinceStageStart >= adjustedWaitTime && gameState.alienSpawnCount === 0) {
        const settings = getDifficultySettings();
        const alienDiff = Math.max(1, gameState.stage + settings.alienDifficultyOffset);
        const a = createAlienShip(alienDiff, settings.alienSpeedMultiplier);
        // Ensure cue plays if not already (compute pan from position if available)
        if (!alienIncomingCtlRef.current) {
          const pan = panFromX(a.position.x);
          alienIncomingCtlRef.current = soundSystem.playAlienIncomingDirectional(pan);
        }
        if (gameState.stage > 1) {
          (a as AlienShip).isMissileType = true;
          (a as AlienShip).spawnAt = Date.now();
          (a as AlienShip).doomStage = 0;
          soundSystem.playEpicUfo();
          // Immediately duck/pause music and start bad UFO loop for guaranteed behavior
          try { soundSystem.setMusicVolume(0.08); } catch { /* ignore */ }
          try { soundSystem.pauseMusic(); } catch { /* ignore */ }
          try { badUfoLoopCtlRef.current = soundSystem.startBadUfoLoop(1.0); badUfoActiveRef.current = true; musicFadeResumeFramesRef.current = 0; } catch { /* ignore */ }
        }
        gameState.alienShips.push(a);
        gameState.alienSpawnCount++;
      }
      
      // Additional aliens every 30 seconds after the first (adjusted by difficulty)
      const baseSpawnInterval = 30000 * getDifficultySettings().alienSpawnDelayMultiplier;
      const additionalSpawnTime = adjustedWaitTime + (gameState.alienSpawnCount * baseSpawnInterval);
      if (timeSinceStageStart >= additionalSpawnTime && gameState.alienSpawnCount > 0) {
        // Play approach music for additional aliens too
        const settings = getDifficultySettings();
        const tempAlien = createAlienShip(
          Math.max(1, gameState.stage + gameState.alienSpawnCount + settings.alienDifficultyOffset),
          settings.alienSpeedMultiplier
        );
        const approachSide = tempAlien.approachSide;
        alienMusicControlRef.current = soundSystem.playAlienApproachMusic(approachSide);
        // Directional cue for additional spawns as well
        alienIncomingCtlRef.current?.stop?.();
        alienIncomingCtlRef.current = soundSystem.playAlienIncomingDirectional(
          approachSide === 'left' ? -1 : approachSide === 'right' ? 1 : 0
        );
        const alienDiff = Math.max(1, gameState.stage + gameState.alienSpawnCount + settings.alienDifficultyOffset);
        const nextAlien = createAlienShip(alienDiff);
        if (gameState.stage === 1) {
          (nextAlien as AlienShip).isMissileType = false;
        }
        gameState.alienShips.push(nextAlien);
        gameState.alienSpawnCount++;
      }

      // Update bullets
      gameState.bullets = gameState.bullets
        .map(updateBullet)
        .filter(bullet => bullet.life < bullet.maxLife);

      // Update alien bullets
      gameState.alienBullets = gameState.alienBullets
        .map((b: AlienBullet) => {
          // Homing missile steering
          if (b.homing) {
            const speed = Math.hypot(b.velocity.x, b.velocity.y) || 1;
            const desiredDx = gameState.player.position.x + (b.targetOffsetX || 0) - b.position.x;
            const desiredDy = gameState.player.position.y + (b.targetOffsetY || 0) - b.position.y;
            const desiredAngle = Math.atan2(desiredDy, desiredDx);
            const currentAngle = Math.atan2(b.velocity.y, b.velocity.x);
            let diff = desiredAngle - currentAngle;
            while (diff > Math.PI) diff -= 2 * Math.PI;
            while (diff < -Math.PI) diff += 2 * Math.PI;
            const turn = Math.sign(diff) * Math.min(Math.abs(diff), b.turnRate || 0.06);
            const newAngle = currentAngle + turn;
            b.velocity.x = Math.cos(newAngle) * speed;
            b.velocity.y = Math.sin(newAngle) * speed;
            // If missile loses target for too long, self-destruct in place
            const offTarget = Math.abs(diff) > 1.1 || Math.hypot(desiredDx, desiredDy) > 700;
            b.lostFrames = (b.lostFrames || 0) + (offTarget ? 1 : -1);
            if (b.lostFrames! < 0) b.lostFrames = 0;
            if (offTarget && b.lostFrames! > 24) {
              // Self-destruct: spawn white/red debris and remove
              const boom = createExplosion(b.position);
              // Recolor to white/red and add more particles
              boom.particles.forEach(p => { p.color = Math.random() < 0.5 ? '#ffffff' : '#ff3333'; p.maxLife += 20; });
              for (let i = 0; i < 120; i++) {
                boom.particles.push({
                  position: { x: b.position.x, y: b.position.y },
                  velocity: { x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 8 },
                  life: 0,
                  maxLife: 40 + Math.floor(Math.random() * 40),
                  size: 2 + Math.random() * 3,
                  color: Math.random() < 0.5 ? '#ffffff' : '#ff3333',
                });
              }
              gameState.explosions.push(boom);
              soundSystem.playMissileExplosion();
              // Mark bullet as expired immediately
              b.life = b.maxLife;
            }
          }
          return updateAlienBullet(b);
        })
        .filter(bullet => bullet.life < bullet.maxLife);

      // Helper: select highest priority target for player missile
      // Priority: (1) UFOs (missile-type first, then highest health), (2) closest large asteroid, else null (no lock)
      const selectWorstTarget = () => {
        // 1) Missile-type UFO
        const bad = gameState.alienShips.find(s => (s as AlienShip).isMissileType);
        if (bad) return { type: 'alien' as const, obj: bad };
        // 2) Other UFOs by highest health
        let bestAlien: AlienShip | null = null;
        let bestHealth = -1;
        for (const s of gameState.alienShips) {
          if ((s as AlienShip).isMissileType) continue;
          if (s.health > bestHealth) { bestAlien = s; bestHealth = s.health; }
        }
        if (bestAlien) return { type: 'alien' as const, obj: bestAlien };
        // 3) Closest large asteroid to the player
        let closest: Asteroid | null = null;
        let bestD = Infinity;
        const px = gameState.player.position.x, py = gameState.player.position.y;
        for (const a of gameState.asteroids) {
          if (a.size !== 'large') continue;
          const dx = a.position.x - px, dy = a.position.y - py; const d = Math.hypot(dx, dy);
          if (d < bestD) { bestD = d; closest = a; }
        }
        if (closest) return { type: 'asteroid' as const, obj: closest };
        return null; // no lock
      };

      // Update player missiles: smarter targeting, record path history, emit smoke; handle hits
      if (!gameState.playerMissiles) gameState.playerMissiles = [];
      gameState.playerMissiles = gameState.playerMissiles
        .map((m: AlienBullet) => {
          // Always re-acquire a live target from current game state each frame
          const reacq = selectWorstTarget();
          const targetObj: any = reacq ? reacq.obj : null;
          const targetType: 'alien' | 'asteroid' | undefined = reacq ? reacq.type : undefined;
          // Two-phase behavior: first straight for ~1s, then homing.
          const nowMs = performance.now();
          const bornAt = (m as any).bornAt || nowMs;
          const straightMs = (m as any).straightMs || 1000;
          if (nowMs - bornAt < straightMs) {
            // Phase 1: straight & slow
            const speed = 2.6; // slow forward for dramatics
            const ang = Math.atan2(m.velocity.y, m.velocity.x);
            m.velocity.x = Math.cos(ang) * speed;
            m.velocity.y = Math.sin(ang) * speed;
          } else if (targetObj && targetObj.position) {
            // Live target position (no stored spot) with predictive lead using target velocity if available
            const tvx = targetObj.velocity ? targetObj.velocity.x || 0 : 0;
            const tvy = targetObj.velocity ? targetObj.velocity.y || 0 : 0;
            const baseTx = targetObj.position.x + (m.targetOffsetX || 0);
            const baseTy = targetObj.position.y + (m.targetOffsetY || 0);
            const dx0 = baseTx - m.position.x; const dy0 = baseTy - m.position.y;
            const dist0 = Math.hypot(dx0, dy0) || 1;
            let speed = Math.hypot(m.velocity.x, m.velocity.y) || 1;
            const tgtSpeed = Math.hypot(tvx, tvy);
            // Lead time in frames: scaled by distance and relative speed, clamped to [4..30] frames
            const denom = Math.max(0.1, speed + tgtSpeed);
            const leadFrames = Math.max(4, Math.min(30, Math.floor((dist0 / denom) * 0.6)));
            const tx = baseTx + tvx * leadFrames;
            const ty = baseTy + tvy * leadFrames;
            const desiredAngle = Math.atan2(ty - m.position.y, tx - m.position.x);
            const currentAngle = Math.atan2(m.velocity.y, m.velocity.x);
            let diff = desiredAngle - currentAngle;
            while (diff > Math.PI) diff -= 2 * Math.PI;
            while (diff < -Math.PI) diff += 2 * Math.PI;
            const turn = Math.sign(diff) * Math.min(Math.abs(diff), m.turnRate || 0.12);
            const newAngle = currentAngle + turn;
            // Acceleration toward target when aligned; maintain a healthy floor otherwise
            // On phase transition into homing, briefly clamp down speed to grab the turn, then accelerate
            if ((m as any).phase !== 'homing') {
              speed = Math.min(speed, 3.8);
              (m as any).phase = 'homing';
              // Audio cue for missile accelerating into homing
              try { soundSystem.playMissileStage2(); } catch { /* no-op */ }
            }
            const aligned = Math.abs(diff) < 0.30 && ((m.targetOffsetX || 0) === 0) && ((m.targetOffsetY || 0) === 0);
            const cap = 7.8; // px/frame cap
            const floor = 4.2; // stronger base speed
            if (aligned) {
              speed = Math.min(cap, speed * 1.10);
            }
            speed = Math.max(floor, Math.min(cap, speed));
            m.velocity.x = Math.cos(newAngle) * speed;
            m.velocity.y = Math.sin(newAngle) * speed;
            // Incidental collision: if we bump into another object en route (not the selected target),
            // explode and apply 20% damage of that object's max health
            {
              const thresh = (targetObj.radius || 6) + 10;
              // Check aliens first (excluding targetObj)
              let collided: { kind: 'alien' | 'asteroid'; obj: any } | null = null;
              for (const a of gameState.alienShips) {
                if (a === targetObj) continue;
                const ddx = a.position.x - m.position.x;
                const ddy = a.position.y - m.position.y;
                if (Math.hypot(ddx, ddy) < ((a.radius || 12) + 6)) { collided = { kind: 'alien', obj: a }; break; }
              }
              if (!collided) {
                for (const a of gameState.asteroids) {
                  if (a === targetObj) continue;
                  const ddx = a.position.x - m.position.x;
                  const ddy = a.position.y - m.position.y;
                  if (Math.hypot(ddx, ddy) < ((a.radius || 12) + 6)) { collided = { kind: 'asteroid', obj: a }; break; }
                }
              }
              if (collided) {
                const hit = collided.obj;
                const boom = createExplosion({ x: hit.position.x, y: hit.position.y });
                for (let i = 0; i < 60; i++) {
                  boom.particles.push({
                    position: { x: hit.position.x, y: hit.position.y },
                    velocity: { x: (Math.random() - 0.5) * 7, y: (Math.random() - 0.5) * 7 },
                    life: 0,
                    maxLife: 40 + Math.floor(Math.random() * 50),
                    size: 2 + Math.random() * 3,
                    color: Math.random() < 0.5 ? '#ffffff' : '#ff6666',
                  });
                }
                gameState.explosions.push(boom);
                soundSystem.playMissileExplosion();
                // Apply 20% of max health damage to the incidental object
                if (collided.kind === 'alien') {
                  const maxH = Math.max(1, hit.maxHealth || hit.health || 1);
                  const dmg = maxH * 0.2;
                  hit.health = Math.max(0, (hit.health || maxH) - dmg);
                  if (hit.health <= 0) {
                    gameState.alienShips = gameState.alienShips.filter(s => s !== hit);
                  }
                } else {
                  const maxH = Math.max(1, hit.maxHealth || hit.health || 1);
                  const dmg = maxH * 0.2;
                  hit.health = Math.max(0, (hit.health || maxH) - dmg);
                  // Distortion only for special asteroid incidental bump
                  const isSpecial = !!(hit as any).special;
                  if (isSpecial) {
                    try {
                      if (distortionRef.current) {
                        distortionRef.current.spawn({ cx: hit.position.x, cy: hit.position.y, durationMs: 420, radiusPx: 160, strength: 0.9 });
                      }
                    } catch {}
                  }
                  if (hit.health <= 0) {
                    try {
                      if (isSpecial && distortionRef.current) {
                        const bigR = Math.min(CANVAS_WIDTH, CANVAS_HEIGHT) * 0.4;
                        distortionRef.current.spawn({ cx: hit.position.x, cy: hit.position.y, durationMs: 700, radiusPx: bigR, strength: 1.1 });
                      }
                    } catch {}
                    gameState.asteroids = gameState.asteroids.filter(a => a !== hit);
                  }
                }
                m.life = m.maxLife; // expire missile on incidental collision
              }
            }
            // Collision check (simple radius overlap)
            const dx = baseTx - m.position.x; const dy = baseTy - m.position.y;
            const dist = Math.hypot(dx, dy);
            if (dist < ((targetObj.radius || 6) + 10)) {
              const boom = createExplosion({ x: targetObj.position.x, y: targetObj.position.y });
              // Fewer extra particles to avoid wash
              for (let i = 0; i < 90; i++) {
                boom.particles.push({
                  position: { x: targetObj.position.x, y: targetObj.position.y },
                  velocity: { x: (Math.random() - 0.5) * 9, y: (Math.random() - 0.5) * 9 },
                  life: 0,
                  maxLife: 50 + Math.floor(Math.random() * 60),
                  size: 2 + Math.random() * 3.5,
                  color: Math.random() < 0.5 ? '#ffffff' : '#ff3333',
                });
              }
              gameState.explosions.push(boom);
              soundSystem.playMissileExplosion();
              if (targetType === 'alien') {
                // Random damage between 20% and 50% of max health
                const maxH = Math.max(1, targetObj.maxHealth || targetObj.health || 1);
                const dmg = maxH * (0.2 + Math.random() * 0.3);
                targetObj.health = Math.max(0, (targetObj.health || maxH) - dmg);
                if (targetObj.health <= 0) {
                  gameState.alienShips = gameState.alienShips.filter(s => s !== targetObj);
                }
              } else if (targetType === 'asteroid') {
                // Special large asteroid: apply damage and spawn distortion pulse on each hit; bigger pulse on break
                const isSpecial = !!(targetObj as any).special;
                if (isSpecial) {
                  // Damage: ~33% of max per primary hit (require multiple hits)
                  const maxH = Math.max(1, targetObj.maxHealth || targetObj.health || 1);
                  const dmg = Math.max(1, Math.floor(maxH * 0.33));
                  targetObj.health = Math.max(0, (targetObj.health || maxH) - dmg);
                  // Spawn a smaller pulse on each hit
                  try {
                    if (distortionRef.current) {
                      distortionRef.current.spawn({ cx: targetObj.position.x, cy: targetObj.position.y, durationMs: 450, radiusPx: 160, strength: 0.9 });
                    }
                  } catch {}
                  // If broken, spawn larger pulse and remove
                  if (targetObj.health <= 0) {
                    try {
                      if (distortionRef.current) {
                        const bigR = Math.min(CANVAS_WIDTH, CANVAS_HEIGHT) * 0.4;
                        distortionRef.current.spawn({ cx: targetObj.position.x, cy: targetObj.position.y, durationMs: 700, radiusPx: bigR, strength: 1.1 });
                      }
                    } catch {}
                    gameState.asteroids = gameState.asteroids.filter(a => a !== targetObj);
                  }
                } else {
                  // Non-special asteroid: no distortion pulse (per request)
                  if (targetObj.health <= 0) {
                    gameState.asteroids = gameState.asteroids.filter(a => a !== targetObj);
                  }
                }
              }
              m.life = m.maxLife; // expire missile
            }
          } else {
            // No valid target: fly straight (keep current velocity)
          }
          // Update physics
          m = updateAlienBullet(m);
          // Append to path history (for true trail) - only for primary (non-extra)
          if (!(m as any).isExtra) {
            const hist = ((m as any).history as Array<{x:number,y:number}>) || []; 
            hist.push({ x: m.position.x, y: m.position.y });
            while (hist.length > 24) hist.shift();
            (m as any).history = hist;
          }
          // Emit small smoke debris along path (skip for extras to keep them simple)
          const nowSmk = performance.now();
          const lastSmk = (m as any).lastSmokeAt || 0;
          if (!(m as any).isExtra && nowSmk - lastSmk > 40) {
            (m as any).lastSmokeAt = nowSmk;
            const jx = (Math.random() - 0.5) * 0.8, jy = (Math.random() - 0.5) * 0.8;
            if (!(gameState as any).visualDebris) {
              (gameState as any).visualDebris = [];
            }
            (gameState as any).visualDebris.push({ x: m.position.x + jx, y: m.position.y + jy, vx: (Math.random()-0.5)*0.6, vy: (Math.random()-0.5)*0.6, life: 28 + Math.floor(Math.random()*10), size: 2 + Math.random()*2, color: 'rgba(255,255,255,0.25)' });
          }
          return m;
        })
        .filter(bullet => bullet.life < bullet.maxLife);

      // Update alien ships and handle their shooting
      gameState.alienShips = gameState.alienShips.map(ship => {
        const updated = updateAlienShip(ship, gameState.player.position, Date.now(), gameState.asteroids);
        // If UFO collides with an asteroid, knock it off path and set knockedTimer to force recalculation
        for (const a of gameState.asteroids) {
          const dx = a.position.x - updated.position.x;
          const dy = a.position.y - updated.position.y;
          const dist = Math.hypot(dx, dy);
          if (dist < a.radius + updated.radius) {
            const nx = dist > 0 ? dx / dist : Math.cos(updated.rotation + Math.PI / 2);
            const ny = dist > 0 ? dy / dist : Math.sin(updated.rotation + Math.PI / 2);
            // Push UFO away
            updated.position.x -= nx * 4;
            updated.position.y -= ny * 4;
            // Redirect velocity perpendicular a bit and dampen
            const tangentX = -ny;
            const tangentY = nx;
            const speed = Math.hypot(updated.velocity.x, updated.velocity.y) || 1;
            updated.velocity.x = tangentX * speed * 0.6;
            updated.velocity.y = tangentY * speed * 0.6;
            // Set knocked cooldown
            (updated as unknown as AlienShip).knockedTimer = 90; // ~1.5s
            break;
          }
        }
        
        // Play alien engine sound based on distance to player
        const dx = gameState.player.position.x - updated.position.x;
        const dy = gameState.player.position.y - updated.position.y;
        const distanceToPlayer = Math.sqrt(dx * dx + dy * dy);
        
        // Play engine sound occasionally (every ~30 frames) to avoid spam
        if (Math.random() < 0.03) {
          soundSystem.playAlienEngine(distanceToPlayer);
        }
        
        // Missile-type standoff movement, doom sequence, and lock/launch timeline
        if ((updated as AlienShip).isMissileType) {
          // Track lifetime frames for deterministic timing
          (updated as AlienShip).aliveFrames = ((updated as AlienShip).aliveFrames || 0) + 1;
          const desiredMin = 380;
          const desiredMax = 520;
          if (distanceToPlayer < desiredMin) {
            // Nudge away from player
            const ux = -dx / (distanceToPlayer || 1);
            const uy = -dy / (distanceToPlayer || 1);
            updated.velocity.x += ux * 0.25;
            updated.velocity.y += uy * 0.25;
          } else if (distanceToPlayer > desiredMax) {
            // Nudge slightly toward to regain standoff
            const ux = dx / (distanceToPlayer || 1);
            const uy = dy / (distanceToPlayer || 1);
            updated.velocity.x += ux * 0.12;
            updated.velocity.y += uy * 0.12;
          }

          // Doom sequence progression (after 30s alive)
          if (typeof (updated as AlienShip).spawnAt !== 'number') {
            (updated as AlienShip).spawnAt = Date.now();
          }
          const aliveMs = Date.now() - ((updated as AlienShip).spawnAt || Date.now());
          const aliveFrames = (updated as AlienShip).aliveFrames || 0;
          const dStage = (updated as AlienShip).doomStage || 0;
          if (dStage === 0 && (aliveMs >= 30000 || aliveFrames >= 1800)) {
            (updated as AlienShip).doomStage = 1; // move to center
            (updated as AlienShip).doomTimer = 180; // 3s budget
          }
          if ((updated as AlienShip).doomStage && (updated as AlienShip).doomStage! >= 1) {
            const cx = CANVAS_WIDTH / 2, cy = CANVAS_HEIGHT / 2;
            const stage = (updated as AlienShip).doomStage!;
            if (stage === 1) {
              // Force move to center
              const ddx = cx - updated.position.x; const ddy = cy - updated.position.y;
              const dist = Math.hypot(ddx, ddy) || 1;
              const ux2 = ddx / dist, uy2 = ddy / dist;
              updated.velocity.x = ux2 * 2.5;
              updated.velocity.y = uy2 * 2.5;
              (updated as AlienShip).doomTimer = Math.max(0, ((updated as AlienShip).doomTimer || 0) - 1);
              if (dist < 8 || (updated as AlienShip).doomTimer === 0) {
                updated.position.x = cx; updated.position.y = cy;
                updated.velocity.x = 0; updated.velocity.y = 0;
                (updated as AlienShip).doomStage = 2; // vibrate
                (updated as AlienShip).doomTimer = 90; // 1.5s
              }
            } else if (stage === 2) {
              // Vibrate at center
              updated.velocity.x = 0; updated.velocity.y = 0;
              (updated as AlienShip).doomTimer = Math.max(0, ((updated as AlienShip).doomTimer || 0) - 1);
              if ((updated as AlienShip).doomTimer === 0) {
                (updated as AlienShip).doomStage = 3; // shrink
                (updated as AlienShip).doomTimer = 60; // 1s
              }
            } else if (stage === 3) {
              // Shrink to dot; next frame will post-process collapse
              updated.velocity.x = 0; updated.velocity.y = 0;
              (updated as AlienShip).doomTimer = Math.max(0, ((updated as AlienShip).doomTimer || 0) - 1);
              if ((updated as AlienShip).doomTimer === 0) {
                (updated as AlienShip).doomStage = 4; // collapse complete (handled after map)
              }
            }
            // While in doom sequence, skip lock/launch behavior
            return updated;
          }

          // Start or manage lock countdown independent of old shooting range
          const vx = Math.cos(updated.rotation);
          const vy = Math.sin(updated.rotation);
          const px = dx / (distanceToPlayer || 1);
          const py = dy / (distanceToPlayer || 1);
          const approaching = (px * (-vx) + py * (-vy)) > 0.6; // player heading toward ship
          // Begin lock if not locking and conditions favorable (more permissive)
          const angleToPlayer = Math.atan2(dy, dx);
          const facingError = Math.abs(((angleToPlayer - updated.rotation + Math.PI) % (2 * Math.PI)) - Math.PI);
          if ((!updated.lockCountdown || updated.lockCountdown <= 0)
              && !approaching
              && distanceToPlayer >= 340 && distanceToPlayer <= 560
              && facingError < 0.8) {
            updated.lockCountdown = 60; // faster lock (~1.0s)
          }
          if (updated.lockCountdown && updated.lockCountdown > 0) {
            // Cancel lock if player rushes
            if ((approaching && distanceToPlayer < 280) || distanceToPlayer < 240 || facingError > 1.2) {
              updated.lockCountdown = 0;
            } else {
              updated.lockCountdown--;
              // Launch when done
              if (updated.lockCountdown === 0) {
                const angleToPlayer = Math.atan2(dy, dx);
                // Improve accuracy the longer UFO remains: lower miss chance as shotCount grows
                const acc = Math.min(0.9, updated.shotCount * 0.08);
                const missProb = Math.max(0.1, 0.6 - acc);
                const miss = Math.random() < missProb;
                const missile: AlienBullet = createAlienBullet(updated.position, angleToPlayer);
                missile.homing = true;
                missile.turnRate = 0.06;
                const baseSpeed = 3.0;
                missile.velocity = multiplyVector({ x: Math.cos(angleToPlayer), y: Math.sin(angleToPlayer) }, baseSpeed);
                missile.radius = 4;
                missile.maxLife = 240; // ~4s
                missile.damageMultiplier = 2;
                missile.explosionRadius = 60;
                missile.locked = true; missile.lostFrames = 0; missile.selfDestruct = 180;
                if (miss) {
                  const ang = angleToPlayer + (Math.random() - 0.5) * 1.2;
                  const r = 80 + Math.random() * 120;
                  missile.targetOffsetX = Math.cos(ang) * r;
                  missile.targetOffsetY = Math.sin(ang) * r;
                } else {
                  missile.targetOffsetX = 0;
                  missile.targetOffsetY = 0;
                }
                // Mark UFO reticle as latched during missile flight
                (updated as AlienShip).lockLatched = true;
                (updated as AlienShip).lockLatchedTimer = Math.max((updated as AlienShip).lockLatchedTimer || 0, 240);
                // Play lock/launch cue now that lock is confirmed
                soundSystem.playMissileWarning();
                soundSystem.playMissileLaunch();
                gameState.alienBullets.push(missile);
              }
            }
          }
        }

        // Alien shooting logic (skip legacy shots for missile-type; firing handled by lock timeline)
        const frameCount = Math.floor(timeSinceStageStart / 16.67); // Approximate frame count
        if (frameCount - updated.lastShot >= updated.fireRate) {
          // Calculate distance to player for shooting accuracy
          
          // Only shoot if player is within range
          if (distanceToPlayer < 300) {
            updated.shotCount++;
            
            if (!(updated as AlienShip).isMissileType) {
              // Legacy UFO behavior: lasers every 5th shot, regular otherwise
              if (updated.shotCount % 5 === 0) {
                // Laser shot with 50% accuracy
                const angleToPlayer = Math.atan2(dy, dx);
                const accuracy = Math.random() < 0.5 ? 0 : (Math.random() - 0.5) * 0.3; // 50% chance of perfect shot
                const shootAngle = angleToPlayer + accuracy;
                const laserBullet = createAlienBullet(updated.position, shootAngle);
                laserBullet.velocity = multiplyVector(laserBullet.velocity, 2); // Twice as fast
                laserBullet.radius = 4; // Larger
                gameState.alienBullets.push(laserBullet);
              } else {
                // Regular shot
                const angleToPlayer = Math.atan2(dy, dx);
                const inaccuracy = (6 - Math.min(updated.difficulty, 5)) * 0.1;
                const shootAngle = angleToPlayer + (Math.random() - 0.5) * inaccuracy;
                gameState.alienBullets.push(createAlienBullet(updated.position, shootAngle));
                try {
                  const panProvider = () => {
                    const nx = (updated.position.x / CANVAS_WIDTH) * 2 - 1;
                    return Math.max(-1, Math.min(1, nx));
                  };
                  soundSystem.playAlienShootPanned(panProvider);
                } catch { /* ignore */ }
              }
            }
            
            updated.lastShot = frameCount;
          }
        }
        
        return updated;
      });

      // Decrement lock-latched timers and post-process doom completions
      (gameState.alienShips as AlienShip[]).forEach(s => {
        if (s.isMissileType && s.lockLatched) {
          s.lockLatchedTimer = Math.max(0, (s.lockLatchedTimer || 0) - 1);
          if (s.lockLatchedTimer === 0) s.lockLatched = false;
        }
      });
      // Post-process doom completions: spawn 5 normal UFOs from center and remove the missile-type that collapsed
      const spawnList: AlienShip[] = [];
      const survivors: AlienShip[] = [];
      (gameState.alienShips as AlienShip[]).forEach(s => {
        if (s.isMissileType && s.doomStage === 4) {
          const cx = CANVAS_WIDTH / 2, cy = CANVAS_HEIGHT / 2;
          // Flash effect
          const flash = createExplosion({ x: cx, y: cy });
          flash.particles.forEach(p => { p.color = '#ffffff'; p.size *= 2; p.maxLife += 20; });
          gameState.explosions.push(flash);
          // Spawn 5 normal UFOs in a star pattern
          const settings = getDifficultySettings();
          for (let i = 0; i < 5; i++) {
            const a = createAlienShip(Math.max(1, gameState.stage + settings.alienDifficultyOffset), settings.alienSpeedMultiplier);
            (a as AlienShip).isMissileType = false;
            const ang = (i / 5) * Math.PI * 2;
            const r = 80;
            a.position = { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r };
            a.velocity = { x: Math.cos(ang) * 1.5, y: Math.sin(ang) * 1.5 };
            spawnList.push(a as AlienShip);
          }
        } else {
          survivors.push(s);
        }
      });
      gameState.alienShips = survivors.concat(spawnList);

      // === Bad UFO music logic ===
      const hasMissileUfo = (gameState.alienShips as AlienShip[]).some(s => s.isMissileType);
      if (hasMissileUfo && !badUfoActiveRef.current) {
        // Duck quickly and pause the stage music, then start the bad UFO loop
        try { soundSystem.setMusicVolume(0.08); } catch { /* ignore */ }
        // Capture current playback index and offset so we can resume from the same spot later
        try {
          const info = soundSystem.getPlaybackInfo();
          if (typeof info.index === 'number' && typeof info.offsetSec === 'number') {
            badUfoMusicMemRef.current = { index: info.index, offsetSec: Math.max(0, info.offsetSec) };
          }
        } catch { /* ignore */ }
        try { soundSystem.pauseMusic(); } catch { /* ignore */ }
        badUfoLoopCtlRef.current = soundSystem.startBadUfoLoop(1.0);
        badUfoActiveRef.current = true;
        musicFadeResumeFramesRef.current = 0;
      } else if (!hasMissileUfo && badUfoActiveRef.current) {
        // Bad UFO gone: fade loop, play victory cue, resume and fade music back up
        try { soundSystem.fadeOutBadUfoLoop(1000); } catch { /* ignore */ }
        badUfoLoopCtlRef.current = null;
        // Use an existing strong cue as a victory placeholder
        try { soundSystem.playLargeAsteroidDestroy(); } catch { /* ignore */ }
        // Rewind song to the exact position we captured when the scene began
        try {
          if (badUfoMusicMemRef.current) {
            soundSystem.setResumePoint(badUfoMusicMemRef.current.index, badUfoMusicMemRef.current.offsetSec);
          }
        } catch { /* ignore */ }
        try { soundSystem.resumeMusic(); soundSystem.setMusicVolume(0.1); } catch { /* ignore */ }
        badUfoMusicMemRef.current = null;
        musicFadeResumeFramesRef.current = 180; // 3 seconds fade-up
        badUfoActiveRef.current = false;
      }

      // Smoothly fade music back up after resume
      if (musicFadeResumeFramesRef.current > 0) {
        const left = musicFadeResumeFramesRef.current;
        const t = 1 - left / 180;
        const vol = 0.1 + t * (1.0 - 0.1);
        try { soundSystem.setMusicVolume(vol); } catch { /* ignore */ }
        musicFadeResumeFramesRef.current = Math.max(0, left - 1);
      }

      // Handle large-asteroid vs large-asteroid collisions (bounce without damage)
      if (gameState.asteroids.length > 1) {
        const nowTs = performance.now();
        for (let i = 0; i < gameState.asteroids.length; i++) {
          const a = gameState.asteroids[i];
          for (let j = i + 1; j < gameState.asteroids.length; j++) {
            const b = gameState.asteroids[j];
            // Only handle: large-large and large-medium (not medium-medium)
            const isLL = (a.size === 'large' && b.size === 'large');
            const isLM = (a.size === 'large' && b.size === 'medium') || (a.size === 'medium' && b.size === 'large');
            if (!isLL && !isLM) continue;
            const dx = b.position.x - a.position.x;
            const dy = b.position.y - a.position.y;
            const dist = Math.hypot(dx, dy);
            const rSum = (a.radius || 0) + (b.radius || 0);
            if (dist > 0 && dist < rSum) {
              // Normalize collision normal
              const nx = dx / dist;
              const ny = dy / dist;
              // Minimum translation to resolve interpenetration
              const overlap = rSum - dist;
              const m1 = a.mass || 1;
              const m2 = b.mass || 1;
              const totalM = m1 + m2;
              const pushA = (overlap * (m2 / totalM));
              const pushB = (overlap * (m1 / totalM));
              a.position.x -= nx * pushA;
              a.position.y -= ny * pushA;
              b.position.x += nx * pushB;
              b.position.y += ny * pushB;

              // Relative velocity along normal
              const rvx = (a.velocity.x || 0) - (b.velocity.x || 0);
              const rvy = (a.velocity.y || 0) - (b.velocity.y || 0);
              const velAlongNormal = rvx * nx + rvy * ny;
              if (velAlongNormal < 0) {
                const restitution = 0.8; // a bit bouncy
                const jImpulse = -(1 + restitution) * velAlongNormal / (1 / m1 + 1 / m2);
                const ix = jImpulse * nx;
                const iy = jImpulse * ny;
                a.velocity.x = (a.velocity.x || 0) + ix / m1;
                a.velocity.y = (a.velocity.y || 0) + iy / m1;
                b.velocity.x = (b.velocity.x || 0) - ix / m2;
                b.velocity.y = (b.velocity.y || 0) - iy / m2;
              }

              // SFX and black puff explosions with cooldown
              const lastA = asteroidBounceCooldownRef.current.get(a) ?? 0;
              const lastB = asteroidBounceCooldownRef.current.get(b) ?? 0;
              if (nowTs - Math.max(lastA, lastB) > 220) {
                // Only play SFX if one is the special hard-to-break dark one; pan to that asteroid and follow it
                const involvesSpecial = !!(a.special || b.special);
                if (involvesSpecial) {
                  try {
                    const target = a.special ? a : (b.special ? b : a);
                    const sizeForSound: 'large' | 'medium' = isLL ? 'large' : 'medium';
                    const panProvider = () => {
                      const nx = (target.position.x / CANVAS_WIDTH) * 2 - 1; // -1..1
                      return Math.max(-1, Math.min(1, nx));
                    };
                    soundSystem.playAsteroidCollisionPanned(sizeForSound, panProvider, 500);
                  } catch { /* ignore */ }
                }
                asteroidBounceCooldownRef.current.set(a, nowTs);
                asteroidBounceCooldownRef.current.set(b, nowTs);
                const cx = (a.position.x + b.position.x) / 2;
                const cy = (a.position.y + b.position.y) / 2;
                // 2-3 subtle black puffs with boosted intensity based on sizes
                const count = 2 + Math.floor(Math.random() * 2);
                for (let k = 0; k < count; k++) {
                  const base = 6 + Math.floor(Math.random() * 4); // 6-9
                  const boost = isLL ? 5 : (isLM ? 3 : 0);
                  gameState.explosions.push(createBlackPuffExplosion({ x: cx, y: cy }, base + boost));
                }
              }
            }
          }
        }
      }

      // Update bonuses and handle expiration
      for (let i = gameState.bonuses.length - 1; i >= 0; i--) {
        const bonus = gameState.bonuses[i];
        const updatedBonus = updateBonus(bonus);
        gameState.bonuses[i] = updatedBonus;
        
        // Check if bonus expired (left screen)
        if (updatedBonus.life >= updatedBonus.maxLife) {
          gameState.bonuses.splice(i, 1);
          
          // Stop ambient sound and play missed sound
          if (bonusAmbientControlRef.current) {
            bonusAmbientControlRef.current.stop();
            bonusAmbientControlRef.current = null;
          }
          soundSystem.playBonusMissed();
        }
      }

      // Apply player-attraction to bonuses based on difficulty when the player is nearby
      // Easy: strong pull; Medium: 50% pull; Hard: none
      {
        const { damageScale } = getDifficultySettings();
        let pullScale = 0; // 0 = none (hard)
        if (damageScale < 1) pullScale = 1.0;           // easy
        else if (Math.abs(damageScale - 1) < 0.001) pullScale = 0.5; // medium
        else pullScale = 0.0;                           // hard or above

        if (pullScale > 0) {
          const attractRadius = 180; // px
          const maxAccel = 0.25 * pullScale; // per-frame accel cap toward player
          for (const b of gameState.bonuses) {
            const dx = gameState.player.position.x - b.position.x;
            const dy = gameState.player.position.y - b.position.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0 && dist < attractRadius) {
              const ux = dx / dist;
              const uy = dy / dist;
              // Scale with proximity (stronger when closer)
              const proximity = 1 - dist / attractRadius; // 0..1
              const accel = maxAccel * (0.35 + 0.65 * proximity); // keep some baseline
              b.velocity.x += ux * accel;
              b.velocity.y += uy * accel;
              // Tame runaway speeds
              const speed = Math.hypot(b.velocity.x, b.velocity.y);
              const maxSpeed = 2.0 + 1.5 * pullScale;
              if (speed > maxSpeed) {
                const s = maxSpeed / speed;
                b.velocity.x *= s;
                b.velocity.y *= s;
              }
            }
          }
        }
      }

      // Spawn bonuses on an interval based on difficulty
      const { bonusIntervalMs } = getDifficultySettings();
      if (currentTime - gameState.lastBonusSpawn >= bonusIntervalMs) {
        gameState.bonuses.push(createBonus());
        gameState.lastBonusSpawn = currentTime;
        
        // Stop any existing bonus ambient sound first
        if (bonusAmbientControlRef.current) {
          bonusAmbientControlRef.current.stop();
          bonusAmbientControlRef.current = null;
        }
        
        // Start new bonus ambient sound
        bonusAmbientControlRef.current = soundSystem.playBonusAmbient();
      }

      // Check for bonus collection
      for (let i = gameState.bonuses.length - 1; i >= 0; i--) {
        const bonus = gameState.bonuses[i];
        
        if (checkCollision(gameState.player, bonus)) {
          // Capture pickup position for panned SFX before removing
          const pickupX = bonus.position.x;
          // Remove bonus
          gameState.bonuses.splice(i, 1);
          
          // Apply bonus effect
          if (bonus.type === 'shield') {
            // If already shielded, double remaining time; else 10s
            if (gameState.player.shieldTime > 0) {
              gameState.player.shieldTime = gameState.player.shieldTime * 2;
            } else {
              gameState.player.shieldTime = 600; // 10 seconds at 60 FPS
            }
            try {
              const panProvider = () => {
                const nx = (pickupX / CANVAS_WIDTH) * 2 - 1;
                return Math.max(-1, Math.min(1, nx));
              };
              soundSystem.playBonusCollectedPanned(panProvider);
            } catch { /* ignore */ }
            
            // Stop ambient sound when collected
            if (bonusAmbientControlRef.current) {
              bonusAmbientControlRef.current.stop();
              bonusAmbientControlRef.current = null;
            }
          } else if (bonus.type === 'heal') {
            const healAmount = bonus.healAmount || 50;
            const oldHealth = gameState.player.health;
            gameState.player.health = Math.min(gameState.player.maxHealth, gameState.player.health + healAmount);
            
            // Only trigger heal effect if we actually healed
            if (gameState.player.health > oldHealth) {
              gameState.healEffect = 120; // 2 seconds at 60 FPS
            }
            // UI reads from player.health; no separate state to update
            try {
              const panProvider = () => {
                const nx = (pickupX / CANVAS_WIDTH) * 2 - 1;
                return Math.max(-1, Math.min(1, nx));
              };
              soundSystem.playBonusCollectedPanned(panProvider);
            } catch { /* ignore */ }
            
            // Stop ambient sound when collected
            if (bonusAmbientControlRef.current) {
              bonusAmbientControlRef.current.stop();
              bonusAmbientControlRef.current = null;
            }
          } else if (bonus.type === 'doubleShooter') {
            // Double Shooter pickup: if already active, double remaining time; else start fresh
            if (gameState.player.doubleShooter > 0) {
              gameState.player.doubleShooter = gameState.player.doubleShooter * 2;
            } else {
              gameState.player.doubleShooter = 600; // 10 seconds
            }
            // Increment stacks up to 2 (0=single,1=2-way,2=4-way)
            const curStacks = gameState.player.doubleShooterStacks || 0;
            gameState.player.doubleShooterStacks = Math.min(2, curStacks + 1);
            try {
              const panProvider = () => {
                const nx = (pickupX / CANVAS_WIDTH) * 2 - 1;
                return Math.max(-1, Math.min(1, nx));
              };
              soundSystem.playBonusCollectedPanned(panProvider);
            } catch { /* ignore */ }
            
            // Stop ambient sound when collected
            if (bonusAmbientControlRef.current) {
              bonusAmbientControlRef.current.stop();
              bonusAmbientControlRef.current = null;
            }
          } else if (bonus.type === 'missile') {
            // Determine missile amount: 60%=>1, 20%=>2, 10%=>3, 10%=>4 (slots to add)
            const r = Math.random();
            let amount = 1;
            if (r < 0.6) amount = 1;
            else if (r < 0.8) amount = 2;
            else if (r < 0.9) amount = 3;
            else amount = 4;
            // Spawn one mini-missile icon per amount that hovers then flies to the first empty HUD slot
            if (!gameState.missilePopups) gameState.missilePopups = [];
            const nowMs = Date.now();
            const maxIcons = 5;
            const iconX0 = CANVAS_WIDTH - 180;
            const iconY = 120;
            const gap = 26;
            // Determine how many slots appear occupied including in-flight reservations
            const pAny = gameState.player as any;
            if (typeof pAny.missileSlots !== 'number') pAny.missileSlots = Math.max(0, Math.min(maxIcons, gameState.player.missiles || 0));
            if (typeof pAny.missileSegments !== 'number') pAny.missileSegments = Math.max(0, Math.min(pAny.missileSlots * 5, (gameState.player.missiles || 0) * 5));
            const logicalCount = Math.max(0, Math.min(maxIcons, pAny.missileSlots || 0));
            for (let k = 0; k < amount; k++) {
              // find first available slot based on current missiles and already scheduled incoming icons
              let slotIndex: number | undefined = undefined;
              const occupied = Math.min(maxIcons, logicalCount + k);
              if (occupied < maxIcons) {
                slotIndex = occupied; // next empty slot
              }
              const targetX = typeof slotIndex === 'number' ? (iconX0 + slotIndex * gap) : (iconX0 + (maxIcons - 1) * gap);
              const targetY = iconY;
              const pop = {
                id: Math.floor(Math.random() * 1e9),
                amount: 1,
                start: nowMs,
                x: gameState.player.position.x,
                y: gameState.player.position.y - 20,
                phase: 'hover' as const,
                applied: false,
                slotIndex,
                targetX,
                targetY,
                scale: 1.0,
              };
              gameState.missilePopups.push(pop);
            }
            try {
              const panProvider = () => {
                const nx = (pickupX / CANVAS_WIDTH) * 2 - 1;
                return Math.max(-1, Math.min(1, nx));
              };
              soundSystem.playBonusCollectedPanned(panProvider);
            } catch { /* ignore */ }
            if (bonusAmbientControlRef.current) {
              bonusAmbientControlRef.current.stop();
              bonusAmbientControlRef.current = null;
            }
          }
        }
      }

      // Update shield time
      if (gameState.player.shieldTime > 0) {
        gameState.player.shieldTime--;
      }

      // Update heal effect
      if (gameState.healEffect > 0) {
        gameState.healEffect--;
      }

      // Update explosions
      gameState.explosions = gameState.explosions
        .map(updateExplosion)
        .filter((explosion): explosion is Explosion => explosion.particles.length > 0);

      // Update missile popups: hover near player then fly to HUD slot and apply
      if (!gameState.missilePopups) gameState.missilePopups = [];
      const maxIcons = 5;
      const iconX0 = CANVAS_WIDTH - 180;
      const iconY = 120;
      const gap = 26;
      for (let i = gameState.missilePopups.length - 1; i >= 0; i--) {
        const p = gameState.missilePopups[i];
        const age = Date.now() - p.start;
        if (p.phase === 'hover') {
          // small bobbing
          p.y = gameState.player.position.y - 20 + Math.sin(age * 0.01) * 4;
          p.x = gameState.player.position.x + Math.cos(age * 0.01) * 4;
          if (age >= 800) { // shorter hover
            // Assign target slot if not already set
            if (typeof p.slotIndex !== 'number') {
              const ply: any = gameState.player as any;
              const haveSlots = Math.max(0, Math.min(maxIcons, (ply.missileSlots || 0)));
              p.slotIndex = haveSlots < maxIcons ? haveSlots : (maxIcons - 1);
              p.targetX = iconX0 + (p.slotIndex as number) * gap;
              p.targetY = iconY;
            }
            p.phase = 'fly';
          }
        } else {
          // accelerate toward HUD target slot
          const tx = (typeof p.targetX === 'number') ? p.targetX : (iconX0 + (maxIcons - 1) * gap);
          const ty = (typeof p.targetY === 'number') ? p.targetY : iconY;
          const dx = tx - p.x;
          const dy = ty - p.y;
          const dist = Math.hypot(dx, dy) || 1;
          const ux = dx / dist, uy = dy / dist;
          const speed = Math.min(18, 5 + age * 0.012);
          p.x += ux * speed;
          p.y += uy * speed;
          // shrink slightly during flight
          p.scale = Math.max(0.6, 1.0 - (age / 1200));
          if (dist < 10 && !p.applied) {
            // Apply missiles and remove popup: add one slot (up to 5) and +5 segments
            const ply: any = gameState.player as any;
            if (typeof ply.missileSlots !== 'number') ply.missileSlots = Math.max(0, Math.min(5, gameState.player.missiles || 0));
            if (typeof ply.missileSegments !== 'number') ply.missileSegments = Math.max(0, Math.min(ply.missileSlots * 5, (gameState.player.missiles || 0) * 5));
            ply.missileSlots = Math.min(5, (ply.missileSlots || 0) + 1);
            ply.missileSegments = Math.min(ply.missileSlots * 5, (ply.missileSegments || 0) + 5);
            p.applied = true;
            gameState.missilePopups.splice(i, 1);
          }
        }
      }

      // Apply gravitational forces between asteroids
      for (let i = 0; i < gameState.asteroids.length; i++) {
        for (let j = i + 1; j < gameState.asteroids.length; j++) {
          const asteroid1 = gameState.asteroids[i];
          const asteroid2 = gameState.asteroids[j];
          
          // Calculate gravitational force between asteroids
          const force = calculateGravitationalForce(asteroid1, asteroid2, 0.05);
          
          // Apply force to both asteroids (Newton's third law)
          asteroid1.velocity = addVectors(asteroid1.velocity, multiplyVector(force, 1 / asteroid1.mass));
          asteroid2.velocity = subtractVectors(asteroid2.velocity, multiplyVector(force, 1 / asteroid2.mass));
        }
      }

      // Apply gravitational pull from large asteroids to ship
      gameState.asteroids.forEach(asteroid => {
        if (asteroid.size === 'large') {
          const force = calculateGravitationalForce(gameState.player, asteroid, 0.3);
          gameState.player.velocity = addVectors(gameState.player.velocity, multiplyVector(force, 1 / gameState.player.mass));
        }
      });

      // During warp, pull ship toward screen center; starts gentle and wins by the end
      if (gameState.levelComplete) {
        const cx = CANVAS_WIDTH / 2;
        const cy = CANVAS_HEIGHT / 2;
        const dx = cx - gameState.player.position.x;
        const dy = cy - gameState.player.position.y;
        const dist = Math.hypot(dx, dy) || 1;
        const ux = dx / dist;
        const uy = dy / dist;
        // Strength increases nonlinearly with warpEffect; last half gets much stronger
        const t = Math.max(0, Math.min(1, gameState.warpEffect));
        const strength = 0.02 + 0.38 * (t * t); // 0.02 .. ~0.4
        // Apply pull and a light global damping to keep speeds reasonable
        gameState.player.velocity = addVectors(gameState.player.velocity, { x: ux * strength, y: uy * strength });
        gameState.player.velocity = multiplyVector(gameState.player.velocity, 0.995);
      }

      // Collision detection: bullets vs asteroids
      for (let i = gameState.bullets.length - 1; i >= 0; i--) {
        const bullet = gameState.bullets[i];
        for (let j = gameState.asteroids.length - 1; j >= 0; j--) {
          const asteroid = gameState.asteroids[j];
          
          if (checkCollision(bullet, asteroid)) {
            // Remove bullet
            gameState.bullets.splice(i, 1);
            
            // Damage asteroid
            asteroid.health--;
            // Distortion on hit: ONLY for special asteroid
            try {
              if (distortionRef.current && (asteroid as any).special) {
                const r = 160;
                distortionRef.current.spawn({ cx: asteroid.position.x, cy: asteroid.position.y, durationMs: 450, radiusPx: r, strength: 0.9 });
              }
            } catch {}
            // On each hit of a large asteroid (while still alive), spawn small dust debris
            if (asteroid.size === 'large' && asteroid.health > 0) {
              spawnSmallDebris(asteroid, 8 + Math.floor(Math.random() * 6));
            }
            
            // Sparks when hitting special asteroid
            if (asteroid.special) {
              const sparks = createExplosion(asteroid.position);
              sparks.particles = sparks.particles.slice(0, 6).map(p => ({
                ...p,
                color: Math.random() > 0.5 ? '#ccccff' : '#ffff88',
                maxLife: 15 + Math.floor(Math.random() * 10),
                size: 2,
              }));
              gameState.explosions.push(sparks);
            }
            
            // Play appropriate sound based on asteroid size
            if (asteroid.size === 'large') {
              if (asteroid.health <= 0) {
              // If this was a special large asteroid, spawn its surprise before splitting
              if (asteroid.size === 'large' && asteroid.special) {
                if (asteroid.specialSpawn === 'bonus') {
                  const b = createBonus();
                  // Direct bonus toward the furthest screen side from the player
                  const targetX = Math.abs(gameState.player.position.x - 0) > Math.abs(gameState.player.position.x - CANVAS_WIDTH) ? 0 : CANVAS_WIDTH;
                  const targetY = Math.abs(gameState.player.position.y - 0) > Math.abs(gameState.player.position.y - CANVAS_HEIGHT) ? 0 : CANVAS_HEIGHT;
                  const dirX = targetX - asteroid.position.x;
                  const dirY = targetY - asteroid.position.y;
                  const len = Math.max(1, Math.hypot(dirX, dirY));
                  const speed = 0.8;
                  b.position = { ...asteroid.position };
                  b.velocity = { x: (dirX / len) * speed, y: (dirY / len) * speed };
                  gameState.bonuses.push(b);
                } else {
                  // Alien emerges dizzy for ~2 seconds
                  const alien = createAlienShip(Math.max(1, gameState.stage));
                  alien.position = { ...asteroid.position };
                  (alien as unknown as { wakeupTime: number }).wakeupTime = 120;
                  gameState.alienShips.push(alien as AlienShip);
                }
              }
                try {
                  const panProvider = () => {
                    const nx = (asteroid.position.x / CANVAS_WIDTH) * 2 - 1;
                    return Math.max(-1, Math.min(1, nx));
                  };
                  soundSystem.playLargeAsteroidDestroyPanned(panProvider);
                } catch { /* ignore */ }
              } else {
                soundSystem.playLargeAsteroidCollision();
              }
            } else if (asteroid.size === 'medium') {
              if (asteroid.health <= 0) {
                try {
                  const panProvider = () => {
                    const nx = (asteroid.position.x / CANVAS_WIDTH) * 2 - 1;
                    return Math.max(-1, Math.min(1, nx));
                  };
                  soundSystem.playMediumAsteroidDestroyPanned(panProvider);
                } catch { /* ignore */ }
              } else {
                soundSystem.playMediumAsteroidCollision();
              }
            } else {
              try {
                const panProvider = () => {
                  const nx = (asteroid.position.x / CANVAS_WIDTH) * 2 - 1;
                  return Math.max(-1, Math.min(1, nx));
                };
                soundSystem.playSmallAsteroidDestroyPanned(panProvider);
              } catch { /* ignore */ }
            }
            
            // Check if asteroid is destroyed
            if (asteroid.health <= 0) {
              // Split asteroid
              const fragments = splitAsteroid(asteroid, bullet.velocity).map(fragment => {
                // Apply current stage speed to fragments
                if (gameState.stage === 1) {
                  fragment.velocity = multiplyVector(fragment.velocity, 0.6);
                } else if (gameState.stage >= 3) {
                  fragment.velocity = multiplyVector(fragment.velocity, 1.2);
                }
                return fragment;
              });
              // Spawn visual debris (no gameplay effect)
              // Large asteroids produce a lot more debris
              if (asteroid.size === 'large') {
                spawnAsteroidDebris(asteroid);
                spawnAsteroidDebris(asteroid); // extra pass for large
              } else {
                spawnAsteroidDebris(asteroid);
              }
              gameState.asteroids.splice(j, 1);
              gameState.asteroids.push(...fragments);
              
              // Update score
              const points = asteroid.size === 'large' ? 20 : asteroid.size === 'medium' ? 50 : 100;
              gameState.score += points;
              setScore(gameState.score);
            }
            
            break;
          }
        }
      }

      // Collision detection: player bullets vs alien ships
      for (let i = gameState.bullets.length - 1; i >= 0; i--) {
        const bullet = gameState.bullets[i];
        for (let j = gameState.alienShips.length - 1; j >= 0; j--) {
          const alienShip = gameState.alienShips[j];
          
          if (checkCollision(bullet, alienShip)) {
            // Remove bullet
            gameState.bullets.splice(i, 1);
            // Damage alien ship
            alienShip.health -= 1;
            if (alienShip.health <= 0) {
              // Create explosion effect
              gameState.explosions.push(createAlienExplosion(alienShip.position));
              // Play dramatic alien destruction sound (panned to alien x)
              try {
                const panProvider = () => {
                  const nx = (alienShip.position.x / CANVAS_WIDTH) * 2 - 1;
                  return Math.max(-1, Math.min(1, nx));
                };
                soundSystem.playAlienDestroyPanned(panProvider);
              } catch { /* ignore */ }
              // Remove ship and add score
              gameState.alienShips.splice(j, 1);
              gameState.score += 200; // Bonus points for destroying alien ship
              setScore(gameState.score);
            }
            break;
          }
        }
      }

      // Collision detection: alien bullets vs player
      if (!gameState.respawning && gameState.player.invulnerable === 0 && gameState.player.shieldTime === 0) {
        for (let i = gameState.alienBullets.length - 1; i >= 0; i--) {
          const bullet = gameState.alienBullets[i];
          
          if (checkCollision(bullet, gameState.player)) {
            // Remove bullet
            gameState.alienBullets.splice(i, 1);
            
            // Damage player (apply temporary force-field reduction if active)
            const { damageScale } = getDifficultySettings();
            const mult = bullet.damageMultiplier ? bullet.damageMultiplier : 1;
            const base = 15 * mult;
            const shieldActive = (tractionBeamRef.current?.forceFieldUntil ?? 0) > performance.now();
            const shieldMult = shieldActive ? 0.5 : 1;
            gameState.player.health -= Math.round(base * damageScale * shieldMult);
            gameState.player.invulnerable = 120; // 2 seconds at 60 FPS
            
            // Larger explosion if missile: loud sound and white/red debris
            if (bullet.explosionRadius) {
              const boom = createExplosion(bullet.position);
              boom.particles.forEach(p => { p.size *= 1.5; p.maxLife += 30; p.color = Math.random() < 0.5 ? '#ffffff' : '#ff3333'; });
              // Add a huge amount of white/red debris
              for (let i = 0; i < 160; i++) {
                boom.particles.push({
                  position: { x: bullet.position.x, y: bullet.position.y },
                  velocity: { x: (Math.random() - 0.5) * 9, y: (Math.random() - 0.5) * 9 },
                  life: 0,
                  maxLife: 50 + Math.floor(Math.random() * 60),
                  size: 2 + Math.random() * 3,
                  color: Math.random() < 0.5 ? '#ffffff' : '#ff3333',
                });
              }
              gameState.explosions.push(boom);
              soundSystem.playMissileExplosion();
            }
            
            // Check if player is dead
            if (gameState.player.health <= 0) {
              // Schedule 10 asteroid-style explosions over 2s around ship
              deathBurstsRef.current = { pos: { x: gameState.player.position.x, y: gameState.player.position.y }, remaining: 120, spawned: 0 };
              if (gameState.lives > 1) {
                // Lose a life and respawn
                gameState.lives -= 1;
                gameState.respawning = true;
                gameState.respawnCountdown = 180;
                gameState.player.health = gameState.player.maxHealth;
                gameState.player.position = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
                gameState.player.velocity = { x: 0, y: 0 };
                gameState.player.invulnerable = 180;
                gameState.player.shieldTime = 180;
              } else {
                // No lives left: game over
                gameState.gameRunning = false;
                setGameRunning(false);
                if (!gameOverStartRef.current) {
                  gameOverStartRef.current = performance.now();
                  // Queue some quips
                  const quips = [
                    'Try again',
                    'Find Flipit Rewards',
                    "Don’t give up!",
                    'You suck',
                    'Loser JK',
                    'Plot armor not included',
                    'Asteroids 1, You 0',
                    'Press R to un-suck',
                    'Close one! Kinda.',
                    'Space is hard',
                    'Next life, new record',
                    'Refuel your ego',
                    'Skill issue (maybe)',
                    'We believe in you',
                  ];
                  for (let i = 0; i < 3; i++) {
                    const pick = quips[Math.floor(Math.random() * quips.length)];
                    queueQuip(pick, i * 1500);
                  }
                }
              }
            }
            
            break;
          }
        }
      } else if (gameState.player.shieldTime > 0) {
        // Shield is active - deflect alien bullets
        for (let i = gameState.alienBullets.length - 1; i >= 0; i--) {
          const bullet = gameState.alienBullets[i];
          
          if (checkCollision(bullet, gameState.player)) {
            // Remove bullet (deflected)
            gameState.alienBullets.splice(i, 1);
            
            // Create small explosion effect at shield contact
            const smallExplosion = createExplosion(bullet.position);
            smallExplosion.particles = smallExplosion.particles.slice(0, 5); // Smaller explosion
            gameState.explosions.push(smallExplosion);
          }
        }
      }

      // Collision detection: player vs asteroids (disabled during traction beam)
      const tractionState = tractionBeamRef.current;
      const tractionActive = tractionState.active && (tractionState.phase === 'approaching' || tractionState.phase === 'locking' || tractionState.phase === 'attached' || tractionState.phase === 'displaying');
      
      if (gameState.player.invulnerable === 0 && gameState.player.shieldTime === 0 && !tractionActive) {
        for (const asteroid of gameState.asteroids) {
          if (checkCollision(gameState.player, asteroid)) {
            // Do not bounce or damage when colliding with the special asteroid; let capture handle it
            const isSpecial = !!asteroid.special || (tractionBeamRef.current?.targetAsteroid && (tractionBeamRef.current.targetAsteroid as any).id === (asteroid as any).id);
            if (isSpecial) {
              // Keep optional visuals, but skip velocity/health changes
              if (asteroid.size === 'large') {
                const cx = (gameState.player.position.x + asteroid.position.x) / 2;
                const cy = (gameState.player.position.y + asteroid.position.y) / 2;
                const base = 6 + Math.floor(Math.random() * 4);
                const puffs = 1 + Math.floor(Math.random() * 2);
                for (let k = 0; k < puffs; k++) {
                  gameState.explosions.push(createBlackPuffExplosion({ x: cx, y: cy }, base));
                }
              }
              continue;
            }
            // Visual and SFX only when hitting big (large) asteroids
            if (asteroid.size === 'large') {
              const nowTs = performance.now();
              const last = asteroidBounceCooldownRef.current.get(asteroid) ?? 0;
              // Only play SFX if asteroid is special hard-to-break
              if (nowTs - last > 220 && asteroid.special) {
                try {
                  const panProvider = () => {
                    const nx = (asteroid.position.x / CANVAS_WIDTH) * 2 - 1;
                    return Math.max(-1, Math.min(1, nx));
                  };
                  soundSystem.playAsteroidCollisionPanned('large', panProvider, 500);
                } catch { /* ignore */ }
              }
              asteroidBounceCooldownRef.current.set(asteroid, nowTs);
              const cx = (gameState.player.position.x + asteroid.position.x) / 2;
              const cy = (gameState.player.position.y + asteroid.position.y) / 2;
              const base = 6 + Math.floor(Math.random() * 4); // 6-9
              const boost = 5;
              const puffs = 2 + Math.floor(Math.random() * 2);
              for (let k = 0; k < puffs; k++) {
                gameState.explosions.push(createBlackPuffExplosion({ x: cx, y: cy }, base + boost));
              }
            }
            // Calculate knockback based on asteroid properties
            const asteroidSpeed = vectorMagnitude(asteroid.velocity);
            const asteroidMass = asteroid.mass;
            const shipMass = gameState.player.mass;
            
            // Calculate impact direction (from asteroid to ship)
            const impactDirection = subtractVectors(gameState.player.position, asteroid.position);
            const normalizedImpact = normalizeVector(impactDirection);
            
            // Calculate knockback force based on asteroid speed and mass ratio
            const massRatio = asteroidMass / shipMass; // How much heavier the asteroid is
            const knockbackForce = asteroidSpeed * massRatio * 0.8; // Scaling factor for gameplay
            
            // Apply knockback to ship
            const knockbackVelocity = multiplyVector(normalizedImpact, knockbackForce);
            gameState.player.velocity = addVectors(gameState.player.velocity, knockbackVelocity);
            
            // Also apply some reverse force to the asteroid (Newton's third law)
            const asteroidKnockback = multiplyVector(normalizedImpact, -knockbackForce * (shipMass / asteroidMass) * 0.3);
            asteroid.velocity = addVectors(asteroid.velocity, asteroidKnockback);
            
            // Calculate damage based on asteroid size
            let damage = 0;
            switch (asteroid.size) {
              case 'large':
                damage = 10;
                break;
              case 'medium':
                damage = 5;
                break;
              case 'small':
                damage = 2;
                break;
            }
            
            // Apply damage and invulnerability frames (scaled by difficulty)
            const { damageScale } = getDifficultySettings();
            const shieldActive = (tractionBeamRef.current?.forceFieldUntil ?? 0) > performance.now();
            const shieldMult = shieldActive ? 0.5 : 1;
            gameState.player.health -= Math.round(damage * damageScale * shieldMult);
            gameState.player.invulnerable = 120; // 2 seconds at 60 FPS
            
            // Check if player is dead
            if (gameState.player.health <= 0) {
              deathBurstsRef.current = { pos: { x: gameState.player.position.x, y: gameState.player.position.y }, remaining: 120, spawned: 0 };
              if (gameState.lives > 1) {
                gameState.lives -= 1;
                gameState.respawning = true;
                gameState.respawnCountdown = 180;
                gameState.player.health = gameState.player.maxHealth;
                gameState.player.position = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
                gameState.player.velocity = { x: 0, y: 0 };
                gameState.player.invulnerable = 180;
                gameState.player.shieldTime = 180;
              } else {
                gameState.gameRunning = false;
                setGameRunning(false);
                if (!gameOverStartRef.current) {
                  gameOverStartRef.current = performance.now();
                  const quips = [
                    'Try again',
                    'Find Flipit Rewards',
                    "Don’t give up!",
                    'You suck',
                    'Loser JK',
                    'Plot armor not included',
                    'Asteroids 1, You 0',
                    'Press R to un-suck',
                    'Close one! Kinda.',
                    'Space is hard',
                    'Next life, new record',
                    'Refuel your ego',
                    'Skill issue (maybe)',
                    'We believe in you',
                  ];
                  for (let i = 0; i < 3; i++) {
                    const pick = quips[Math.floor(Math.random() * quips.length)];
                    queueQuip(pick, i * 1500);
                  }
                }
              }
            }
            
            break; // Only take damage from one asteroid per frame
          }
        }
      } else if (gameState.player.shieldTime > 0) {
        // Shield is active - bounce asteroids away
        for (const asteroid of gameState.asteroids) {
          if (checkCollision(gameState.player, asteroid)) {
            // Visual and SFX only when hitting big (large) asteroids
            if (asteroid.size === 'large') {
              const nowTs = performance.now();
              const last = asteroidBounceCooldownRef.current.get(asteroid) ?? 0;
              if (nowTs - last > 220 && asteroid.special) {
                try {
                  soundSystem.playLargeAsteroidCollision();
                } catch { /* ignore */ }
              }
              asteroidBounceCooldownRef.current.set(asteroid, nowTs);
              const cx = (gameState.player.position.x + asteroid.position.x) / 2;
              const cy = (gameState.player.position.y + asteroid.position.y) / 2;
              const base = 6 + Math.floor(Math.random() * 4);
              const boost = 5;
              const puffs = 2 + Math.floor(Math.random() * 2);
              for (let k = 0; k < puffs; k++) {
                gameState.explosions.push(createBlackPuffExplosion({ x: cx, y: cy }, base + boost));
              }
            }
            // Calculate bounce direction (from ship to asteroid)
            const bounceDirection = subtractVectors(asteroid.position, gameState.player.position);
            const normalizedBounce = normalizeVector(bounceDirection);
            
            // Apply strong bounce force to asteroid
            const bounceForce = 5;
            const bounceVelocity = multiplyVector(normalizedBounce, bounceForce);
            asteroid.velocity = addVectors(asteroid.velocity, bounceVelocity);
            
            // Create small explosion effect at shield contact
            const smallExplosion = createExplosion(asteroid.position);
            smallExplosion.particles = smallExplosion.particles.slice(0, 8); // Smaller explosion
            gameState.explosions.push(smallExplosion);
          }
        }
      }
      
      // Spawn new asteroids if all are destroyed
      if (gameState.asteroids.length === 0 && gameState.asteroidsSpawned) {
        if (!gameState.levelComplete) {
          // Start level completion sequence
          gameState.levelComplete = true;
          gameState.warpEffect = 0;
          // Audio ducking: drop music, boost SFX for 3s
          triggerLevelEndDucking();
          levelEndStartRef.current = performance.now();
          // Don't preload backdrop here - we'll pick random at zoom-in start
          
          // Play warp sound at the beginning of the effect
          soundSystem.playWarpSound();
        }
        
        // Animate warp effect
        if (gameState.levelComplete) {
          // Start slower then accelerate more aggressively: delta grows with current warpEffect
          const tWarp = Math.max(0, Math.min(1, gameState.warpEffect));
          const delta = 0.003 + 0.012 * tWarp * tWarp; // 0.003 at start -> 0.015 near end (quadratic acceleration)
          gameState.warpEffect += delta; // faster completion with more dramatic acceleration
          
          // After warp visual completes AND full fade-out duration elapsed, advance to next stage
          const elapsedSinceLevelEnd = performance.now() - levelEndStartRef.current;
          if (gameState.warpEffect >= 1 && elapsedSinceLevelEnd >= DUCK_HOLD_MS) {
            // Stop alien approach music when advancing to next stage
            if (alienMusicControlRef.current) {
              alienMusicControlRef.current.stop();
              alienMusicControlRef.current = null;
            }
            // Ensure volumes are restored to user prefs on stage transition
            if (!isMuted) {
              soundSystem.setMusicVolume(musicVolOrigRef.current);
              soundSystem.setSfxVolume(sfxVolOrigRef.current);
            }
            // Pick a new random backdrop for this level
            if (backdrops.length > 0) {
              let newIdx;
              do {
                newIdx = Math.floor(Math.random() * backdrops.length);
              } while (newIdx === backdropIndex && backdrops.length > 1);
              
              const src = backdrops[newIdx];
              setBackdropIndex(newIdx);
              console.log(`🎨 Level ${gameState.stage + 1}: Switching to backdrop ${newIdx}: ${src}`);
              
              // Update page background immediately
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
            }

            // Reset intro zoom for dramatic zoom-in on new level
            introZoomStartRef.current = performance.now();
            bgZoomExtraRef.current = 1.5; // Start zoomed way in, will ease out
            
            gameState.stage++;
            setStage(gameState.stage);
            
            // Reset everything for new stage
            gameState.levelComplete = false;
            gameState.warpEffect = 0;
            gameState.stageStartTime = Date.now();
            gameState.alienSpawnCount = 0;
            gameState.alienApproachMusicPlayed = false;
            gameState.asteroidsSpawned = false;
            gameState.alienShips = []; // Clear existing alien ships
            gameState.alienBullets = []; // Clear alien bullets
            gameState.explosions = []; // Clear explosions
            // NOTE: Do NOT clear bonuses — persist any on-screen bonuses across warp
            // Also, do not forcibly stop bonus ambient sound here; let it manage its own lifecycle
            
            // Reset any active bonus timers to full after warp so the reward carries over
            if (gameState.player.shieldTime > 0) {
              gameState.player.shieldTime = 600;
            }
            if (gameState.player.doubleShooter > 0) {
              gameState.player.doubleShooter = 600;
            }

            // Re-tune star density for current canvas size
            ensureStarsForCanvas();

            // Reposition refuel station for the new stage (far off-screen tiles)
            {
              const curTX = gameState.worldTileX ?? 0;
              const curTY = gameState.worldTileY ?? 0;
              const dxTiles = (Math.random() < 0.5 ? -1 : 1) * (5 + Math.floor(Math.random() * 4));
              const dyTiles = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.floor(Math.random() * 4));
              const localX = Math.random() * CANVAS_WIDTH;
              const localY = Math.random() * CANVAS_HEIGHT;
              gameState.refuelStation = { tileX: curTX + dxTiles, tileY: curTY + dyTiles, position: { x: localX, y: localY } };
            }

            // Reposition reward ship for new stage (tiles)
            {
              const curTX2 = gameState.worldTileX ?? 0;
              const curTY2 = gameState.worldTileY ?? 0;
              const dxTiles2 = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 3));
              const dyTiles2 = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 3));
              const localX2 = Math.random() * CANVAS_WIDTH;
              const localY2 = Math.random() * CANVAS_HEIGHT;
              gameState.rewardShip = { tileX: curTX2 + dxTiles2, tileY: curTY2 + dyTiles2, position: { x: localX2, y: localY2 } };
            }

            // If music is not playing and user didn't explicitly pause, start the next track
            const ms = soundSystem.getMusicState();
            if (!isMuted && !musicUserPaused && ms.trackCount > 0 && !ms.isPlaying) {
              const nextIdx = (ms.index + 1) % ms.trackCount;
              safePlayMusic(nextIdx);
            }
            
            // Asteroids will be spawned after 1 second delay
          }
        }
      }
    }

    // Manage level-end audio ducking timeline
    if (!isMuted) {
      const now = performance.now();
      if (duckPhaseRef.current === 'boost') {
        if (now - duckT0Ref.current >= DUCK_HOLD_MS) {
          duckPhaseRef.current = 'restore';
          duckRestoreT0Ref.current = now;
        }
      } else if (duckPhaseRef.current === 'restore') {
        const p = Math.max(0, Math.min(1, (now - duckRestoreT0Ref.current) / RESTORE_MS));
        const music = 0.08 + (musicVolOrigRef.current - 0.08) * p;
        const sfx = 0.7 + (sfxVolOrigRef.current - 0.7) * p;
        soundSystem.setMusicVolume(music);
        soundSystem.setSfxVolume(sfx);
        if (p >= 1) {
          duckPhaseRef.current = 'none';
        }
      }
    }

    // Render: draw background space image (behind stars and game)
    // Mapping info for sampling background brightness under stars
    const bgMap = drawBackground(ctx, gameState, env);

    // Stars (update/draw) immediately after background
    drawStars(ctx, gameState, env, bgMap);

    if (gameState.gameRunning && !isPausedRef.current) {
      // During tractor beam attach/displaying/pushing, render the player on top of the asteroid
      const tState = tractionBeamRef.current;
      const showShipOnTop = tState.active && (tState.phase === 'attached' || tState.phase === 'displaying' || tState.phase === 'pushing');
      if (showShipOnTop) {
        // Draw asteroids first, then overlay player to ensure visibility
        drawAsteroidsMod(ctx, gameState, env);
        drawPlayerMod(ctx, gameState, env);
      } else {
        // Default order
        drawPlayerMod(ctx, gameState, env);
        drawAsteroidsMod(ctx, gameState, env);
      }
      drawBulletsMod(ctx, gameState, env);
      drawAliensMod(ctx, gameState, env);
      drawBonusesMod(ctx, gameState, env);
    }
    drawAlienBullets(ctx, gameState.alienBullets);
    if (gameState.playerMissiles && gameState.playerMissiles.length > 0) {
      drawAlienBullets(ctx, gameState.playerMissiles);
    }
    drawExplosionsMod(ctx, gameState, env);
    // Visual-only debris
    updateVisualDebris();
    drawDebrisMod(ctx, gameState, env);
    // Draw refuel station (and handle docking/refill)
    drawRefuelStation(ctx, gameState);
    // Draw reward ship (and handle docking reward)
    drawRewardShip(ctx, gameState);

    // Detect HUD-relevant changes and set highlight timers
    const nowHud = performance.now();
    // Health change
    if (gameState.player.health > prevHealthRef.current) {
      healthBrightUntilRef.current = nowHud + 1200; // brighten on heal
    } else if (gameState.player.health < prevHealthRef.current) {
      healthDropUntilRef.current = nowHud + 1000; // flash red on damage
    }
    prevHealthRef.current = gameState.player.health;
    // Lives change (brighten on life gain)
    if (gameState.lives > prevLivesRef.current) {
      livesBrightUntilRef.current = nowHud + 1200;
    }
    prevLivesRef.current = gameState.lives;
    // Score drop -> red flash
    if (gameState.score < prevScoreRef.current) {
      scoreDropUntilRef.current = nowHud + 1000;
    }
    prevScoreRef.current = gameState.score;

    // Stage change -> UI event (level up)
    if (gameState.stage !== prevStageRef.current) {
      emitUiEvent({ type: 'level-up', stage: gameState.stage });
      prevStageRef.current = gameState.stage;
    }
    // Alien kill heuristic: if alien count decreased since last frame
    const alienCount = gameState.alienShips.length;
    if (alienCount < prevAlienCountRef.current) {
      emitUiEvent({ type: 'alien-kill' });
    }
    prevAlienCountRef.current = alienCount;

    // UI (no target rings)
    drawUI(ctx, gameState);

    // Show current background name on screen (bottom-left)
    try {
      if (backdrops.length > 0) {
        const url = backdrops[backdropIndex] || '';
        const parts = url.split('/');
        const fname = parts[parts.length - 1] || url;
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(`Background: ${fname}`, 12, CANVAS_HEIGHT - 12);
        ctx.restore();
      }
    } catch { /* ignore */ }

    // Draw song title overlays (bottom-left third) with perspective fade/scale
    const now = performance.now();
    if (titleOverlaysRef.current.length > 0) {
      const kept: typeof titleOverlaysRef.current = [];
      for (const o of titleOverlaysRef.current) {
        const t = now - o.start; // ms since overlay start
        const lifetime = 5200; // total ms window per overlay
        if (t > lifetime) continue; // drop after full window
        kept.push(o);

        // Overlay already starts after the 2s play delay; add a 3s pause before movement/fade
        const tPause = 3000;
        const tVisible = Math.max(0, t);
        const tMove = Math.max(0, tVisible - tPause);
        const lifetimeVisible = Math.max(200, lifetime - 0);

        // Typing parameters (start after 2s)
        const perCharMs = 45; // typing speed
        const chars = Math.max(0, Math.min(o.text.length, Math.floor(tVisible / perCharMs)));
        const visible = o.text.slice(0, chars);
        if (!visible) continue;

        // Easing helpers
        const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
        const easeIn = (x: number) => x * x;
        const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

        // Overall normalized progress
        const pMove = clamp01(tMove / (lifetimeVisible - tPause));
        // Fade-in first 15%, fade-out last 25%
        const fadeIn = easeIn(clamp01(tVisible / (lifetimeVisible * 0.15)));
        const fadeOut = 1 - clamp01((tMove - (lifetimeVisible * 0.50)) / (lifetimeVisible * 0.25));

        // Start bottom-center, travel subtly upward and slightly to the right
        const baseX = Math.floor(CANVAS_WIDTH * 0.5);
        const baseY = CANVAS_HEIGHT - 40;
        const vanishX = baseX + Math.floor(CANVAS_WIDTH * 0.05);
        // Halve the vertical rise compared to before
        const vanishY = baseY - Math.floor(CANVAS_HEIGHT * 0.12);
        // Two times slower movement via eased progress on a longer denominator
        const travel = easeOutCubic(pMove * 0.5);
        const posX = baseX + (vanishX - baseX) * travel;
        const posY = baseY + (vanishY - baseY) * travel;

        // Scale down as it travels into the distance
        const scale = 1 - 0.55 * travel;
        // Alpha tied to scale so fade matches distance, with fade in/out envelope
        // Strengthen the end transparency by squaring fadeOut
        const alpha = Math.max(0, Math.min(1, scale * fadeIn * (fadeOut * fadeOut)));

        // Angle to match the direction towards the vanishing point
        const angle = Math.atan2(vanishY - baseY, vanishX - baseX);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(posX, posY);
        ctx.rotate(angle * 0.08); // subtle tilt along the travel direction
        ctx.scale(scale, scale);
        // Subtle glow and outline for readability that diminishes with distance
        ctx.shadowColor = 'rgba(255,255,255,0.6)';
        ctx.shadowBlur = 12 * (1 - travel);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineWidth = 3 * (1 - 0.5 * travel);
        // Double the title size
        ctx.font = '48px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.strokeText(visible, 0, 0);
        ctx.fillText(visible, 0, 0);

        // Draw "Now Playing" above, with a faster fade so it disappears sooner (guarded by flag)
        if (ENABLE_CANVAS_NOW_PLAYING_OVERLAY) {
          const nowLabelAlpha = Math.max(0, Math.min(1, scale * fadeIn * Math.pow(fadeOut, 3))) * 0.9;
          if (nowLabelAlpha > 0.01) {
            ctx.save();
            ctx.globalAlpha = nowLabelAlpha;
            ctx.translate(0, -22 * (1 - 0.5 * travel));
            ctx.fillStyle = '#a3f7ff';
            ctx.strokeStyle = '#00161a';
            // Increase subtitle size to match larger title
            ctx.font = '28px Arial';
            ctx.lineWidth = 2 * (1 - 0.5 * travel);
            ctx.strokeText('Now Playing', 0, 0);
            ctx.fillText('Now Playing', 0, 0);
            ctx.restore();
          }
        }
        ctx.restore();
      }
      titleOverlaysRef.current = kept;
    }

    // Handle level-end audio ducking restore over 2s (smooth)
    if (duckPhaseRef.current === 'boost') {
      const held = performance.now() - duckT0Ref.current;
      if (held >= DUCK_HOLD_MS) {
        duckPhaseRef.current = 'restore';
        duckRestoreT0Ref.current = performance.now();
      }
    } else if (duckPhaseRef.current === 'restore') {
      const t = Math.max(0, Math.min(1, (performance.now() - duckRestoreT0Ref.current) / RESTORE_MS));
      // Linear interpolation back to original
      const music = 0.08 + (musicVolOrigRef.current - 0.08) * t;
      const sfx = 0.7 + (sfxVolOrigRef.current - 0.7) * t;
      soundSystem.setMusicVolume(music);
      soundSystem.setSfxVolume(sfx);
      if (t >= 1) {
        duckPhaseRef.current = 'none';
      }
    }

    // Handle restart
    if (!gameState.gameRunning && gameState.keys['r']) {
      initGame();
    }

    // Dev: add a lightweight summary roughly every 30 seconds (60fps * 30s = DEV_SUMMARY_FRAMES)
    if (__DEV_MODE__) {
      __frameCounter++;
      if (__frameCounter % DEV_SUMMARY_FRAMES === 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const gs = gameStateRef.current as any;
        const tractorPhase = gs?.tractorBeam?.phase ?? 'idle';
        const summary = `f=${__frameCounter} ast=${gs?.asteroids?.length ?? 0} bul=${gs?.bullets?.length ?? 0} deb=${gs?.visualDebris?.length ?? 0} exp=${gs?.explosions?.length ?? 0} phase=${tractorPhase} bg=${gs?.bgBrightness ?? DEFAULT_BG_BRIGHTNESS}`;
        // eslint-disable-next-line no-console
        console.log('[summary]', summary);
        const arr = debugLinesRef.current; arr.push(summary); if (arr.length > DEBUG_PANEL_MAX) arr.splice(0, arr.length - DEBUG_PANEL_MAX);
      }
    }

    // Forward draw stub (no-op in Pass A); placed near end of frame
    drawFrame(ctx, gameState, frameNow, env);

    animationFrameRef.current = requestAnimationFrame(gameLoop);
    // Note: we intentionally rely on stable refs (e.g., isPausedRef, isMutedRef, musicUserPausedRef)
    // and stable callbacks (e.g., initGame has an empty dependency array). Including all values
    // used inside this animation loop would cause unnecessary re-creations and jank.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stop thrust on unmount just in case
  useEffect(() => {
    return () => {
      soundSystem.stopThrust();
    };
  }, []);

  // Start game loop
  useEffect(() => {
    // Load music track list once
    const tracks = soundSystem.getMusicTracks();
    setMusicTracks(tracks);
    if (tracks.length > 0) {
      setMusicIndex(0);
    }
    // Dev-only: seed track names/order from CSV at build-time using Vite raw import
    if (import.meta.env?.DEV) {
      (async () => {
        try {
          const mod = await import('../sample_data.csv?raw');
          const csvText = (mod as { default?: string }).default ?? (mod as unknown as string);
          if (csvText) {
            soundSystem.seedTracksFromCsv(csvText);
            const seeded = soundSystem.getMusicTracks();
            setMusicTracks(seeded);
          }
        } catch {}
      })();
    }

    // Initialize volumes to defaults
    soundSystem.setMusicVolume(0.9);
    soundSystem.setSfxVolume(0.3);

    initGame();
    gameLoop();
    window.addEventListener('click', handleClick);
    // Prevent arrow keys from scrolling the page during gameplay
    const preventScrollKeys = (e: KeyboardEvent) => {
      const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '];
      if (keys.includes(e.key)) {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', preventScrollKeys, { passive: false });

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      // Clean up any playing sounds
      if (bonusAmbientControlRef.current) {
        bonusAmbientControlRef.current.stop();
      }
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', preventScrollKeys);
    };
  }, [initGame, gameLoop, handleClick]);

  // Handle window resize when in Fit-to-Window mode (no fullscreen)
  useEffect(() => {
    const onResize = () => {
      if (isFitted) applyFitSizing();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isFitted, applyFitSizing]);

  // Re-apply sizing whenever fit mode toggles on
  useEffect(() => {
    if (isFitted) {
      applyFitSizing();
    }
  }, [isFitted, applyFitSizing]);

  // Removed Fullscreen support

  // (Removed duplicate setOnMusicTrackChange effect; handled earlier)

  const handlePlayPauseMusic = () => {
    const state = soundSystem.getMusicState();
    if (musicPlaying) {
      // Currently playing -> pause and keep position
      soundSystem.pauseMusic();
      setMusicPlaying(false);
      setMusicUserPaused(true);
      // While paused, set SFX to 50% (override) without changing the user's preferred value
      setSfxPausedOverride(true);
      setSfxVol(0.5);
      soundSystem.setSfxVolume(0.5);
      return;
    }

    if (musicTracks.length === 0) return;
    if (isMuted) return; // do not attempt to play while muted
    // On resume/start, if we had overridden SFX, restore to preferred unless the user changed it
    if (sfxPausedOverride) {
      setSfxPausedOverride(false);
      setSfxVol(preferredSfxVol);
      soundSystem.setSfxVolume(preferredSfxVol);
    }
    setMusicUserPaused(false);
    // If resuming from paused state, resume
    if (!state.isPlaying && state.offset > 0 && state.index === musicIndex) {
      soundSystem.resumeMusic();
      if (!isMuted) {
        setMusicPlaying(true);
      }
      return;
    }
    // Resume from saved point if available for this index
    const saved = resumeInfoRef.current;
    if (saved && saved.index === musicIndex && saved.offsetSec > 0) {
      // Go back 1 second before the saved position (unless at start of song)
      const rewindOffset = Math.max(0, saved.offsetSec - 1);
      soundSystem.resumeFrom(saved.index, rewindOffset);
      setMusicPlaying(true);
      return;
    }
    // Otherwise start the selected track from the beginning
    soundSystem.selectMusicTrack(musicIndex);
    safePlayMusic();
  };

  const handleMusicVolume = (v: number) => {
    setMusicVol(v);
    soundSystem.setMusicVolume(v);
  };

  const handleSfxVolume = (v: number) => {
    setPreferredSfxVol(v);
    setSfxVol(v);
    soundSystem.setSfxVolumeFromUser(v);
    // User changed SFX manually; cancel any pause override behavior
    if (sfxPausedOverride) setSfxPausedOverride(false);
  };

  const toggleMute = () => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    soundSystem.setMuted(newMutedState);
    // When muting, also stop any currently playing sounds
    if (newMutedState) {
      soundSystem.stopAllSounds();
      setMusicPlaying(false);
    }
  };

  // Disable legacy canvas 'Now Playing' overlay when MusicDock is present
  const ENABLE_CANVAS_NOW_PLAYING_OVERLAY = false;

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 relative">
      {/* Floating animated title banner (DOM overlay) */}
      <TitleBanner
        title="Play & Win Flipit Rewards"
        messages={[
          'Destroy asteroids. Dodge danger.',
          'Lock the special rock and reveal Flipit chance.',
          'Smooth gameplay. Big rewards.',
          'Hold steady — maintain the tractor lock.',
          'Flipit: your odds, your moment.'
        ]}
        cycleIntervalMs={9000}
        fadeMs={700}
        onInfoClick={() => setInfoOpen(true)}
      />

      {/* Info popup modal */}
      <InfoPopup open={infoOpen} onClose={() => setInfoOpen(false)} />

      {/* In-app Debug Panel (dev-only) */}
      {__DEV_MODE__ && (
        <DebugPanel lines={debugLinesRef.current} visible={true} max={200} />
      )}

      {/* Debug Panel Toggle Button - Only show in development */}
      {import.meta.env.DEV && (
        <button
          onClick={() => setDebugPanelOpen(!debugPanelOpen)}
          className="fixed left-4 top-1/2 transform -translate-y-1/2 px-3 py-1.5 text-xs rounded bg-cyan-700 hover:bg-cyan-600 text-white border border-cyan-400 shadow z-10"
        >
          {debugPanelOpen ? 'Debug ▾' : 'Debug ▸'}
        </button>
      )}

      {/* Debug Panel - Only show in development when open */}
      {import.meta.env.DEV && debugPanelOpen && (
        <div className="fixed left-4 top-1/2 transform -translate-y-1/2 translate-y-8 bg-gray-900/95 backdrop-blur-sm text-white p-4 rounded-lg border border-gray-700 shadow-lg z-10 w-80">
          {/* Action Notes Box */}
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-cyan-400 mb-2">Action Notes</h3>
            <div className="bg-gray-800/80 rounded p-3 h-32 overflow-y-auto border border-gray-600">
              <div className="space-y-1">
                {actionNotes.map((note, index) => (
                  <div key={index} className="text-xs text-gray-300 font-mono">
                    <span className="text-cyan-500">[{String(index + 1).padStart(2, '0')}]</span> {note}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Development Tools */}
          <div>
            <h3 className="text-sm font-semibold text-cyan-400 mb-2">Development Tools</h3>
            <div className="space-y-2">
            <button
              onClick={() => {
                if (!gameStateRef.current) return;
                // TODO: Trigger cinematic analyzer when implemented
                setActionNotes(prev => [...prev, "Manual cinematic trigger test (not implemented yet)"]);
              }}
              className="w-full px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded"
            >
              Test Cinematic Analyzer
            </button>
            <button
              onClick={() => {
                if (!gameStateRef.current) return;
                const gs = gameStateRef.current;
                // Force spawn a special asteroid
                const specialAsteroid: Asteroid = {
                  position: { x: CANVAS_WIDTH * 0.7, y: CANVAS_HEIGHT * 0.3 },
                  velocity: { x: 0.5, y: 0.3 },
                  rotation: 0,
                  radius: 40,
                  size: 'large',
                  mass: 8,
                  health: 3,
                  maxHealth: 3,
                  rotationSpeed: 0.02,
                  special: true
                };
                gs.asteroids.push(specialAsteroid);
                setActionNotes(prev => [...prev, "Force spawned special asteroid"]);
              }}
              className="w-full px-2 py-1 bg-orange-600 hover:bg-orange-700 text-white text-xs rounded"
            >
              Spawn Special Asteroid
            </button>
            <button
              onClick={() => {
                if (!gameStateRef.current) return;
                const gs = gameStateRef.current;
                // Clear all asteroids except special ones
                const beforeCount = gs.asteroids.length;
                gs.asteroids = gs.asteroids.filter(a => a.special === true);
                const afterCount = gs.asteroids.length;
                setActionNotes(prev => [...prev, `Cleared ${beforeCount - afterCount} non-special asteroids`]);
              }}
              className="w-full px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded"
            >
              Clear to Special Only
            </button>
            <button
              onClick={() => {
                // Reset action notes
                setActionNotes(["Game initialized", "Waiting for player action..."]);
              }}
              className="w-full px-2 py-1 bg-gray-600 hover:bg-gray-700 text-white text-xs rounded"
            >
              Clear Notes
            </button>
            </div>
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        className={'bg-black rounded-lg p-4 shadow-2xl border border-cyan-500 relative'}
      >
        <canvas
          ref={canvasRef}
          width={canvasSize.w}
          height={canvasSize.h}
          className={'border border-gray-700 rounded cursor-none'}
        />
        {/* Bottom-right MadeWithChat badge */}
      <a
        href="https://madewithchat.com"
        target="_blank"
        rel="noreferrer"
        className="fixed right-4 z-50 flex items-center gap-2 opacity-80 hover:opacity-100 transition-opacity"
        aria-label="MadeWithChat"
        style={{ bottom: 'calc(var(--dock-offset,16px) + var(--dock-height,72px) + 8px)' }}
      >
        <img src={mwcLogo} alt="MadeWithChat Logo" className="h-8 w-auto select-none" draggable={false} />
        <span className="text-white/90 text-sm font-semibold">MadeWithChat</span>
      </a>
    </div>
      
      <div className="mt-4 text-center text-white flex flex-col items-center gap-4 relative">
        {/* Background tuning dropdown positioned bottom-right under gameplay area */}
        <div className="">
          <BackgroundDropdown
            open={bgToolsOpen}
            onToggle={() => setBgToolsOpen((o) => !o)}
            onNextBackground={() => {
              if (backdrops.length === 0) return;
              const next = (backdropIndex + 1) % backdrops.length;
              setBackdropIndex(next);
              const img = new Image();
              img.src = backdrops[next];
              img.onload = () => { bgImageRef.current = img; };
              img.onerror = () => { bgImageRef.current = null; };
            }}
            bgOpacity={bgOpacity}
            bgContrast={bgContrast}
            bgBrightness={bgBrightness}
            setBgOpacity={setBgOpacity}
            setBgContrast={setBgContrast}
            setBgBrightness={setBgBrightness}
            effectsApply={effectsApply}
            setEffectsApply={setEffectsApply}
            trailsEnabled={trailsEnabled}
            setTrailsEnabled={setTrailsEnabled}
            trailsStrength={trailsStrength}
            setTrailsStrength={setTrailsStrength}
            trailsTargets={trailsTargets}
            setTrailsTargets={setTrailsTargets}
          />
        </div>
        
        {/* Row 1: Gameplay controls with Song List toggle on the right */}
        <div className="flex gap-2 items-center w-full justify-between flex-wrap">
          {/* Left: gameplay controls */}
          <div className="flex gap-2 items-center flex-wrap">
            <div className="flex items-center gap-2 px-1 py-1">
              <label htmlFor="difficulty" className="sr-only">Difficulty</label>
              <select
                id="difficulty"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
                className="dock-select"
                aria-label="Difficulty"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            <button onClick={() => setShowInstructions(true)} className="dock-btn">Instructions</button>
            <button onClick={() => setIsPaused(p => !p)} className="dock-btn">{isPaused ? 'Resume' : 'Pause'}</button>
            <button onClick={toggleFitToWindow} className="dock-btn">{isFitted ? 'Original Size' : 'Fit to Window'}</button>
          </div>
          {/* Right: Song List toggle */}
          <div className="ml-auto">
            <button
              type="button"
              className="dock-btn"
              aria-expanded={showSongList}
              aria-controls="songlist-panel"
              aria-live="polite"
              onClick={() => setShowSongList((v) => !v)}
            >{showSongList ? 'Hide Song List' : 'Song List'}</button>
          </div>
        </div>

        {/* Song List: use the original small-pill list, just hidden until toggled */}
        {/* Rendering of the original list moved below and gated by showSongList */}

        {/* MusicDock bottom bar */}
        <MusicDock
          isPlaying={musicPlaying}
          onPlayPause={handlePlayPauseMusic}
          onPrev={handlePrevTrack}
          onNext={handleNextTrack}
          tracks={musicTracks.map(t => ({ name: formatTrackName(t.name), url: t.url }))}
          currentIndex={musicIndex}
          marqueeTitle={formatTrackName(musicTracks[musicIndex]?.name || '')}
          muted={isMuted}
          onToggleMute={toggleMute}
          musicVolume={musicVol}
          onMusicVolume={handleMusicVolume}
          sfxVolume={sfxVol}
          onSfxVolume={handleSfxVolume}
        />
        
        {gameState.player.doubleShooter > 0 && (
          <div className="text-sm text-orange-400">Double Shot: {Math.ceil(gameState.player.doubleShooter / 60)}s</div>
        )}
      </div>
      {showInstructions && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-900 text-white max-w-lg w-full mx-4 rounded-lg shadow-xl border border-cyan-500">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <h2 className="text-lg font-semibold text-cyan-400">Instructions</h2>
              <button
                onClick={() => setShowInstructions(false)}
                className="text-gray-300 hover:text-white"
                aria-label="Close"
              >✕</button>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <div>
                <h3 className="font-semibold text-cyan-300">Controls</h3>
                <ul className="list-disc ml-5 text-gray-300">
                  <li>Arrow Keys / WASD: Move & Rotate</li>
                  <li>Spacebar: Shoot</li>
                  <li>Enter: Start</li>
                  <li>R: Restart after Game Over</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-cyan-300">How to Play</h3>
                <ul className="list-disc ml-5 text-gray-300">
                  <li>Destroy all asteroids to complete the stage.</li>
                  <li>Avoid collisions with asteroids and alien bullets.</li>
                  <li>Collect bonuses: Shield (blue), Heal (green), Double Shooter (red).</li>
                  <li>Survive as long as possible and aim for a high score.</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-cyan-300">Difficulty</h3>
                <p className="text-gray-300">Use the selector above to choose Easy, Medium, or Hard:</p>
                <ul className="list-disc ml-5 text-gray-300">
                  <li><span className="text-green-400">Easy</span>: Fewer/slower asteroids, weaker enemy damage, more frequent bonuses.</li>
                  <li><span className="text-yellow-400">Medium</span>: Balanced (current default behaviors).</li>
                  <li><span className="text-red-400">Hard</span>: More/faster asteroids, stronger enemy damage, less frequent bonuses.</li>
                </ul>
              </div>
            </div>
            <div className="px-4 py-3 border-t border-gray-700 flex justify-end">
              <button
                onClick={() => setShowInstructions(false)}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded"
              >Got it</button>
            </div>
          </div>
        </div>
      )}

      {/* Risqué policy modal */}
      {showRisqueModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-900 text-white max-w-lg w-full mx-4 rounded-lg shadow-xl border border-pink-500">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <h2 className="text-lg font-semibold text-pink-300">Risqué Music Opt‑In</h2>
              <button
                onClick={() => setShowRisqueModal(false)}
                className="text-gray-300 hover:text-white"
                aria-label="Close"
              >✕</button>
            </div>
            <div className="p-4 space-y-3 text-sm leading-relaxed">
              <p>By proceeding, I solemnly swear:</p>
              <ul className="list-disc ml-5 text-gray-300 space-y-1">
                <li>I promise I have a sense of humor.</li>
                <li>I am not terminally woke and I won’t file a complaint with my keyboard.</li>
                <li>Whatever goes in my ears won’t hurt my brain (probably).</li>
                <li>I fully understand these songs are in bad taste and I really want to fucking hear them.</li>
              </ul>
              <div className="mt-3">
                <label htmlFor="skillQ" className="block text-pink-300 font-semibold mb-1">Skill‑testing question</label>
                <div className={`${risquePromptFlash ? 'text-red-400 animate-pulse' : 'text-gray-300'} mb-1 transition-colors`}>
                  Is flipit awesome? You must answer this question.
                </div>
                <input
                  id="skillQ"
                  type="text"
                  value={risqueAnswer}
                  onChange={(e) => { setRisqueAnswer(e.target.value); if (!/^\s*(y|yes)\s*$/i.test(e.target.value)) setRisqueAgreeChecked(false); }}
                  placeholder="Your answer"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-pink-500 text-white"
                />
                {/* Intentionally no hint about the correct answer */}
              </div>
              <label className="flex items-center gap-2 mt-2 select-none">
                <input
                  type="checkbox"
                  checked={risqueAgreeChecked}
                  onClick={(e) => {
                    if (!risqueAnswerValid) {
                      e.preventDefault();
                      setRisquePromptFlash(true);
                      setTimeout(() => setRisquePromptFlash(false), 800);
                      const el = document.getElementById('skillQ') as HTMLInputElement | null;
                      if (el) el.focus();
                    }
                  }}
                  onChange={(e) => {
                    if (!risqueAnswerValid) return; // ignore until answered correctly
                    setRisqueAgreeChecked(e.target.checked);
                  }}
                />
                <span>I agree to turn on risqué music.</span>
              </label>
            </div>
            <div className="px-4 py-3 border-t border-gray-700 flex justify-end gap-2">
              <button
                onClick={() => setShowRisqueModal(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded"
              >Cancel</button>
              <button
                onClick={() => {
                  // Block if question not correctly answered: flash prompt and focus input
                  if (!risqueAnswerValid) {
                    setRisquePromptFlash(true);
                    setTimeout(() => setRisquePromptFlash(false), 800);
                    const el = document.getElementById('skillQ') as HTMLInputElement | null;
                    if (el) el.focus();
                    return;
                  }
                  // Also require explicit agreement checkbox
                  if (!risqueAgreeChecked) {
                    setRisquePromptFlash(true);
                    setTimeout(() => setRisquePromptFlash(false), 800);
                    return;
                  }
                  // Enable risqué tracks and refresh list
                  const ssR = soundSystem as unknown as { setRisqueEnabled?: (e: boolean) => void };
                  if (typeof ssR.setRisqueEnabled === 'function') {
                    ssR.setRisqueEnabled(true);
                  }
                  const tracks = soundSystem.getMusicTracks();
                  setMusicTracks(tracks);
                  // Choose the first risqué track: prefer name starting with 'S1', else first starting with 'S'
                  let idx = 0;
                  const s1 = tracks.findIndex(t => /^s1\b/i.test(t.name));
                  if (s1 >= 0) idx = s1; else {
                    const sAny = tracks.findIndex(t => /^s\d+/i.test(t.name));
                    if (sAny >= 0) idx = sAny;
                  }
                  setMusicIndex(idx);
                  if (tracks.length > 0 && !isMuted) {
                    safePlayMusic(idx);
                  } else if (tracks.length > 0) {
                    soundSystem.selectMusicTrack(idx);
                  }
                  setShowRisqueModal(false);
                }}
                className={`px-4 py-2 rounded ${risqueAgreeChecked && risqueAnswerValid ? 'bg-pink-600 hover:bg-pink-700' : 'bg-pink-900 text-pink-300 cursor-not-allowed'}`}
              >Turn On Risqué Music</button>
            </div>
          </div>
        </div>
      )}
      
      {/* Track list with subtle red glow (original). Shown only when Song List is toggled. */}
      {showSongList && musicTracks.length > 0 && (
        <div className="mt-3 w-full max-w-4xl flex flex-wrap justify-center gap-2">
          {musicTracks.map((t, i) => (
            <button
              key={t.url}
              onClick={() => {
                setMusicIndex(i);
                soundSystem.selectMusicTrack(i);
                if (!isMuted) {
                  safePlayMusic(i);
                }
              }}
              className={
                `px-1.5 py-0.5 rounded text-[0.5rem] transition-transform ` +
                `${i === musicIndex ? 'bg-red-700/40 text-white ring-1 ring-red-400' : 'bg-gray-800/60 text-gray-200'} ` +
                // Only risqué tracks (S*) keep the red glow
                `${/^s\d+/i.test(t.name) ? 'shadow-[0_0_10px_rgba(255,0,0,0.35)]' : ''} ` +
                `hover:scale-105`
              }
              title={t.name}
            >
              {formatTrackName(t.name)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default Game;