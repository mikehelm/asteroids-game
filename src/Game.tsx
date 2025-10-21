import React, { useRef, useEffect, useState, useCallback, useMemo, useLayoutEffect } from 'react';
import { startGridScan, advanceGridScanDt, advanceGridRetractDt, isGridComplete } from './tractorBeam/state';
import { beamUi } from './config/beamUi';
import mwcLogo from '../images/Made With Chat Logo.png';
import { YouTubeCredit } from './components/YouTubeCredit';
import { YouTubeQuotaDisplay } from './components/YouTubeQuotaDisplay';
import { VirtualJoystick } from './components/VirtualJoystick';
import { TouchControls } from './components/TouchControls';
import type { YouTubeVideo, YouTubeChannel, MusicSource } from './youtube/types';
import { GameState, AlienShip, AlienBullet, Explosion, Asteroid, VisualDebris } from './types';
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
import { triggerScreenShake, updateScreenShake, getShakeIntensityForSize } from './utils/screenShake';
import {
  createBullet,
  createAlienShip,
  createScienceVessel,
  createAlienBullet,
  updateAsteroid,
  splitAsteroid,
  createExplosion,
  updateExplosion,
  createAlienExplosion,
  createMotherShipExplosion,
  createUfoSuperExplosionLight,
  createBonus,
  createBlackPuffExplosion,
} from './gameObjects';
import { LASER_HIT_DAMAGE, MISSILE_HIT_DAMAGE } from './gameLoop/constants';
import { ExplosionDistortionManager } from './effects/ExplosionDistortion';
import { applyVelocityCap, VELOCITY_CAPS } from './systems/velocityCap';
import TitleBanner from './ui/TitleBanner';
import MusicDock from './ui/MusicDock';
import InfoPopup from './ui/InfoPopup';
import BackgroundDropdown from './ui/BackgroundDropdown';
import { saveResumeInfo, installMusicResumePersistence } from './ui/persistence';
import { saveFxPreset, loadFxPreset, clearFxPreset, loadFxCap, clearFxCap } from './ui/fxPersistence';
import { applyFxPreset } from './gameLoop/fxPresets';
import { getFxConfig, FX_DEFAULTS } from './gameLoop/fxConfig';
import { DEV_MODE, logDevBanner, log, logOnce, logThrottle, devFrameError } from './dev/logger';
import { installDevHotkeys } from './dev/hotkeys';
import { useRenderClock, freezeRenderClockOnPause } from './gameLoop/pauseClock';
import { createInputHandlers } from './gameLoop/inputHandlers';
import { createMusicControls } from './ui/musicControls';
import { emitUiEvent } from './events';
import {
  initTractorBeamState,
} from './tractorBeam';
import { applyFitSizing, toggleFitToWindow } from './ui/canvasSizing';
import { regenerateStars, ensureStarsForCanvas } from './gameLoop/starfield';
import { formatTrackName } from './ui/musicUtils';
import { Scoreboard, ScoreboardDisplay, getCurrentUser } from './components/Scoreboard';
import { saveScore, resetCurrentGameTickets, getCurrentGameTickets } from './components/Scoreboard/storage';
import { TicketRandomizer } from './components/TicketRandomizer';
import { LoginModal } from './components/Auth';
import { panFromX } from './ui/audioUtils';
import { enqueueTitle, shouldSuppress, seenRecently } from './ui/titleOverlays';
import { update as updateFrame } from './gameLoop/update';
import { createRefuelStation, createRewardShip, devLogSpawns } from './gameLoop/worldTargets';
import { initGame as initGameMod } from './gameLoop/initGame';
import { spawnImpactDebris, chooseAsteroidDebrisPalette, markArtifactEdgeGlow } from './gameLoop/debris';
import { createStageAsteroids } from './gameLoop/staging';
import { drawBackground } from './gameLoop/drawLayers/drawBackground';
import { drawShield } from './gameLoop/drawLayers/drawShield';
import { drawAsteroidScanGrid } from './gameLoop/drawLayers/drawAsteroidScanGrid';
import { WORLD_GRID_SIZE, DEFAULT_BG_BRIGHTNESS, DEV_SUMMARY_FRAMES } from './gameLoop/constants';
import { WORLD_MIN_TILE, WORLD_MAX_TILE } from './constants';
// (duplicate import removed)
  import {
    draw as drawFrame,
    drawStars,
    drawDebris as drawDebrisMod,
    drawExplosions as drawExplosionsMod,
    drawPlayer as drawPlayerMod,
    drawSpecialAsteroids as drawSpecialAsteroidsMod,
    drawNormalAsteroids as drawNormalAsteroidsMod,
    drawAliens as drawAliensMod,
    drawBullets as drawBulletsMod,
    drawBonuses as drawBonusesMod,
    drawAlienBullets as drawAlienBulletsMod,
    drawPlayerMissiles as drawPlayerMissilesMod,
    drawTractorOverlay,
    drawHUD,
    drawMiniMap,
    drawObjectives,
    withPlayerDockingXform,
  } from './gameLoop/draw';

if (DEV_MODE) { logDevBanner(); }
let __frameCounter = 0;
const __DEV_MODE__ = DEV_MODE;
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
  // Render clock refs (initialized with performance.now())
  const { bootStartRef, lastFrameNowRef } = useRenderClock({});
  // Dev-tunable FX config (refs.fxConfig). Defaults preserve visuals if unset.
  const fxConfigRef = useRef<any>(null);
  // Stable holder used by DEV preset buttons so we can mutate refs.fxConfig at runtime
  const devFxRefs = useRef<{ fxConfig?: any }>({ fxConfig: fxConfigRef.current });
  // Soft FPS cap helper
  const lastProcessedRef = useRef<number>(0);
  // Dev UI nudge removed - no longer needed

  // Starfield helpers imported; call ensureStarsForCanvas with deps where needed
  // Backdrops and current index
  const [backdrops, setBackdrops] = useState<string[]>([]);
  const [backdropIndex, setBackdropIndex] = useState<number>(0);
  const musicAutoStartedRef = useRef<boolean>(false);
  const armNextTrackOnShotRef = useRef<boolean>(false);
  const baseCanvasRef = useRef<{w: number, h: number}>({ w: CANVAS_WIDTH, h: CANVAS_HEIGHT });
  // Helper: directly set the canvas pixel size and remember base dims
  const setCanvasPixelSize = useCallback((s: { w: number; h: number }) => {
    const c = canvasRef.current;
    if (c) {
      const w = Math.max(1, Math.floor(s.w));
      const h = Math.max(1, Math.floor(s.h));
      c.width = w;
      c.height = h;
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
    }
    baseCanvasRef.current = { w: s.w, h: s.h };
    try { setCanvasDims({ w: s.w, h: s.h }); } catch { /* State update can fail, ignore */ }
  }, []);


  // Fit helper: ensure stars density matches current canvas size
  const ensureStarsWrapper = useCallback(() => {
    try {
      ensureStarsForCanvas({
        starsRef,
        initialAreaRef,
        initialStarCountRef,
        CANVAS_WIDTH,
        CANVAS_HEIGHT,
      });
    } catch { /* Ignore star generation errors */ }
  }, []);
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
  // Background tuning controls (defaults updated per user: opacity 50%, brightness 50%)
  const [bgOpacity, setBgOpacity] = useState(0.5);
  const [bgBrightness, setBgBrightness] = useState(0.5);
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
  // Strength is fixed at 0.20 (0.08 = subtle, 0.25 = capped strong)
  const trailsStrength = 0.20;
  // Performance mode default ON per user: reduces expensive effects during heavy scenes
  const [perfMode] = useState<boolean>(true);
  // Per-item selection (scaffolding for per-item buffers)
  const [trailsTargets, setTrailsTargets] = useState<{ player: boolean; ufos: boolean; asteroids: boolean }>({
    player: true,
    ufos: true,
    asteroids: true,
  });
  // Refs mirrored for use inside animation loop
  const bgOpacityRef = useRef(bgOpacity);
  const bgContrastRef = useRef(1.0); // Fixed at 100%
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
  
  // Auto-destruction sequence for final small asteroids
  const autoDestructionActiveRef = useRef<boolean>(false);
  const autoDestructionStartRef = useRef<number>(0);
  const autoDestructionInitialCountRef = useRef<number>(0);
  const autoDestructionNextDelayRef = useRef<number>(0); // Delay until next explosion (ms)
  const autoDestructionScoreRandomizerShownRef = useRef<boolean>(false); // Track if score-based randomizer shown
  const autoDestructionBonusRandomizerPendingRef = useRef<boolean>(false); // Track if bonus randomizer needs to show
  const autoDestructionScoreRef = useRef<number>(0); // Track score for bonus calculation
  const gameOverPendingRef = useRef<boolean>(false); // Track if game over should trigger after auto-destruction
  
  // Science vessel thief tracking
  const scienceVesselsToSpawnRef = useRef<number>(0); // How many science vessels should spawn this stage
  const scienceVesselsSpawnedRef = useRef<number>(0); // How many have spawned so far this stage
  const firstScienceVesselTimeRef = useRef<number>(0); // Random spawn time for first vessel
  const scienceVesselAlertShownRef = useRef<boolean>(false); // Track if alert was shown
  const reversedControlsUntilRef = useRef<number>(0); // Timestamp until controls are reversed
  const bubbleEffectUntilRef = useRef<number>(0); // Timestamp until bubble effect is shown
  
  // Double-tap detection for dash ability
  const lastKeyPressTimeRef = useRef<{ [key: string]: number }>({});
  const rotationBeforeFirstPressRef = useRef<{ [key: string]: number }>({});
  const DOUBLE_TAP_WINDOW_MS = 220; // 220ms window to detect double-tap (reduced from 300ms for less sensitivity)
  
  // Screen shake system for juice
  const screenShakeRef = useRef<{ x: number; y: number; intensity: number; duration: number }>({ x: 0, y: 0, intensity: 0, duration: 0 });
  const screenShakeStartRef = useRef<number>(0);
  
  // Combo system for score multipliers
  const comboCountRef = useRef<number>(0);
  const lastKillTimeRef = useRef<number>(0);
  const comboTimeoutMs = 3000; // 3 seconds to keep combo alive
  const [, setComboMultiplier] = useState<number>(1);
  const [comboDisplay, setComboDisplay] = useState<{ count: number; multiplier: number; showUntil: number } | null>(null);
  
  // Game stats tracking removed - no longer used
  
  // InfoPopup state and pause behavior
  const [infoOpen, setInfoOpen] = useState(false);
  const uiPausedRef = useRef(false);
  const gameStartTimeRef = useRef<number>(0);
  const autoPopupShownRef = useRef(false);
  // DEV console buffer state (DEV-only rendering)
  const [devMax, setDevMax] = useState<boolean>(false);
  const [showStats] = useState(false); // Legacy - no longer shown but referenced
  const devLines: string[] = []; // Dev lines buffer
  
  // First-time reward notifications
  const seenRewardsRef = useRef<Set<string>>(new Set());
  const [rewardNotifications, setRewardNotifications] = useState<Array<{
    id: number;
    text: string;
    x: number;
    y: number;
    startTime: number;
    duration: number;
  }>>([]);

  // Link infoOpen to UI pause (render still continues)
  useEffect(() => {
    uiPausedRef.current = infoOpen;
    // Auto-pause game when InfoPopup is open
    setIsPaused(infoOpen);
  }, [infoOpen]);

  // Persist "shown once per session" in sessionStorage to avoid re-showing on music changes or restarts
  useEffect(() => {
    try {
      const s = sessionStorage.getItem('flipit.infoPopupShown');
      autoPopupShownRef.current = s === '1';
    } catch {}
  }, []);

  // Auto-fit canvas to window on mount and on resize before first paint
  useLayoutEffect(() => {
    const deps = {
      initialCanvasRef: baseCanvasRef,
      ensureStarsForCanvas: ensureStarsWrapper,
      setCanvasSize,
      setCanvasPixelSize,
      setIsFitted: (_b: boolean) => { /* no-op here; UI toggle can provide its own */ },
      renderScale: 1,
    } as const;
    // Initial fit
    applyFitSizing(deps);
    // Initialize game immediately after sizing to ensure globals and canvas match
    if (!bootInitDoneRef.current) {
      bootInitDoneRef.current = true;
      initGame();
      try { logOnce('init:game:mount', '[init:game]', { reason: 'layout-fit' }); } catch {}
    }
    // Resize listener
    const onResize = () => {
      applyFitSizing(deps);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [ensureStarsWrapper, setCanvasPixelSize]);

  // When the popup opens (either auto or manual), mark as shown for this session
  useEffect(() => {
    if (infoOpen) {
      autoPopupShownRef.current = true;
      try { sessionStorage.setItem('flipit.infoPopupShown', '1'); } catch {}
    }
  }, [infoOpen]);
  
  useEffect(() => { bgOpacityRef.current = bgOpacity; }, [bgOpacity]);
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
  useEffect(() => { trailsTargetsRef.current = trailsTargets; }, [trailsTargets]);
  useEffect(() => { perfModeRef.current = perfMode; }, [perfMode]);
  useEffect(() => { uiPausedRef.current = infoOpen; }, [infoOpen]);
  // Local state for current canvas dimensions (do NOT shadow utils.setCanvasSize)
  const [canvasSize, setCanvasDims] = useState<{w: number, h: number}>({ w: CANVAS_WIDTH, h: CANVAS_HEIGHT });
  const [isFitted, setIsFitted] = useState(false);
  const isFittedRef = useRef(isFitted);
  useEffect(() => { isFittedRef.current = isFitted; }, [isFitted]);
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
    postPushVelocity?: { x: number; y: number };
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
  
  // Auto-fire feature (on by default)
  const [autoFireEnabled, setAutoFireEnabled] = useState(true);
  const autoFireEnabledRef = useRef(autoFireEnabled);
  useEffect(() => { autoFireEnabledRef.current = autoFireEnabled; }, [autoFireEnabled]);
  const lastAutoFireRef = useRef<number>(0);
  
  // Mobile/touch controls
  const [isMobile] = useState(() => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  const touchRotationRef = useRef<number | null>(null);
  const touchThrustRef = useRef<number>(0);
  const touchFireActiveRef = useRef<boolean>(false);
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
  // Centralized music controls (volume-only mute, safePlay, prev/next, etc.)
  const controls = useMemo(() => createMusicControls({
    soundSystem,
    isMutedRef,
    setIsMuted,
    musicVolState: [musicVol, setMusicVol],
    sfxVolState: [sfxVol, setSfxVol],
    musicUserPausedRef,
    setMusicPlaying,
    setMusicUserPaused,
    setMusicIndex,
  }), [musicVol, sfxVol]);
  // Music persistence key and in-memory resume storage
  // Boot initialization gate
  const bootInitDoneRef = useRef(false);
  // Music resume persistence
  const MUSIC_RESUME_KEY = 'flipit_music_resume_v1';
  // Decode UI timings
  // const DECODE_DURATION_MS   = 1200;            // unused (beamUi.DECODE_DURATION_MS used instead)
  // const MULTIPLIER_DELAY_MS  = 300;             // unused (beamUi.MULTIPLIER_DELAY_MS used instead)
  // const CLEANUP_FADE_MS      = 600;             // unused
  // (Dev HUD/toasts removed)
  const resumeInfoRef = useRef<{ index: number; offsetSec: number } | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showSongList, setShowSongList] = useState(false);
  const [showQuotaDisplay, setShowQuotaDisplay] = useState(false);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('easy');
  
  // YouTube Music Integration State
  const [youtubeVideo, setYouTubeVideo] = useState<YouTubeVideo | null>(null);
  const [youtubeChannel, setYouTubeChannel] = useState<YouTubeChannel | null>(null);
  const [youtubeIsPlaying, setYouTubeIsPlaying] = useState(false);
  const [musicSource, setMusicSource] = useState<MusicSource>('local'); // Default to local (no API calls!)
  const [youtubeEnabled, setYouTubeEnabled] = useState(false); // Disabled by default
  const [customChannelUrl, setCustomChannelUrl] = useState('');
  const [channelLoading, setChannelLoading] = useState(false);
  const [channelError, setChannelError] = useState('');
  // Stable refs for values used inside callbacks to avoid unnecessary deps
  // We mirror difficulty into a ref for use inside stable callbacks (e.g., key handlers, gameLoop)
  // to avoid expanding dependency arrays and re-creating those callbacks every state change.
  const difficultyRef = useRef(difficulty);
  useEffect(() => { difficultyRef.current = difficulty; }, [difficulty]);
  
  // Song list click-outside handler
  const songListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showSongList) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      if (songListRef.current && !songListRef.current.contains(event.target as Node)) {
        setShowSongList(false);
      }
    };
    
    // Add small delay before adding listener to prevent immediate close
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);
    
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSongList]);
  
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

  // Minimal local helper to trigger level-end ducking using existing refs/state
  const triggerLevelEndDucking = () => {
    // Snapshot current volumes
    musicVolOrigRef.current = musicVol;
    sfxVolOrigRef.current = sfxVol;
    // Begin boost phase and timestamp
    duckPhaseRef.current = 'boost';
    duckT0Ref.current = performance.now();
    // Immediate adjustment; ramp/restore handled elsewhere per existing logic
    try { soundSystem.setMusicVolume(Math.max(0, musicVol * 0.35)); } catch {}
    try { soundSystem.setSfxVolume(Math.min(1, sfxVol + 0.3)); } catch {}
  };

  

  // Delegate to controls for safe playback
  const safePlayMusic = (index?: number) => controls.safePlayMusic(index);

  const handlePrevTrack = () => controls.prev();
  const handleNextTrack = () => controls.next();

  // (Target rings removed per user request)

  // Toggle Fit-to-Window handler that delegates to extracted helper with proper deps
  const onToggleFit = useCallback(() => {
    const ensureStarsForCanvasCb = () =>
      ensureStarsForCanvas({
        starsRef,
        initialAreaRef,
        initialStarCountRef,
        CANVAS_WIDTH,
        CANVAS_HEIGHT,
      });

    toggleFitToWindow(
      {
        initialCanvasRef,
        ensureStarsForCanvas: ensureStarsForCanvasCb,
        setCanvasSize,
        setCanvasPixelSize,
        setIsFitted,
      },
      isFittedRef
    );
  }, [setIsFitted]);


// ...

// Level-end background crossfade
const levelEndStartRef = useRef<number>(0);
const fadeInStartRef = useRef<number>(0);
const fadeInActiveRef = useRef<boolean>(false);
const gameOverStartRef = useRef<number | null>(null);

// ...

// Pause control (game auto-start behavior remains unchanged)
const [isPaused, setIsPaused] = useState(false);
const isPausedRef = useRef(false);
useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
// Track if any modal/popup is open (needed by gameLoop closure)
const anyModalOpenRef = useRef(false);
// Freeze clock for rendering while paused (UI-only time freeze)
const pauseFreezeNowRef = useRef<number | undefined>(undefined);

