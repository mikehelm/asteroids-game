export type UiEvent =
  | { type: 'level-up'; stage: number }
  | { type: 'alien-kill'; id?: string };

export type UiEventListener = (e: UiEvent) => void;

const listeners = new Set<UiEventListener>();

export function onUiEvent(fn: UiEventListener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitUiEvent(e: UiEvent) {
  for (const fn of Array.from(listeners)) fn(e);
}
