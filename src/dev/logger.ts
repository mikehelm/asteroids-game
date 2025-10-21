// Tiny dev logger module (no React deps). Behavior matches Game.tsx inline banner.

// Resolve GAME_MODE from Node-style process if present
// Type narrowed to avoid bringing in @types/node
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type NodeProc = { env?: { GAME_MODE?: string } };

export const nodeGameMode: string | undefined =
  ('process' in globalThis ? (globalThis as unknown as { process?: NodeProc }).process?.env?.GAME_MODE : undefined);

export const DEV_MODE: boolean =
  ((import.meta.env?.VITE_ENV as string | undefined) ?? 'local') !== 'prod' &&
  nodeGameMode !== 'production';

export function logDevBanner(): void {
  if (!DEV_MODE) return;
  // Should print once on reload if dev mode is ON
  // (VITE_ENV and GAME_MODE resolved at build/runtime)
  // If you don't see this in DevTools Console, the guard is false.
  // eslint-disable-next-line no-console
  console.log('Dev logger active', {
    VITE_ENV: import.meta.env?.VITE_ENV,
    GAME_MODE: nodeGameMode,
  });
}

// Verbose dev flag (opt-in via VITE_DEV_VERBOSE=1)
export const DEV_VERBOSE: boolean = DEV_MODE && String(import.meta.env?.VITE_DEV_VERBOSE) === '1';

// In-memory dev log ring buffer (no React deps)
const __DEV_BUF_MAX = 500;
const __devBuf: string[] = [];
type DevListener = (lines: string[]) => void;
const __listeners = new Set<DevListener>();

function emitToListeners() {
  const snapshot = __devBuf.slice();
  __listeners.forEach((fn) => {
    try { fn(snapshot); } catch {}
  });
}

export function appendDevLine(line: string): void {
  if (!DEV_MODE) return; // Only track in DEV
  __devBuf.push(line);
  if (__devBuf.length > __DEV_BUF_MAX) {
    __devBuf.splice(0, __devBuf.length - __DEV_BUF_MAX);
  }
  emitToListeners();
}

export function getDevLines(): string[] {
  return __devBuf.slice();
}

export function onDevLog(listener: DevListener): () => void {
  __listeners.add(listener);
  return () => { __listeners.delete(listener); };
}

// No-op unless DEV_MODE && DEV_VERBOSE
export function log(tag: string, data?: any): void {
  if (!DEV_VERBOSE) return;
  // eslint-disable-next-line no-console
  console.info(`[${tag}]`, data);
  try { appendDevLine(`[${tag}] ${typeof data === 'string' ? data : JSON.stringify(data)}`); } catch {}
}

// Print once per session when DEV_MODE is true (ignores DEV_VERBOSE)
const __onceKeys = new Set<string>();
export function logOnce(key: string, tag: string, data?: any): void {
  if (!DEV_MODE) return;
  if (__onceKeys.has(key)) return;
  __onceKeys.add(key);
  // eslint-disable-next-line no-console
  console.info(`[${tag}]`, data);
  try { appendDevLine(`[${tag}] ${typeof data === 'string' ? data : JSON.stringify(data)}`); } catch {}
}

// Throttled logger: prints at most once per ms interval when DEV_MODE && DEV_VERBOSE
const __throttleMap = new Map<string, number>();
export function logThrottle(tag: string, ms: number, dataFactory: () => any): void {
  if (!DEV_VERBOSE) return;
  const now = Date.now();
  const last = __throttleMap.get(tag) ?? 0;
  if (now - last < ms) return;
  __throttleMap.set(tag, now);
  const payload = dataFactory();
  // eslint-disable-next-line no-console
  console.info(`[${tag}]`, payload);
  try { appendDevLine(`[${tag}] ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`); } catch {}
}

// Throttle per-session frame-error logs in DEV to avoid console spam
// Keep only first 3 unique error messages; drop repeats and beyond-cap uniques
let __frameErrorUnique = 0;
const __frameErrorMaxUnique = 3;
const __frameErrorSeen = new Set<string>();
export function devFrameError(err: unknown): void {
  if (!DEV_MODE) return;
  const key = err instanceof Error ? `${err.name}:${err.message}` : String(err);
  if (__frameErrorSeen.has(key)) return; // ignore duplicates
  if (__frameErrorUnique >= __frameErrorMaxUnique) return; // cap unique
  __frameErrorSeen.add(key);
  __frameErrorUnique++;
  // eslint-disable-next-line no-console
  console.warn('[frame-error]', err);
}