// Helper: directly set the canvas pixel size and remember base dims
  // Instantiate keyboard handlers via factory (stable identity)
  const { onKeyDown, onKeyUp } = useMemo(() => createInputHandlers({
    gameStateRef,
    isPausedRef,
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    soundSystem,
    requestRestart: () => { try { initGame(); } catch {} },

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
    toggleDebugHud: () => setShowDebugHud(v => !v),
    
    // Dash ability
    lastKeyPressTimeRef,
    rotationBeforeFirstPressRef,
    DOUBLE_TAP_WINDOW_MS,
  }), []);

  // Attach keyboard listeners
  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [onKeyDown, onKeyUp]);

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
  
  useEffect(() => {
    freezeRenderClockOnPause({ isPausedRef, pauseFreezeNowRef });
    log('pause:toggle', { paused: isPaused });
  }, [isPaused]);
  // Music UX toggles (UI only)
  // Removed unused music UX toggles to satisfy lint (no functional change)
  // Risqué music opt-in
  const [showRisqueModal, setShowRisqueModal] = useState(false);
  const [risqueAgreeChecked, setRisqueAgreeChecked] = useState(false);
  const [risqueAnswer, setRisqueAnswer] = useState('');
  
  // Scoreboard state
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [finalStage, setFinalStage] = useState(1);
  const [rewardAmount, setRewardAmount] = useState(0);
  const [targetScoreIdLeaderboard, setTargetScoreIdLeaderboard] = useState<string | undefined>(undefined);
  
  // Auth state
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [currentUser, setCurrentUser] = useState(getCurrentUser());
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  
  // Ticket randomizer state
  const [showTicketRandomizer, setShowTicketRandomizer] = useState(false);
  const [randomizerFlipitPercent, setRandomizerFlipitPercent] = useState(0);
  
  // Sync anyModalOpenRef with modal states (must be after all state declarations)
  useEffect(() => {
    anyModalOpenRef.current = showTicketRandomizer || showScoreboard || showLeaderboard || showLoginModal || showInstructions || showRisqueModal || showStats || infoOpen;
  }, [showTicketRandomizer, showScoreboard, showLeaderboard, showLoginModal, showInstructions, showRisqueModal, showStats, infoOpen]);
  
  // Stable callback for ticket randomizer to prevent animation restart
  const handleTicketRandomizerComplete = useCallback(() => {
    setShowTicketRandomizer(false);
    
    // Check if we need to show bonus randomizer for high scores
    if (autoDestructionBonusRandomizerPendingRef.current) {
      autoDestructionBonusRandomizerPendingRef.current = false;
      const bonusScore = autoDestructionScoreRef.current - 10000;
      const bonusChance = (bonusScore / 10000) * 100;
      
      if (bonusChance > 0) {
        // Show bonus randomizer after a short delay
        setTimeout(() => {
          setRandomizerFlipitPercent(bonusChance);
          setShowTicketRandomizer(true);
        }, 800);
      }
    }
  }, []); // No dependencies needed since we use refs
  
  const risqueAnswerValid = /^\s*(y|yes)\s*$/i.test(risqueAnswer);
  const [risquePromptFlash, setRisquePromptFlash] = useState(false);

  // Helper extracted to ui/musicUtils.ts
  
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


  // Song title overlay animation (typing + fade + float)
  const titleOverlaysRef = useRef<Array<{ id: number; text: string; start: number }>>([]);
  const nextTitleIdRef = useRef<number>(1);
  // Prevent double title at song start (some code paths notify twice: select + play)
  const lastTitleInfoRef = useRef<{ index: number; ts: number } | null>(null);
  // Window in which we suppress listener-driven title enqueues (used for first start)
  const suppressTitleUntilRef = useRef<number>(0);


  // Periodically persist playback info while playing; also on tab hide/unload
  useEffect(() => {
    const save = () => {
      try {
        const info = soundSystem.getPlaybackInfo();
        if (info.isPlaying || info.offsetSec > 0) {
          const data = { index: info.index, offsetSec: info.offsetSec };
          saveResumeInfo(MUSIC_RESUME_KEY, data);
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

  // Set up YouTube state change listener (don't init automatically - wait for user to enable)
  useEffect(() => {
    // Set up YouTube state change listener
    soundSystem.onYouTubeStateChange((video, channel, isPlaying) => {
      setYouTubeVideo(video);
      setYouTubeChannel(channel);
      setYouTubeIsPlaying(isPlaying);
    });
    
    // Note: YouTube init happens when user enables it (see checkbox onChange)
    console.log('🎮 Game loaded with local music only (0 API calls). Enable YouTube to load playlist.');
  }, []);

  useEffect(() => {
    // Single handler: keep UI index in sync and show the title after 2s
    soundSystem.setOnMusicTrackChange((index: number) => {
      setMusicIndex(index);
      const now = performance.now();
      // Suppress during guarded window (e.g., first-start manual enqueue)
      if (shouldSuppress({ listRef: titleOverlaysRef, nextIdRef: nextTitleIdRef, suppressUntilRef: suppressTitleUntilRef })) {
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
        const dup = seenRecently({ listRef: titleOverlaysRef, nextIdRef: nextTitleIdRef }, `♪ ${formatted}`, 4000);
        if (dup) return;
        enqueueTitle({ listRef: titleOverlaysRef, nextIdRef: nextTitleIdRef }, `♪ ${formatted}`, 0);
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
    
    // Reset game over state for fresh start
    gameOverStartRef.current = null;
    
    // Reset current game tickets for new game
    resetCurrentGameTickets();

    const spawnW = (canvasRef.current?.width ?? CANVAS_WIDTH);
    const spawnH = (canvasRef.current?.height ?? CANVAS_HEIGHT);

    initGameMod({
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
      gameStateRef: gameStateRef as any,
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
      DEV_MODE: __DEV_MODE__,
    });
    lastIntroStepRef.current = 0;
  }, []);

  // Handle initial click: restart if game over and prime music playback/select
  const handleClick = useCallback(() => {
    // If game over, clicking restarts (also allow starting music on same click)
    if (gameStateRef.current && !gameStateRef.current.gameRunning) {
      initGame();
    }
  }, [initGame]);

  // (mount-only init moved into useLayoutEffect after initial fit)

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

  // Install periodic/visibility/unload persistence for music resume (every 3s; same guards)
  useEffect(() => {
    const cleanup = installMusicResumePersistence({
      soundSystem,
      key: MUSIC_RESUME_KEY,
      setMusicIndex,
      resumeInfoRef,
      saveResumeInfo,
    });
    return cleanup;
  }, []);

  // Dev-only: hotkeys for summary (` or D) and tile dump (T)
  useEffect(() => {
    const cleanup = installDevHotkeys({
      getGameState: () => gameStateRef.current,
      appendDebugLine: (s) => {
        const arr = debugLinesRef.current;
        arr.push(s);
        if (arr.length > 200) arr.splice(0, arr.length - 200);
      },
      getFrameCounter: () => __frameCounter,
    });
    return cleanup;
  }, []);

  // Touch control handlers for mobile
  const handleJoystickMove = useCallback((angle: number | null, distance: number) => {
    if (angle !== null) {
      touchRotationRef.current = angle;
      touchThrustRef.current = distance;
      
      // Apply rotation to player
      const gs = gameStateRef.current;
      if (gs && gs.player) {
        gs.player.rotation = angle;
        
        // Apply thrust if distance > threshold
        if (distance > 0.2) {
          gs.keys['ArrowUp'] = true;
          gs.keys['w'] = true;
        } else {
          delete gs.keys['ArrowUp'];
          delete gs.keys['w'];
        }
      }
    } else {
      touchRotationRef.current = null;
      touchThrustRef.current = 0;
      
      // Release thrust
      const gs = gameStateRef.current;
      if (gs) {
        delete gs.keys['ArrowUp'];
        delete gs.keys['w'];
      }
    }
  }, []);

  const handleTouchFire = useCallback((active: boolean) => {
    touchFireActiveRef.current = active;
    
    const gs = gameStateRef.current;
    if (!gs || !gs.player) return;
    
    if (active) {
      // Simulate spacebar press
      gs.keys[' '] = true;
      
      // Fire bullet using same logic as keyboard
      if (gs.stage === 1) {
        const spread = 0.10;
        gs.bullets.push(createBullet(gs.player.position, gs.player.rotation));
        gs.bullets.push(createBullet(gs.player.position, gs.player.rotation - spread));
        gs.bullets.push(createBullet(gs.player.position, gs.player.rotation + spread));
      } else {
        const stacks = gs.player.doubleShooterStacks || 0;
        if (gs.player.doubleShooter > 0 && stacks >= 2) {
          const spread = 0.12;
          const angles = [
            gs.player.rotation - spread * 1.5,
            gs.player.rotation - spread * 0.5,
            gs.player.rotation + spread * 0.5,
            gs.player.rotation + spread * 1.5,
          ];
          for (const a of angles) gs.bullets.push(createBullet(gs.player.position, a));
        } else if (gs.player.doubleShooter > 0 && stacks >= 1) {
          const spread = 0.12;
          gs.bullets.push(createBullet(gs.player.position, gs.player.rotation - spread));
          gs.bullets.push(createBullet(gs.player.position, gs.player.rotation + spread));
        } else {
          gs.bullets.push(createBullet(gs.player.position, gs.player.rotation));
        }
      }
      soundSystem.playPlayerShoot();
    } else {
      delete gs.keys[' '];
    }
  }, []);

  const handleTouchMissile = useCallback(() => {
    const gs = gameStateRef.current;
    if (!gs) return;
    
    // Simulate Enter key press for missile
    gs.keys['Enter'] = true;
    setTimeout(() => {
      if (gs) delete gs.keys['Enter'];
    }, 100);
  }, []);

  const handleTouchDash = useCallback((direction: 'forward' | 'backward' | 'left' | 'right') => {
    const gs = gameStateRef.current;
    if (!gs || !gs.player) return;
    
    // Simulate double-tap for dash
    const keyMap = {
      forward: 'w',
      backward: 's',
      left: 'a',
      right: 'd',
    };
    
    const key = keyMap[direction];
    
    // Trigger dash by simulating double-tap
    gs.keys[key] = true;
    setTimeout(() => {
      if (gs) gs.keys[key] = true;
    }, 50);
    setTimeout(() => {
      if (gs) delete gs.keys[key];
    }, 150);
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

  

  



  
  
  

  

  
  
  
  /* UI drawing previously done locally has been refactored to modular drawHUD/drawMiniMap/drawObjectives.
   * Any remaining deltas should be extracted in future work. */

  // Game loop
  const gameLoop = useCallback(() => {
    if (!gameStateRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Optional soft FPS cap: skip this tick if within min frame interval
    const cfgCap = getFxConfig({ refs: { fxConfig: devFxRefs.current.fxConfig } }).capFps;
    if (Number.isFinite(cfgCap as number) && (cfgCap as number) > 0) {
      const now = performance.now();
      const minDelta = 1000 / (cfgCap as number);
      if (now - lastProcessedRef.current < minDelta) {
        animationFrameRef.current = requestAnimationFrame(gameLoop);
        return; // skip frame; order of update/draw remains unchanged for processed frames
      }
      lastProcessedRef.current = now;
    }

    const gameState = gameStateRef.current;

    // Dev: throttle summary instead of per-30-frame spam
    if (__DEV_MODE__) {
      const gs = gameStateRef.current as any;
      const f = ++__frameCounter;
      logThrottle('summary', 2000, () => ({
        frame: f,
        asteroidCount: gs?.asteroids?.length ?? 0,
        bulletCount: gs?.bullets?.length ?? 0,
        debrisCount: gs?.visualDebris?.length ?? 0,
        explosionsCount: gs?.explosions?.length ?? 0,
        tractorPhase: gs?.tractorBeam?.phase ?? 'idle',
        bgBrightness: gs?.bgBrightness ?? DEFAULT_BG_BRIGHTNESS,
      }));
    }

    // When paused, we still render the frame (updates are skipped below via isPausedRef guards).

    // Auto-open popup 2 seconds after game starts (only once per game session)
    // Don't show if scoreboard/completion screens are active
  if (!autoPopupShownRef.current && gameStartTimeRef.current > 0 && gameState.gameRunning && !gameOverStartRef.current && !anyModalOpenRef.current) {
    const elapsed = lastFrameNowRef.current - gameStartTimeRef.current;
    if (elapsed >= 2000) { // 2 seconds
      autoPopupShownRef.current = true;
      setInfoOpen(true);
      }
    }

    // Draw a tiny floating control for Distortion toggle (top-left under score)
    // Note: kept lightweight; UI paint happens later in drawUI via React

    // Death bursts: moved to after env construction to honor runtime FX presets.

    // Apply slow motion during traction beam
    const traction = tractionBeamRef.current;
    const slowMotionFactor = traction.slowMotionActive ? 0.5 : 1.0;
    const deltaTime = 16 * slowMotionFactor;

    // Check if any modal/popup is open (use ref to avoid stale closure)
    const anyModalOpen = anyModalOpenRef.current;

    // Define the per-frame body wrapper used below
    const __runFrameBody = () => {
      // Pass A: compute now/dt once and thread to stubbed update/draw
      const frameNow = performance.now();
      // Expose per-frame now to render/UI so no resampling occurs
      lastFrameNowRef.current = frameNow;
      const dt = deltaTime;
      const bootMs = frameNow - bootStartRef.current;
      const isBootSettled = (
        bootMs >= 1000 &&
        Number.isFinite((gameState as any).worldTileX) &&
        Number.isFinite((gameState as any).worldTileY) &&
        Number.isFinite(gameState.player?.position?.x as number) &&
        Number.isFinite(gameState.player?.position?.y as number)
      );
      // Freeze render time while paused so animated UI layers become static
      const renderNow = isPausedRef.current ? (pauseFreezeNowRef.current ?? frameNow) : frameNow;
      const env = {
        VITE_ENV: import.meta.env?.VITE_ENV,
        DEFAULT_BG_BRIGHTNESS,
        frameNow: renderNow,
        isBootSettled,
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
          // Traction beam state for overlays and asteroid scan grid
          tractionBeamRef,
          // Stars and warp particles
          starsRef,
          initialAreaRef,
          isPausedRef,
          warpParticlesRef,
          fadeInActiveRef,
          fadeInStartRef,
          distortionRef,
          levelEndStartRef,
          INTRO_ZOOM_DUR_MS,
          START_ZOOM_EXTRA,
          DUCK_HOLD_MS,
          backdrops,
          introZoomStartRef,
          // Boot clock reference for early-frame guards in draw module
          bootStartRef,
          // Dev perf config overrides (optional)
          fxConfig: devFxRefs.current.fxConfig,
          // Provide soundSystem for factories needing one-off SFX scheduling
          soundSystem,
        },
      } as const;
      // Capture previous position to detect wraps performed inside update()
      const prevX = gameState.player.position.x;
      const prevY = gameState.player.position.y;
      
      // Set reversed controls flag for player update
      (gameState as any).reversedControls = Date.now() < reversedControlsUntilRef.current;
      (gameState as any).bubbleEffect = Date.now() < bubbleEffectUntilRef.current;
      
      // Forward call sites only; no logic moved yet
      // Pause updates when paused OR when any modal/popup is showing
      if (!isPausedRef.current && !anyModalOpen) {
        updateFrame(gameState, frameNow, dt, env, soundSystem);
      }

      // World tiling: detect screen wrap by comparing previous vs current positions
      {
        const W = (typeof CANVAS_WIDTH !== 'undefined' ? CANVAS_WIDTH : ctx.canvas.width);
        const H = (typeof CANVAS_HEIGHT !== 'undefined' ? CANVAS_HEIGHT : ctx.canvas.height);
        const curX = gameState.player.position.x;
        const curY = gameState.player.position.y;
        let tileX = (gameState.worldTileX ?? 1);
        let tileY = (gameState.worldTileY ?? 1);
        let crossed = false;
        const M = 12; // edge margin in pixels
        // Horizontal wrap detection
        if (prevX > W - M && curX < M) { tileX += 1; crossed = true; }
        else if (prevX < M && curX > W - M) { tileX -= 1; crossed = true; }
        // Vertical wrap detection
        if (prevY > H - M && curY < M) { tileY += 1; crossed = true; }
        else if (prevY < M && curY > H - M) { tileY -= 1; crossed = true; }
        if (crossed) {
          const clamp = (v: number) => Math.max(WORLD_MIN_TILE, Math.min(WORLD_MAX_TILE, v));
          const nx = clamp(tileX);
          const ny = clamp(tileY);
          if (nx !== gameState.worldTileX || ny !== gameState.worldTileY) {
            gameState.worldTileX = nx;
            gameState.worldTileY = ny;
            if (__DEV_MODE__) {
              logThrottle('tile-cross', 1500, () => ({ tileX: nx, tileY: ny, prevX, prevY, curX, curY, W, H }));
              try {
                const arr = debugLinesRef?.current as string[] | undefined;
                if (Array.isArray(arr)) arr.push(`[tile-cross] nx=${nx} ny=${ny} W=${W} H=${H}`);
              } catch {}
            }
          }
        }
        
      }

    // (Spawn handled inside gameRunning block; timing unchanged)

      if (gameState.gameRunning && !isPausedRef.current && !anyModalOpen) {
        // Spawn asteroids after 1 second (original gate)
        {
          const timeSinceStageStart = Date.now() - gameState.stageStartTime;
          if (timeSinceStageStart >= 1000 && !gameState.asteroidsSpawned) {
            const newAsteroids = createStageAsteroids(gameState.stage, difficultyRef.current);
            gameState.asteroids = newAsteroids;
            gameState.asteroidsSpawned = true;
            
            // Initialize science vessel spawning for this stage
            if (gameState.stage === 1) {
              scienceVesselsToSpawnRef.current = 1;
            } else if (gameState.stage === 2) {
              scienceVesselsToSpawnRef.current = 2;
            } else {
              scienceVesselsToSpawnRef.current = 3;
            }
            scienceVesselsSpawnedRef.current = 0;
            // Random spawn time within first 10 seconds
            firstScienceVesselTimeRef.current = gameState.stageStartTime + 1000 + Math.random() * 10000;
            scienceVesselAlertShownRef.current = false;
            
            if (__DEV_MODE__) {
              // eslint-disable-next-line no-console
              console.log('[spawn-fired]', { stage: gameState.stage, count: gameState.asteroids?.length });
            }
          }
          
          // Spawn first science vessel randomly within first 10 seconds
          if (scienceVesselsSpawnedRef.current === 0 && 
              scienceVesselsToSpawnRef.current > 0 && 
              timeSinceStageStart >= 1000 &&
              Date.now() >= firstScienceVesselTimeRef.current) {
            const specialAsteroid = gameState.asteroids.find(a => a.special === true);
            if (specialAsteroid) {
              const scienceVessel = createScienceVessel(specialAsteroid, 'primary', gameState.stage);
              gameState.alienShips.push(scienceVessel);
              scienceVesselsSpawnedRef.current++;
              
              // Show alert
              if (!scienceVesselAlertShownRef.current) {
                setActionNotes(prev => [...prev, '⚠️ SCIENCE VESSEL APPROACHING!']);
                scienceVesselAlertShownRef.current = true;
              }
            }
          }
        }
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
      const now = lastFrameNowRef.current;
      
      // Simple overlap capture for special asteroids (but not during LOST sequence)
      const lostSeqActive = (traction as any).lostSequence?.active;
      if (!traction.active && !lostSeqActive) {
        // Simple overlap detection for special asteroids
        const specials = gameState.asteroids.filter(a => a.special === true);
        for (const a of specials) {
          const dx = a.position.x - gameState.player.position.x;
          const dy = a.position.y - gameState.player.position.y;
          const dist = Math.hypot(dx, dy);
          const captureDistance = a.radius + gameState.player.radius + 10;
          
          // Check if science vessel is already docked on this asteroid
          const scienceVesselDocked = gameState.alienShips.some((ship: any) => 
            ship.isScienceVessel && 
            ship.scienceState === 'docking' && 
            ship.scienceTargetAsteroid === a
          );
          
          if (scienceVesselDocked) {
            // Can't dock - science vessel is stealing it!
            setActionNotes(prev => [...prev, '⚠️ Science vessel is docking! Destroy it first!']);
            continue; // Skip to next asteroid
          }
          
          // Simple rule: player overlaps special asteroid → instant capture
          if (dist < captureDistance) {
            traction.active = true;
            traction.targetAsteroid = a;
            (traction as any).targetAsteroidIndex = gameState.asteroids.indexOf(a);
            traction.phase = 'attached'; // Skip to attached immediately
            traction.attachStartTime = now;
            traction.slowMotionActive = true;
            traction.originalAsteroidVelocity = { x: a.velocity.x, y: a.velocity.y };
            
            // Initialize orbit
            traction.orbitAngle = Math.atan2(
              gameState.player.position.y - a.position.y,
              gameState.player.position.x - a.position.x
            );
            traction.orbitRadius = a.radius + gameState.player.radius + 8;
            
            // Slow down asteroid
            a.velocity.x *= 0.25;
            a.velocity.y *= 0.25;
            
            // Start grid scan
            (traction as TractionAug).gameState = { stage: gameState.stage };
            startGridScan(traction, now);
            
            // Audio/visual feedback
            try { soundSystem.playTractorWhoosh?.(); } catch {}
            try { soundSystem.playScanTick?.(); } catch {}
            soundSystem.setMusicVolume(0.5);
            (traction as any)._scanTicking = true;
            (traction as any)._lastScanTick = now;
            
            setActionNotes(prev => [...prev, 'Captured special asteroid - scan started']);
            break;
          }
        }
      }

      // Update asteroids BEFORE traction beam physics to ensure correct positioning
      // Only update if game is running or auto-destruction is active
      if (gameState.gameRunning || autoDestructionActiveRef.current) {
        gameState.asteroids = gameState.asteroids.map(updateAsteroid);
      }

      // IMPORTANT: Rebind traction target to the freshly updated asteroid object
      if (traction.active) {
        const idx = (traction as any).targetAsteroidIndex;
        const oldTarget = traction.targetAsteroid;
        
        // Verify the asteroid at this index is actually the same one (has special flag)
        if (typeof idx === 'number' && idx >= 0 && idx < gameState.asteroids.length) {
          const asteroidAtIndex = gameState.asteroids[idx];
          // Check if this is the same asteroid (must be special)
          if (asteroidAtIndex && asteroidAtIndex.special === true) {
            traction.targetAsteroid = asteroidAtIndex;
          } else {
            // Asteroid at this index is no longer special - target was destroyed
            traction.targetAsteroid = null;
          }
        } else {
          // Index out of range - asteroid was removed
          traction.targetAsteroid = null;
        }
        
        // If we lost the target, trigger LOST sequence
        if (oldTarget && !traction.targetAsteroid) {
          // Target lost - trigger "LOST" sequence instead of jumping to another asteroid
          // Use the FINAL chance (with stage multiplier) to match what's shown in HUD
          const baseChance = traction.flipitChance || 0.05;
          const finalChance = baseChance * 100 * gameState.stage;
          const lostPercent = finalChance.toFixed(1);
          
          // Trigger loss animation and sound (use performance.now for consistency)
          (traction as any).lostSequence = {
            startTime: performance.now(),
            initialPercent: parseFloat(lostPercent),
            active: true
          };
          
          // Bounce player away from last known position
          const dx = gameState.player.position.x - oldTarget.position.x;
          const dy = gameState.player.position.y - oldTarget.position.y;
          const dist = Math.hypot(dx, dy) || 1;
          const bounceSpeed = 3;
          gameState.player.velocity.x += (dx / dist) * bounceSpeed;
          gameState.player.velocity.y += (dy / dist) * bounceSpeed;
          
          // Play "bad" sound - method removed
          
          // Update artifact status to LOST
          if (gameState.currentArtifact) {
            gameState.currentArtifact.type = 'unknown' as any; // Mark as lost
            (gameState.currentArtifact as any).status = 'LOST';
          }
          
          // DON'T end traction yet - keep it active during LOST countdown to prevent re-capture
          // traction.active will be set to false after countdown finishes
          traction.targetAsteroid = null;
          traction.slowMotionActive = false;
          soundSystem.setMusicVolume(1.0);
          setActionNotes(prev => [...prev, 'Artifact LOST - target destroyed']);
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
          
          // Only handle attached, displaying, and pushing phases (capture goes directly to attached)
          if (traction.phase === 'attached') {
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
                // Mark asteroid as scanned by player (for visual state)
                (asteroid as any).specialState = 'scanned';
                
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
                
                // Update persistent artifact info in gameState
                gameState.currentArtifact = {
                  type: 'Flipit',
                  baseChance: traction.flipitChance * 100,
                  finalChance: traction.flipitChance * 100 * gameState.stage,
                  scannedAt: now
                };
                
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
              setActionNotes(prev => [...prev, "Pushed away from special asteroid"]);
            }
          } else if (traction.phase === 'pushing') {
            // Smooth push away from asteroid
            const elapsed = now - traction.pushStartTime;
            const pushDurationMs = 800;
            
            // Check if this is a science vessel interruption with postPushVelocity
            if (traction.postPushVelocity && elapsed === 0) {
              // Initial kick from science vessel interruption - apply the velocity once
              gameState.player.velocity.x = traction.postPushVelocity.x;
              gameState.player.velocity.y = traction.postPushVelocity.y;
              // Clear it so we don't apply it again
              traction.postPushVelocity = undefined;
            }
            
            // Apply normal deceleration for smooth slowdown (whether normal or interrupted)
            const pushForceBase = 0.65;
            const pushProgress = Math.min(1, elapsed / pushDurationMs);
            
            // Only apply additional push force if we have a valid orbitAngle (normal eject)
            if (traction.orbitAngle !== undefined) {
              const pushForce = pushForceBase * (1 - pushProgress); // Decreasing push force
              gameState.player.velocity.x += Math.cos(traction.orbitAngle) * pushForce;
              gameState.player.velocity.y += Math.sin(traction.orbitAngle) * pushForce;
            }
            
            // Apply friction/air resistance to gradually slow down (works for both cases)
            gameState.player.velocity.x *= 0.96;
            gameState.player.velocity.y *= 0.96;
            
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
              
              // Spawn next science vessel if needed
              if (scienceVesselsSpawnedRef.current < scienceVesselsToSpawnRef.current) {
                const specialAsteroid = gameState.asteroids.find(a => a.special === true);
                if (specialAsteroid) {
                  const role = scienceVesselsSpawnedRef.current === 0 ? 'primary' : 'secondary';
                  const scienceVessel = createScienceVessel(specialAsteroid, role, gameState.stage);
                  gameState.alienShips.push(scienceVessel);
                  scienceVesselsSpawnedRef.current++;
                  
                  // Show alert for additional vessels
                  setActionNotes(prev => [...prev, '⚠️ SCIENCE VESSEL APPROACHING!']);
                }
              }
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
          // Physics integration moved to update(); no-op here.
        }
        
        // Note: tile-step on edge wrap is handled centrally right after updateFrame()
      }

      // If music is stopped and user did not pause and we're not muted,
      // arm the next-track-on-shot so the next shot starts the next song.
      const ms = soundSystem.getMusicState();
      if (!isMutedRef.current && !musicUserPausedRef.current && !ms.isPlaying && musicAutoStartedRef.current) {
        // Only arm next-track-on-shot after music has played at least once.
        armNextTrackOnShotRef.current = true;
      }

      // Thrust sound control: start/ramp while thrust key is held, stop otherwise (disabled when paused)
      const thrusting = !isPausedRef.current && !!(gameState.keys['ArrowUp'] || gameState.keys['w'] || gameState.keys['W']);
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
          const pan = panFromX(a.position.x, CANVAS_WIDTH);
          alienIncomingCtlRef.current = soundSystem.playAlienIncomingDirectional(pan);
        }
        // Allow missile-type (bad UFO) only from stage 2 onwards
        if (gameState.stage >= 2) {
          (a as AlienShip).isMissileType = true;
          (a as AlienShip).spawnAt = Date.now();
          (a as AlienShip).doomStage = 0;
          // Temporarily disable Epic UFO cue and music duck/loop to diagnose freezes
          // soundSystem.playEpicUfo();
          // try { soundSystem.setMusicVolume(0.08); } catch { /* ignore */ }
          // try { soundSystem.pauseMusic(); } catch { /* ignore */ }
          // try { badUfoLoopCtlRef.current = soundSystem.startBadUfoLoop(1.0); badUfoActiveRef.current = true; musicFadeResumeFramesRef.current = 0; } catch { /* ignore */ }
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

      // Auto-fire logic: shoot straight ahead if target will intersect bullet path
      if (autoFireEnabledRef.current && gameState.gameRunning && !isPausedRef.current && !anyModalOpen) {
        const now = performance.now();
        const AUTO_FIRE_COOLDOWN = 250; // Fire every 250ms (4 shots per second)
        
        if (now - lastAutoFireRef.current >= AUTO_FIRE_COOLDOWN) {
          const player = gameState.player;
          const BULLET_SPEED = 8; // Bullet velocity
          const MAX_PREDICTION_TIME = 120; // Predict up to 2 seconds ahead (120 frames at 60fps)
          const COLLISION_THRESHOLD = 25; // How close bullet needs to be to target
          
          // Calculate bullet trajectory from ship's current rotation
          const bulletDirX = Math.cos(player.rotation);
          const bulletDirY = Math.sin(player.rotation);
          
          let shouldFire = false;
          let willHitSpecial = false;
          
          // Check if bullet path will intersect with any target
          // First check special asteroids to avoid shooting them
          for (const asteroid of gameState.asteroids) {
            if (!asteroid.special) continue;
            
            // Predict where special asteroid will be
            for (let t = 0; t < MAX_PREDICTION_TIME; t++) {
              const futureAstX = asteroid.position.x + asteroid.velocity.x * t;
              const futureAstY = asteroid.position.y + asteroid.velocity.y * t;
              
              const bulletX = player.position.x + bulletDirX * BULLET_SPEED * t;
              const bulletY = player.position.y + bulletDirY * BULLET_SPEED * t;
              
              const dist = Math.sqrt(
                Math.pow(bulletX - futureAstX, 2) + Math.pow(bulletY - futureAstY, 2)
              );
              
              if (dist < asteroid.radius + COLLISION_THRESHOLD) {
                willHitSpecial = true;
                break;
              }
            }
            if (willHitSpecial) break;
          }
          
          // Don't shoot if it would hit a special asteroid
          if (!willHitSpecial) {
            // Check regular asteroids
            for (const asteroid of gameState.asteroids) {
              if (asteroid.special) continue;
              
              // Predict collision with moving asteroid
              for (let t = 10; t < MAX_PREDICTION_TIME; t++) { // Start at t=10 to avoid immediate proximity
                const futureAstX = asteroid.position.x + asteroid.velocity.x * t;
                const futureAstY = asteroid.position.y + asteroid.velocity.y * t;
                
                const bulletX = player.position.x + bulletDirX * BULLET_SPEED * t;
                const bulletY = player.position.y + bulletDirY * BULLET_SPEED * t;
                
                const dist = Math.sqrt(
                  Math.pow(bulletX - futureAstX, 2) + Math.pow(bulletY - futureAstY, 2)
                );
                
                if (dist < asteroid.radius + COLLISION_THRESHOLD) {
                  shouldFire = true;
                  break;
                }
              }
              if (shouldFire) break;
            }
            
            // Check alien ships (they move too, so predict their position)
            if (!shouldFire) {
              for (const alien of gameState.alienShips) {
                for (let t = 10; t < MAX_PREDICTION_TIME; t++) {
                  const futureAlienX = alien.position.x + alien.velocity.x * t;
                  const futureAlienY = alien.position.y + alien.velocity.y * t;
                  
                  const bulletX = player.position.x + bulletDirX * BULLET_SPEED * t;
                  const bulletY = player.position.y + bulletDirY * BULLET_SPEED * t;
                  
                  const dist = Math.sqrt(
                    Math.pow(bulletX - futureAlienX, 2) + Math.pow(bulletY - futureAlienY, 2)
                  );
                  
                  if (dist < alien.radius + COLLISION_THRESHOLD) {
                    shouldFire = true;
                    break;
                  }
                }
                if (shouldFire) break;
              }
            }
          }
          
          // Fire straight ahead if we found a valid target
          if (shouldFire) {
            // Use same shooting logic as manual fire (fires in player.rotation direction)
            if (gameState.stage === 1) {
              const spread = 0.10;
              gameState.bullets.push(createBullet(player.position, player.rotation));
              gameState.bullets.push(createBullet(player.position, player.rotation - spread));
              gameState.bullets.push(createBullet(player.position, player.rotation + spread));
            } else {
              const stacks = player.doubleShooterStacks || 0;
              if (player.doubleShooter > 0 && stacks >= 2) {
                const spread = 0.12;
                const angles = [
                  player.rotation - spread * 1.5,
                  player.rotation - spread * 0.5,
                  player.rotation + spread * 0.5,
                  player.rotation + spread * 1.5,
                ];
                for (const a of angles) gameState.bullets.push(createBullet(player.position, a));
              } else if (player.doubleShooter > 0 && stacks >= 1) {
                const spread = 0.12;
                gameState.bullets.push(createBullet(player.position, player.rotation - spread));
                gameState.bullets.push(createBullet(player.position, player.rotation + spread));
              } else {
                gameState.bullets.push(createBullet(player.position, player.rotation));
              }
            }
            
            soundSystem.playPlayerShoot();
            lastAutoFireRef.current = now;
          }
        }
      }

      // Update bullets (only if game is running or auto-destruction is active)
      if (gameState.gameRunning || autoDestructionActiveRef.current) {
        gameState.bullets = gameState.bullets
          .filter(bullet => bullet.life < bullet.maxLife);

        // Update alien bullets
        gameState.alienBullets = gameState.alienBullets.map(b => {
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
              // Self-destruct: use lightweight burst to avoid heavy fireworks
              const boomLite = createUfoSuperExplosionLight(b.position, env as any);
              gameState.explosions.push(boomLite);
              // SFX handled by factory; no debris
              // Note: do not call suspendTrails here; this is the alien bullet path and
              // the helper is defined later for player missile logic. Removing avoids
              // a temporal initialization ReferenceError and unnecessary work.
              // Mark bullet as expired immediately
              b.life = b.maxLife;
            }

            // Block on asteroids (detonate, no asteroid damage)
            if (b.life < b.maxLife) {
              for (const a of gameState.asteroids) {
                const dx = a.position.x - b.position.x;
                const dy = a.position.y - b.position.y;
                if (Math.hypot(dx, dy) < ((a.radius || 12) + (b.radius || 4))) {
                  const boomLite = createUfoSuperExplosionLight(b.position, env as any);
                  gameState.explosions.push(boomLite);
                  b.life = b.maxLife; // expire
                  break;
                }
              }
            }

            // Proximity to player: 50% chance to hit on reach
            if (b.life < b.maxLife) {
              const pdx = gameState.player.position.x - b.position.x;
              const pdy = gameState.player.position.y - b.position.y;
              const pr = 12; // approximate player radius
              if (Math.hypot(pdx, pdy) < pr + (b.radius || 4)) {
                const hit = Math.random() < 0.5;
                const boomLite = createUfoSuperExplosionLight(b.position, env as any);
                gameState.explosions.push(boomLite);
                if (hit) {
                  gameState.player.health = Math.max(0, (gameState.player.health || 0) - MISSILE_HIT_DAMAGE);
                  // Screen shake on player damage
                  triggerScreenShake(screenShakeRef, screenShakeStartRef, 6, 250);
                }
                b.life = b.maxLife; // expire either way
              }
            }
          }
          // Physics integration moved to update(); return as-is.
          return b;
        })
        .filter(bullet => bullet.life < bullet.maxLife);
      } else {
        // Game over: clear all bullets
        gameState.bullets = [];
        gameState.alienBullets = [];
      }

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
      // Local FX config and safe trail suspension helper (no-op if shadows enabled)
      const __fxCfg = getFxConfig(env as any);
      const suspendTrails = (
        refs: {
          trailsSuspendUntilRef: React.MutableRefObject<number | undefined>;
          trailsFadeInStartRef: React.MutableRefObject<number | undefined>;
          trailsEnabledRef: React.MutableRefObject<boolean>;
          trailsStrengthRef: React.MutableRefObject<number>;
          lastMissileEventRef: React.MutableRefObject<number | undefined>;
        },
        untilMs: number
      ) => {
        // Only apply when shadows are disabled per FX config; otherwise no-op
        const disableTrails = __fxCfg && (__fxCfg as any).enableShadows === false;
        if (!disableTrails) return;
        try {
          const nowMs = performance.now();
          if (typeof refs.trailsSuspendUntilRef.current !== 'number') refs.trailsSuspendUntilRef.current = 0;
          refs.trailsSuspendUntilRef.current = Math.max(refs.trailsSuspendUntilRef.current!, untilMs);
          refs.trailsFadeInStartRef.current = nowMs;
          refs.lastMissileEventRef.current = nowMs;
        } catch { /* Ignore star generation errors */ }
      };
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
                // Lightweight burst for incidental missile collision to avoid fireworks pause
                const boomLite1 = createUfoSuperExplosionLight({ x: hit.position.x, y: hit.position.y }, env as any);
                gameState.explosions.push(boomLite1);
                // SFX handled by factory; do not double-play here
                // Suspend trails on player missile incidental impact (1s window)
                suspendTrails({
                  trailsSuspendUntilRef,
                  trailsFadeInStartRef,
                  trailsEnabledRef,
                  trailsStrengthRef,
                  lastMissileEventRef,
                }, performance.now() + 1000);
                // Apply 20% of max health damage to the incidental object
                if (collided.kind === 'alien') {
                  const maxH = Math.max(1, hit.maxHealth || hit.health || 1);
                  const dmg = maxH * 0.2;
                  hit.health = Math.max(0, (hit.health || maxH) - dmg);
                  if (hit.health <= 0) {
                    const boom = (hit as any).isMissileType
                      ? createMotherShipExplosion({ x: hit.position.x, y: hit.position.y }, env as any)
                      : createAlienExplosion({ x: hit.position.x, y: hit.position.y }, env as any);
                    gameState.explosions.push(boom);
                    if ((hit as any).isMissileType) {
                      const ex = { x: hit.position.x, y: hit.position.y };
                      const suckR = 180;
                      const breakR = 36;
                      const toBreak: Asteroid[] = [];
                      for (const a of gameState.asteroids) {
                        const dx = ex.x - a.position.x; const dy = ex.y - a.position.y;
                        const d = Math.hypot(dx, dy) || 1;
                        if (d < suckR) {
                          const ux = dx / d, uy = dy / d;
                          const s = (1 - d / suckR) * (a.size === 'large' ? 0.25 : a.size === 'medium' ? 0.35 : 0.45);
                          a.velocity = addVectors(a.velocity, { x: ux * s, y: uy * s });
                          if (d < breakR) toBreak.push(a);
                        }
                      }
                      for (const a of toBreak) {
                        const idx = gameState.asteroids.indexOf(a);
                        if (idx >= 0) {
                          const fragments = splitAsteroid(a).map(fragment => {
                            if (gameState.stage === 1) fragment.velocity = multiplyVector(fragment.velocity, 0.6);
                            else if (gameState.stage >= 3) fragment.velocity = multiplyVector(fragment.velocity, 1.2);
                            return fragment;
                          });
                          spawnAsteroidDebris(a);
                          if (a.size === 'large') spawnAsteroidDebris(a);
                          gameState.asteroids.splice(idx, 1);
                          gameState.asteroids.push(...fragments);
                          const points = a.size === 'large' ? 20 : a.size === 'medium' ? 50 : 100;
                          gameState.score += points;
                          setScore(gameState.score);
                        }
                      }
                    }
                    try {
                      const panProvider = () => {
                        const nx = (hit.position.x / CANVAS_WIDTH) * 2 - 1;
                        return Math.max(-1, Math.min(1, nx));
                      };
                      soundSystem.playAlienDestroyPanned(panProvider);
                    } catch { /* ignore */ }
                    gameState.alienShips = gameState.alienShips.filter(s => s !== hit);
                    gameState.score += 200;
                    setScore(gameState.score);
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
              // Lightweight burst for primary missile impact on target
              const boomLite2 = createUfoSuperExplosionLight({ x: targetObj.position.x, y: targetObj.position.y }, env as any);
              gameState.explosions.push(boomLite2);
              // SFX handled by factory; do not double-play here
              if (targetType === 'alien') {
                // Random damage between 20% and 50% of max health
                const maxH = Math.max(1, targetObj.maxHealth || targetObj.health || 1);
                const dmg = maxH * (0.2 + Math.random() * 0.3);
                targetObj.health = Math.max(0, (targetObj.health || maxH) - dmg);
                if (targetObj.health <= 0) {
                  const boom = (targetObj as any).isMissileType
                    ? createMotherShipExplosion({ x: targetObj.position.x, y: targetObj.position.y }, env as any)
                    : createAlienExplosion({ x: targetObj.position.x, y: targetObj.position.y }, env as any);
                  gameState.explosions.push(boom);
                  if ((targetObj as any).isMissileType) {
                    const ex = { x: targetObj.position.x, y: targetObj.position.y };
                    const suckR = 180;
                    const breakR = 36;
                    const toBreak: Asteroid[] = [];
                    for (const a of gameState.asteroids) {
                      const dx = ex.x - a.position.x; const dy = ex.y - a.position.y;
                      const d = Math.hypot(dx, dy) || 1;
                      if (d < suckR) {
                        const ux = dx / d, uy = dy / d;
                        const s = (1 - d / suckR) * (a.size === 'large' ? 0.25 : a.size === 'medium' ? 0.35 : 0.45);
                        a.velocity = addVectors(a.velocity, { x: ux * s, y: uy * s });
                        if (d < breakR) toBreak.push(a);
                      }
                    }
                    for (const a of toBreak) {
                      const idx = gameState.asteroids.indexOf(a);
                      if (idx >= 0) {
                        const fragments = splitAsteroid(a).map(fragment => {
                          if (gameState.stage === 1) fragment.velocity = multiplyVector(fragment.velocity, 0.6);
                          else if (gameState.stage >= 3) fragment.velocity = multiplyVector(fragment.velocity, 1.2);
                          return fragment;
                        });
                        spawnAsteroidDebris(a);
                        if (a.size === 'large') spawnAsteroidDebris(a);
                        gameState.asteroids.splice(idx, 1);
                        gameState.asteroids.push(...fragments);
                        const points = a.size === 'large' ? 20 : a.size === 'medium' ? 50 : 100;
                        gameState.score += points;
                        setScore(gameState.score);
                      }
                    }
                  }
                  try {
                    const panProvider = () => {
                      const nx = (targetObj.position.x / CANVAS_WIDTH) * 2 - 1;
                      return Math.max(-1, Math.min(1, nx));
                    };
                    soundSystem.playAlienDestroyPanned(panProvider);
                  } catch { /* ignore */ }
                  gameState.alienShips = gameState.alienShips.filter(s => s !== targetObj);
                  gameState.score += 200;
                  setScore(gameState.score);
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
          // Physics integration moved to update();
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
      // Only update if game is running or auto-destruction is active
      if (gameState.gameRunning || autoDestructionActiveRef.current) {
        gameState.alienShips = gameState.alienShips.map(ship => {
        const updated = ship; // Physics integration moved to update(); ship already updated
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
        
        // Science vessel AI: fly toward Flipit asteroid, dock, scan, and steal
        if ((updated as AlienShip).isScienceVessel) {
          const state = (updated as AlienShip).scienceState || 'approaching';
          
          if (state === 'fleeing') {
            // Stolen the Flipit, now escaping off screen
            const centerX = CANVAS_WIDTH / 2;
            const centerY = CANVAS_HEIGHT / 2;
            const escapeDx = updated.position.x - centerX;
            const escapeDy = updated.position.y - centerY;
            const escapeDist = Math.sqrt(escapeDx * escapeDx + escapeDy * escapeDy) || 1;
            const escapeSpeed = 3.0; // Fast escape
            updated.velocity.x = (escapeDx / escapeDist) * escapeSpeed;
            updated.velocity.y = (escapeDy / escapeDist) * escapeSpeed;
          } else if (state === 'patrolling' || state === 'hiding') {
            // Secondary vessel waiting - check if primary vessel is still active
            const role = (updated as AlienShip).scienceRole;
            if (role === 'secondary') {
              // Check if any primary vessels are still docking/approaching
              const primaryActive = gameState.alienShips.some((ship: any) => 
                ship.isScienceVessel && 
                ship.scienceRole === 'primary' &&
                (ship.scienceState === 'approaching' || ship.scienceState === 'docking')
              );
              
              if (!primaryActive) {
                // Primary is gone or fled - switch to approaching!
                (updated as AlienShip).scienceState = 'approaching';
                setActionNotes(prev => [...prev, '⚠️ Another science vessel approaching!']);
              }
            }
            
            // Circle around edges while waiting
            const centerX = CANVAS_WIDTH / 2;
            const centerY = CANVAS_HEIGHT / 2;
            const orbitAngle = (Date.now() * 0.001) % (Math.PI * 2);
            const orbitRadius = 350;
            const targetX = centerX + Math.cos(orbitAngle) * orbitRadius;
            const targetY = centerY + Math.sin(orbitAngle) * orbitRadius;
            const dx = targetX - updated.position.x;
            const dy = targetY - updated.position.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const speed = updated.speed || 1.0;
            updated.velocity.x = (dx / dist) * speed;
            updated.velocity.y = (dy / dist) * speed;
          } else {
            // Approaching or docking
            const specialAsteroid = gameState.asteroids.find(a => a.special === true);
            if (specialAsteroid) {
              const targetDx = specialAsteroid.position.x - updated.position.x;
              const targetDy = specialAsteroid.position.y - updated.position.y;
              const targetDistance = Math.sqrt(targetDx * targetDx + targetDy * targetDy);
              const dockingRange = 80; // Range to start docking
              
              if (state === 'docking') {
                // Stay near asteroid while scanning
                if (targetDistance > dockingRange + 20) {
                  // Move back closer if drifted away
                  const ux = targetDx / (targetDistance || 1);
                  const uy = targetDy / (targetDistance || 1);
                  updated.velocity.x = ux * 0.5;
                  updated.velocity.y = uy * 0.5;
                } else {
                  // Hold position
                  updated.velocity.x *= 0.9;
                  updated.velocity.y *= 0.9;
                }
                
                // Update scan progress - duration varies by stage
                let scanDuration = 3000; // Base: 3 seconds
                if (gameState.stage === 1) {
                  scanDuration = 12000; // Stage 1: 4x longer (12 seconds)
                } else if (gameState.stage === 2) {
                  scanDuration = 9000; // Stage 2: 3x longer (9 seconds)
                } else if (gameState.stage >= 3 && gameState.stage <= 5) {
                  scanDuration = 6000; // Stage 3-5: 2x longer (6 seconds)
                }
                // Stage 6+: normal speed (3 seconds)
                
                if (!(updated as AlienShip).scienceDockStartTime) {
                  (updated as AlienShip).scienceDockStartTime = Date.now();
                  (updated as AlienShip).scienceDockProgress = 0;
                }
                
                const elapsed = Date.now() - ((updated as AlienShip).scienceDockStartTime || Date.now());
                const progress = Math.min(100, (elapsed / scanDuration) * 100);
                (updated as AlienShip).scienceDockProgress = progress;
                
                // Check if scan is complete
                if (progress >= 100 && !(updated as AlienShip).scienceStealAttempted) {
                  (updated as AlienShip).scienceStealAttempted = true;
                  (updated as AlienShip).scienceState = 'fleeing';
                  
                  // Remove the Flipit from the asteroid and mark as hacked
                  specialAsteroid.special = false;
                  (specialAsteroid as any).flipitChance = undefined;
                  (specialAsteroid as any).specialState = 'hacked';
                  
                  // Clear current artifact
                  if (gameState.currentArtifact?.type === 'Flipit') {
                    gameState.currentArtifact = undefined;
                  }
                  
                  // Show message
                  setActionNotes(prev => [...prev, '🚨 FLIPIT STOLEN! Science vessel escaping!']);
                }
              } else if (targetDistance <= dockingRange && state === 'approaching') {
                // Check if player is docked on this asteroid - kick them off!
                const traction = tractionBeamRef.current;
                if (traction && traction.active && traction.targetAsteroid === specialAsteroid) {
                  // NEW: Instead of high-speed ejection, apply reversed controls + bubble effect
                  const now = Date.now();
                  reversedControlsUntilRef.current = now + 10000; // 10 seconds of reversed controls
                  bubbleEffectUntilRef.current = now + 10000; // 10 seconds of bubble visual
                  
                  // End traction immediately
                  traction.active = false;
                  traction.slowMotionActive = false;
                  traction.targetAsteroid = null;
                  
                  // Clear key states to prevent stuck inputs
                  gameState.keys = {};
                  
                  // Impact/bounce sound
                  try { soundSystem.playBounce(); } catch { /* no-op */ }
                  
                  // Restore music volume
                  soundSystem.setMusicVolume(1.0);
                  
                  setActionNotes(prev => [...prev, '🚨 CONTROLS SCRAMBLED! Science vessel hacked your ship!']);
                }
                
                // Start docking
                (updated as AlienShip).scienceState = 'docking';
                (updated as AlienShip).scienceDockStartTime = Date.now();
                (updated as AlienShip).scienceDockProgress = 0;
                setActionNotes(prev => [...prev, '⚠️ Science vessel docking! Destroy it quickly!']);
              } else {
                // Fly toward the Flipit asteroid
                if (targetDistance > 0) {
                  const ux = targetDx / targetDistance;
                  const uy = targetDy / targetDistance;
                  const speed = updated.speed || 1.0;
                  updated.velocity.x = ux * speed;
                  updated.velocity.y = uy * speed;
                }
              }
            }
          }
        }
        
        // Missile-type standoff movement, doom sequence, and lock/launch timeline
        else if ((updated as AlienShip).isMissileType) {
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

          // Perf probe start (missile-type UFO update)
          const __pf_t0 = performance.now();
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
                (missile as any).owner = 'alien';
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
                const us2 = updated as AlienShip;
                if (!((us2 as any)._warnedOnce === true)) {
                  soundSystem.playMissileWarning();
                  (us2 as any)._warnedOnce = true;
                } else {
                  try { soundSystem.playMissileStage2?.(); } catch { /* no-op */ }
                }
                soundSystem.playMissileLaunch();
                gameState.alienBullets.push(missile);
              }
            }
          }

          // Occasional line-of-sight laser: low-cost, short-lived beam, half missile damage
          {
            const us = updated as any;
            us._laserCd = Math.max(0, us._laserCd || 0);
            if (us._laserCd === 0) {
              // 1 in ~90 chance per frame if LOS is clear and player is within mid-range
              const px = gameState.player.position.x; const py = gameState.player.position.y;
              const distToPlayer = Math.hypot(px - updated.position.x, py - updated.position.y);
              const tryLaser = distToPlayer >= 180 && distToPlayer <= 720 && Math.random() < 1 / 90;
              if (tryLaser) {
                const hasLOS = (() => {
                  // Segment-circle test against large/medium asteroids; skip tiny debris
                  const x1 = updated.position.x, y1 = updated.position.y;
                  const x2 = px, y2 = py;
                  const dx = x2 - x1, dy = y2 - y1;
                  const len2 = dx * dx + dy * dy || 1;
                  for (const a of gameState.asteroids) {
                    const r = (a.radius || 0);
                    if (r < 10) continue; // ignore small
                    const fx = a.position.x - x1, fy = a.position.y - y1;
                    const t = Math.max(0, Math.min(1, (fx * dx + fy * dy) / len2));
                    const cx = x1 + dx * t, cy = y1 + dy * t;
                    const d = Math.hypot(a.position.x - cx, a.position.y - cy);
                    if (d < r) return false; // blocked
                  }
                  return true;
                })();
                if (hasLOS) {
                  // Pre-fire warmup glow at UFO nose (brief charge-up)
                  if (!Array.isArray((gameState as any).alienLasers)) (gameState as any).alienLasers = [];
                  (gameState as any).alienLasers.push({
                    kind: 'warmup',
                    from: { x: updated.position.x, y: updated.position.y },
                    to: { x: updated.position.x, y: updated.position.y },
                    life: 0,
                    maxLife: 10,
                    width: 4,
                  });
                  // Spawn a beam that lasts twice as long
                  if (!Array.isArray((gameState as any).alienLasers)) (gameState as any).alienLasers = [];
                  (gameState as any).alienLasers.push({
                    from: { x: updated.position.x, y: updated.position.y },
                    to: { x: px, y: py },
                    life: 0,
                    maxLife: 16,
                    width: 2,
                    color: '#ff3b7a'
                  });
                  // Apply damage instantly: half missile hit
                  gameState.player.health = Math.max(0, (gameState.player.health || 0) - LASER_HIT_DAMAGE);
                  // Emit small black debris with red edges from the ship on laser hit (cap per-event)
                  if (!Array.isArray((gameState as any).visualDebris)) (gameState as any).visualDebris = [];
                  const __fxCfg = getFxConfig((env as any) || undefined);
                  const __cap = Math.max(0, Number(__fxCfg.laserHitDebrisMax ?? 60));
                  const __count = Math.min(10, __cap);
                  for (let i = 0; i < __count; i++) {
                    const ang = Math.random() * Math.PI * 2;
                    const spd = 1 + Math.random() * 2.5;
                    (gameState as any).visualDebris.push({
                      kind: 'chunk',
                      position: { x: px, y: py },
                      velocity: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
                      life: 0,
                      maxLife: 24 + Math.floor(Math.random() * 10),
                      size: 3 + Math.random() * 2,
                      color: '#000000',
                      edgeColor: '#ff3333',
                      rotation: Math.random() * Math.PI * 2,
                      rotationSpeed: (Math.random() - 0.5) * 0.2,
                    });
                  }
                  // Small nudge to indicate impact (no heavy FX)
                  try { soundSystem.playAlienLaser?.(); } catch {}
                  // Cooldown (2–3 seconds)
                  (us as any)._laserCd = 120 + Math.floor(Math.random() * 60);
                }
              }
            } else {
              (us as any)._laserCd = Math.max(0, (us as any)._laserCd - 1);
            }
          }

          // Missile fallback: ensure missiles appear even if lock conditions are not perfect
          {
            const us = updated as AlienShip;
            (us as any)._missileCd = Math.max(0, (us as any)._missileCd || 0);
            if ((us as any)._missileCd === 0) {
              const px = gameState.player.position.x; const py = gameState.player.position.y;
              const angleToPlayer = Math.atan2(py - updated.position.y, px - updated.position.x);
              const missile: AlienBullet = createAlienBullet(updated.position, angleToPlayer);
              missile.homing = true;
              missile.turnRate = 0.06;
              missile.velocity = multiplyVector({ x: Math.cos(angleToPlayer), y: Math.sin(angleToPlayer) }, 3.0);
              missile.radius = 4;
              missile.maxLife = 240;
              missile.damageMultiplier = 2;
              missile.explosionRadius = 60;
              missile.locked = true; missile.lostFrames = 0; missile.selfDestruct = 180;
              missile.targetOffsetX = 0; missile.targetOffsetY = 0;
              gameState.alienBullets.push(missile);
              // Faster cadence for testing: 0.8–1.2s between fallback missiles
              (us as any)._missileCd = 48 + Math.floor(Math.random() * 24);
            } else {
              (us as any)._missileCd = Math.max(0, (us as any)._missileCd - 1);
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
      })
      // Remove science vessels that have fled off-screen
      .filter(ship => {
        if ((ship as AlienShip).isScienceVessel && (ship as AlienShip).scienceState === 'fleeing') {
          // Check if ship is well off-screen (add buffer beyond canvas edges)
          const buffer = 100; // Extra distance beyond screen edge
          const isOffScreen = 
            ship.position.x < -buffer ||
            ship.position.x > CANVAS_WIDTH + buffer ||
            ship.position.y < -buffer ||
            ship.position.y > CANVAS_HEIGHT + buffer;
          
          return !isOffScreen; // Keep ship if NOT off-screen, remove if off-screen
        }
        return true; // Keep all non-fleeing ships
      });
      }

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
          // Flash effect (lightweight to avoid stall)
          const flashLite = createUfoSuperExplosionLight({ x: cx, y: cy }, env as any);
          gameState.explosions.push(flashLite);
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

      // === Bad UFO music logic (disabled for perf diagnostics) ===
      const hasMissileUfo = (gameState.alienShips as AlienShip[]).some(s => s.isMissileType);
      // Bypass all pause/duck/loop logic to rule out audio stalls
      if (!hasMissileUfo && badUfoActiveRef.current) {
        badUfoLoopCtlRef.current = null;
        badUfoMusicMemRef.current = null;
        musicFadeResumeFramesRef.current = 0;
        badUfoActiveRef.current = false;
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
        const updatedBonus = bonus; // Physics integration moved to update();
        
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
          
          // First-time reward notification
          const rewardNames: Record<string, string> = {
            shield: 'SHIELD',
            heal: 'HEAL',
            doubleShooter: 'DOUBLE SHOOTER',
            missile: 'MISSILE'
          };
          
          if (!seenRewardsRef.current.has(bonus.type)) {
            seenRewardsRef.current.add(bonus.type);
            const notificationText = rewardNames[bonus.type] || bonus.type.toUpperCase();
            setRewardNotifications(prev => [...prev, {
              id: Date.now(),
              text: notificationText,
              x: gameState.player.position.x,
              y: gameState.player.position.y - 60,
              startTime: Date.now(),
              duration: 1500 // 1.5 seconds
            }]);
          }
          
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
            // Spawn one mini-missile icon per amount that hovers then flies to the first empty HUD slot (bottom-left)
            if (!gameState.missilePopups) gameState.missilePopups = [];
            const nowMs = Date.now();
            const maxIcons = 5;
            const marginX = 20;
            const energyBarY = CANVAS_HEIGHT - 40;
            const iconsTopY = energyBarY - 44;
            const iconX0 = marginX;
            const iconY = iconsTopY;
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
              const targetX = iconX0;
              const targetY = typeof slotIndex === 'number' ? (iconY - slotIndex * gap) : (iconY - (maxIcons - 1) * gap);
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
      
      // Cleanup expired reward notifications
      setRewardNotifications(prev => {
        const now = Date.now();
        return prev.filter(notif => (now - notif.startTime) < notif.duration);
      });

      // Update explosions (only if not paused and no modals open)
      if (!isPausedRef.current && !anyModalOpen) {
        gameState.explosions = gameState.explosions
          .map(updateExplosion)
          .filter((explosion): explosion is Explosion => explosion.particles.length > 0);
      }

      // Update missile popups: hover near player then fly down-left to HUD slot
      if (!isPausedRef.current && !anyModalOpen) {
      if (!gameState.missilePopups) gameState.missilePopups = [];
      const maxIcons = 5;
      // Missile HUD is on bottom-left
      const marginX = 20;
      const energyBarY = CANVAS_HEIGHT - 40;
      const iconsTopY = energyBarY - 44;
      const iconX0 = marginX;
      const iconY = iconsTopY;
      const gap = 26;
      
      for (let i = gameState.missilePopups.length - 1; i >= 0; i--) {
        const p = gameState.missilePopups[i];
        const age = Date.now() - p.start;
        
        if (p.phase === 'hover') {
          // small bobbing
          p.y = gameState.player.position.y - 20 + Math.sin(age * 0.01) * 4;
          p.x = gameState.player.position.x + Math.cos(age * 0.01) * 4;
          if (age >= 600) {
            // Assign target slot if not already set
            if (typeof p.slotIndex !== 'number') {
              const ply: any = gameState.player as any;
              const haveSlots = Math.max(0, Math.min(maxIcons, (ply.missileSlots || 0)));
              p.slotIndex = haveSlots < maxIcons ? haveSlots : (maxIcons - 1);
              p.targetX = iconX0;
              p.targetY = iconY - (p.slotIndex as number) * gap; // vertical stack
            }
            p.phase = 'fly';
            (p as any).rotation = 0; // Start with no rotation
          }
        } else if (p.phase === 'fly') {
          // Fly down and to the left toward target (slower - takes twice as long)
          const tx = (typeof p.targetX === 'number') ? p.targetX : iconX0;
          const ty = (typeof p.targetY === 'number') ? p.targetY : iconY;
          const dx = tx - p.x;
          const dy = ty - p.y;
          const dist = Math.hypot(dx, dy) || 1;
          const ux = dx / dist, uy = dy / dist;
          const speed = Math.min(10, 3 + age * 0.0075); // Halved for 2x duration
          p.x += ux * speed;
          p.y += uy * speed;
          
          // When getting close (within 140px), start landing phase for smoother docking
          if (dist < 140) {
            p.phase = 'landing' as any;
            (p as any).landingStartTime = Date.now();
          }
        } else if ((p as any).phase === 'landing') {
          // Landing animation: turn and approach final position with smooth easing
          const tx = (typeof p.targetX === 'number') ? p.targetX : iconX0;
          const ty = (typeof p.targetY === 'number') ? p.targetY : iconY;
          const dx = tx - p.x;
          const dy = ty - p.y;
          const dist = Math.hypot(dx, dy) || 1;
          const ux = dx / dist, uy = dy / dist;
          
          // Smooth easeOut deceleration for landing
          const landingAge = Date.now() - ((p as any).landingStartTime || Date.now());
          const progress = Math.min(1, landingAge / 1500); // 1.5s landing phase
          // Cubic ease-out: fast->slow
          const easeOut = 1 - Math.pow(1 - progress, 3);
          const baseSpeed = 8;
          const speed = Math.max(0.5, baseSpeed * (1 - easeOut));
          p.x += ux * speed;
          p.y += uy * speed;
          
          // Rotate as if banking to land (rotate up to 45 degrees)
          (p as any).rotation = Math.min(Math.PI / 4, landingAge * 0.002);
          
          // Start shrinking with easing
          p.scale = Math.max(0.2, 1.0 - (landingAge / 1200));
          
          // When very close and small, apply and vanish
          if ((dist < 15 || landingAge > 1800) && !p.applied) {
            // Apply missiles and remove popup
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
      }

      // Apply gravitational forces between asteroids (only if not paused and no modals open)
      if (!isPausedRef.current && !anyModalOpen) {
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
      // Cosmetic-only close-contact dust between asteroids (no physics changes)
      try {
        for (let i = 0; i < gameState.asteroids.length; i++) {
          for (let j = i + 1; j < gameState.asteroids.length; j++) {
            const a = gameState.asteroids[i];
            const b = gameState.asteroids[j];
            const dx = b.position.x - a.position.x;
            const dy = b.position.y - a.position.y;
            const d = Math.hypot(dx, dy) || 1;
            if (d <= a.radius + b.radius) {
              const cx = (a.position.x + b.position.x) / 2;
              const cy = (a.position.y + b.position.y) / 2;
              const isArtifactA = !!a.special;
              const isArtifactB = !!b.special;
              const isArtifact = isArtifactA || isArtifactB;
              const target = isArtifactA ? a : (isArtifactB ? b : a);
              const pal = chooseAsteroidDebrisPalette(target as any, isArtifact);
              const dustBase = isArtifact ? (16 + Math.floor(Math.random() * 9)) : (8 + Math.floor(Math.random() * 7));
              const chunkBase = isArtifact ? (6 + Math.floor(Math.random() * 5)) : (2 + Math.floor(Math.random() * 3));
              // Half counts and travel for rub/contact
              const dustN = Math.max(1, Math.round(dustBase * 0.5));
              const chunkN = Math.max(1, Math.round(chunkBase * 0.5));
              spawnImpactDebris({
                gs: gameState,
                at: { x: cx, y: cy },
                baseVelocity: { x: 0, y: 0 },
                countDust: dustN,
                countChunks: chunkN,
                lifeMul: (isArtifact ? 2.0 : 1.0) * 0.5,
                speedMul: (isArtifact ? 1.15 : 1.0) * 0.5,
                palette: pal,
              });
              if (isArtifact) {
                const art = isArtifactA ? a : b;
                const other = isArtifactA ? b : a;
                const ang = Math.atan2(other.position.y - art.position.y, other.position.x - art.position.x);
                markArtifactEdgeGlow(art as any, performance.now(), ang, 550);
              }
            }
          }
        }
      } catch { /* cosmetic only */ }

      // Apply gravitational pull from large asteroids to ship
      gameState.asteroids.forEach(asteroid => {
        if (asteroid.size === 'large') {
          const force = calculateGravitationalForce(gameState.player, asteroid, 0.3);
          gameState.player.velocity = addVectors(gameState.player.velocity, multiplyVector(force, 1 / gameState.player.mass));
        }
      });
      }

      // During warp, pull ship toward screen center (only if not paused and no modals open)
      if (!isPausedRef.current && !anyModalOpen) {
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
            // Set timestamp for fade animation (1 second fade in 5 stages)
            (asteroid as any).lastHitTime = performance.now();
            // Cosmetic: small explosion + debris on every hit (artifact spawns more, longer)
            try {
              const hitPos = { x: bullet.position.x, y: bullet.position.y };
              const isArtifact = !!asteroid.special;
              // Small explosion flash at impact (colored by asteroid health)
              const fx = createExplosion(hitPos, env as any);
              fx.particles = fx.particles.slice(0, 10);
              
              // Apply health color to explosion if asteroid is damaged
              const healthColor = (asteroid as any).healthColor;
              if (healthColor) {
                fx.particles.forEach(p => {
                  p.color = healthColor;
                });
              }
              
              gameState.explosions.push(fx);
              // Debris spray
              const pal = chooseAsteroidDebrisPalette(asteroid as any, isArtifact);
              if (isArtifact) {
                spawnImpactDebris({
                  gs: gameState,
                  at: hitPos,
                  baseVelocity: bullet.velocity,
                  // ~20% more than current artifact-on-hit settings
                  countDust: Math.round((16 + Math.floor(Math.random() * 9)) * 1.2),
                  countChunks: Math.round((6 + Math.floor(Math.random() * 5)) * 1.2),
                  lifeMul: 2.0 * 1.2,
                  speedMul: 1.2 * 1.2,
                  palette: pal,
                });
                // Edge glow direction from asteroid center toward impact
                const ang = Math.atan2(hitPos.y - asteroid.position.y, hitPos.x - asteroid.position.x);
                markArtifactEdgeGlow(asteroid as any, performance.now(), ang, 600);
              } else {
                spawnImpactDebris({
                  gs: gameState,
                  at: hitPos,
                  baseVelocity: bullet.velocity,
                  countDust: 8 + Math.floor(Math.random() * 7), // 8-14
                  countChunks: 2 + Math.floor(Math.random() * 4), // 2-5
                  lifeMul: 1.0,
                  speedMul: 1.0,
                  palette: pal,
                });
              }
            } catch { /* cosmetic only */ }
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
              const sparks = createExplosion(asteroid.position, env as any);
              sparks.particles = sparks.particles.slice(0, 6).map(p => ({
                ...p,
                color: Math.random() > 0.5 ? '#ccccff' : '#ffff88',
                maxLife: 15 + Math.floor(Math.random() * 10),
                size: 2,
              }));
              gameState.explosions.push(sparks);
            }
            
            // Subtle kinetic impulse from the bullet when asteroid survives the hit
            try {
              if (asteroid.health > 0) {
                const bv = bullet.velocity;
                const bmag = Math.hypot(bv.x, bv.y) || 1;
                const dirx = bv.x / bmag, diry = bv.y / bmag;
                // Size-based scaling: smaller rocks get nudged more
                const base = asteroid.size === 'large' ? 0.12 : (asteroid.size === 'medium' ? 0.18 : 0.24);
                const av = asteroid.velocity || { x: 0, y: 0 };
                // Reduce impulse if already traveling along bullet direction
                const rel = av.x * dirx + av.y * diry; // >0 means already moving along
                const damp = rel > 0 ? 0.6 : 1.0;
                const imp = base * damp;
                asteroid.velocity = addVectors(av, { x: dirx * imp, y: diry * imp });
                // Tiny drag to keep velocities sane
                asteroid.velocity = multiplyVector(asteroid.velocity, 0.995);
              }
            } catch { /* cosmetic nudge only */ }

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
                  const basePan = () => {
                    const nx = (asteroid.position.x / CANVAS_WIDTH) * 2 - 1;
                    return Math.max(-1, Math.min(1, nx));
                  };
                  soundSystem.playLargeAsteroidDestroyPanned(basePan);
                  // Artifact boom layering: three staggered small-explosion shots for bigger feel
                  if (asteroid.special) {
                    for (let i = 0; i < 3; i++) {
                      const delay = Math.floor(Math.random() * 120); // 0..120ms
                      const panDelta = (Math.random() - 0.5) * 0.4; // -0.2..+0.2
                      window.setTimeout(() => {
                        try {
                          soundSystem.playSmallAsteroidDestroyPanned(() => {
                            const p = basePan() + panDelta;
                            return Math.max(-1, Math.min(1, p));
                          });
                        } catch { /* ignore */ }
                      }, delay);
                    }
                  }
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
              // Screen shake based on asteroid size
              const shakeIntensity = getShakeIntensityForSize(asteroid.size);
              const shakeDuration = asteroid.size === 'large' ? 300 : asteroid.size === 'medium' ? 200 : 100;
              triggerScreenShake(screenShakeRef, screenShakeStartRef, shakeIntensity, shakeDuration);
              
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
              
              // Update score with combo multiplier
              const now = Date.now();
              const timeSinceLastKill = now - lastKillTimeRef.current;
              
              // Check if combo should continue (within 3 seconds)
              if (timeSinceLastKill <= comboTimeoutMs && comboCountRef.current > 0) {
                comboCountRef.current++;
              } else {
                comboCountRef.current = 1; // Start new combo
              }
              
              lastKillTimeRef.current = now;
              
              // Calculate multiplier: 1x, 2x, 3x, 5x, 10x
              let mult = 1;
              if (comboCountRef.current >= 20) mult = 10;
              else if (comboCountRef.current >= 10) mult = 5;
              else if (comboCountRef.current >= 5) mult = 3;
              else if (comboCountRef.current >= 3) mult = 2;
              
              setComboMultiplier(mult);
              
              // Show combo display
              if (mult > 1 || comboCountRef.current > 1) {
                setComboDisplay({
                  count: comboCountRef.current,
                  multiplier: mult,
                  showUntil: now + 2000 // Show for 2 seconds
                });
              }
              
              const basePoints = asteroid.size === 'large' ? 20 : asteroid.size === 'medium' ? 50 : 100;
              const points = basePoints * mult;
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
              // Screen shake for UFO destruction
              const isMissileType = (alienShip as any).isMissileType;
              const shakeIntensity = isMissileType ? 15 : 10;
              const shakeDuration = isMissileType ? 500 : 350;
              triggerScreenShake(screenShakeRef, screenShakeStartRef, shakeIntensity, shakeDuration);
              
              // Create explosion effect (dramatic for Mother Ship variant)
              const boom = isMissileType
                ? createMotherShipExplosion(alienShip.position, env as any)
                : createAlienExplosion(alienShip.position, env as any);
              gameState.explosions.push(boom);
              if ((alienShip as any).isMissileType) {
                const ex = { x: alienShip.position.x, y: alienShip.position.y };
                const suckR = 180;
                const breakR = 36;
                const toBreak: Asteroid[] = [];
                for (const a of gameState.asteroids) {
                  const dx = ex.x - a.position.x; const dy = ex.y - a.position.y;
                  const d = Math.hypot(dx, dy) || 1;
                  if (d < suckR) {
                    const ux = dx / d, uy = dy / d;
                    const s = (1 - d / suckR) * (a.size === 'large' ? 0.25 : a.size === 'medium' ? 0.35 : 0.45);
                    a.velocity = addVectors(a.velocity, { x: ux * s, y: uy * s });
                    if (d < breakR) toBreak.push(a);
                  }
                }
                for (const a of toBreak) {
                  const idx = gameState.asteroids.indexOf(a);
                  if (idx >= 0) {
                    const fragments = splitAsteroid(a).map(fragment => {
                      if (gameState.stage === 1) fragment.velocity = multiplyVector(fragment.velocity, 0.6);
                      else if (gameState.stage >= 3) fragment.velocity = multiplyVector(fragment.velocity, 1.2);
                      return fragment;
                    });
                    spawnAsteroidDebris(a);
                    if (a.size === 'large') spawnAsteroidDebris(a);
                    gameState.asteroids.splice(idx, 1);
                    gameState.asteroids.push(...fragments);
                    const points = a.size === 'large' ? 20 : a.size === 'medium' ? 50 : 100;
                    gameState.score += points;
                    setScore(gameState.score);
                  }
                }
              }
              // Play dramatic alien destruction sound (panned to alien x)
              try {
                const panProvider = () => {
                  const nx = (alienShip.position.x / CANVAS_WIDTH) * 2 - 1;
                  return Math.max(-1, Math.min(1, nx));
                };
                soundSystem.playAlienDestroyPanned(panProvider);
              } catch { /* ignore */ }
              // Remove ship and add score with combo
              gameState.alienShips.splice(j, 1);
              
              // Apply combo logic for UFO kills
              const now = Date.now();
              const timeSinceLastKill = now - lastKillTimeRef.current;
              if (timeSinceLastKill <= comboTimeoutMs && comboCountRef.current > 0) {
                comboCountRef.current++;
              } else {
                comboCountRef.current = 1;
              }
              lastKillTimeRef.current = now;
              
              let mult = 1;
              if (comboCountRef.current >= 20) mult = 10;
              else if (comboCountRef.current >= 10) mult = 5;
              else if (comboCountRef.current >= 5) mult = 3;
              else if (comboCountRef.current >= 3) mult = 2;
              
              setComboMultiplier(mult);
              if (mult > 1 || comboCountRef.current > 1) {
                setComboDisplay({
                  count: comboCountRef.current,
                  multiplier: mult,
                  showUntil: now + 2000
                });
              }
              
              const basePoints = 200;
              const points = basePoints * mult;
              gameState.score += points;
              setScore(gameState.score);
            }
            break;
          }
        }
      }

      // Collision detection: alien bullets vs player (disabled during forward dash)
      const isForwardDashing = gameState.player.dashActive && gameState.player.dashType === 'forward';
      if (!gameState.respawning && gameState.player.invulnerable === 0 && gameState.player.shieldTime === 0 && !isForwardDashing) {
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
            
            // Larger explosion if missile. We are inside alienBullets context; always use lightweight Super UFO effect.
            if (bullet.explosionRadius) {
              const boomLite = createUfoSuperExplosionLight(bullet.position, env as any);
              gameState.explosions.push(boomLite);
              // SFX is scheduled by the lightweight factory; do not double-play here.
            }
            
            // Check if player is dead
            if (gameState.player.health <= 0) {
              // Temporarily disable multi-burst death effect to diagnose Super UFO stutter
              // deathBurstsRef.current = { pos: { x: gameState.player.position.x, y: gameState.player.position.y }, remaining: 120, spawned: 0 };
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
                // No lives left: trigger auto-destruction first, then game over
                gameOverPendingRef.current = true;
                
                // If no large asteroids remain, let auto-destruction handle game over
                const largeAsteroids = gameState.asteroids.filter(a => a.size === 'large');
                if (largeAsteroids.length === 0 && gameState.asteroids.length > 0) {
                  // Auto-destruction will trigger and handle game over when complete
                  return;
                }
                
                // Otherwise, trigger game over immediately
                gameState.gameRunning = false;
                setGameRunning(false);
                if (!gameOverStartRef.current) {
                  gameOverStartRef.current = performance.now();
                  
                  // Calculate rewards but delay scoreboard to show GAME OVER screen
                  const calculateRewards = () => {
                    // Get current game tickets earned (from randomizer wins)
                    return getCurrentGameTickets();
                  };
                  
                  const rewards = calculateRewards();
                  setFinalScore(gameState.score);
                  setFinalStage(gameState.stage);
                  setRewardAmount(rewards);
                  
                  // Delay scoreboard by 3 seconds to show GAME OVER visuals and explosions
                  setTimeout(() => {
                    // Only show if still on game over screen (player didn't restart)
                    if (gameStateRef.current && !gameStateRef.current.gameRunning) {
                      setShowScoreboard(true);
                    }
                  }, 3000);
                  
                  // Queue some quips
                  const quips = [
                    'Try again',
                    'Find Flipit Rewards',
                    "Don't give up!",
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
                    enqueueTitle({ listRef: titleOverlaysRef, nextIdRef: nextTitleIdRef }, pick, i * 1500);
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
            const smallExplosion = createExplosion(bullet.position, env as any);
            smallExplosion.particles = smallExplosion.particles.slice(0, 5); // Smaller explosion
            gameState.explosions.push(smallExplosion);
          }
        }
      }

      // Collision detection: player vs asteroids (disabled during traction beam and forward dash)
      const tractionState = tractionBeamRef.current;
      const tractionActive = tractionState.active && (tractionState.phase === 'approaching' || tractionState.phase === 'locking' || tractionState.phase === 'attached' || tractionState.phase === 'displaying');
      const isForwardDashing2 = gameState.player.dashActive && gameState.player.dashType === 'forward';
      
      if (gameState.player.invulnerable === 0 && gameState.player.shieldTime === 0 && !tractionActive && !isForwardDashing2) {
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
              // Cosmetic debris at contact point
              try {
                const isArtifact = !!asteroid.special;
                const pal = chooseAsteroidDebrisPalette(asteroid as any, isArtifact);
                const dustN = isArtifact ? 16 + Math.floor(Math.random() * 9) : 8 + Math.floor(Math.random() * 7);
                const chunkN = isArtifact ? 6 + Math.floor(Math.random() * 5) : 3 + Math.floor(Math.random() * 3);
                spawnImpactDebris({
                  gs: gameState,
                  at: { x: cx, y: cy },
                  baseVelocity: gameState.player.velocity,
                  countDust: dustN,
                  countChunks: chunkN,
                  lifeMul: isArtifact ? 2.0 : 1.0,
                  speedMul: isArtifact ? 1.2 : 1.0,
                  palette: pal,
                });
                if (isArtifact) {
                  const ang = Math.atan2(gameState.player.position.y - asteroid.position.y, gameState.player.position.x - asteroid.position.x);
                  markArtifactEdgeGlow(asteroid as any, performance.now(), ang, 450);
                }
              } catch { /* cosmetic only */ }
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
                // No lives left: trigger auto-destruction first, then game over
                gameOverPendingRef.current = true;
                
                // If no large asteroids remain, let auto-destruction handle game over
                const largeAsteroids = gameState.asteroids.filter(a => a.size === 'large');
                if (largeAsteroids.length === 0 && gameState.asteroids.length > 0) {
                  // Auto-destruction will trigger and handle game over when complete
                  return;
                }
                
                // Otherwise, trigger game over immediately
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
                    enqueueTitle({ listRef: titleOverlaysRef, nextIdRef: nextTitleIdRef }, pick, i * 1500);
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
            const smallExplosion = createExplosion(asteroid.position, env as any);
            smallExplosion.particles = smallExplosion.particles.slice(0, 8); // Smaller explosion
            gameState.explosions.push(smallExplosion);
            // Cosmetic debris at shield contact
            try {
              const cx = (gameState.player.position.x + asteroid.position.x) / 2;
              const cy = (gameState.player.position.y + asteroid.position.y) / 2;
              const isArtifact = !!asteroid.special;
              const pal = chooseAsteroidDebrisPalette(asteroid as any, isArtifact);
              const dustBase = isArtifact ? (14 + Math.floor(Math.random() * 9)) : (6 + Math.floor(Math.random() * 7));
              const chunkBase = isArtifact ? (5 + Math.floor(Math.random() * 4)) : (2 + Math.floor(Math.random() * 3));
              // Half counts and travel for bump contact
              const dustN = Math.max(1, Math.round(dustBase * 0.5));
              const chunkN = Math.max(1, Math.round(chunkBase * 0.5));
              spawnImpactDebris({
                gs: gameState,
                at: { x: cx, y: cy },
                baseVelocity: asteroid.velocity,
                countDust: dustN,
                countChunks: chunkN,
                lifeMul: (isArtifact ? 2.0 : 1.0) * 0.5,
                speedMul: (isArtifact ? 1.2 : 1.0) * 0.5,
                palette: pal,
              });
              if (isArtifact) {
                const ang = Math.atan2(gameState.player.position.y - asteroid.position.y, gameState.player.position.x - asteroid.position.x);
                markArtifactEdgeGlow(asteroid as any, performance.now(), ang, 450);
              }
            } catch { /* cosmetic only */ }
          }
        }
      }
      
      // Auto-destruction sequence: trigger when no large asteroids remain
      // Will auto-destroy all remaining small and medium asteroids
      const largeAsteroids = gameState.asteroids.filter(a => a.size === 'large');
      const noLargeRemain = largeAsteroids.length === 0;
      
      // Allow auto-destruction to start even during game over (when gameOverPending is true)
      if (noLargeRemain && gameState.asteroids.length > 0 && !autoDestructionActiveRef.current && !gameState.levelComplete && (gameState.gameRunning || gameOverPendingRef.current) && !isPausedRef.current && !anyModalOpen) {
        // Start auto-destruction sequence
        autoDestructionActiveRef.current = true;
        autoDestructionStartRef.current = Date.now();
        autoDestructionInitialCountRef.current = gameState.asteroids.length;
        // Generate random delay for first explosion (200-800ms)
        autoDestructionNextDelayRef.current = 200 + Math.random() * 600;
        
        // Make UFOs flee toward screen edges
        gameState.alienShips.forEach((ship: any) => {
          ship._fleeing = true;
          ship._fleeStartTime = Date.now();
          // Calculate flee direction (away from center)
          const centerX = CANVAS_WIDTH / 2;
          const centerY = CANVAS_HEIGHT / 2;
          const dx = ship.position.x - centerX;
          const dy = ship.position.y - centerY;
          const dist = Math.hypot(dx, dy) || 1;
          ship._fleeDirection = { x: dx / dist, y: dy / dist };
        });
      }
      
      // Process auto-destruction sequence (allow it to continue even during game over)
      if (autoDestructionActiveRef.current && !isPausedRef.current && !anyModalOpen) {
        const elapsed = Date.now() - autoDestructionStartRef.current;
        
        // Update fleeing UFOs
        gameState.alienShips.forEach((ship: any, index: number) => {
          if (ship._fleeing) {
            const fleeElapsed = Date.now() - ship._fleeStartTime;
            const fleeSpeed = 3;
            ship.velocity.x = ship._fleeDirection.x * fleeSpeed;
            ship.velocity.y = ship._fleeDirection.y * fleeSpeed;
            
            // Explode UFO after 2 seconds of fleeing
            if (fleeElapsed > 2000 && !ship._exploded) {
              ship._exploded = true;
              const boom = (ship as any).isMissileType
                ? createMotherShipExplosion(ship.position, env as any)
                : createAlienExplosion(ship.position, env as any);
              gameState.explosions.push(boom);
              // Remove ship
              gameState.alienShips.splice(index, 1);
            }
          }
        });
        
        // Check if it's time to destroy next asteroid (using random intervals)
        if (gameState.asteroids.length > 0 && elapsed >= autoDestructionNextDelayRef.current) {
          // Separate medium and small asteroids
          const mediumAsteroids = gameState.asteroids.filter(a => a.size === 'medium');
          
          // First break all medium asteroids (they spawn small ones)
          if (mediumAsteroids.length > 0) {
            const toBreak = mediumAsteroids[0];
            // Create explosion
            gameState.explosions.push(createExplosion(toBreak.position, env as any));
            // Play medium asteroid explosion sound
            soundSystem.playMediumAsteroidDestroy();
            // Split into small asteroids
            const fragments = splitAsteroid(toBreak);
            // Remove medium
            const idx = gameState.asteroids.indexOf(toBreak);
            if (idx >= 0) gameState.asteroids.splice(idx, 1);
            // Add small fragments
            gameState.asteroids.push(...fragments);
          }
          // Then destroy small asteroids one by one
          else {
            const currentSmalls = gameState.asteroids.filter(a => a.size === 'small');
            if (currentSmalls.length > 0) {
              const toDestroy = currentSmalls[0];
              if (toDestroy) {
                // Create explosion
                gameState.explosions.push(createExplosion(toDestroy.position, env as any));
                // Play small asteroid explosion sound
                soundSystem.playSmallAsteroidDestroy();
                // Remove asteroid
                const idx = gameState.asteroids.indexOf(toDestroy);
                if (idx >= 0) gameState.asteroids.splice(idx, 1);
              }
            }
          }
          
          // Schedule next explosion with random delay (200-800ms)
          autoDestructionStartRef.current = Date.now();
          autoDestructionNextDelayRef.current = 200 + Math.random() * 600;
        }
        
        // Reset sequence when all destroyed
        if (gameState.asteroids.length === 0) {
          autoDestructionActiveRef.current = false;
          
          // If game over was pending, trigger it now
          if (gameOverPendingRef.current) {
            gameOverPendingRef.current = false;
            gameState.gameRunning = false;
            setGameRunning(false);
            if (!gameOverStartRef.current) {
              gameOverStartRef.current = performance.now();
              
              // Calculate rewards but delay scoreboard to show GAME OVER screen
              const calculateRewards = () => {
                return getCurrentGameTickets();
              };
              
              const rewards = calculateRewards();
              setFinalScore(gameState.score);
              setFinalStage(gameState.stage);
              setRewardAmount(rewards);
              
              // Delay scoreboard by 3 seconds to show GAME OVER visuals and explosions
              setTimeout(() => {
                // Only show if still on game over screen (player didn't restart)
                if (gameStateRef.current && !gameStateRef.current.gameRunning) {
                  setShowScoreboard(true);
                }
              }, 3000);
            }
          }
          
          // Trigger score-based ticket randomizer after auto-destruction completes
          if (!autoDestructionScoreRandomizerShownRef.current && gameState.score > 0) {
            autoDestructionScoreRandomizerShownRef.current = true;
            autoDestructionScoreRef.current = gameState.score;
            
            // Calculate chance based on score: 10,000 = 100%, below is proportional
            const baseScore = Math.min(gameState.score, 10000);
            const baseChance = (baseScore / 10000) * 100;
            
            // Check if we'll need to show bonus randomizer
            if (gameState.score > 10000) {
              autoDestructionBonusRandomizerPendingRef.current = true;
            }
            
            // Show first randomizer (base chance) - increased delay to coordinate with GAME OVER screen
            setTimeout(() => {
              setRandomizerFlipitPercent(baseChance);
              setShowTicketRandomizer(true);
            }, 1500); // 1.5s delay to show during GAME OVER screen but before scoreboard
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
          
          // Show ticket randomizer if artifact was scanned
          if (gameState.currentArtifact && gameState.currentArtifact.type === 'Flipit') {
            setRandomizerFlipitPercent(gameState.currentArtifact.finalChance);
            setShowTicketRandomizer(true);
          }
        }
        
        // Animate warp effect (pause if any modal is showing)
        if (gameState.levelComplete && !anyModalOpen) {
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
            // Reset artifact info for new level
            gameState.currentArtifact = undefined;
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
            ensureStarsForCanvas({
              starsRef,
              initialAreaRef,
              initialStarCountRef,
              CANVAS_WIDTH,
              CANVAS_HEIGHT,
            });

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

      // Update screen shake
      const shakeOffset = updateScreenShake(screenShakeRef, screenShakeStartRef);
      
      // CRITICAL: Reset canvas transform to identity at the start of each frame
      // This prevents transform accumulation if previous frame's ctx.restore() failed due to errors
      // Without this, screen shake and other transforms progressively shift the draw area
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      
      // Apply screen shake translation to canvas
      // Note: We don't clear during shake to avoid dark flash
      // Minor edge artifacts during shake are acceptable (barely visible, only ~200-300ms)
      ctx.save();
      ctx.translate(shakeOffset.x, shakeOffset.y);

      // 1) Background → returns bgMap
      const bgMap = drawBackground(ctx, gameState, env);
      // 2) Stars (uses bgMap)
      drawStars(ctx, gameState, env, bgMap);
      // 3) Objectives (stations) under the player so ship appears on top
      try { drawObjectives(ctx, gameState, env); } catch {}
      // 4) Entities: showShipOnTop branch
      {
        const tBeam = tractionBeamRef.current as any;
        const showShipOnTop = !!(tBeam && (tBeam.active || (tBeam.onTopEntry && tBeam.onTopEntry.inProgress)));
        if (showShipOnTop) {
          // Special below ship, normals above
          drawSpecialAsteroidsMod(ctx, gameState, env);
          withPlayerDockingXform(ctx, gameState, env, () => { drawPlayerMod(ctx, gameState, env); });
          try { drawShield(ctx, gameState, env); } catch {}
          drawNormalAsteroidsMod(ctx, gameState, env);
          // Grid last for visibility
          try { drawAsteroidScanGrid(ctx, gameState, env); } catch {}
        } else {
          // Even when not showing ship on top, keep same depth plan for docking visuals
          drawSpecialAsteroidsMod(ctx, gameState, env);
          withPlayerDockingXform(ctx, gameState, env, () => { drawPlayerMod(ctx, gameState, env); });
          drawNormalAsteroidsMod(ctx, gameState, env);
          try { drawShield(ctx, gameState, env); } catch {}
          // Grid last
          try { drawAsteroidScanGrid(ctx, gameState, env); } catch {}
        }
      }
      // 5) Player bullets
      drawBulletsMod(ctx, gameState, env);
      // 6) Aliens
      drawAliensMod(ctx, gameState, env);
      // 7) Bonuses
      drawBonusesMod(ctx, gameState, env);
      // Also render alien bullets and player missiles before effects (kept from prior wiring)
      drawAlienBulletsMod(ctx, gameState, env);
      if (gameState.playerMissiles && gameState.playerMissiles.length > 0) {
        drawPlayerMissilesMod(ctx, gameState, env);
      }
      // 8) Explosions
      drawExplosionsMod(ctx, gameState, env);
      // 9) Debris
      drawDebrisMod(ctx, gameState, env);
      // 10) UI overlays
      drawTractorOverlay(ctx, gameState, env);
      // 11) HUD
      drawHUD(ctx, gameState, env);
      // (Optional no-op placeholder that was there before)
      drawFrame(ctx, gameState, frameNow, env);

      // Draw combo display if active
      if (comboDisplay && Date.now() < comboDisplay.showUntil) {
        ctx.save();
        const centerX = CANVAS_WIDTH / 2;
        const centerY = CANVAS_HEIGHT / 3;
        
        // Fade out in last 500ms
        const remaining = comboDisplay.showUntil - Date.now();
        const alpha = remaining < 500 ? remaining / 500 : 1;
        
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Combo count
        ctx.font = 'bold 48px Arial';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;
        ctx.strokeText(`${comboDisplay.count} HITS`, centerX, centerY);
        ctx.fillStyle = '#ffaa00';
        ctx.fillText(`${comboDisplay.count} HITS`, centerX, centerY);
        
        // Multiplier
        if (comboDisplay.multiplier > 1) {
          ctx.font = 'bold 72px Arial';
          const multText = `${comboDisplay.multiplier}X`;
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 6;
          ctx.strokeText(multText, centerX, centerY + 60);
          
          // Color based on multiplier
          let color = '#ffaa00';
          if (comboDisplay.multiplier >= 10) color = '#ff00ff';
          else if (comboDisplay.multiplier >= 5) color = '#ff0000';
          else if (comboDisplay.multiplier >= 3) color = '#ffaa00';
          else color = '#ffffff';
          
          ctx.fillStyle = color;
          ctx.fillText(multText, centerX, centerY + 60);
        }
        
        ctx.restore();
      }

      // Restore canvas state (remove screen shake translation)
      ctx.restore();
      
      // Subtle edge darkening during shake to minimize artifacts (1px borders)
      if (shakeOffset.x !== 0 || shakeOffset.y !== 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        const borderWidth = 1;
        // Top and bottom edges
        ctx.fillRect(0, 0, CANVAS_WIDTH, borderWidth);
        ctx.fillRect(0, CANVAS_HEIGHT - borderWidth, CANVAS_WIDTH, borderWidth);
        // Left and right edges  
        ctx.fillRect(0, 0, borderWidth, CANVAS_HEIGHT);
        ctx.fillRect(CANVAS_WIDTH - borderWidth, 0, borderWidth, CANVAS_HEIGHT);
      }

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

      // UI layers: overlays then HUD (order preserved)
      drawTractorOverlay(ctx, gameState, env);
      drawHUD(ctx, gameState, env);
      // Minimap (UI-only), after HUD
      try { drawMiniMap(ctx, gameState, env); } catch {}
      
      // Auto-destruction visual effects: screen fade + text overlay
      if (autoDestructionActiveRef.current) {
        // 10% screen fade (darken)
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        // Check if user has a chance to win (has Flipit artifact)
        const hasChanceToWin = gameState.currentArtifact?.type === 'Flipit';
        const centerX = CANVAS_WIDTH / 2;
        const centerY = CANVAS_HEIGHT / 2;
        
        // Large main text at 10% opacity
        ctx.font = 'bold 180px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 3;
        
        const mainText = hasChanceToWin ? 'AWESOME' : 'TOO BAD';
        ctx.strokeText(mainText, centerX, centerY);
        ctx.fillText(mainText, centerX, centerY);
        
        // Smaller subtitle text below
        ctx.font = 'bold 36px Arial';
        const subText = hasChanceToWin 
          ? 'You have a chance to win' 
          : 'You lost your chance this time';
        ctx.strokeText(subText, centerX, centerY + 120);
        ctx.fillText(subText, centerX, centerY + 120);
        
        ctx.restore();
      }
      
      // Game Over visual effects: screen fade + "GAME OVER" text
      if (!gameState.gameRunning && gameOverStartRef.current) {
        // 10% screen fade (darken)
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        const centerX = CANVAS_WIDTH / 2;
        const centerY = CANVAS_HEIGHT / 2;
        
        // Large "GAME OVER" text at 10% opacity
        ctx.font = 'bold 180px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 3;
        ctx.strokeText('GAME OVER', centerX, centerY);
        ctx.fillText('GAME OVER', centerX, centerY);
        
        // Smaller subtitle text below
        ctx.font = 'bold 36px Arial';
        ctx.strokeText("That was fun, let's do it again", centerX, centerY + 120);
        ctx.fillText("That was fun, let's do it again", centerX, centerY + 120);
        
        // Pulsing "Press R to Restart" prompt
        const pulseAlpha = 0.25 + Math.sin(frameNow / 400) * 0.15; // Smooth pulse between 0.1 and 0.4
        ctx.font = 'bold 48px Arial';
        ctx.fillStyle = `rgba(100, 200, 255, ${pulseAlpha})`;
        ctx.strokeStyle = `rgba(50, 100, 150, ${pulseAlpha * 0.5})`;
        ctx.lineWidth = 2;
        ctx.strokeText('Press R to Restart', centerX, centerY + 220);
        ctx.fillText('Press R to Restart', centerX, centerY + 220);
        
        ctx.restore();
      }
      
      // Pause overlay with animated ship
      if (isPausedRef.current && gameState.gameRunning) {
        ctx.save();
        
        // Semi-transparent dark overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        // Animated ship in header area
        const shipAnimTime = frameNow / 1000; // seconds
        
        // Cycle through health states every 2 seconds
        const healthCycle = (Math.floor(shipAnimTime / 2) % 4) / 3; // 0, 0.33, 0.66, 1
        
        // Ship flies in a circular pattern in the top area
        const headerHeight = 120;
        const pathRadius = 80;
        const centerX = CANVAS_WIDTH / 2;
        const centerY = headerHeight / 2;
        const shipX = centerX + Math.cos(shipAnimTime * 0.5) * pathRadius;
        const shipY = centerY + Math.sin(shipAnimTime * 0.5) * pathRadius * 0.5; // Elliptical
        const shipRotation = Math.atan2(Math.sin(shipAnimTime * 0.5) * 0.5, Math.cos(shipAnimTime * 0.5)) + Math.PI / 2;
        
        // Draw the ship (same as player ship but scaled up)
        ctx.save();
        ctx.translate(shipX, shipY);
        ctx.rotate(shipRotation);
        
        const shipSize = 25; // Larger than normal player ship
        
        // Determine ship color based on health cycle
        let shipColor, glowColor;
        if (healthCycle > 0.66) {
          // Full health - green
          shipColor = '#00ff66';
          glowColor = '#00ff66';
        } else if (healthCycle > 0.33) {
          // Medium health - yellow
          shipColor = '#ffcc00';
          glowColor = '#ffcc00';
        } else {
          // Low health - red
          shipColor = '#ff3333';
          glowColor = '#ff3333';
        }
        
        // Glow effect
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 20;
        
        // Draw ship body (triangle)
        ctx.fillStyle = shipColor;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -shipSize);
        ctx.lineTo(-shipSize * 0.6, shipSize * 0.7);
        ctx.lineTo(shipSize * 0.6, shipSize * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Draw cockpit detail
        ctx.fillStyle = 'rgba(100, 200, 255, 0.6)';
        ctx.beginPath();
        ctx.arc(0, -shipSize * 0.3, shipSize * 0.25, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw engine flames (animated)
        const flameLength = 10 + Math.sin(shipAnimTime * 10) * 5;
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ff6600';
        ctx.fillStyle = '#ff6600';
        ctx.beginPath();
        ctx.moveTo(-shipSize * 0.3, shipSize * 0.7);
        ctx.lineTo(-shipSize * 0.15, shipSize * 0.7 + flameLength);
        ctx.lineTo(0, shipSize * 0.7);
        ctx.closePath();
        ctx.fill();
        
        ctx.beginPath();
        ctx.moveTo(shipSize * 0.3, shipSize * 0.7);
        ctx.lineTo(shipSize * 0.15, shipSize * 0.7 + flameLength);
        ctx.lineTo(0, shipSize * 0.7);
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
        
        // PAUSED text
        const centerTextX = CANVAS_WIDTH / 2;
        const centerTextY = CANVAS_HEIGHT / 2;
        
        ctx.font = 'bold 120px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 4;
        ctx.shadowColor = 'rgba(100, 200, 255, 0.8)';
        ctx.shadowBlur = 20;
        ctx.strokeText('PAUSED', centerTextX, centerTextY);
        ctx.fillText('PAUSED', centerTextX, centerTextY);
        
        // Instruction text
        ctx.font = 'bold 32px Arial';
        ctx.fillStyle = 'rgba(200, 200, 200, 0.9)';
        ctx.shadowBlur = 10;
        ctx.strokeText('Press P to Resume', centerTextX, centerTextY + 80);
        ctx.fillText('Press P to Resume', centerTextX, centerTextY + 80);
        
        ctx.restore();
      }
      
      // Draw LOST sequence countdown in center of screen
      const traction = tractionBeamRef.current;
      const lostSeq = (traction as any).lostSequence;
      if (lostSeq && lostSeq.active) {
        const nowPerf = performance.now();
        const elapsed = nowPerf - lostSeq.startTime;
        const duration = 3000; // 3 seconds
        
        if (elapsed < duration) {
          // Calculate current percentage (counts down from initial to 0)
          const progress = elapsed / duration;
          const currentPercent = lostSeq.initialPercent * (1 - progress);
          
          // Center screen position
          const cx = CANVAS_WIDTH / 2;
          const cy = CANVAS_HEIGHT / 2;
          
          // Draw large red percentage countdown
          ctx.save();
          ctx.font = 'bold 72px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = `rgba(255, 0, 0, ${1 - progress * 0.3})`; // Fade slightly
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
          ctx.lineWidth = 4;
          ctx.strokeText(`${currentPercent.toFixed(1)}%`, cx, cy);
          ctx.fillText(`${currentPercent.toFixed(1)}%`, cx, cy);
          
          // Draw "LOST" text below
          ctx.font = 'bold 32px Arial';
          ctx.fillStyle = `rgba(255, 100, 100, ${1 - progress * 0.3})`;
          ctx.strokeText('LOST', cx, cy + 60);
          ctx.fillText('LOST', cx, cy + 60);
          ctx.restore();
        } else {
          // Countdown finished, clear the sequence and end traction
          (traction as any).lostSequence = { active: false };
          traction.active = false;
          traction.targetAsteroid = null;
        }
      }

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
          const arr = debugLinesRef.current; arr.push(summary); if (arr.length > 200) arr.splice(0, arr.length - 200);
        }
      }

      // Forward draw stub (no-op in Pass A); placed near end of frame
      drawFrame(ctx, gameState, frameNow, env);
    };

    if (__DEV_MODE__) {
      try {
        __runFrameBody();
      } catch (err) {
        const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        const arr = debugLinesRef.current; arr.push(`[error] ${msg}`);
        if (arr.length > 200) arr.splice(0, arr.length - 200);
        devFrameError(err);
        // Re-throw to avoid masking in dev if needed:
        // throw err;
      }
    } else {
      __runFrameBody();
    }

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
      if (isFittedRef.current) {
        const cfg = getFxConfig({ refs: { fxConfig: devFxRefs.current.fxConfig } });
        applyFitSizing({
          initialCanvasRef,
          ensureStarsForCanvas: () => ensureStarsForCanvas({
            starsRef,
            initialAreaRef,
            initialStarCountRef,
            CANVAS_WIDTH,
            CANVAS_HEIGHT,
            starCountScale: cfg.starCountScale,
          }),
          setCanvasSize,
          setCanvasPixelSize,
          setIsFitted,
          renderScale: cfg.renderScale,
        });
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Removed Fullscreen support

  // (Removed duplicate setOnMusicTrackChange effect; handled earlier)

  // Mount-only: restore saved FX preset (if any) and apply sizing; then restore FPS cap
  useEffect(() => {
    const saved = loadFxPreset();
    if (saved) {
      if (!devFxRefs.current.fxConfig) devFxRefs.current.fxConfig = {};
      applyFxPreset(devFxRefs.current, saved);
      const cfg = getFxConfig({ refs: { fxConfig: devFxRefs.current.fxConfig } });
      const ensureStarsForCanvasCb = () => ensureStarsForCanvas({
        starsRef,
        initialAreaRef,
        initialStarCountRef,
        CANVAS_WIDTH,
        CANVAS_HEIGHT,
        starCountScale: cfg.starCountScale,
      });
      applyFitSizing({
        initialCanvasRef,
        ensureStarsForCanvas: ensureStarsForCanvasCb,
        setCanvasSize,
        setCanvasPixelSize,
        setIsFitted,
        renderScale: cfg.renderScale,
      });
    }
    // Restore FPS cap regardless of whether a preset was saved
    const cap = loadFxCap();
    if (cap != null) {
      if (!devFxRefs.current.fxConfig) devFxRefs.current.fxConfig = {};
      devFxRefs.current.fxConfig.capFps = cap;
    }
  }, []);

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

  // controls already created earlier

  // Disable legacy canvas 'Now Playing' overlay when MusicDock is present
  const ENABLE_CANVAS_NOW_PLAYING_OVERLAY = false;

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 relative" style={{ cursor: 'default' }}>
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

      {/* Removed legacy floating DebugPanel overlay. All debug UI lives inside the panel below. */}

      {/* Top buttons row: Login/User on left, Effects/Debug on right */}
      <div className="mb-2 px-4 flex justify-between items-center" style={{ width: canvasSize.w + 32 }}>
        {/* Left side: Login/User and Scoreboard */}
        <div className="flex flex-row gap-1.5">
        {/* Login/User Button */}
        {currentUser ? (
          <div className="flex items-center gap-1.5">
            <div className="px-2 py-1 bg-cyan-900/70 backdrop-blur-sm border border-cyan-400/40 rounded text-xs">
              <span className="text-cyan-300">👤</span>
              <span className="text-white ml-1">{currentUser.displayName}</span>
            </div>
            <button
              onClick={() => {
                if (confirm('Are you sure you want to logout?')) {
                  localStorage.removeItem('asteroids_user');
                  setCurrentUser(null);
                }
              }}
              className="px-2 py-1 bg-gray-700/80 hover:bg-gray-600 text-white text-xs rounded border border-gray-500/40 transition-colors"
              title="Logout"
            >
              Logout
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowLoginModal(true)}
            className="px-2 py-1 bg-cyan-700/80 hover:bg-cyan-600 text-white text-xs rounded border border-cyan-400/40 transition-colors"
          >
            Login / Register
          </button>
        )}
        
        {/* Scoreboard Link */}
        <button
          onClick={() => {
            try {
              const displayName = currentUser?.displayName ?? 'Anonymous';
              const userEmail = currentUser?.email;
              const saved = saveScore({
                displayName,
                score: gameState.score ?? 0,
                stage: gameState.stage ?? 1,
                rewardAmount: 0,
                userEmail,
              });
              setTargetScoreIdLeaderboard(saved.id);
            } catch {}
            setShowLeaderboard(true);
          }}
          className="px-2 py-1 bg-yellow-700/80 hover:bg-yellow-600 text-white text-xs rounded border border-yellow-400/40 transition-colors flex items-center gap-1"
        >
          <span>🏆</span>
          <span>Leaderboard</span>
        </button>
        </div>
        
        {/* Right side: Effects/CPU and Debug Tools */}
        <div className="flex gap-1.5">
          {/* Background/Effects dropdown button */}
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
            bgBrightness={bgBrightness}
            setBgOpacity={setBgOpacity}
            setBgBrightness={setBgBrightness}
            effectsApply={effectsApply}
            setEffectsApply={setEffectsApply}
            trailsEnabled={trailsEnabled}
            setTrailsEnabled={setTrailsEnabled}
            trailsTargets={trailsTargets}
            setTrailsTargets={setTrailsTargets}
          />
          
          {/* Debug Tools button (dev only) */}
          {import.meta.env.DEV && !debugPanelOpen && (
            <button
              onClick={() => setDebugPanelOpen(true)}
              className="px-3 py-1.5 text-xs rounded bg-cyan-700 hover:bg-cyan-600 text-white border border-cyan-400 shadow opacity-20 hover:opacity-100 transition-opacity"
              aria-label="Open Debug Panel"
            >
              Debug Tools
            </button>
          )}
        </div>
      </div>

      {/* Debug Panel Launcher moved to top button row */}

      {/* Debug Panel - Only show in development when open (aligned with right buttons) */}
      {import.meta.env.DEV && debugPanelOpen && (
        <div className="fixed right-4 top-16 bg-gray-900/95 backdrop-blur-sm text-white p-4 rounded-lg border border-gray-700 shadow-lg z-50 w-80 max-h-[80vh] overflow-y-auto">
          <button
            onClick={() => setDebugPanelOpen(false)}
            aria-label="Close Debug Tools"
            className="absolute right-2 top-2 px-2 py-0.5 text-xs rounded bg-gray-700 hover:bg-gray-600 border border-gray-500"
          >
            ×
          </button>
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
            {/* FX Presets (DEV-only) */}
            <div className="mt-3">
              <h4 className="text-xs font-semibold text-cyan-300 mb-1">FX Presets</h4>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => {
                    if (!devFxRefs.current.fxConfig) devFxRefs.current.fxConfig = {};
                    applyFxPreset(devFxRefs.current, 'high');
                    saveFxPreset('high');
                    const cfg = getFxConfig({ refs: { fxConfig: devFxRefs.current.fxConfig } });
                    const ensureStarsForCanvasCb = () => ensureStarsForCanvas({
                      starsRef,
                      initialAreaRef,
                      initialStarCountRef,
                      CANVAS_WIDTH,
                      CANVAS_HEIGHT,
                      starCountScale: cfg.starCountScale,
                    });
                    applyFitSizing({
                      initialCanvasRef,
                      ensureStarsForCanvas: ensureStarsForCanvasCb,
                      setCanvasSize,
                      setCanvasPixelSize,
                      setIsFitted,
                      renderScale: cfg.renderScale,
                    });
                  }}
                  className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded border border-gray-500"
                >FX High</button>
                <button
                  onClick={() => {
                    if (!devFxRefs.current.fxConfig) devFxRefs.current.fxConfig = {};
                    applyFxPreset(devFxRefs.current, 'medium');
                    saveFxPreset('medium');
                    const cfg = getFxConfig({ refs: { fxConfig: devFxRefs.current.fxConfig } });
                    const ensureStarsForCanvasCb = () => ensureStarsForCanvas({
                      starsRef,
                      initialAreaRef,
                      initialStarCountRef,
                      CANVAS_WIDTH,
                      CANVAS_HEIGHT,
                      starCountScale: cfg.starCountScale,
                    });
                    applyFitSizing({
                      initialCanvasRef,
                      ensureStarsForCanvas: ensureStarsForCanvasCb,
                      setCanvasSize,
                      setCanvasPixelSize,
                      setIsFitted,
                      renderScale: cfg.renderScale,
                    });
                  }}
                  className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded border border-gray-500"
                >FX Med</button>
                <button
                  onClick={() => {
                    if (!devFxRefs.current.fxConfig) devFxRefs.current.fxConfig = {};
                    applyFxPreset(devFxRefs.current, 'low');
                    saveFxPreset('low');
                    const cfg = getFxConfig({ refs: { fxConfig: devFxRefs.current.fxConfig } });
                    const ensureStarsForCanvasCb = () => ensureStarsForCanvas({
                      starsRef,
                      initialAreaRef,
                      initialStarCountRef,
                      CANVAS_WIDTH,
                      CANVAS_HEIGHT,
                      starCountScale: cfg.starCountScale,
                    });
                    applyFitSizing({
                      initialCanvasRef,
                      ensureStarsForCanvas: ensureStarsForCanvasCb,
                      setCanvasSize,
                      setCanvasPixelSize,
                      setIsFitted,
                      renderScale: cfg.renderScale,
                    });
                  }}
                  className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded border border-gray-500"
                >FX Low</button>
              </div>
              <div className="mt-2">
                <button
                  onClick={() => {
                    // Clear saved preset and cap
                    clearFxPreset();
                    clearFxCap();
                    // Reset runtime FX config to defaults
                    devFxRefs.current.fxConfig = { ...FX_DEFAULTS };
                    // Re-ensure stars and re-apply fit sizing with defaults
                    const cfg = getFxConfig({ refs: { fxConfig: devFxRefs.current.fxConfig } });
                    const ensureStarsForCanvasCb = () => ensureStarsForCanvas({
                      starsRef,
                      initialAreaRef,
                      initialStarCountRef,
                      CANVAS_WIDTH,
                      CANVAS_HEIGHT,
                      starCountScale: cfg.starCountScale,
                    });
                    applyFitSizing({
                      initialCanvasRef,
                      ensureStarsForCanvas: ensureStarsForCanvasCb,
                      setCanvasSize,
                      setCanvasPixelSize,
                      setIsFitted,
                      renderScale: cfg.renderScale,
                    });
                  }}
                  className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded border border-gray-500"
                >Reset FX</button>
              </div>
            </div>
            {/* Debug Console */}
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-xs font-semibold text-cyan-300">Debug Console</h4>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDevMax(v => !v)}
                    className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded border border-gray-500"
                  >{devMax ? 'Minimize' : 'Maximize'}</button>
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(devLines.join('\n'));
                      } catch (e) {
                        // eslint-disable-next-line no-console
                        console.log('[dev-copy]', devLines);
                      }
                    }}
                    className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded border border-gray-500"
                  >Copy</button>
                </div>
              </div>
              <div
                className="bg-gray-800/80 rounded p-2 border border-gray-600 font-mono text-[11px] leading-4 overflow-y-auto"
                style={{ maxHeight: devMax ? 260 : 96 }}
              >
                {devLines.slice(-250).map((ln, i) => (
                  <div key={i} className="text-gray-300">{ln}</div>
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
                // Reset action notes
                setActionNotes(["Game initialized", "Waiting for player action..."]);
              }}
              className="w-full px-2 py-1 bg-gray-600 hover:bg-gray-700 text-white text-xs rounded"
            >
              Clear Notes
            </button>
            <button
              onClick={() => {
                // Import quota tracker dynamically
                import('./youtube/quotaTracker').then(({ quotaTracker }) => {
                  const usage = quotaTracker.getTodayUsage();
                  const remaining = quotaTracker.getRemainingQuota();
                  const byEndpoint = quotaTracker.getUsageByEndpoint();
                  const allEntries = quotaTracker.getTodayEntries();
                  
                  console.group('📊 YouTube API Quota Report');
                  console.log(`%c═══════════════════════════════════════════`, 'color: cyan');
                  console.log(`%c📈 DAILY QUOTA SUMMARY`, 'color: yellow; font-weight: bold; font-size: 14px');
                  console.log(`%c═══════════════════════════════════════════`, 'color: cyan');
                  console.log(`%cTotal Used:     ${usage} / 10,000 units`, usage > 7000 ? 'color: red; font-weight: bold' : usage > 5000 ? 'color: orange' : 'color: green');
                  console.log(`%cRemaining:      ${remaining} units`, remaining < 3000 ? 'color: red' : 'color: green');
                  console.log(`%cUsage:          ${((usage / 10000) * 100).toFixed(1)}%`, 'color: cyan');
                  console.log('');
                  
                  console.log(`%c═══════════════════════════════════════════`, 'color: cyan');
                  console.log(`%c📋 USAGE BY ENDPOINT`, 'color: yellow; font-weight: bold; font-size: 14px');
                  console.log(`%c═══════════════════════════════════════════`, 'color: cyan');
                  
                  if (Object.keys(byEndpoint).length === 0) {
                    console.log('%cNo API calls made today', 'color: gray; font-style: italic');
                  } else {
                    Object.entries(byEndpoint).forEach(([endpoint, data]: [string, { count: number; totalCost: number }]) => {
                      console.log(`%c${endpoint}`, 'color: white; font-weight: bold');
                      console.log(`  ├─ Calls:  ${data.count}`);
                      console.log(`  └─ Cost:   ${data.totalCost} units`);
                    });
                  }
                  console.log('');
                  
                  console.log(`%c═══════════════════════════════════════════`, 'color: cyan');
                  console.log(`%c📝 RECENT API CALLS (Last 10)`, 'color: yellow; font-weight: bold; font-size: 14px');
                  console.log(`%c═══════════════════════════════════════════`, 'color: cyan');
                  
                  const recent = allEntries.slice(-10).reverse();
                  if (recent.length === 0) {
                    console.log('%cNo recent calls', 'color: gray; font-style: italic');
                  } else {
                    recent.forEach((entry: { timestamp: number; success: boolean; endpoint: string; cost: number; error?: string }) => {
                      const time = new Date(entry.timestamp).toLocaleTimeString();
                      const status = entry.success ? '✅' : '❌';
                      const color = entry.success ? 'color: green' : 'color: red';
                      console.log(`${status} %c${time}%c - ${entry.endpoint} (${entry.cost} units)`, color, 'color: white', entry.error ? `\n   Error: ${entry.error}` : '');
                    });
                  }
                  console.log('');
                  
                  console.log(`%c═══════════════════════════════════════════`, 'color: cyan');
                  console.log(`%c💰 API COST REFERENCE`, 'color: yellow; font-weight: bold; font-size: 14px');
                  console.log(`%c═══════════════════════════════════════════`, 'color: cyan');
                  console.log('%csearch.list            100 units  (Channel search)', 'color: orange; font-weight: bold');
                  console.log('%cchannels.list          1 unit     (Channel details)', 'color: lightgreen');
                  console.log('%cplaylistItems.list     1 unit     (Playlist videos)', 'color: lightgreen');
                  console.log('%cvideos.list            1 unit     (Video details)', 'color: lightgreen');
                  console.log('%ccommentThreads.list    50 units   (Comments)', 'color: yellow');
                  console.log('%csubscriptions.list     5 units    (Subscriptions)', 'color: yellow');
                  console.log('');
                  console.log(`%c═══════════════════════════════════════════`, 'color: cyan');
                  console.groupEnd();
                  
                  setActionNotes(prev => [...prev, `YouTube API Report logged to console`]);
                }).catch(err => {
                  console.error('Failed to load quota tracker:', err);
                });
              }}
              className="w-full px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded"
            >
              YouTube API Results
            </button>
            </div>
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        className={'bg-black rounded-lg p-4 shadow-2xl border border-cyan-500 relative z-10'}
        style={{ cursor: 'crosshair' }}
      >
        <canvas
          ref={canvasRef}
          style={{ cursor: 'inherit' }}
          width={canvasSize.w}
          height={canvasSize.h}
          className={'border border-gray-700 rounded cursor-none'}
        />
        
        {/* Reward collection notifications */}
        {rewardNotifications.map(notif => {
          const now = Date.now();
          const elapsed = now - notif.startTime;
          const progress = elapsed / notif.duration;
          const opacity = 1 - progress;
          const offsetY = -progress * 30; // Float upward
          
          return (
            <div
              key={notif.id}
              className="absolute pointer-events-none"
              style={{
                left: `${notif.x}px`,
                top: `${notif.y + offsetY}px`,
                transform: 'translate(-50%, -50%)',
                opacity,
                fontSize: '24px',
                fontWeight: 'bold',
                color: '#FFD700',
                textShadow: '0 0 10px rgba(255, 215, 0, 0.8), 0 0 20px rgba(255, 215, 0, 0.5)',
                letterSpacing: '2px',
                zIndex: 100
              }}
            >
              {notif.text}
            </div>
          );
        })}
        
        {/* Bottom buttons row: Easy/Instructions/Resume/Fit/SongList/AutoFire - bottom aligned with ENERGY bar */}
        <div className="absolute left-0 right-0 flex justify-center gap-2 opacity-20 hover:opacity-100 transition-opacity" style={{ bottom: '30px' }}>
          <select
            id="difficulty"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
            className="dock-select px-3 py-2"
            aria-label="Difficulty"
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
          <button onClick={() => setShowInstructions(true)} className="dock-btn px-3 py-2">Instructions</button>
          <button onClick={() => setIsPaused(p => !p)} className="dock-btn px-3 py-2">{isPaused ? 'Resume' : 'Pause'}</button>
          <button onClick={onToggleFit} className="dock-btn px-3 py-2">{isFitted ? 'Original Size' : 'Fit to Window'}</button>
          <button
            type="button"
            className="dock-btn px-3 py-2"
            aria-expanded={showSongList}
            aria-controls="songlist-panel"
            onClick={() => setShowSongList((v) => !v)}
          >{showSongList ? 'Hide Song List' : 'Song List'}</button>
          <button
            type="button"
            className={`dock-btn px-3 py-2 ${autoFireEnabled ? 'bg-green-600 hover:bg-green-500' : 'bg-gray-600 hover:bg-gray-500'}`}
            onClick={() => setAutoFireEnabled(prev => !prev)}
            title={autoFireEnabled ? 'Auto-Fire: ON' : 'Auto-Fire: OFF'}
          >
            🎯 Auto-Fire: {autoFireEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
        
        {/* MusicDock - positioned above buttons with reduced spacing */}
        <div className="absolute bottom-12 left-0 right-0 flex justify-center px-6 transition-opacity duration-300" style={{ opacity: 0.2 }}
          onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.opacity = '0.95'}
          onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.opacity = '0.2'}>
          <MusicDock
            isPlaying={musicPlaying}
            onPlayPause={handlePlayPauseMusic}
            onPrev={handlePrevTrack}
            onNext={handleNextTrack}
            tracks={musicTracks.map(t => ({ name: formatTrackName(t.name), url: t.url }))}
            currentIndex={musicIndex}
            marqueeTitle={formatTrackName(musicTracks[musicIndex]?.name || '')}
            muted={isMuted}
            onToggleMute={controls.toggleMute}
            musicVolume={musicVol}
            onMusicVolume={controls.handleMusicVolume}
            sfxVolume={sfxVol}
            onSfxVolume={controls.handleSfxVolume}
          />
        </div>
        
        {/* Background dropdown moved to top button row */}
        
        {gameState.player.doubleShooter > 0 && (
          <div className="absolute top-4 right-4 text-sm text-orange-400">Double Shot: {Math.ceil(gameState.player.doubleShooter / 60)}s</div>
        )}
        
        {/* MadeWithChat badge - bottom aligned with ENERGY bar and menu buttons */}
      <a
        href="https://madewithchat.com"
        target="_blank"
        rel="noreferrer"
        className="absolute z-40 flex items-center gap-2 opacity-60 hover:opacity-100 transition-opacity"
        style={{ bottom: '30px', right: '50px' }}
        aria-label="MadeWithChat"
      >
        <img src={mwcLogo} alt="MadeWithChat Logo" className="h-6 w-auto select-none" draggable={false} />
        <span className="text-white/80 text-xs font-semibold">MadeWithChat</span>
      </a>
    </div>
      
      {/* Song List and YouTube Settings - Below canvas */}
      <div className="mt-4 text-center text-white flex flex-col items-center gap-4 relative">
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
        <div ref={songListRef} className="mt-3 mb-32 w-full max-w-4xl bg-gray-800/40 backdrop-blur-sm rounded-lg p-4 border border-gray-700/50">
          <div className="flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-gray-700/50 pb-2">
              <span className="text-red-400 text-lg">♫</span>
              <h3 className="text-white font-semibold text-sm">Music & Playlist</h3>
            </div>
            
            {/* Local Track List */}
            <div className="flex flex-col gap-2">
              <p className="text-gray-400 text-xs font-medium">Local Songs:</p>
              <div className="flex flex-wrap gap-2">
                {musicTracks.map((t, i) => (
                  <button
                    key={t.url}
                    onClick={() => {
                      setMusicIndex(i);
                      // Start playback of this track immediately; if muted, it will be silent but timeline continues
                      safePlayMusic(i);
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
            </div>
            
            {/* YouTube Music Settings */}
            <div className="flex flex-col gap-3 pt-3 border-t border-gray-700/30">
              
              {/* Enable/Disable YouTube */}
              <label className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={youtubeEnabled}
                  onChange={async (e) => {
                    const enabled = e.target.checked;
                    setYouTubeEnabled(enabled);
                    soundSystem.setYouTubeEnabled(enabled);
                    
                    if (enabled) {
                      // Initialize YouTube and switch to YouTube-only mode
                      console.log('🚀 User enabled YouTube - initializing...');
                      await soundSystem.initYouTube();
                      
                      // Switch to YouTube Only mode
                      setMusicSource('youtube');
                      await soundSystem.setMusicSource('youtube');
                      
                      // Stop current music and play a YouTube song after brief delay
                      // Delay prevents race condition with mode change
                      soundSystem.stopMusic();
                      setTimeout(() => {
                        soundSystem.playMusic().catch(() => {});
                      }, 500); // Increased delay to let mode change settle
                    } else {
                      // Disabled YouTube - switch back to local
                      setMusicSource('local');
                      await soundSystem.setMusicSource('local');
                      
                      // Pick random local song
                      const tracks = soundSystem.getMusicTracks();
                      const randomIndex = Math.floor(Math.random() * tracks.length);
                      soundSystem.stopMusic();
                      setTimeout(() => {
                        soundSystem.playMusic(randomIndex).catch(() => {});
                      }, 100);
                    }
                  }}
                  className="w-4 h-4 rounded border-gray-600 text-red-600 focus:ring-2 focus:ring-red-500 focus:ring-offset-0 focus:ring-offset-gray-900"
                />
                <span className="text-gray-300 text-sm group-hover:text-white transition-colors">
                  Enable YouTube Music (from @OutlawAlgorithm)
                </span>
              </label>
              
              {/* Music Source Selection */}
              {youtubeEnabled && (
                <div className="flex flex-col gap-2 pl-7">
                  <label className="text-gray-400 text-xs font-medium">Music Mix:</label>
                  <select
                    value={musicSource}
                    onChange={async (e) => {
                      const source = e.target.value as MusicSource;
                      setMusicSource(source);
                      
                      // Initialize YouTube if switching to mixed or youtube mode
                      if (source === 'mixed' || source === 'youtube') {
                        await soundSystem.initYouTube();
                      }
                      
                      await soundSystem.setMusicSource(source);
                      
                      // Pick appropriate song for the mode
                      soundSystem.stopMusic();
                      setTimeout(() => {
                        if (source === 'local') {
                          // Pick random local song
                          const tracks = soundSystem.getMusicTracks();
                          const randomIndex = Math.floor(Math.random() * tracks.length);
                          soundSystem.playMusic(randomIndex).catch(() => {});
                        } else {
                          // For mixed/youtube, let system pick
                          soundSystem.playMusic().catch(() => {});
                        }
                      }, 300);
                    }}
                    className="bg-gray-900/60 border border-gray-600 text-gray-200 text-sm rounded-lg px-3 py-2 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                  >
                    <option value="mixed">Mixed (90% Local, 10% YouTube)</option>
                    <option value="local">Local Songs Only</option>
                    <option value="youtube">YouTube Only</option>
                  </select>
                  
                  <p className="text-gray-500 text-xs italic mt-1">
                    {musicSource === 'mixed' && '🎵 Random mix: 10% YouTube, 90% Local'}
                    {musicSource === 'local' && '💿 Playing only downloaded songs'}
                    {musicSource === 'youtube' && '📺 Streaming from YouTube channel'}
                  </p>
                  
                  {/* YouTube API Quota Button */}
                  <button
                    onClick={() => setShowQuotaDisplay(true)}
                    className="mt-2 px-3 py-2 bg-cyan-700 hover:bg-cyan-600 text-white text-xs rounded-lg border border-cyan-500 transition-colors flex items-center gap-2"
                  >
                    <span>📊</span>
                    <span>API Quota Usage</span>
                  </button>
                </div>
              )}
              
              {/* Channel Info Display */}
              {youtubeEnabled && youtubeChannel && (
                <div className="flex items-center gap-3 pl-7 pt-2 border-t border-gray-700/30">
                  <img 
                    src={youtubeChannel.thumbnail} 
                    alt={youtubeChannel.title}
                    className="w-10 h-10 rounded-full border border-red-500/30"
                  />
                  <div className="flex flex-col flex-1">
                    <span className="text-gray-300 text-xs font-medium">{youtubeChannel.title}</span>
                    <a 
                      href={youtubeChannel.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-red-400 hover:text-red-300 text-xs transition-colors"
                    >
                      {youtubeChannel.handle}
                    </a>
                  </div>
                </div>
              )}
              
              {/* Custom Channel URL Input */}
              {youtubeEnabled && (
                <div className="flex flex-col gap-2 pl-7 pt-3 border-t border-gray-700/30 mt-3">
                  <label className="text-gray-400 text-xs font-medium">Custom Music Channel:</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customChannelUrl}
                      onChange={(e) => {
                        setCustomChannelUrl(e.target.value);
                        setChannelError('');
                      }}
                      placeholder="https://www.youtube.com/@YourChannel"
                      className="flex-1 bg-gray-900/60 border border-gray-600 text-gray-200 text-xs rounded-lg px-3 py-2 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none placeholder-gray-500"
                      disabled={channelLoading}
                    />
                    <button
                      onClick={async () => {
                        const url = customChannelUrl.trim();
                        if (!url) {
                          setChannelError('Please enter a channel URL');
                          return;
                        }
                        
                        // Validate URL format
                        const { isValidYouTubeChannel } = await import('./config/youtube');
                        if (!isValidYouTubeChannel(url)) {
                          setChannelError('Invalid YouTube channel URL');
                          return;
                        }
                        
                        setChannelLoading(true);
                        setChannelError('');
                        
                        try {
                          // Clear cache and fetch new channel
                          const { clearPlaylistCache, fetchYouTubePlaylist } = await import('./youtube/youtubeApi');
                          clearPlaylistCache();
                          
                          const playlist = await fetchYouTubePlaylist(url, true); // forceRefresh = true
                          if (!playlist) {
                            setChannelError('Could not load channel. Check URL and try again.');
                            return;
                          }
                          
                          // Update channel state
                          setYouTubeChannel(playlist.channel);
                          
                          // Stop current song and play from new channel
                          soundSystem.stopMusic();
                          setTimeout(() => {
                            soundSystem.playMusic().catch(() => {});
                          }, 100);
                          
                          setCustomChannelUrl(''); // Clear input on success
                        } catch (error) {
                          console.error('Error loading channel:', error);
                          setChannelError('Failed to load channel');
                        } finally {
                          setChannelLoading(false);
                        }
                      }}
                      disabled={channelLoading || !customChannelUrl.trim()}
                      className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                        channelLoading || !customChannelUrl.trim()
                          ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                          : 'bg-red-600 hover:bg-red-700 text-white'
                      }`}
                    >
                      {channelLoading ? 'Loading...' : 'Load'}
                    </button>
                  </div>
                  
                  {channelError && (
                    <p className="text-red-400 text-xs">⚠️ {channelError}</p>
                  )}
                  
                  <p className="text-gray-500 text-xs italic">
                    💡 Paste any YouTube music channel URL (e.g., @YourFavoriteArtist)
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </div>

      {/* YouTube Credit Display (Bottom-Right) */}
      <YouTubeCredit
        video={youtubeVideo}
        channel={youtubeChannel}
        isPlaying={youtubeIsPlaying}
      />

      {/* Hidden YouTube Player Container (for IFrame API) */}
      <div id="youtube-player" style={{ display: 'none' }}></div>

      {/* YouTube Quota Display Modal */}
      <YouTubeQuotaDisplay 
        isOpen={showQuotaDisplay}
        onClose={() => setShowQuotaDisplay(false)}
      />

      {/* Scoreboard Modal (shown on game over) */}
      {showScoreboard && (
        <Scoreboard
          score={finalScore}
          stage={finalStage}
          rewardAmount={rewardAmount}
          onComplete={() => {
            setShowScoreboard(false);
            // Reset game to menu or restart
            initGame();
          }}
        />
      )}

      {/* Login/Register Modal */}
      {showLoginModal && (
        <LoginModal
          onClose={() => setShowLoginModal(false)}
          onSuccess={(user) => {
            setCurrentUser(user);
            setShowLoginModal(false);
          }}
        />
      )}

      {/* Leaderboard Modal */}
      {showLeaderboard && (
        <ScoreboardDisplay
          onClose={() => setShowLeaderboard(false)}
          targetScoreId={targetScoreIdLeaderboard}
        />
      )}

      {/* Ticket Randomizer Modal */}
      {showTicketRandomizer && (
        <TicketRandomizer
          flipitPercent={randomizerFlipitPercent}
          stage={gameState.stage}
          onComplete={handleTicketRandomizerComplete}
        />
      )}

      {/* Mobile Touch Controls */}
      {isMobile && (
        <>
          {/* Virtual Joystick - Left Side */}
          <div className="fixed bottom-4 left-4 z-50">
            <VirtualJoystick onMove={handleJoystickMove} size={140} />
          </div>

          {/* Touch Controls - Right Side */}
          <TouchControls
            onFire={handleTouchFire}
            onMissile={handleTouchMissile}
            onDash={handleTouchDash}
          />
        </>
      )}
    </div>
  );
};

export default Game;