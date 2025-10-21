// src/ui/fxPersistence.ts
// Tiny localStorage persistence for FX presets

export type FxPresetName = 'high' | 'medium' | 'low';

export function getFxPresetKey(): string {
  return 'fxPreset:v1';
}

export function saveFxPreset(name: FxPresetName): void {
  try {
    localStorage.setItem(getFxPresetKey(), name);
  } catch {
    // ignore
  }
}

export function loadFxPreset(): FxPresetName | null {
  try {
    const v = localStorage.getItem(getFxPresetKey());
    if (v === 'high' || v === 'medium' || v === 'low') return v;
    return null;
  } catch {
    return null;
  }
}

export function clearFxPreset(): void {
  try {
    localStorage.removeItem(getFxPresetKey());
  } catch {
    // ignore
  }
}

// FPS cap persistence helpers
export function getFxCapKey(): string {
  return 'fxCap:v1';
}

export function saveFxCap(value: number | null): void {
  try {
    if (value == null) {
      localStorage.setItem(getFxCapKey(), 'off');
    } else {
      localStorage.setItem(getFxCapKey(), String(value));
    }
  } catch {
    // ignore
  }
}

export function loadFxCap(): number | null {
  try {
    const v = localStorage.getItem(getFxCapKey());
    if (!v || v === 'off') return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function clearFxCap(): void {
  try {
    localStorage.removeItem(getFxCapKey());
  } catch {
    // ignore
  }
}
