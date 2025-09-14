import React, { useRef, useEffect, useState, useCallback } from 'react';
import mwcLogo from '../images/Made With Chat Logo.png';
import { GameState, Bullet, AlienShip, AlienBullet, Explosion, Bonus, Asteroid, VisualDebris } from './types';
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
  createAsteroid,
  createBullet,
  createAlienShip,
  createAlienBullet,
  updatePlayer,
  updateBullet,
  updateAlienShip,
  updateAlienBullet,
  updateAsteroid,
  splitAsteroid,
  updateExplosion,
  createExplosion,
  createAlienExplosion,
  updateBonus,
  createBonus,
  createBlackPuffExplosion,
} from './gameObjects';
import { ExplosionDistortionManager } from './effects/ExplosionDistortion';

const Game: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gameStateRef = useRef<GameState>();
  const animationFrameRef = useRef<number>();
  // Distortion manager for background warps
  const distortionRef = useRef<ExplosionDistortionManager | null>(null);
  const introPulseMarksRef = useRef<Record<string, boolean>>({});
  const starsRef = useRef<Array<{x: number, y: number, brightness: number, twinkleSpeed: number}>>([]);
  // Starfield scaling helpers
  const initialAreaRef = useRef<number>(CANVAS_WIDTH * CANVAS_HEIGHT);
  const initialStarCountRef = useRef<number>(200);

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
  // Background tuning controls (defaults updated per user: opacity 25%, contrast 100%, brightness 100%)
  const [bgOpacity, setBgOpacity] = useState(0.25);
  const [bgContrast, setBgContrast] = useState(1.0);
  const [bgBrightness, setBgBrightness] = useState(1.0);
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
  // Local state for current canvas dimensions (do NOT shadow utils.setCanvasSize)
  const [canvasSize, setCanvasDims] = useState<{w: number, h: number}>({ w: CANVAS_WIDTH, h: CANVAS_HEIGHT });
  const [isFitted, setIsFitted] = useState(false);
  // Remember initial canvas size to restore "Original Size"
  const initialCanvasRef = useRef<{ w: number; h: number }>({ w: CANVAS_WIDTH, h: CANVAS_HEIGHT });
  const [, setScore] = useState(0);

  // UI: simple toggle + sliders for explosion distortion
  const [distortionEnabled, setDistortionEnabled] = useState<boolean>(true);
  const [distortionSize, setDistortionSize] = useState<number>(50); // 0..100
  const [distortionDepth, setDistortionDepth] = useState<number>(70); // 0..100
  
  // Action notes box state
  const [actionNotes, setActionNotes] = useState<string[]>([
    "Game initialized",
    "Waiting for player action..."
  ]);
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
  const resumeInfoRef = useRef<{ index: number; offsetSec: number } | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
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

  // Music track change handler for dropdown
  const handleChangeTrack = (index: number) => {
    setMusicIndex(index);
  };

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

    // Player docking glow overlay
    if (canDock) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = 'rgba(207,227,255,0.55)';
      ctx.beginPath();
      ctx.arc(player.position.x, player.position.y, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // Tractor beam (soft gradient line)
      const bx0 = sx, by0 = sy;
      const bx1 = player.position.x, by1 = player.position.y;
      const grad = ctx.createLinearGradient(bx0, by0, bx1, by1);
      grad.addColorStop(0, 'rgba(207,227,255,0.45)');
      grad.addColorStop(1, 'rgba(207,227,255,0.0)');
      ctx.save();
      ctx.strokeStyle = grad;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(bx0, by0);
      ctx.lineTo(bx1, by1);
      ctx.stroke();
      ctx.restore();
    }
  }


  // Black frame border and off-screen indicators (framework)
  {
    // Draw black frame border (thin)
    const border = 2;
{{ ... }}
        const t1 = (xMin - ax) / vx;
        const y1 = ay + t1 * vy;
        if (t1 > 0 && y1 >= yMin && y1 <= yMax && t1 < t) t = t1;
        const t2 = (xMax - ax) / vx;
        const y2 = ay + t2 * vy;
        if (t2 > 0 && y2 >= yMin && y2 <= yMax && t2 < t) t = t2;
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

    // Optional Debug HUD
    if (showDebugHud) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
{{ ... }}
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

    // Draw a tiny floating control for Distortion toggle (top-left under score)
    // Note: kept lightweight to avoid touching existing dropdown wiring
    {
      // UI paint happens later in drawUI, but we still show HTML inputs via React below
    }

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

      // Update player (disabled during respawn countdown)
      if (!gameState.respawning) {
        // Capture previous position before update to detect wrap crossings
        const prevX = gameState.player.position.x;
        const prevY = gameState.player.position.y;
        gameState.player = updatePlayer(gameState.player, gameState.keys, 16);
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

      // Update asteroids - maintaining cardinal directions
      gameState.asteroids = gameState.asteroids.map(updateAsteroid);

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
        .filter(explosion => explosion.particles.length > 0);

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
            
            // Damage player
            const { damageScale } = getDifficultySettings();
            const mult = bullet.damageMultiplier ? bullet.damageMultiplier : 1;
            const base = 15 * mult;
            gameState.player.health -= Math.round(base * damageScale);
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

      // Collision detection: player vs asteroids
      if (gameState.player.invulnerable === 0 && gameState.player.shieldTime === 0) {
        for (const asteroid of gameState.asteroids) {
          if (checkCollision(gameState.player, asteroid)) {
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
            gameState.player.health -= Math.round(damage * damageScale);
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
              soundSystem.playMusic(nextIdx);
              setMusicPlaying(true);
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
    let bgMap: { sx: number; sy: number; sw: number; sh: number; iw: number; ih: number } | null = null;
    const bg = bgImageRef.current;
    if (bg && bg.complete && bg.naturalWidth > 0) {
      const iw = bg.naturalWidth;
      const ih = bg.naturalHeight;
      // Update parallax offset based on ship velocity (20% of star parallax)
      if (gameState.gameRunning) {
        const shipVelocity = gameState.player.velocity;
        const moving = Math.hypot(shipVelocity.x, shipVelocity.y) > 0.01;
        const parallaxFactor = (moving ? 2.0 : 1.0) * 0.02; // 20% of stars' 0.1 factor
        const wantX = bgOffsetRef.current.x - shipVelocity.x * parallaxFactor;
        const wantY = bgOffsetRef.current.y - shipVelocity.y * parallaxFactor;
        bgOffsetRef.current.x = wantX;
        bgOffsetRef.current.y = wantY;
      }

      // If we're fading out to black for level end, also zoom the background towards us
      let pOutEarly = 0;
      if (gameState.levelComplete && levelEndStartRef.current > 0) {
        const nowTsEarly = performance.now();
        pOutEarly = Math.max(0, Math.min(1, (nowTsEarly - levelEndStartRef.current) / DUCK_HOLD_MS));
      }
      // Accelerate zoom-in (ease-in) and increase intensity to ~+240%
      const zoomEase = pOutEarly * pOutEarly; // accelerate
      // Intro zoom: start at +20% and ease back to 0 over 2s
      const tIntro = Math.max(0, Math.min(1, (performance.now() - introZoomStartRef.current) / INTRO_ZOOM_DUR_MS));
      const introExtra = START_ZOOM_EXTRA * (1 - tIntro);
      const baseZoom = (1.2 + bgZoomExtraRef.current) * (1 + introExtra) * (1 + zoomEase * 2.4);
      const sw = Math.max(10, iw / baseZoom);
      const sh = Math.max(10, ih / baseZoom);
      // Map offset as pixels in source space
      let sx = iw * 0.5 - sw * 0.5 + bgOffsetRef.current.x;
      let sy = ih * 0.5 - sh * 0.5 + bgOffsetRef.current.y;

      // Clamp to image bounds; if clamped, accumulate extra zoom slightly to simulate motion
      let clamped = false;
      if (sx < 0) { sx = 0; clamped = true; }
      if (sy < 0) { sy = 0; clamped = true; }
      if (sx + sw > iw) { sx = iw - sw; clamped = true; }
      if (sy + sh > ih) { sy = ih - sh; clamped = true; }
      if (clamped) {
        bgZoomExtraRef.current = Math.min(bgZoomExtraRef.current + 0.005, 0.12); // up to +12% more
      } else {
        bgZoomExtraRef.current = Math.max(0, bgZoomExtraRef.current - 0.008); // decay back
      }

      // Derive performance-active flag: user perfMode OR UFO present OR recent missile event
      const ufoPresent = (gameState.alienShips?.length || 0) > 0;
      const nowPerf = performance.now();
      const perfActive = (perfModeRef.current || ufoPresent || (nowPerf - lastMissileEventRef.current) < 1500);

      // Motion Trails: gently fade prior frame, but suspend during missile effects and fade back in
      if (trailsEnabledRef.current) {
        const nowFade = performance.now();
        let trailsAlpha = 1;
        if (nowFade < trailsSuspendUntilRef.current || perfActive) {
          trailsAlpha = 0; // fully suspended
        } else if (trailsFadeInStartRef.current > 0 || trailsSuspendUntilRef.current > 0) {
          if (trailsFadeInStartRef.current === 0) trailsFadeInStartRef.current = nowFade;
          const t = Math.max(0, Math.min(1, (nowFade - trailsFadeInStartRef.current) / 600));
          trailsAlpha = t;
        }
        if (trailsAlpha > 0) {
          ctx.save();
          const cap = perfActive ? 0.18 : 0.25;
          const base = Math.max(0.08, Math.min(cap, trailsStrengthRef.current));
          const fade = base * trailsAlpha;
          ctx.globalAlpha = fade;
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          ctx.restore();
        }
      }

      // Draw with current opacity/filters, factoring crossfade states
      const nowTs = performance.now();
      const oBase = Math.max(0, Math.min(1, bgOpacityRef.current));
      const c = Math.max(0.0, bgContrastRef.current);
      const b = Math.max(0.0, bgBrightnessRef.current);

      const effBg = effectsApplyRef.current;
      const useFxBg = effBg.background;
      // Suppress background filters during heavy scenes
      const suppressBgFilter = perfActive;
      if (fadeInActiveRef.current) {
        // Fade in new backdrop from black
        const pIn = Math.max(0, Math.min(1, (nowTs - fadeInStartRef.current) / 2000));
        // Clear to black
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        // Draw bg increasing alpha
        ctx.save();
        ctx.globalAlpha = (useFxBg ? oBase : 1) * pIn;
        ctx.filter = (useFxBg && !suppressBgFilter) ? `contrast(${c * 100}%) brightness(${b * 100}%)` : 'none';
        ctx.drawImage(bg, sx, sy, sw, sh, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.restore();
        // Capture background and apply distortion pulses BEFORE drawing gameplay sprites
        if (distortionRef.current) {
          try {
            const bgBuf = distortionRef.current.captureBackground(ctx);
            const nowTs = performance.now();
            const coarse = !!perfModeRef.current; // coarser grid when perf mode is active
            distortionRef.current.renderSimple(ctx, bgBuf, nowTs, { debugRing: false, perfCoarse: coarse });
          } catch {}
        }
        if (pIn >= 1) {
          fadeInActiveRef.current = false;
        }
      } else {
        // Normal draw
        ctx.save();
        // When trails are disabled and drawing with partial opacity, clear the canvas first to avoid residual trails
        if (!trailsEnabledRef.current && useFxBg && oBase < 1) {
          ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        }
        ctx.globalAlpha = useFxBg ? oBase : 1;
        ctx.filter = useFxBg ? `contrast(${c * 100}%) brightness(${b * 100}%)` : 'none';
        ctx.drawImage(bg, sx, sy, sw, sh, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.restore();
        // Capture background and apply distortion pulses in normal draw branch as well
        if (distortionRef.current) {
          try {
            const bgBuf = distortionRef.current.captureBackground(ctx);
            const nowTs = performance.now();
            const coarse = !!perfModeRef.current; // coarser grid when perf mode is active
            distortionRef.current.renderSimple(ctx, bgBuf, nowTs, { debugRing: true, perfCoarse: coarse });
          } catch {}
        }
        // If level is ending, fade to black over the duck hold duration
        if (gameState.levelComplete && levelEndStartRef.current > 0) {
          const pOut = Math.max(0, Math.min(1, (nowTs - levelEndStartRef.current) / DUCK_HOLD_MS));
          if (pOut > 0) {
            ctx.save();
            ctx.globalAlpha = pOut;
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            ctx.restore();
          }
        }
      }

      // Cache mapping values for star masking
      bgMap = { sx, sy, sw, sh, iw, ih };
    } else {
      // With true page wallpaper, keep canvas transparent; only fill if no backdrop is available at all
      if (!backdrops || backdrops.length === 0) {
        ctx.fillStyle = '#000011';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      } else {
        // Transparent background lets body wallpaper show through
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      }
    }
    // Reset any filter/alpha side-effects before drawing stars/objects
    ctx.globalAlpha = 1;
    ctx.filter = 'none';

    // Update dynamic stars with parallax and twinkling
    if (gameState.gameRunning) {
      const shipVelocity = gameState.player.velocity;
      const moving = Math.hypot(shipVelocity.x, shipVelocity.y) > 0.01;
      const speedFactor = moving ? 2.0 : 1.0; // 2x when flying
      starsRef.current.forEach(star => {
        const moveFactorX = 0.1 * speedFactor;
        const moveFactorY = 0.1 * speedFactor;
        star.x -= shipVelocity.x * moveFactorX;
        star.y -= shipVelocity.y * moveFactorY;
        // Wrap
        if (star.x < 0) star.x += CANVAS_WIDTH;
        if (star.x > CANVAS_WIDTH) star.x -= CANVAS_WIDTH;
        if (star.y < 0) star.y += CANVAS_HEIGHT;
        if (star.y > CANVAS_HEIGHT) star.y -= CANVAS_HEIGHT;
      });
    }

    // Draw stars with twinkling; during warp draw as dim points (streaks handled by warp particles)
    const bgData = bgImageDataRef.current;
    const map = bgMap;
    const centerX = CANVAS_WIDTH / 2;
    const centerY = CANVAS_HEIGHT / 2;
    starsRef.current.forEach(star => {
      // Mask: only draw if underlying bg pixel is dark
      let draw = true;
      if (bgData && map) {
        const u = map.sx + (star.x / CANVAS_WIDTH) * map.sw;
        const v = map.sy + (star.y / CANVAS_HEIGHT) * map.sh;
        const ix = Math.max(0, Math.min(map.iw - 1, Math.floor(u)));
        const iy = Math.max(0, Math.min(map.ih - 1, Math.floor(v)));
        const idx = (iy * map.iw + ix) * 4;
        const r = bgData.data[idx];
        const g = bgData.data[idx + 1];
        const b = bgData.data[idx + 2];
        const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        draw = luma < 0.20; // only in dark zones
      }
      if (!draw) return;

      const warp = gameState.warpEffect;
      if (warp > 0) {
        // During warp, draw small dim points; main motion comes from warp particles below
        const alpha = Math.min(0.6, star.brightness * 0.4);
        const size = 1;
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fillRect(star.x, star.y, size, size);
      } else {
        const alpha = star.brightness;
        const size = star.brightness > 0.8 ? 2 : 1;
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fillRect(star.x, star.y, size, size);
      }
    });

    // Warp particles: spawn from center and fly outward to simulate passing stars
    if (gameState.warpEffect > 0) {
      // Limit warp particle effect to 2 seconds from level end start
      const sinceLevelEnd = levelEndStartRef.current > 0 ? (performance.now() - levelEndStartRef.current) : 0;
      if (sinceLevelEnd > 2000) {
        // Past 2 seconds: stop spawning/drawing particles
        if (warpParticlesRef.current.length) warpParticlesRef.current.length = 0;
      } else {
      // Easing for spawn and speed so it starts slow and accelerates
      const t = Math.max(0, Math.min(1, gameState.warpEffect));
      const easeIn = (x: number) => x * x;
      const eased = easeIn(t);
      // Reduce further: about 35% of previous, scaled by easing
      const spawnCount = Math.floor((30 + t * 90) * 0.35 * Math.max(0.4, eased));
      for (let i = 0; i < spawnCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        // Start slow, accelerate with eased t
        const speed = 4 + eased * 26 + Math.random() * 5;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        // Spawn with a hole in the middle (ring start radius)
        const holeR = 50; // radius of central hole
        const r = holeR + Math.random() * 20; // start outside the hole with small jitter band
        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;
        // Slightly shorter lifetimes so they fade sooner in the distance
        warpParticlesRef.current.push({ x, y, vx, vy, life: 0, maxLife: 12 + Math.floor(Math.random() * 6), prevX: x, prevY: y });
      }
      // Update and draw
      ctx.strokeStyle = '#ffffff';
      // Local effect params
      const effWarp = effectsApplyRef.current;
      const fxAlpha = Math.max(0, Math.min(1, bgOpacityRef.current));
      const fxC = Math.max(0.0, bgContrastRef.current);
      const fxB = Math.max(0.0, bgBrightnessRef.current);
      // Apply effects to warp trails if enabled
      const baseWarpAlpha = effWarp.warpTrails ? fxAlpha : 1;
      if (effWarp.warpTrails) {
        ctx.save();
        ctx.filter = `contrast(${fxC * 100}%) brightness(${fxB * 100}%)`;
      }
      for (let i = warpParticlesRef.current.length - 1; i >= 0; i--) {
        const p = warpParticlesRef.current[i];
        p.prevX = p.x; p.prevY = p.y;
        p.x += p.vx; p.y += p.vy;
        p.life++;
        // Remove if off-screen or life exceeded
        const off = p.x < -20 || p.x > CANVAS_WIDTH + 20 || p.y < -20 || p.y > CANVAS_HEIGHT + 20;
        if (p.life > p.maxLife || off) {
          warpParticlesRef.current.splice(i, 1);
          continue;
        }
        // Alpha tapers with life; small streak from previous to current
        const t = p.life / p.maxLife;
        let alpha = Math.max(0, 1 - t) * Math.min(1, 0.4 + eased * 0.6);
        // Fade at edges of screen
        const edgeFade = 80; // px fade width at edges
        const dxEdge = Math.min(p.x, CANVAS_WIDTH - p.x);
        const dyEdge = Math.min(p.y, CANVAS_HEIGHT - p.y);
        const edgeFactor = Math.max(0, Math.min(1, Math.min(dxEdge, dyEdge) / edgeFade));
        alpha *= edgeFactor;
        ctx.globalAlpha = alpha * baseWarpAlpha;
        ctx.lineWidth = 1 + Math.min(2, eased * 1.2);
        // Shorter streak: draw only a fraction behind current position to avoid long smears
        const sx = p.x - p.vx * 0.4;
        const sy = p.y - p.vy * 0.4;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      }
    } else if (warpParticlesRef.current.length) {
      // Clear any leftovers when not in warp
      warpParticlesRef.current.length = 0;
    }
    
    // Twinkling stars (background layer)
    {
      const stars = starsRef.current;
      if (stars && stars.length) {
        const now = performance.now();
        ctx.save();
        ctx.fillStyle = '#ffffff';
        // Scale star size slightly with area ratio so stars appear a bit larger when the playable area grows
        const areaRatio = Math.max(1, (CANVAS_WIDTH * CANVAS_HEIGHT) / Math.max(1, initialAreaRef.current));
        const starSize = Math.min(2, 1 + 0.35 * Math.sqrt(areaRatio));
        // Local effect params
        const effStars = effectsApplyRef.current;
        const fxAlphaS = Math.max(0, Math.min(1, bgOpacityRef.current));
        const fxCS = Math.max(0.0, bgContrastRef.current);
        const fxBS = Math.max(0.0, bgBrightnessRef.current);
        // Apply effects to stars if enabled
        const baseStarAlpha = effStars.stars ? fxAlphaS : 1;
        if (effStars.stars) {
          ctx.filter = `contrast(${fxCS * 100}%) brightness(${fxBS * 100}%)`;
        }
        for (let i = 0; i < stars.length; i++) {
          const s = stars[i];
          // Subtle parallax relative to player
          const x = ((s.x - gameState.player.position.x * 0.01) % CANVAS_WIDTH + CANVAS_WIDTH) % CANVAS_WIDTH;
          const y = ((s.y - gameState.player.position.y * 0.01) % CANVAS_HEIGHT + CANVAS_HEIGHT) % CANVAS_HEIGHT;
          // Twinkle between 0.2..1.0 based on speed and per-star phase via index
          const phase = i * 1.7; // deterministic per-star offset
          const tw = 0.2 + 0.8 * (0.5 + 0.5 * Math.sin(now * s.twinkleSpeed * 0.006 + phase));
          ctx.globalAlpha = (tw * s.brightness) * baseStarAlpha;
          ctx.fillRect(x, y, starSize, starSize);
        }
        ctx.restore();
      }
    }

    // Add some larger, more distant stars that move slower
    if (gameState.gameRunning && !isPausedRef.current) {
      const effDist = effectsApplyRef.current;
      // Local effect params
      const fxAlphaD = Math.max(0, Math.min(1, bgOpacityRef.current));
      const fxCD = Math.max(0.0, bgContrastRef.current);
      const fxBD = Math.max(0.0, bgBrightnessRef.current);
      // Apply effects to distant stars if enabled
      const baseDistAlpha = effDist.distantStars ? fxAlphaD : 1;
      ctx.save();
      if (effDist.distantStars) {
        ctx.filter = `contrast(${fxCD * 100}%) brightness(${fxBD * 100}%)`;
      }
      ctx.fillStyle = `rgba(200, 200, 255, ${0.3 * baseDistAlpha})`;
      for (let i = 0; i < 20; i++) {
        const x = ((i * 127 - gameState.player.position.x * 0.02) % CANVAS_WIDTH + CANVAS_WIDTH) % CANVAS_WIDTH;
        const y = ((i * 83 - gameState.player.position.y * 0.02) % CANVAS_HEIGHT + CANVAS_HEIGHT) % CANVAS_HEIGHT;
        ctx.fillRect(x, y, 1, 1);
      }
      ctx.restore();
    }

    if (gameState.gameRunning && !isPausedRef.current) {
      drawPlayer(ctx, gameState);
      // Draw asteroids before bullets/ships so impacts overlay naturally
      drawAsteroids(ctx, gameState);
      drawBullets(ctx, gameState.bullets);
      drawAlienShips(ctx, gameState.alienShips);
      drawBonuses(ctx, gameState.bonuses);
    }
    drawAlienBullets(ctx, gameState.alienBullets);
    if (gameState.playerMissiles && gameState.playerMissiles.length > 0) {
      drawAlienBullets(ctx, gameState.playerMissiles);
    }
    drawExplosions(ctx, gameState.explosions);
    // Visual-only debris
    updateVisualDebris();
    drawVisualDebris(ctx);
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

        // Draw "Now Playing" above, with a faster fade so it disappears sooner
        const nowLabelAlpha = Math.max(0, Math.min(1, scale * fadeIn * Math.pow(fadeOut, 3))) * 0.9;
        if (nowLabelAlpha > 0.01) {
          ctx.save();
          ctx.globalAlpha = nowLabelAlpha;
          // Slightly smaller and above the title
          ctx.translate(0, -26);
          // Increase subtitle size to match larger title
          ctx.font = '28px Arial';
          ctx.lineWidth = 2 * (1 - 0.5 * travel);
          ctx.strokeText('Now Playing', 0, 0);
          ctx.fillText('Now Playing', 0, 0);
          ctx.restore();
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
    soundSystem.playMusic();
    setMusicPlaying(true);
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

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 relative">
      {/* Left sidebar: Action Notes and Controls */}
      <div className="fixed left-4 top-4 bg-gray-900/95 backdrop-blur-sm text-white p-4 rounded-lg border border-gray-700 shadow-lg z-10 w-80">
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

        {/* Explosion Distortion Controls */}
        <div>
          <h3 className="text-sm font-semibold text-cyan-400 mb-2">Explosion Distortion</h3>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={distortionEnabled}
                onChange={(e) => setDistortionEnabled(e.target.checked)}
                className="w-3 h-3"
              />
              Enabled
            </label>
            <div className="space-y-1">
              <label className="block text-xs text-gray-300">Size: {distortionSize}%</label>
              <input
                type="range"
                min="0"
                max="100"
                value={distortionSize}
                onChange={(e) => setDistortionSize(parseInt(e.target.value))}
                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-gray-300">Depth: {distortionDepth}%</label>
              <input
                type="range"
                min="0"
                max="100"
                value={distortionDepth}
                onChange={(e) => setDistortionDepth(parseInt(e.target.value))}
                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

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
        href="https://secret.madewithchat.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 opacity-80 hover:opacity-100 transition-opacity"
        aria-label="MadeWithChat"
      >
        <img src={mwcLogo} alt="MadeWithChat Logo" className="h-10 w-auto select-none" draggable={false} />
        <span className="text-white/90 text-base font-semibold">MadeWithChat</span>
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
        <div className="text-center mb-4">
          <h1 className="text-4xl font-bold mb-1 bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 bg-clip-text text-transparent">
            Play to Win Flipit Rewards
          </h1>
          <p className="text-sm text-gray-300">You could win up to $10,000 worth of tokens or nodes</p>
        </div>
        
        {/* Row 1: Gameplay controls */}
        <div className="flex gap-2 items-center flex-wrap justify-center w-full">
          <div className="flex items-center gap-2 bg-gray-800 px-3 py-2 rounded border border-gray-700">
            <label htmlFor="difficulty" className="text-sm text-gray-300">Difficulty:</label>
            <select
              id="difficulty"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
              className="bg-gray-900 text-white text-sm px-2 py-1 rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>

          <button
            onClick={() => setShowInstructions(true)}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors"
          >
            Instructions
          </button>
          
          <button
            onClick={() => setIsPaused(p => !p)}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold transition-colors"
          >
            {isPaused ? 'Resume Game' : 'Pause Game'}
          </button>

          <button
            onClick={toggleFitToWindow}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
          >
            {isFitted ? 'Original Size' : 'Fit to Window'}
          </button>
        </div>

        {/* Row 2: Audio controls (Mute + Music controls) */}
        <div className="flex gap-2 items-center flex-wrap justify-center w-full">
          <button
            onClick={toggleMute}
            className={`px-4 py-2 text-white rounded-lg transition-colors ${
              isMuted 
                ? 'bg-red-600 hover:bg-red-700' 
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {isMuted ? 'Unmute' : 'Mute'}
          </button>

          <div className="flex items-center gap-2 bg-gray-800 px-3 py-2 rounded border border-gray-700">
            <button
              onClick={handlePlayPauseMusic}
              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 rounded text-sm"
            >{musicPlaying ? 'Pause Music' : 'Play Music'}</button>
            <label htmlFor="track" className="text-sm text-gray-300">Track:</label>
            <select
              id="track"
              value={musicIndex}
              onChange={(e) => handleChangeTrack(parseInt(e.target.value, 10))}
              className="bg-gray-900 text-white text-sm px-2 py-1 rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              {musicTracks.length === 0 ? (
                <option value={0}>No tracks found</option>
              ) : (
                musicTracks.map((t, i) => {
                  const isRisque = /^s\d+/i.test(t.name);
                  return (
                    <option
                      key={t.url}
                      value={i}
                      style={{ color: isRisque ? '#ef4444' : undefined }}
                    >
                      {formatTrackName(t.name)}
                    </option>
                  );
                })
              )}
            </select>
          </div>
          {/* 19+ risqué opt-in button */}
          <button
            onClick={() => { setShowRisqueModal(true); setRisqueAgreeChecked(false); setRisqueAnswer(''); }}
            className="px-3 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg text-sm font-semibold"
          >
            I am 19+
          </button>
        </div>

        {/* Row 3: Volume sliders (Music + SFX) */}
        <div className="flex items-center gap-3 bg-gray-800 px-3 py-2 rounded border border-gray-700 w-full justify-center flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-300">Music</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={musicVol}
              onChange={(e) => handleMusicVolume(parseFloat(e.target.value))}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-300">SFX</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={sfxVol}
              onChange={(e) => handleSfxVolume(parseFloat(e.target.value))}
            />
          </div>
        </div>
        
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
                    soundSystem.playMusic(idx);
                    setMusicPlaying(true);
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
      
      {/* Track list with subtle red glow */}
      {musicTracks.length > 0 && (
        <div className="mt-3 w-full max-w-4xl flex flex-wrap justify-center gap-2">
          {musicTracks.map((t, i) => (
            <button
              key={t.url}
              onClick={() => {
                setMusicIndex(i);
                soundSystem.selectMusicTrack(i);
                if (!isMuted) {
                  soundSystem.playMusic(i);
                  setMusicPlaying(true);
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