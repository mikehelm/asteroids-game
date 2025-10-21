export function sessionFlag(key: string) {
  return {
    get(): boolean {
      try {
        return sessionStorage.getItem(key) === '1';
      } catch {
        return false;
      }
    },
    setTrue(): void {
      try {
        sessionStorage.setItem(key, '1');
      } catch {
        /* no-op */
      }
    },
  };
}


export type ResumeInfo = { index: number; offsetSec: number };

export function saveResumeInfo(key: string, val: ResumeInfo): void {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* no-op */
  }
}

export function loadResumeInfo(key: string): ResumeInfo | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.index === 'number' &&
      typeof parsed?.offsetSec === 'number'
    ) {
      return { index: parsed.index, offsetSec: Math.max(0, parsed.offsetSec) };
    }
    return null;
  } catch {
    return null;
  }
}

// ---- Music playback resume persistence (extracted from Game.tsx) ----
import type { MutableRefObject } from 'react';

export type PlaybackInfo = { index: number; offsetSec: number; isPlaying?: boolean };

export function installMusicResumePersistence(opts: {
  soundSystem: any;
  key: string;
  setMusicIndex: (i: number) => void; // retained in signature to match caller; not used here
  resumeInfoRef: MutableRefObject<{ index: number; offsetSec: number } | null>;
  saveResumeInfo: (key: string, val: { index: number; offsetSec: number }) => void;
}): () => void {
  const { soundSystem, key, resumeInfoRef, saveResumeInfo } = opts;

  const save = () => {
    try {
      const info: PlaybackInfo = soundSystem.getPlaybackInfo();
      if (info?.isPlaying || (typeof info?.offsetSec === 'number' && info.offsetSec > 0)) {
        const data = { index: info.index, offsetSec: info.offsetSec };
        saveResumeInfo(key, data);
        resumeInfoRef.current = data;
      }
    } catch {
      /* ignore */
    }
  };

  const onVis = () => {
    try {
      if (document.visibilityState === 'hidden') save();
    } catch { /* ignore */ }
  };

  const onBeforeUnload = () => {
    try { save(); } catch { /* ignore */ }
  };

  const id = setInterval(save, 3000);
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('beforeunload', onBeforeUnload);

  return () => {
    try { clearInterval(id); } catch { /* ignore */ }
    try { document.removeEventListener('visibilitychange', onVis); } catch { /* ignore */ }
    try { window.removeEventListener('beforeunload', onBeforeUnload); } catch { /* ignore */ }
  };
}
