import type React from 'react';

type SetState = React.Dispatch<React.SetStateAction<any>>;

export type MusicControlsDeps = {
  soundSystem: any;

  // mute state
  isMutedRef: React.MutableRefObject<any>;
  setIsMuted: SetState;

  // volumes
  musicVolState: [number, SetState];
  sfxVolState: [number, SetState];

  // playback state flags (UI)
  setMusicPlaying: SetState;
  setMusicUserPaused: SetState;
  musicUserPausedRef: React.MutableRefObject<any>;

  // UI index setter
  setMusicIndex: SetState;
};

export function createMusicControls(deps: MusicControlsDeps) {
  const {
    soundSystem,
    isMutedRef, setIsMuted,
    musicVolState, sfxVolState,
    setMusicPlaying, setMusicUserPaused, musicUserPausedRef,
    setMusicIndex,
  } = deps;

  const [musicVol, setMusicVol] = musicVolState;
  const [sfxVol, setSfxVol] = sfxVolState;

  // Remember intended volumes while muted; restore on unmute
  const muteVolMemRef: React.MutableRefObject<{ music: number; sfx: number } | null> =
    { current: null } as any;

  const applyVolumesToEngine = (music: number, sfx: number) => {
    try {
      soundSystem.setMusicVolume?.(music);
      soundSystem.setSfxVolume?.(sfx);
    } catch { /* no-op */ }
  };

  const safePlayMusic = (index?: number) => {
    try {
      const ms = soundSystem.getMusicState?.() ?? {};
      const targetIdx = typeof index === 'number' ? index : (ms as any).index;
      // avoid double-starting same track
      if ((ms as any).isPlaying && typeof targetIdx === 'number' && (ms as any).index === targetIdx) {
        return;
      }
      if (typeof index === 'number') soundSystem.playMusic?.(index);
      else soundSystem.playMusic?.();
      setMusicPlaying(true);
      setMusicUserPaused(false);
      if (typeof targetIdx === 'number') setMusicIndex(targetIdx);
    } catch { /* no-op */ }
  };

  const handleMusicVolume = (v: number) => {
    setMusicVol(v);
    if (isMutedRef.current) {
      // remember while muted
      muteVolMemRef.current = { music: v, sfx: (muteVolMemRef.current?.sfx ?? sfxVol) };
      return;
    }
    applyVolumesToEngine(v, sfxVol);
  };

  const handleSfxVolume = (v: number) => {
    setSfxVol(v);
    if (isMutedRef.current) {
      muteVolMemRef.current = { music: (muteVolMemRef.current?.music ?? musicVol), sfx: v };
      return;
    }
    applyVolumesToEngine(musicVol, v);
  };

  const toggleMute = () => {
    if (!isMutedRef.current) {
      // muting: remember desired volumes, set output to 0, do not pause/stop
      muteVolMemRef.current = { music: musicVol, sfx: sfxVol };
      applyVolumesToEngine(0, 0);
      setIsMuted(true);
      (isMutedRef as any).current = true;
    } else {
      // unmuting: restore intended volumes (from memory if present)
      const restoreMusic = muteVolMemRef.current?.music ?? musicVol;
      const restoreSfx = muteVolMemRef.current?.sfx ?? sfxVol;
      applyVolumesToEngine(restoreMusic, restoreSfx);
      setIsMuted(false);
      (isMutedRef as any).current = false;
    }
  };

  const play = () => {
    try {
      soundSystem.playMusic?.();
      setMusicPlaying(true);
      setMusicUserPaused(false);
    } catch { /* no-op */ }
  };

  const pause = () => {
    try {
      soundSystem.pauseMusic?.();
      setMusicPlaying(false);
      setMusicUserPaused(true);
    } catch { /* no-op */ }
  };

  const next = () => {
    try {
      const ms = soundSystem.getMusicState?.() ?? {};
      const count = (ms as any).trackCount ?? 0;
      if (count <= 0) return;
      const nextIdx = (((ms as any).index ?? 0) + 1) % count;
      setMusicIndex(nextIdx);
      safePlayMusic(nextIdx);
    } catch { /* no-op */ }
  };

  const prev = () => {
    try {
      const ms = soundSystem.getMusicState?.() ?? {};
      const count = (ms as any).trackCount ?? 0;
      if (count <= 0) return;
      const prevIdx = (((ms as any).index ?? 0) - 1 + count) % count;
      setMusicIndex(prevIdx);
      safePlayMusic(prevIdx);
    } catch { /* no-op */ }
  };

  return {
    safePlayMusic,
    handleMusicVolume,
    handleSfxVolume,
    toggleMute,
    play,
    pause,
    next,
    prev,
  };
}
