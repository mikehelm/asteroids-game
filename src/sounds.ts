// Sound effect system using Web Audio API
import type { TrackInfo } from './types';

// Internal and public audio types
interface TrackMeta { key: string; url: string; name: string; ext: string }
export interface MusicState { isPlaying: boolean; index: number; offset: number; trackCount: number }
class SoundSystemImpl {
  private audioContext: AudioContext | null = null;
  private masterVolume = 0.3; // legacy for SFX; will map to sfxVolume
  private bufferCache: Map<string, AudioBuffer> = new Map();
  private muted = false;
  // Persistent nodes for continuous thrust (noise + bandpass + gentle low saw)
  private thrustGain: GainNode | null = null;
  private thrustNoiseSrc: AudioBufferSourceNode | null = null; // repurposed to hold the sample source
  private thrustFilter: BiquadFilterNode | null = null;
  private thrustLoading = false;

  // Master routing
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxVolume = 0.3;   // default SFX vol
  private musicVolume = 0.25; // default music vol

  // Music player state
  private musicAssetUrls: Record<string, string> = import.meta.glob<string>('../sounds/music/*', { eager: true, as: 'url' });
  private musicTracks: Array<{ key: string; url: string; name: string; ext: string }>|null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  // We index into a filtered "view" (safe-only by default). This is the index visible to the UI.
  private musicCurrentViewIndex: number = 0;
  private musicOffsetSec: number = 0; // resume offset
  private musicStartCtxTime: number = 0; // when current started
  private musicStopping: boolean = false; // guard to detect manual stop/pause
  private musicTrackChangeListener: ((index: number) => void) | null = null;
  private musicAdvanceTimer: number | null = null; // fallback advance timer
  private musicGapMs: number = 4000; // 4-second gap between songs
  private sfxUserSet: boolean = false; // true when user changed SFX volume via UI
  private sfxPrevForGap: number | null = null;
  // Bad UFO loop node
  private badUfoLoopSrc: AudioBufferSourceNode | null = null;
  private badUfoLoopGain: GainNode | null = null;
  // Guard against duplicated timers/races
  private musicSessionId: number = 0; // increments on each playMusic() start
  // Risqué toggle (false by default means only numbered tracks are listed/used)
  private risqueEnabled: boolean = false;
  // Explicit pause flag to block any auto-advance or scheduled resumes
  private musicPaused: boolean = false;

  constructor() {
    // Initialize audio context on first user interaction
    this.initAudioContext();
  }

  // Player missile acceleration cue (transition into homing)
  playMissileStage2(): void {
    if (!this.isAudioAllowed()) return;
    if (!this.audioContext) return;
    this.loadBuffer('missile_stage2.wav').then(buf => {
      if (!buf) return;
      // Slightly punchy but under the explosion volume
      this.playBuffer(buf, { volume: 0.75 });
    });
  }

