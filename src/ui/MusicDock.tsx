import React, { useEffect, useMemo, useRef, useState } from 'react';
import './MusicDock.css';

export type MusicDockProps = {
  // Music controls only
  isPlaying: boolean;
  onPlayPause: () => void;
  onPrev: () => void;
  onNext: () => void;
  tracks: Array<{ name: string; url: string }>;
  currentIndex: number;
  marqueeTitle?: string;
  muted: boolean;
  onToggleMute: () => void;
  musicVolume: number;
  onMusicVolume: (v: number) => void;
  sfxVolume: number;
  onSfxVolume: (v: number) => void;
  // Optional: marquee duration override
  marqueeDuration?: string | number;
};

export default function MusicDock({
  isPlaying,
  onPlayPause,
  onPrev,
  onNext,
  tracks,
  currentIndex,
  marqueeTitle,
  muted,
  onToggleMute,
  musicVolume,
  onMusicVolume,
  sfxVolume,
  onSfxVolume,
  marqueeDuration,
}: MusicDockProps) {
  const computedTitle = useMemo(() => (tracks[currentIndex]?.name ?? marqueeTitle ?? ''), [tracks, currentIndex, marqueeTitle]);

  // Controlled marquee state
  const prefersReducedMotion = useRef(false);
  useEffect(() => {
    try { prefersReducedMotion.current = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* no-op */ }
  }, []);

  const [displayTitle, setDisplayTitle] = useState<string>(computedTitle);
  const [prevTitle, setPrevTitle] = useState<string>('');
  const [phase, setPhase] = useState<'idle'|'fadeout'|'enter'>('idle');

  // Animate on title changes
  useEffect(() => {
    if (!computedTitle || computedTitle === displayTitle) return;
    // Start fade-out of current, then enter new from right
    if (prefersReducedMotion.current) {
      setDisplayTitle(computedTitle);
      setPrevTitle('');
      setPhase('idle');
      return;
    }
    setPrevTitle(displayTitle);
    setPhase('fadeout');
    const to1 = window.setTimeout(() => {
      setDisplayTitle(computedTitle);
      setPhase('enter');
      const to2 = window.setTimeout(() => setPhase('idle'), 800); // allow slide-in to complete
      return () => window.clearTimeout(to2);
    }, 220);
    return () => window.clearTimeout(to1);
  }, [computedTitle, displayTitle]);

  // Inline CSS var for marquee speed
  const marqueeStyle: React.CSSProperties = {};
  if (typeof marqueeDuration === 'number') (marqueeStyle as unknown as Record<string, string>)['--marquee-duration'] = `${marqueeDuration}s`;
  else if (typeof marqueeDuration === 'string' && marqueeDuration.trim().length > 0) (marqueeStyle as unknown as Record<string, string>)['--marquee-duration'] = marqueeDuration;

  return (
    <>
      {/* Bottom dock: single music row spanning the bottom */}
      <div className="music-dock" role="group" aria-label="Music controls">
        <div className="dock-transport" role="toolbar" aria-label="Playback controls">
          <button type="button" className="dock-btn" onClick={onPrev} aria-label="Previous track">⏮︎</button>
          <button
            type="button"
            className="dock-btn dock-btn--primary"
            onClick={onPlayPause}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            aria-pressed={isPlaying}
          >{isPlaying ? '⏸︎' : '▶︎'}</button>
          <button type="button" className="dock-btn" onClick={onNext} aria-label="Next track">⏭︎</button>
        </div>

        <div className="dock-marquee" style={marqueeStyle} role="marquee" aria-live="polite" tabIndex={0} title={displayTitle}>
          {/* Previous title fading out */}
          {phase !== 'idle' && prevTitle && (
            <span className={`dock-marquee__text ${phase === 'fadeout' ? 'is-out' : ''}`}>{prevTitle}</span>
          )}
          {/* Current title sliding in from right and then stopping at left */}
          <span className={`dock-marquee__text ${phase === 'enter' ? 'is-in' : 'is-static'}`}>{displayTitle}</span>
        </div>

        <div className="dock-sliders" aria-label="Audio settings">
          <div className="dock-slider">
            <label htmlFor="dock-music" className="dock-label">Music</label>
            <input
              id="dock-music"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={musicVolume}
              onChange={(e) => onMusicVolume(parseFloat(e.target.value))}
              aria-valuemin={0}
              aria-valuemax={1}
              aria-valuenow={Number(musicVolume.toFixed(2))}
            />
          </div>
          <div className="dock-slider">
            <label htmlFor="dock-sfx" className="dock-label">SFX</label>
            <input
              id="dock-sfx"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={sfxVolume}
              onChange={(e) => onSfxVolume(parseFloat(e.target.value))}
              aria-valuemin={0}
              aria-valuemax={1}
              aria-valuenow={Number(sfxVolume.toFixed(2))}
            />
          </div>
          <button
            type="button"
            className={`dock-btn ${muted ? 'is-on' : ''}`}
            onClick={onToggleMute}
            aria-pressed={muted}
            aria-label={muted ? 'Unmute' : 'Mute'}
          >{muted ? '🔇' : '🔊'}</button>
        </div>
      </div>
    </>
  );
}
