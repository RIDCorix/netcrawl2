import { useEffect, useSyncExternalStore } from 'react';

/**
 * Global tracker for Ctrl/Cmd pressed state.
 * Single window-level listener shared by every subscriber.
 */
let ctrlDown = false;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function ensureGlobalListener() {
  if (typeof window === 'undefined') return;
  if ((ensureGlobalListener as any)._installed) return;
  (ensureGlobalListener as any)._installed = true;

  const onDown = (e: KeyboardEvent) => {
    const next = e.ctrlKey || e.metaKey;
    if (next !== ctrlDown) { ctrlDown = next; notify(); }
  };
  const onUp = (e: KeyboardEvent) => {
    const next = e.ctrlKey || e.metaKey;
    if (next !== ctrlDown) { ctrlDown = next; notify(); }
  };
  const onBlur = () => { if (ctrlDown) { ctrlDown = false; notify(); } };
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  window.addEventListener('blur', onBlur);
}

function subscribe(l: () => void) {
  ensureGlobalListener();
  listeners.add(l);
  return () => { listeners.delete(l); };
}

function getSnapshot() { return ctrlDown; }

/** True while either Ctrl or Cmd (Meta) is currently held. */
export function useCtrlOrCmd(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Returns 'cmd' on macOS, 'ctrl' elsewhere. Static per session. */
export function getModifierLabel(): 'cmd' | 'ctrl' {
  if (typeof navigator === 'undefined') return 'ctrl';
  return /mac/i.test(navigator.platform) ? 'cmd' : 'ctrl';
}

/**
 * Install a one-shot effect that fires `onTrigger()` whenever Ctrl/Cmd
 * becomes pressed while `enabled` is true. Use for hover cells.
 */
export function useCtrlTrigger(enabled: boolean, onTrigger: () => void) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.repeat) {
        onTrigger();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, onTrigger]);
}