  // --- Scan grid cues (optional) ---
  // Quiet tick used during scan fill; very short blip to avoid annoyance
  playScanTick?(): void {
    if (!this.isAudioAllowed() || !this.audioContext) return;
    const ac = this.audioContext;
    const osc = this.createOscillator(1400, 'square');
    const gain = this.createGainNode(0.0001);
    if (!osc || !gain) return;
    osc.connect(gain);
    gain.connect(this.sfxGain ?? ac.destination);
    const t0 = ac.currentTime;
    // Subtle 30ms blip
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.02 * this.masterVolume, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.03);
    osc.start();
    osc.stop(t0 + 0.035);
  }

  // Short soft 'complete' whoomp when scan completes and retract starts
  playScanComplete?(): void {
    if (!this.isAudioAllowed() || !this.audioContext) return;
    const ac = this.audioContext;
    // Low sine drop + quick noise burst layered very quietly
    const tone = this.createOscillator(220, 'sine');
    const tgain = this.createGainNode(0.0001);
    if (!tone || !tgain) return;
    tone.connect(tgain);
    tgain.connect(this.sfxGain ?? ac.destination);
    const t0 = ac.currentTime;
    tgain.gain.setValueAtTime(0.0001, t0);
    tgain.gain.exponentialRampToValueAtTime(0.06 * this.masterVolume, t0 + 0.04);
    tgain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24);
    tone.frequency.setValueAtTime(280, t0);
    tone.frequency.exponentialRampToValueAtTime(140, t0 + 0.22);
    tone.start();
    tone.stop(t0 + 0.26);
  }

  // --- Generic helper for panned one-shots by asset name ---
  private playOneShotPanned(
    fileName: string,
    opts: { volume: number; playbackRate?: number; durationMs?: number },
    panProvider: () => number
  ) {
    if (!this.isAudioAllowed()) return;
    this.ensureAudioContext();
    if (!this.audioContext) return;
    const ac = this.audioContext;
    this.loadBuffer(fileName).then(buf => {
      if (!buf || !this.audioContext) return;
      const src = ac.createBufferSource();
      src.buffer = buf;
      if (opts.playbackRate) src.playbackRate.value = opts.playbackRate;

      const gain = ac.createGain();
      gain.gain.value = opts.volume * this.masterVolume;

      let panner: StereoPannerNode | null = null;
      if ('createStereoPanner' in ac) {
        try { panner = ac.createStereoPanner(); } catch { panner = null; }
      }
      if (panner) { src.connect(panner); panner.connect(gain); } else { src.connect(gain); }
      gain.connect(this.sfxGain ?? ac.destination);

      const dur = opts.durationMs ? Math.min(opts.durationMs / 1000, Math.max(0.15, buf.duration / (opts.playbackRate || 1))) : Math.max(0.15, buf.duration / (opts.playbackRate || 1));
      const endAt = ac.currentTime + dur;
      src.start();

      let stopUpdates = false;
      const updatePan = () => {
        if (stopUpdates) return;
        if (panner) {
          const pan = Math.max(-1, Math.min(1, panProvider()));
          try { panner.pan.value = pan; } catch { /* ignore */ }
        }
        if (ac.currentTime < endAt) requestAnimationFrame(updatePan);
      };
      updatePan();

      const clear = () => {
        stopUpdates = true;
        try { src.disconnect(); } catch { /* no-op */ }
        try { panner?.disconnect(); } catch { /* no-op */ }
        try { gain.disconnect(); } catch { /* no-op */ }
      };
      src.onended = clear;
      window.setTimeout(clear, Math.ceil((endAt - ac.currentTime) * 1000) + 80);
    });
  }

  // --- Panned wrappers ---
  playBonusCollectedPanned(panProvider: () => number) {
    this.playOneShotPanned('pickedupaward.mp3', { volume: 0.6 }, panProvider);
  }

  playAlienShootPanned(panProvider: () => number) {
    const rate = 0.95 + Math.random() * 0.1;
    this.playOneShotPanned('enemy lazer.wav', { volume: 0.6, playbackRate: rate }, panProvider);
  }

  playAlienDestroyPanned(panProvider: () => number) {
    this.playOneShotPanned('killedalien.mp3', { volume: 0.91 }, panProvider);
  }

  playLargeAsteroidDestroyPanned(panProvider: () => number) {
    this.playOneShotPanned('asteroid_explosion-3.wav', { volume: 0.8 }, panProvider);
  }

  playMediumAsteroidDestroyPanned(panProvider: () => number) {
    this.playOneShotPanned('asteroid_explosion-2.wav', { volume: 0.7 }, panProvider);
  }

  playSmallAsteroidDestroyPanned(panProvider: () => number) {
    this.playOneShotPanned('asteroid_explosion-1.wav', { volume: 0.6 }, panProvider);
  }

  // Follow-panned asteroid collision one-shot. Pan updates while the sample plays.
  // size: 'large' | 'medium' to choose loudness/playback rate flavor
  playAsteroidCollisionPanned(size: 'large' | 'medium', panProvider: () => number, durationMs: number = 450) {
    if (!this.isAudioAllowed()) return;
    this.ensureAudioContext();
    if (!this.audioContext) return;
    const ac = this.audioContext;
    this.loadBuffer('asteroid bump.wav').then(buf => {
      if (!buf || !this.audioContext) return;
      const src = ac.createBufferSource();
      src.buffer = buf;
      const rate = (size === 'large' ? (0.95 + Math.random() * 0.1) : (1.0 + Math.random() * 0.1));
      src.playbackRate.value = rate;

      const gain = ac.createGain();
      gain.gain.value = (size === 'large' ? 0.5 : 0.45) * this.masterVolume;

      // Optional stereo panner that we can update over time
      let panner: StereoPannerNode | null = null;
      if ('createStereoPanner' in ac) {
        try { panner = ac.createStereoPanner(); } catch { panner = null; }
      }

      if (panner) {
        src.connect(panner);
        panner.connect(gain);
      } else {
        src.connect(gain);
      }
      gain.connect(this.sfxGain ?? ac.destination);

      // Start source and update pan for a short period while it plays
      const endAt = ac.currentTime + Math.min(durationMs / 1000, Math.max(0.15, buf.duration / rate));
      src.start();

      // Drive pan updates using rAF for smoothness; fallback to setInterval
      let stopUpdates = false;
      const updatePan = () => {
        if (stopUpdates) return;
        if (panner) {
          const pan = Math.max(-1, Math.min(1, panProvider()));
          try { panner.pan.value = pan; } catch { /* ignore */ }
        }
        if (ac.currentTime < endAt) {
          requestAnimationFrame(updatePan);
        }
      };
      updatePan();

      // Ensure cleanup after sound ends
      const clear = () => {
        stopUpdates = true;
        try { src.disconnect(); } catch { /* no-op */ }
        try { panner?.disconnect(); } catch { /* no-op */ }
        try { gain.disconnect(); } catch { /* no-op */ }
      };
      src.onended = clear;
      // Safety timeout in case onended doesn't fire
      window.setTimeout(clear, Math.ceil((endAt - ac.currentTime) * 1000) + 80);
    });
  }

  // Refuel energy cue (one-shot)
  playRefuelEnergy() {
    if (!this.isAudioAllowed()) return;
    this.loadBuffer('energy.wav').then(buf => {
      if (buf) this.playBuffer(buf, { volume: 0.4 });
    });
  }

  // Alien incoming cue (one-shot)
  playAlienIncomingDirectional(initialPan: number = 0): { setPan: (p: number) => void; stop: () => void } | null {
    if (!this.isAudioAllowed()) return null;
    if (!this.audioContext) return null;
    const ac = this.audioContext;
    const panner = (ac.createStereoPanner ? ac.createStereoPanner() : null) as StereoPannerNode | null;
    const gain = this.createGainNode(0.8); // overall cue gain
    if (!gain) return null;
    if (panner) {
      try { panner.pan.value = Math.max(-1, Math.min(1, initialPan)); } catch { /* no-op */ }
      gain.connect(panner);
      panner.connect(this.sfxGain ?? ac.destination);
    } else {
      gain.connect(this.sfxGain ?? ac.destination);
    }

    let src1: AudioBufferSourceNode | null = null;
    let src2: AudioBufferSourceNode | null = null;
    const stop = () => {
      try { src1?.stop(); } catch { /* no-op */ }
      try { src2?.stop(); } catch { /* no-op */ }
      try { gain.disconnect(); } catch { /* no-op */ }
      try { panner?.disconnect(); } catch { /* no-op */ }
      src1 = null; src2 = null;
    };
    const setPan = (p: number) => {
      if (panner) {
        try { panner.pan.value = Math.max(-1, Math.min(1, p)); } catch { /* no-op */ }
      }
    };

    this.loadBuffer('start.wav').then(buf => {
      if (!buf || !this.audioContext) return;
      src1 = ac.createBufferSource(); src1.buffer = buf;
      src1.connect(gain);
      src1.start();
      // Second hit shortly after for emphasis
      src2 = ac.createBufferSource(); src2.buffer = buf;
      src2.connect(gain);
      src2.start(ac.currentTime + 0.25);
      // Auto stop after ~1s
      const total = 1.2;
      src1.stop(ac.currentTime + total);
      src2.stop(ac.currentTime + total);
      window.setTimeout(stop, Math.ceil(total * 1000) + 100);
    });
    return { setPan, stop };
  }

  // Gentle docking confirmation ping
  playDockPing() {
    if (!this.isAudioAllowed()) return;
    if (!this.audioContext) return;
    const ac = this.audioContext;
    const osc = this.createOscillator(1100, 'triangle');
    const gain = this.createGainNode(0.0001);
    if (!osc || !gain) return;
    osc.connect(gain);
    gain.connect(this.sfxGain ?? ac.destination);
    const t0 = ac.currentTime;
    // quick soft ping with slight pitch down
    osc.frequency.setValueAtTime(1200, t0);
    osc.frequency.exponentialRampToValueAtTime(800, t0 + 0.18);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.06 * this.masterVolume, t0 + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
    osc.start();
    osc.stop(t0 + 0.22);
  }

  // Soft whoosh for tractor beam engage
  playTractorWhoosh() {
    if (!this.isAudioAllowed()) return;
    if (!this.audioContext) return;
    const ac = this.audioContext;
    const file = this.assetExists('whoosh.wav') ? 'whoosh.wav' : (this.assetExists('woosh.wav') ? 'woosh.wav' : null);
    if (file) {
      this.loadBuffer(file).then(buf => {
        if (buf) {
          // Louder whoosh for tractor-beam scene
          this.playBuffer(buf, { volume: 0.6 });
        } else {
          // Fallback synthesized short whoosh
          const noise = ac.createBufferSource();
          const buffer = ac.createBuffer(1, ac.sampleRate * 0.18, ac.sampleRate);
          const data = buffer.getChannelData(0);
          for (let i = 0; i < data.length; i++) {
            const t = i / data.length;
            data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 10);
          }
          noise.buffer = buffer;
          const hp = ac.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.value = 700;
          const gain = ac.createGain();
          // Louder fallback gain
          gain.gain.value = 0.3 * this.masterVolume;
          noise.connect(hp); hp.connect(gain); gain.connect(this.sfxGain ?? ac.destination);
          noise.start();
        }
      });
    } else {
      // Synth fallback without touching asset loader
      const noise = ac.createBufferSource();
      const buffer = ac.createBuffer(1, ac.sampleRate * 0.18, ac.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / data.length;
        data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 10);
      }
      noise.buffer = buffer;
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 700;
      const gain = ac.createGain();
      gain.gain.value = 0.3 * this.masterVolume;
      noise.connect(hp); hp.connect(gain); gain.connect(this.sfxGain ?? ac.destination);
      noise.start();
    }
  }

  // Bounce/thump used when tractor-beam ejects the player away
  playBounce() {
    if (!this.isAudioAllowed()) return;
    if (!this.audioContext) return;
    const ac = this.audioContext;
    const file = this.assetExists('bounce.wav') ? 'bounce.wav' : (this.assetExists('asteroid bump.wav') ? 'asteroid bump.wav' : null);
    if (file) {
      this.loadBuffer(file).then(buf => { if (buf) this.playBuffer(buf, { volume: file === 'bounce.wav' ? 0.8 : 0.7 }); });
    } else {
      // Synthesized low thump
      const osc = this.createOscillator(90, 'sine');
      const gain = this.createGainNode(0.0001);
      if (!osc || !gain) return;
      osc.connect(gain);
      gain.connect(this.sfxGain ?? ac.destination);
      const t0 = ac.currentTime;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.12 * this.masterVolume, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      osc.start();
      osc.stop(t0 + 0.24);
    }
  }

  // Start a looping bed for the bad UFO until stopped
  startBadUfoLoop(volume: number = 1.0): { stop: () => void } | null {
    this.ensureAudioContext();
    if (!this.isAudioAllowed() || !this.audioContext) return null;
    if (this.badUfoLoopSrc) {
      // already running
      return { stop: () => this.stopBadUfoLoop() };
    }
    // Load epic_ufo.wav and loop it
    const start = async () => {
      const buf = await this.loadBuffer('epic_ufo.wav');
      if (!buf || !this.audioContext) return;
      const src = this.audioContext.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const gain = this.audioContext.createGain();
      gain.gain.value = Math.max(0, Math.min(1, volume)) * this.masterVolume;
      src.connect(gain);
      gain.connect(this.sfxGain ?? this.audioContext.destination);
      src.start();
      this.badUfoLoopSrc = src;
      this.badUfoLoopGain = gain;
    };
    start();
    return { stop: () => this.stopBadUfoLoop() };
  }

  stopBadUfoLoop() {
    if (this.badUfoLoopSrc) {
      try { this.badUfoLoopSrc.stop(); } catch { /* no-op */ }
      try { this.badUfoLoopSrc.disconnect(); } catch { /* no-op */ }
    }
    if (this.badUfoLoopGain) {
      try { this.badUfoLoopGain.disconnect(); } catch { /* no-op */ }
    }
    this.badUfoLoopSrc = null;
    this.badUfoLoopGain = null;
  }

  // Fade out the bad UFO loop over the given duration and then stop it
  fadeOutBadUfoLoop(durationMs: number = 1000) {
    if (!this.audioContext) { this.stopBadUfoLoop(); return; }
    const ac = this.audioContext;
    const gain = this.badUfoLoopGain;
    const src = this.badUfoLoopSrc;
    if (!gain || !src) { this.stopBadUfoLoop(); return; }
    try {
      const now = ac.currentTime;
      // Cancel any scheduled ramps and ramp down to 0
      gain.gain.cancelScheduledValues(now);
      const cur = gain.gain.value;
      gain.gain.setValueAtTime(cur, now);
      gain.gain.linearRampToValueAtTime(0.0001, now + Math.max(0.01, durationMs / 1000));
      // Stop source slightly after fade completes
      src.stop(now + Math.max(0.02, durationMs / 1000 + 0.02));
    } catch {
      // If anything fails, stop immediately
      this.stopBadUfoLoop();
      return;
    }
    // Cleanup nodes after fade completes
    window.setTimeout(() => {
      try { this.badUfoLoopSrc?.disconnect(); } catch { /* no-op */ }
      try { this.badUfoLoopGain?.disconnect(); } catch { /* no-op */ }
      this.badUfoLoopSrc = null;
      this.badUfoLoopGain = null;
    }, Math.max(0, durationMs + 150));
  }

  // Loud missile explosion
  playMissileExplosion() {
    if (!this.isAudioAllowed()) return;
    const p = this.loadBuffer('massive_asteroid_4.wav');
    p.then(buf => {
      if (buf) {
        this.playBuffer(buf, { volume: 1.0 });
      } else if (this.audioContext) {
        // Fallback: layered noise burst
        const ac = this.audioContext;
        const noise = ac.createBufferSource();
        const buffer = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          const t = i / data.length;
          data[i] = (Math.random() * 2 - 1) * (1 - t) * Math.exp(-t * 6);
        }
        noise.buffer = buffer;
        const filter = ac.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 800;
        const gain = ac.createGain(); gain.gain.value = 0.6 * this.masterVolume;
        noise.connect(filter); filter.connect(gain); gain.connect(this.sfxGain ?? ac.destination);
        noise.start();
      }
    });
  }

  // Play explicit missile warning asset if available
  playMissileWarning() {
    if (!this.isAudioAllowed()) return;
    const p = this.loadBuffer('missle_warning.wav');
    p.then(buf => {
      if (buf) {
        this.playBuffer(buf, { volume: 0.3 });
      } else {
        // Fallback beeping pattern
        const ac = this.audioContext!;
        const osc = this.createOscillator(900, 'square');
        const gain = this.createGainNode(0.0001);
        if (!osc || !gain) return;
        osc.connect(gain);
        gain.connect(this.sfxGain ?? ac.destination);
        const t0 = ac.currentTime;
        gain.gain.setValueAtTime(0.0001, t0);
        for (let i = 0; i < 3; i++) {
          const t = t0 + i * 0.1;
          gain.gain.exponentialRampToValueAtTime(0.03 * this.masterVolume, t + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
        }
        osc.start();
        osc.stop(t0 + 0.35);
      }
    });
  }

  // Play epic UFO approach cue for missile-type spawns
  playEpicUfo() {
    if (!this.isAudioAllowed()) return;
    const p = this.loadBuffer('epic_ufo.wav');
    p.then(buf => {
      if (buf) {
        this.playBuffer(buf, { volume: 1.0 });
      } else {
        // Fallback: low whoosh + tone
        const ac = this.audioContext!;
        const tone = this.createOscillator(180, 'sawtooth');
        const gain = this.createGainNode(0.0001);
        if (!tone || !gain) return;
        tone.connect(gain);
        gain.connect(this.sfxGain ?? ac.destination);
        const t0 = ac.currentTime;
        gain.gain.exponentialRampToValueAtTime(0.1 * this.masterVolume, t0 + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.2);
        tone.start();
        tone.stop(t0 + 1.25);
      }
    });
  }

  // Missile lock-on cue (short beeping ramp)
  playMissileLock() {
    if (!this.isAudioAllowed()) return;
    if (!this.audioContext) return;
    const ac = this.audioContext;
    const osc = this.createOscillator(600, 'square');
    const gain = this.createGainNode(0.001);
    if (!osc || !gain) return;
    osc.connect(gain);
    gain.connect(this.sfxGain ?? ac.destination);
    const t0 = ac.currentTime;
    // Pitch ramps up, volume blips
    osc.frequency.setValueAtTime(600, t0);
    osc.frequency.linearRampToValueAtTime(1200, t0 + 0.25);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.08 * this.masterVolume, t0 + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
    osc.start();
    osc.stop(t0 + 0.32);
  }

  // Missile launch whoosh
  playMissileLaunch() {
    if (!this.isAudioAllowed()) return;
    if (!this.audioContext) return;
    const ac = this.audioContext;
    const file = this.assetExists('woosh.wav') ? 'woosh.wav' : (this.assetExists('whoosh.wav') ? 'whoosh.wav' : null);
    if (file) {
      this.loadBuffer(file).then(buf => {
        if (buf) {
          this.playBuffer(buf, { volume: 0.8 });
        } else {
          const noise = ac.createBufferSource();
          const buffer = ac.createBuffer(1, ac.sampleRate * 0.3, ac.sampleRate);
          const data = buffer.getChannelData(0);
          for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.8));
          noise.buffer = buffer;
          const filter = ac.createBiquadFilter();
          filter.type = 'highpass';
          filter.frequency.value = 800;
          const gain = ac.createGain();
          gain.gain.value = 0.25 * this.masterVolume;
          noise.connect(filter);
          filter.connect(gain);
          gain.connect(this.sfxGain ?? ac.destination);
          noise.start();
        }
      });
    } else {
      // Fallback synthesized whoosh using filtered noise
      const noise = ac.createBufferSource();
      const buffer = ac.createBuffer(1, ac.sampleRate * 0.3, ac.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.8));
      noise.buffer = buffer;
      const filter = ac.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 800;
      const gain = ac.createGain();
      gain.gain.value = 0.25 * this.masterVolume;
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain ?? ac.destination);
      noise.start();
    }
  }

  setOnMusicTrackChange(listener: ((index: number) => void) | null) {
    this.musicTrackChangeListener = listener;
  }

  private isAudioAllowed(): boolean {
    return !!this.audioContext && !this.muted;
  }

  // --- Continuous Thrust API ---
  startThrust() {
    this.ensureAudioContext();
    if (!this.isAudioAllowed()) return;
    if (!this.audioContext) return;
    if (this.thrustGain || this.thrustLoading) return; // already running or starting

    const ac = this.audioContext;
    this.thrustLoading = true;
    // Prefer explicit thrust file; fallback to space.wav if not present
    const pickBuffer = async (): Promise<AudioBuffer | null> => {
      const thrustBuf = await this.loadBuffer('thrust.wav');
      if (thrustBuf) return thrustBuf;
      const thrust2 = await this.loadBuffer('thrust2.wav');
      if (thrust2) return thrust2;
      return this.loadBuffer('space.wav');
    };
    pickBuffer().then((buf) => {
      this.thrustLoading = false;
      if (!ac || !buf || this.thrustGain) return;

      const src = ac.createBufferSource();
      src.buffer = buf;
      src.loop = true;

      // Bandpass filter to carve an engine-like band out of the ambient sample
      const band = ac.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.setValueAtTime(500, ac.currentTime);
      band.Q.setValueAtTime(0.8, ac.currentTime);

      // Output gain (we ramp this with setThrustIntensity)
      const gain = ac.createGain();
      gain.gain.setValueAtTime(0.0, ac.currentTime);

      // Mix and route
      src.connect(band);
      band.connect(gain);
      gain.connect(ac.destination);

      // Start 1 second into the sample for a stronger loop segment
      src.start(0, 1.0);

      this.thrustNoiseSrc = src;
      this.thrustFilter = band;
      this.thrustGain = gain;
    });
  }

  setThrustIntensity(level: number) {
    // Level expected in [0,1]
    if (!this.audioContext || !this.thrustGain) return;
    const ac = this.audioContext;
    const clamped = Math.max(0, Math.min(1, level));
    // Make it a bit non-linear for feel
    // Volume: start quiet and increase; significantly louder ceiling for thrust
    const vol = (0.2 + 0.8 * clamped) * 1.0; // max feeds masterVolume for up to full 0.3
    this.thrustGain.gain.cancelScheduledValues(ac.currentTime);
    this.thrustGain.gain.linearRampToValueAtTime(vol * this.masterVolume, ac.currentTime + 0.06);

    // Filter: open up as intensity grows
    if (this.thrustFilter) {
      const baseFreq = 400;
      const freqRange = 1800;
      const qBase = 0.7;
      const qRange = 2.5;
      this.thrustFilter.frequency.linearRampToValueAtTime(baseFreq + freqRange * clamped, ac.currentTime + 0.06);
      this.thrustFilter.Q.linearRampToValueAtTime(qBase + qRange * clamped, ac.currentTime + 0.06);
    }

    // Slightly open filter with intensity for brighter texture
    // (handled above via thrustFilter)
  }

  stopThrust() {
    if (!this.audioContext) return;
    if (!this.thrustGain) return;
    const ac = this.audioContext;
    // Smooth fade out
    this.thrustGain.gain.cancelScheduledValues(ac.currentTime);
    this.thrustGain.gain.linearRampToValueAtTime(0.0001, ac.currentTime + 0.1);
    const noise = this.thrustNoiseSrc;
    const gain = this.thrustGain;
    // Clear refs first to avoid double-stop races
    this.thrustNoiseSrc = null;
    this.thrustGain = null;
    this.thrustFilter = null;
    setTimeout(() => {
      try { noise?.stop(); } catch { /* no-op */ }
      try { gain?.disconnect(); } catch { /* no-op */ }
    }, 120);
  }

  // --- Asset management ---
  // Use Vite to load all files under ../sounds as URLs
  // The keys are absolute-ish module paths; values are the final URLs
  private assetUrls: Record<string, string> = import.meta.glob<string>('../sounds/*', { eager: true, as: 'url' });

  private resolveAssetUrl(fileName: string): string | null {
    // Find the entry whose path ends with /sounds/<fileName>
    for (const key of Object.keys(this.assetUrls)) {
      if (key.endsWith(`/sounds/${fileName}`)) {
        return this.assetUrls[key] as string;
      }
    }
    console.warn(`Sound asset not found: ${fileName}`);
    return null;
  }

  // Silent variant for optional assets (no console warning)
  private resolveAssetUrlSilent(fileName: string): string | null {
    for (const key of Object.keys(this.assetUrls)) {
      if (key.endsWith(`/sounds/${fileName}`)) {
        return this.assetUrls[key] as string;
      }
    }
    return null;
  }

  // Quick existence check for optional assets
  private assetExists(fileName: string): boolean {
    return !!this.resolveAssetUrlSilent(fileName);
  }

  private async loadBuffer(fileName: string): Promise<AudioBuffer | null> {
    this.ensureAudioContext();
    if (!this.audioContext) return null;
    if (this.bufferCache.has(fileName)) return this.bufferCache.get(fileName)!;
    const url = this.resolveAssetUrl(fileName);
    if (!url) return null;
    try {
      const res = await fetch(url);
      const arr = await res.arrayBuffer();
      const buf = await this.audioContext.decodeAudioData(arr);
      this.bufferCache.set(fileName, buf);
      return buf;
    } catch (e) {
      console.warn('Failed to load sound', fileName, e);
      return null;
    }
  }

  private playBuffer(buffer: AudioBuffer, opts?: { volume?: number; playbackRate?: number; loop?: boolean; pan?: number; channel?: 'sfx'|'music' }): { stop: () => void } | null {
    if (!this.isAudioAllowed()) return null;
    if (!this.audioContext) return null;
    const src = this.audioContext.createBufferSource();
    src.buffer = buffer;
    if (opts?.playbackRate) src.playbackRate.value = opts.playbackRate;

    const gain = this.audioContext.createGain();
    // Per-sound local gain; final gain controlled by master sfx/music nodes
    gain.gain.value = (opts?.volume ?? 1);

    // Optional stereo pan
    if (typeof opts?.pan === 'number' && 'createStereoPanner' in this.audioContext) {
      const panner = (this.audioContext as AudioContext).createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, opts.pan));
      src.connect(panner);
      panner.connect(gain);
    } else {
      src.connect(gain);
    }
    // Route to SFX or Music master
    const dest = opts?.channel === 'music' ? this.musicGain : this.sfxGain;
    gain.connect(dest ?? this.audioContext.destination);

    src.loop = !!opts?.loop;
    src.start();
    return {
      stop: () => {
        try { src.stop(); } catch { /* no-op */ }
      }
    };
  }

  private initAudioContext() {
    try {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) {
        this.audioContext = new AC();
        // Create master gains for SFX and Music
        this.sfxGain = this.audioContext.createGain();
        this.musicGain = this.audioContext.createGain();
        this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.audioContext.currentTime);
        this.musicGain.gain.setValueAtTime(this.musicVolume, this.audioContext.currentTime);
        this.sfxGain.connect(this.audioContext.destination);
        this.musicGain.connect(this.audioContext.destination);
      } else {
        console.warn('Web Audio API not supported');
      }
    } catch {
      console.warn('Web Audio API not supported');
    }
  }

  private ensureAudioContext() {
    if (!this.audioContext) {
      this.initAudioContext();
    }
    
    if (this.audioContext && this.audioContext.state === 'suspended') {
      // Only resume if not muted
      if (!this.muted) {
        this.audioContext.resume();
      }
    }
    // Ensure routing nodes exist
    if (this.audioContext) {
      if (!this.sfxGain) {
        this.sfxGain = this.audioContext.createGain();
        this.sfxGain.gain.value = this.sfxVolume;
        this.sfxGain.connect(this.audioContext.destination);
      }
      if (!this.musicGain) {
        this.musicGain = this.audioContext.createGain();
        this.musicGain.gain.value = this.musicVolume;
        this.musicGain.connect(this.audioContext.destination);
      }
    }
  }

  // Generate different types of sounds using oscillators
  private createOscillator(frequency: number, type: OscillatorType = 'sine'): OscillatorNode | null {
    this.ensureAudioContext();
    if (!this.audioContext) return null;

    const oscillator = this.audioContext.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
    return oscillator;
  }

  private createGainNode(volume: number = 1): GainNode | null {
    if (!this.audioContext) return null;

    const gainNode = this.audioContext.createGain();
    // Per-node local gain; final output controlled by sfxGain/musicGain
    gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
    return gainNode;
  }

  // Player ship thrust sound
  playThrustSound() {
    if (!this.isAudioAllowed()) return;
    if (!this.audioContext) return;

    const oscillator = this.createOscillator(80, 'sawtooth');
    const gainNode = this.createGainNode(0.1);
    
    if (!oscillator || !gainNode) return;

    oscillator.connect(gainNode);
    gainNode.connect(this.sfxGain ?? this.audioContext.destination);

    // Quick fade in/out for thrust
    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.1 * this.masterVolume, this.audioContext.currentTime + 0.05);
    gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.15);

    oscillator.start();
    oscillator.stop(this.audioContext.currentTime + 0.15);
  }

  // Player bullet sound
  playPlayerShoot() {
    if (!this.isAudioAllowed()) return;
    if (!this.audioContext) return;
    // Map to: ourshots.wav
    if (this.assetExists('ourshots.wav')) {
      this.loadBuffer('ourshots.wav').then(buf => {
        if (!buf) return;
        // Slight randomization
        const rate = 0.95 + Math.random() * 0.1;
        this.playBuffer(buf, { volume: 0.5, playbackRate: rate });
      });
    }
  }

  // Alien ship shoot sound
  playAlienShoot(): void {
    if (!this.isAudioAllowed()) return;
    if (!this.audioContext) return;
    // Map to: enemy lazer.wav
    if (this.assetExists('enemy lazer.wav')) {
      this.loadBuffer('enemy lazer.wav').then(buf => {
        if (!buf) return;
        const rate = 0.95 + Math.random() * 0.1;
        this.playBuffer(buf, { volume: 0.6, playbackRate: rate });
      });
    }
  }

  // Alien laser sound (every 5th shot)
  playAlienLaser(): void {
    if (!this.isAudioAllowed()) return;
    if (!this.audioContext) return;

    const oscillator = this.createOscillator(1200, 'sawtooth');
    const gainNode = this.createGainNode(0.25);
    
    if (!oscillator || !gainNode) return;

    oscillator.connect(gainNode);
    gainNode.connect(this.sfxGain ?? this.audioContext.destination);

    // Powerful laser sound
    oscillator.frequency.exponentialRampToValueAtTime(200, this.audioContext.currentTime + 0.3);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);

    oscillator.start();
    oscillator.stop(this.audioContext.currentTime + 0.3);
  }

  // Large asteroid destruction
  playLargeAsteroidDestroy(): void {
    if (!this.isAudioAllowed()) return;
    if (!this.audioContext) return;
    // Map to: asteroid_explosion-3.wav or Massive_asteroid_4.wav as accent (pick 3)
    if (this.assetExists('asteroid_explosion-3.wav')) {
      this.loadBuffer('asteroid_explosion-3.wav').then(buf => {
        if (!buf) return;
        this.playBuffer(buf, { volume: 0.8 });
      });
    }
  }

  // Medium asteroid destruction
  playMediumAsteroidDestroy(): void {
    if (!this.isAudioAllowed()) return;
    if (!this.audioContext) return;
    if (this.assetExists('asteroid_explosion-2.wav')) {
      this.loadBuffer('asteroid_explosion-2.wav').then(buf => {
        if (!buf) return;
        this.playBuffer(buf, { volume: 0.7 });
      });
    }
  }

  // Small asteroid destruction
  playSmallAsteroidDestroy(): void {
    if (!this.isAudioAllowed()) return;
    if (!this.audioContext) return;
    if (this.assetExists('asteroid_explosion-1.wav')) {
      this.loadBuffer('asteroid_explosion-1.wav').then(buf => {
        if (!buf) return;
        this.playBuffer(buf, { volume: 0.6 });
      });
    }
  }

  // Player hit by asteroid (different sounds based on asteroid size)
  playPlayerHitByLargeAsteroid(): void {
    if (!this.isAudioAllowed()) return;
    if (!this.audioContext) return;

    const oscillator = this.createOscillator(200, 'sawtooth');
    const gainNode = this.createGainNode(0.4);
    
    if (!oscillator || !gainNode) return;

    oscillator.connect(gainNode);
    gainNode.connect(this.sfxGain ?? this.audioContext.destination);

    // Heavy impact sound
    oscillator.frequency.exponentialRampToValueAtTime(50, this.audioContext.currentTime + 0.3);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);

    oscillator.start();
    oscillator.stop(this.audioContext.currentTime + 0.3);
  }

  playPlayerHitByMediumAsteroid(): void {
    if (!this.isAudioAllowed()) return;
    if (!this.audioContext) return;

    const oscillator = this.createOscillator(300, 'square');
    const gainNode = this.createGainNode(0.3);
    
    if (!oscillator || !gainNode) return;

    oscillator.connect(gainNode);
    gainNode.connect(this.sfxGain ?? this.audioContext.destination);

    // Medium impact sound
    oscillator.frequency.exponentialRampToValueAtTime(100, this.audioContext.currentTime + 0.2);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);

    oscillator.start();
    oscillator.stop(this.audioContext.currentTime + 0.2);
  }

  playPlayerHitBySmallAsteroid(): void {
    if (!this.isAudioAllowed()) return;
    if (!this.audioContext) return;

    const oscillator = this.createOscillator(500, 'triangle');
    const gainNode = this.createGainNode(0.2);
    
    if (!oscillator || !gainNode) return;

    oscillator.connect(gainNode);
    gainNode.connect(this.sfxGain ?? this.audioContext.destination);

    // Light impact sound
    oscillator.frequency.exponentialRampToValueAtTime(200, this.audioContext.currentTime + 0.15);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.15);

    oscillator.start();
    oscillator.stop(this.audioContext.currentTime + 0.15);
  }

  // Player hit by alien bullet
  playPlayerHitByAlien(): void {
    if (!this.isAudioAllowed()) return;
    if (!this.audioContext) return;

    const oscillator = this.createOscillator(400, 'square');
    const gainNode = this.createGainNode(0.35);
    
    if (!oscillator || !gainNode) return;

    oscillator.connect(gainNode);
    gainNode.connect(this.sfxGain ?? this.audioContext.destination);

    // Electric zap sound
    oscillator.frequency.exponentialRampToValueAtTime(100, this.audioContext.currentTime + 0.25);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.25);

    oscillator.start();
    oscillator.stop(this.audioContext.currentTime + 0.25);
  }

  // Alien ship destruction
  playAlienDestroy(): void {
    if (!this.isAudioAllowed()) return;
    if (!this.audioContext) return;
    // Map to: killedalien.mp3
    if (this.assetExists('killedalien.mp3')) {
      this.loadBuffer('killedalien.mp3').then(buf => {
        if (!buf) return;
        // +30% volume boost
        this.playBuffer(buf, { volume: 0.91 });
      });
    }
  }

  // Bonus collected sound
  playBonusCollected(): void {
    if (!this.isAudioAllowed()) return;
    if (!this.audioContext) return;
    // Map to: pickedupaward.mp3
    if (this.assetExists('pickedupaward.mp3')) {
      this.loadBuffer('pickedupaward.mp3').then(buf => {
        if (!buf) return;
        this.playBuffer(buf, { volume: 0.6 });
      });
    }
  }

  // Bonus missed sound (disappointed "Aww")
  playBonusMissed(): void {
    if (!this.isAudioAllowed()) return;
    if (!this.audioContext) return;

    // Descending disappointed sound
    const oscillator = this.createOscillator(400, 'triangle');
    const gainNode = this.createGainNode(0.25);
    
    if (!oscillator || !gainNode) return;

    oscillator.connect(gainNode);
    gainNode.connect(this.sfxGain ?? this.audioContext.destination);

    const duration = 1.0;
    
    // Descending "aww" sound
    oscillator.frequency.setValueAtTime(400, this.audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(200, this.audioContext.currentTime + 0.5);
    oscillator.frequency.exponentialRampToValueAtTime(150, this.audioContext.currentTime + duration);
    
    // Volume envelope for "aww" effect
    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.25 * this.masterVolume, this.audioContext.currentTime + 0.1);
    gainNode.gain.linearRampToValueAtTime(0.2 * this.masterVolume, this.audioContext.currentTime + 0.4);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

    oscillator.start();
    oscillator.stop(this.audioContext.currentTime + duration);
  }

  // Asteroid collision sounds (asteroid hitting asteroid)
  playLargeAsteroidCollision(): void {
    if (!this.isAudioAllowed()) return;
    if (!this.audioContext) return;
    // Map to: asteroid bump.wav
    if (this.assetExists('asteroid bump.wav')) {
      this.loadBuffer('asteroid bump.wav').then(buf => {
        if (!buf) return;
        const rate = 0.95 + Math.random() * 0.1;
        this.playBuffer(buf, { volume: 0.5, playbackRate: rate });
      });
    }
  }

  playMediumAsteroidCollision(): void {
    if (!this.isAudioAllowed()) return;
    if (!this.audioContext) return;
    if (this.assetExists('asteroid bump.wav')) {
      this.loadBuffer('asteroid bump.wav').then(buf => {
        if (!buf) return;
        const rate = 1.0 + Math.random() * 0.1;
        this.playBuffer(buf, { volume: 0.45, playbackRate: rate });
      });
    }
  }

  playSmallAsteroidCollision(): void {
    if (!this.isAudioAllowed()) return;
    if (!this.audioContext) return;
    if (this.assetExists('asteroid bump.wav')) {
      this.loadBuffer('asteroid bump.wav').then(buf => {
        if (!buf) return;
        const rate = 1.1 + Math.random() * 0.1;
        this.playBuffer(buf, { volume: 0.4, playbackRate: rate });
      });
    }
  }

  // Stage completion warp sound
  playWarpSound(): void {
    if (!this.isAudioAllowed()) return;
    if (!this.audioContext) return;
    // Map to: boom.wav (short one-shot)
    if (this.assetExists('boom.wav')) {
      this.loadBuffer('boom.wav').then(buf => {
        if (!buf) return;
        this.playBuffer(buf, { volume: 0.7 });
      });
    }
  }

  // Alien ship engine sound (distance-based volume)
  playAlienEngine(distance: number, maxDistance: number = 400): void {
    if (!this.isAudioAllowed()) return;
    if (!this.audioContext) return;

    // Calculate volume based on distance (closer = louder)
    const distanceRatio = Math.max(0, Math.min(1, 1 - (distance / maxDistance)));
    const volume = distanceRatio * 0.15;

    if (volume < 0.01) return; // Don't play if too quiet

    const oscillator1 = this.createOscillator(60, 'sawtooth');
    const oscillator2 = this.createOscillator(120, 'triangle');
    const gainNode = this.createGainNode(volume);
    
    if (!oscillator1 || !oscillator2 || !gainNode) return;

    oscillator1.connect(gainNode);
    oscillator2.connect(gainNode);
    gainNode.connect(this.sfxGain ?? this.audioContext.destination);

    // Pulsing alien engine sound
    const pulseDuration = 0.3;
    gainNode.gain.setValueAtTime(volume * this.masterVolume, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + pulseDuration);

    oscillator1.start();
    oscillator2.start();
    oscillator1.stop(this.audioContext.currentTime + pulseDuration);
    oscillator2.stop(this.audioContext.currentTime + pulseDuration);
  }

  // Game over sound
  playGameOver(): void {
    if (!this.isAudioAllowed()) return;
    if (!this.audioContext) return;
    // Map to: gameovertingle.mp3
    if (this.assetExists('gameovertingle.mp3')) {
      this.loadBuffer('gameovertingle.mp3').then(buf => {
        if (!buf) return;
        this.playBuffer(buf, { volume: 0.7 });
      });
    }
  }

  // Set master volume (0.0 to 1.0)
  setVolume(volume: number): void {
    // Back-compat: map to SFX volume
    this.setSfxVolume(volume);
  }

  // Mute/unmute all sounds
  setMuted(muted: boolean): void {
    this.ensureAudioContext();
    if (!this.audioContext) return;
    this.muted = muted;
    if (muted) {
      // Suspend the entire audio context to ensure nothing leaks through
      this.audioContext.suspend();
      if (this.sfxGain) this.sfxGain.gain.value = 0;
      if (this.musicGain) this.musicGain.gain.value = 0;
    } else {
      // Restore defaults
      if (this.sfxGain) this.sfxGain.gain.value = this.sfxVolume;
      if (this.musicGain) this.musicGain.gain.value = this.musicVolume;
      this.audioContext.resume();
    }
  }

  // Get current mute state
  isMuted(): boolean {
    return this.muted;
  }

  // Stop all currently playing sounds
  stopAllSounds(): void {
    if (!this.audioContext) return;
    
    // Close and recreate the audio context to stop all sounds
    this.audioContext.close();
    this.initAudioContext();
  }

  // --- Music System ---
  private ensureMusicTracks(): void {
    if (this.musicTracks) return;
    const items: Array<{ key: string; url: string; name: string; ext: string }> = [];
    for (const key of Object.keys(this.musicAssetUrls)) {
      const url = this.musicAssetUrls[key] as string;
      const parts = key.split('/');
      const file = parts[parts.length - 1];
      const dot = file.lastIndexOf('.');
      const name = dot > 0 ? file.substring(0, dot) : file;
      const ext = dot > 0 ? file.substring(dot + 1) : '';
      items.push({ key, url, name, ext });
    }
    // Sort with numeric-leading names first by their number, then alpha as fallback
    const leadNum = (s: string): number | null => {
      const m = s.match(/^\s*(\d+)/);
      return m ? parseInt(m[1], 10) : null;
    };
    items.sort((a, b) => {
      const na = leadNum(a.name);
      const nb = leadNum(b.name);
      if (na !== null && nb !== null) return na - nb || a.name.localeCompare(b.name);
      if (na !== null && nb === null) return -1; // numbered first
      if (na === null && nb !== null) return 1;
      return a.name.localeCompare(b.name);
    });
    this.musicTracks = items;
  }

  // Current view = only numbered tracks unless risqué is enabled
  private getCurrentViewIndices(): number[] {
    this.ensureMusicTracks();
    const list = this.musicTracks ?? [];
    if (this.risqueEnabled) {
      return list.map((_, i) => i);
    }
    // Default view: only numbered, non-risqué tracks (names starting with a digit)
    return list
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => /^\d/.test(t.name))
      .map(({ i }) => i);
  }

  private resolveRealIndex(viewIndex: number): number {
    const v = this.getCurrentViewIndices();
    if (v.length === 0) return -1;
    const i = ((viewIndex % v.length) + v.length) % v.length;
    return v[i];
  }

  setRisqueEnabled(enabled: boolean): void {
    this.risqueEnabled = !!enabled;
    // Clamp current view index into new view range
    const v = this.getCurrentViewIndices();
    if (v.length === 0) {
      this.musicCurrentViewIndex = 0;
    } else if (this.musicCurrentViewIndex >= v.length) {
      this.musicCurrentViewIndex = 0;
    }
    // Reset offset to avoid resuming into mismatched tracks
    this.musicOffsetSec = 0;
    if (this.musicTrackChangeListener) this.musicTrackChangeListener(this.musicCurrentViewIndex);
  }

  getMusicTracks(): TrackInfo[] {
    this.ensureMusicTracks();
    const v = this.getCurrentViewIndices();
    const list = this.musicTracks ?? [];
    return v.map(i => ({ name: list[i].name, url: list[i].url }));
  }

  // Dev-only: seed track names/order from CSV content
  // CSV columns expected: track_id,name,url,risque,default_volume,duration_sec
  // We match rows to discovered assets by URL filename (case-insensitive)
  seedTracksFromCsv(csvText: string): void {
    if (!import.meta.env?.DEV) return; // no-op in prod builds
    this.ensureMusicTracks();
    if (!this.musicTracks || this.musicTracks.length === 0) return;

    // Parse simple CSV (no external deps). Assumes no embedded commas.
    const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length <= 1) return;
    const header = lines[0].split(',').map(s => s.trim());
    const idxName = header.findIndex(h => /^(name)$/i.test(h));
    const idxUrl = header.findIndex(h => /^(url)$/i.test(h));
    if (idxName < 0 || idxUrl < 0) return;
    const rows: Array<{ name: string; file: string }> = [];
    for (let i = 1; i < lines.length; i++) {
      const raw = lines[i];
      // naive split without embedded comma support
      const cols = raw.split(',');
      if (cols.length <= Math.max(idxName, idxUrl)) continue;
      const strip = (s: string) => s.replace(/^"|"$/g, '');
      const name = strip(cols[idxName]);
      const url = strip(cols[idxUrl]);
      const parts = url.split('/');
      const file = (parts[parts.length - 1] || url).toLowerCase();
      rows.push({ name, file: file.toLowerCase() });
    }

    // Build map from filename -> desired name and target order
    const byFile = new Map<string, { name: string; order: number }>();
    rows.forEach((r, i) => byFile.set(r.file, { name: r.name, order: i }));

    // Apply rename and compute ordering weight for each discovered track
    const withWeights: Array<TrackMeta & { __order: number }> = (this.musicTracks ?? []).map((t) => {
      const file = (t.name && t.name.toLowerCase().endsWith('.mp3')) ? t.name.toLowerCase() : (t.url.split('/').pop() || '').toLowerCase();
      const meta = byFile.get(file);
      return {
        ...t,
        name: meta?.name ?? t.name,
        __order: (typeof meta?.order === 'number') ? meta!.order : Number.MAX_SAFE_INTEGER
      };
    });

    // Stable sort by CSV order, leaving unmatched at the end in existing relative order
    withWeights.sort((a, b) => a.__order - b.__order);
    // Rebuild list without temp field to avoid delete & any casts
    this.musicTracks = withWeights.map(w => ({ key: w.key, url: w.url, name: w.name, ext: w.ext }));
    // Notify listeners so UI can refresh the displayed list/current name
    if (this.musicTrackChangeListener) this.musicTrackChangeListener(this.musicCurrentViewIndex);
  }

  private async loadMusicBuffer(viewIndex: number): Promise<AudioBuffer | null> {
    this.ensureMusicTracks();
    const realIndex = this.resolveRealIndex(viewIndex);
    if (realIndex < 0 || !this.musicTracks || this.musicTracks.length === 0) return null;
    const url = this.musicTracks[realIndex].url;
    try {
      const res = await fetch(url);
      const arr = await res.arrayBuffer();
      this.ensureAudioContext();
      if (!this.audioContext) return null;
      return await this.audioContext.decodeAudioData(arr);
    } catch {
      return null;
    }
  }

  private stopCurrentMusicNode() {
    if (this.musicAdvanceTimer !== null) {
      clearTimeout(this.musicAdvanceTimer);
      this.musicAdvanceTimer = null;
    }
    if (this.musicSource) {
      try { this.musicSource.stop(); } catch { /* no-op */ }
      try { this.musicSource.disconnect(); } catch { /* no-op */ }
    }
    this.musicSource = null;
    // After an intentional stop, ensure future natural onended handlers work
    this.musicStopping = false;
  }

  async playMusic(index?: number): Promise<void> {
    this.ensureAudioContext();
    if (!this.isAudioAllowed()) return;
    if (!this.audioContext) return;
    this.musicPaused = false;
    if (typeof index === 'number') {
      this.musicCurrentViewIndex = index;
      this.musicOffsetSec = 0;
      if (this.musicTrackChangeListener) { this.musicTrackChangeListener(this.musicCurrentViewIndex); }
    }
    const buf = await this.loadMusicBuffer(this.musicCurrentViewIndex);
    if (!buf) return;
    // Prevent current onended from auto-advancing when we are intentionally switching tracks
    this.musicStopping = true;
    this.stopCurrentMusicNode();
    // New play session
    this.musicSessionId++;
    const sessionId = this.musicSessionId;
    const src = this.audioContext.createBufferSource();
    src.buffer = buf;
    src.onended = () => {
      // Ignore if a newer session has started
      if (sessionId !== this.musicSessionId) return;
      // Ignore manual stops/pauses
      if (this.musicStopping) {
        this.musicStopping = false;
        if (this.musicAdvanceTimer !== null) { clearTimeout(this.musicAdvanceTimer); this.musicAdvanceTimer = null; }
        return;
      }
      // If paused, do nothing further
      if (this.musicPaused) return;
      // Auto-advance only on natural end while not muted, with a gap
      if (!this.muted) {
        // Clear any existing fallback timer for this session
        if (this.musicAdvanceTimer !== null) { clearTimeout(this.musicAdvanceTimer); this.musicAdvanceTimer = null; }
        const view = this.getCurrentViewIndices();
        const nextIndex = view.length > 0 ? (this.musicCurrentViewIndex + 1) % view.length : 0;
        // Temporarily boost SFX during gap unless user set SFX
        const orig = this.sfxVolume;
        if (!this.sfxUserSet) {
          this.sfxPrevForGap = orig;
          this.setSfxVolume(0.5);
        }
        const startNext = () => {
          // Ignore if a newer session has started meanwhile
          if (sessionId !== this.musicSessionId) return;
          if (this.musicPaused) return;
          // Restore SFX if we changed it and user hasn't taken over since
          if (!this.sfxUserSet && this.sfxPrevForGap !== null) {
            this.setSfxVolume(this.sfxPrevForGap);
          }
          this.sfxPrevForGap = null;
          this.musicOffsetSec = 0;
          this.musicCurrentViewIndex = nextIndex;
          if (this.musicTrackChangeListener) this.musicTrackChangeListener(this.musicCurrentViewIndex);
          this.playMusic().catch(() => {});
        };
        window.setTimeout(startNext, this.musicGapMs);
      }
    };
    const gain = this.audioContext.createGain();
    gain.gain.value = 1.0; // track-local, master controlled by musicGain
    src.connect(gain);
    gain.connect(this.musicGain ?? this.audioContext.destination);
    src.start(0, this.musicOffsetSec);
    this.musicStartCtxTime = this.audioContext.currentTime;
    this.musicSource = src;
    // We have started a new natural source; allow its onended to auto-advance
    this.musicStopping = false;

    // Fallback: schedule next track in case onended is not fired (some browsers)
    if (this.musicAdvanceTimer !== null) {
      clearTimeout(this.musicAdvanceTimer);
      this.musicAdvanceTimer = null;
    }
    try {
      const remaining = Math.max(0, src.buffer.duration - this.musicOffsetSec);
      this.musicAdvanceTimer = window.setTimeout(() => {
        // Ignore if a newer session has started
        if (sessionId !== this.musicSessionId) return;
        if (this.musicPaused) return;
        // If source still current and not manually stopped, advance with gap
        if (!this.musicStopping && this.musicSource === src && !this.muted) {
          const view = this.getCurrentViewIndices();
          const nextIndex = view.length > 0 ? (this.musicCurrentViewIndex + 1) % view.length : 0;
          const orig = this.sfxVolume;
          if (!this.sfxUserSet) {
            this.sfxPrevForGap = orig;
            this.setSfxVolume(0.5);
          }
          window.setTimeout(() => {
            if (sessionId !== this.musicSessionId) return;
            if (this.musicPaused) return;
            if (!this.sfxUserSet && this.sfxPrevForGap !== null) {
              this.setSfxVolume(this.sfxPrevForGap);
            }
            this.sfxPrevForGap = null;
            this.musicOffsetSec = 0;
            this.musicCurrentViewIndex = nextIndex;
            if (this.musicTrackChangeListener) this.musicTrackChangeListener(this.musicCurrentViewIndex);
            this.playMusic().catch(() => {});
          }, this.musicGapMs);
        }
      }, Math.max(0, Math.floor(remaining * 1000 - 50))); // 50ms early
    } catch {
      // ignore scheduling errors
    }
  }

  pauseMusic(): void {
    if (!this.audioContext) return;
    if (!this.musicSource) return;
    const elapsed = this.audioContext.currentTime - this.musicStartCtxTime;
    this.musicOffsetSec += Math.max(0, elapsed);
    this.musicPaused = true;
    this.musicStopping = true;
    if (this.musicAdvanceTimer !== null) { clearTimeout(this.musicAdvanceTimer); this.musicAdvanceTimer = null; }
    this.stopCurrentMusicNode();
    // Invalidate any pending callbacks that captured the old sessionId
    this.musicSessionId++;
  }

  resumeMusic(): void {
    if (!this.audioContext) return;
    this.musicPaused = false;
    this.playMusic().catch(() => {});
  }

  stopMusic(): void {
    this.musicOffsetSec = 0;
    this.musicPaused = false;
    this.musicStopping = true;
    this.stopCurrentMusicNode();
  }

  // Select track without starting playback (resets resume offset)
  selectMusicTrack(index: number): void {
    this.ensureAudioContext();
    this.ensureMusicTracks();
    const view = this.getCurrentViewIndices();
    if (view.length === 0) return;
    const i = ((index % view.length) + view.length) % view.length;
    this.musicCurrentViewIndex = i;
    this.musicOffsetSec = 0;
    if (this.musicTrackChangeListener) this.musicTrackChangeListener(this.musicCurrentViewIndex);
  }

  // Expose current music state for UI logic
  getMusicState(): MusicState {
    // offset reports the resume offset captured at last pause/stop (legacy)
    return {
      isPlaying: !!this.musicSource,
      index: this.musicCurrentViewIndex,
      offset: this.musicOffsetSec,
      trackCount: this.getCurrentViewIndices().length,
    };
  }

  // Detailed live playback info (for persistence)
  getPlaybackInfo(): { index: number; offsetSec: number; isPlaying: boolean; durationSec: number } {
    let liveOffset = this.musicOffsetSec;
    let duration = 0;
    if (this.musicSource && this.musicSource.buffer && this.audioContext) {
      duration = this.musicSource.buffer.duration;
      const elapsed = Math.max(0, this.audioContext.currentTime - this.musicStartCtxTime);
      liveOffset = this.musicOffsetSec + elapsed;
    }
    return {
      index: this.musicCurrentViewIndex,
      offsetSec: Math.max(0, liveOffset),
      isPlaying: !!this.musicSource,
      durationSec: duration,
    };
  }

  // Set resume point without starting playback; clamps offset to track duration when known later
  setResumePoint(index: number, offsetSec: number): void {
    this.musicCurrentViewIndex = index;
    this.musicOffsetSec = Math.max(0, offsetSec || 0);
    // Do not notify track change listener here to avoid UI flashes; selection APIs will do that
  }

  // Resume immediately from a given index+offset
  resumeFrom(index: number, offsetSec: number): void {
    this.musicCurrentViewIndex = index;
    this.musicOffsetSec = Math.max(0, offsetSec || 0);
    this.playMusic().catch(() => {});
  }

  setMusicVolume(v: number): void {
    this.musicVolume = Math.max(0, Math.min(1, v));
    if (this.musicGain && !this.muted) {
      this.musicGain.gain.setValueAtTime(this.musicVolume, this.audioContext!.currentTime);
    }
  }

  setSfxVolume(v: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, v));
    if (this.sfxGain && !this.muted) {
      this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.audioContext!.currentTime);
    }
  }

  // Called by UI when user explicitly changes SFX volume; marks as user-controlled
  setSfxVolumeFromUser(v: number): void {
    this.sfxUserSet = true;
    this.setSfxVolume(v);
  }

  // Bonus ambient sound (quiet background hum)
  playBonusAmbient(): { stop: () => void } | null {
    if (!this.isAudioAllowed()) return null;
    if (!this.audioContext) return null;
    // Map to: space.wav as a quiet loop
    // Use buffer source with loop and a small fade handled externally via volume
    let handle: { stop: () => void } | null = null;
    // Only play ambient space when music is not playing
    try {
      const ms = this.getMusicState();
      if (ms.isPlaying) return null;
    } catch { /* no-op */ }
    if (this.assetExists('space.wav')) {
      this.loadBuffer('space.wav').then(buf => {
        if (!buf) return;
        handle = this.playBuffer(buf, { volume: 0.15, loop: true });
      });
    }
    return {
      stop: () => {
        try { handle?.stop(); } catch { /* no-op */ }
      }
    };
  }

  // Alien approach cue disabled (no-op) to avoid unintended sound on UFO arrival
  playAlienApproachMusic(approachSide: 'top' | 'right' | 'bottom' | 'left'): { stop: () => void } | null {
    // reference param to satisfy lint
    void approachSide;
    return null;
  }

  // Louder, obvious tier-change cue (short descending chirp)
  playTierChangeCue(): void {
    if (!this.isAudioAllowed()) return;
    if (!this.audioContext) return;
    const osc = this.createOscillator(1200, 'sawtooth');
    const gain = this.createGainNode(0.7);
    if (!osc || !gain) return;
    osc.connect(gain);
    gain.connect(this.sfxGain ?? this.audioContext.destination);
    const now = this.audioContext.currentTime;
    // Fast descending pitch and quick envelope
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.25);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.9, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    osc.start(now);
    osc.stop(now + 0.3);
  }
}

// Type: instance of SoundSystemImpl augmented with optional scan hooks
export type SoundSystem = InstanceType<typeof SoundSystemImpl> & {
  playScanTick?(): void;
  stopScanTick?(): void;
  playScanComplete?(): void;
};

// Export singleton instance with widened type (optional methods supported by class)
export const soundSystem: SoundSystem = new SoundSystemImpl();