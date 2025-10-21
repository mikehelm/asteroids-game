export type TitleOverlay = { id: number; text: string; start: number };

export type TitleOverlayRefs = {
  listRef: { current: TitleOverlay[] };
  nextIdRef: { current: number };
  suppressUntilRef?: { current: number };
};

export function enqueueTitle(refs: TitleOverlayRefs, text: string, delayMs = 0): void {
  const { listRef, nextIdRef } = refs;
  window.setTimeout(() => {
    listRef.current.push({ id: nextIdRef.current++, text, start: performance.now() });
  }, delayMs);
}

export function shouldSuppress(refs: TitleOverlayRefs): boolean {
  const now = performance.now();
  const sup = refs.suppressUntilRef?.current ?? 0;
  return now < sup;
}

export function seenRecently(refs: TitleOverlayRefs, fullText: string, ms: number): boolean {
  const now = performance.now();
  return refs.listRef.current.some(o => o.text === fullText && (now - o.start) < ms);
}
