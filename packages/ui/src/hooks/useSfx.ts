import { useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import { playSfx as audioPlaySfx, type SfxId } from '../audio/sfx';

/**
 * Play an SFX. Can be called outside React components.
 */
export function playSfx(id: SfxId) {
  const vol = useGameStore.getState().settings.sfxVolume;
  if (vol === 0) return;
  audioPlaySfx(id);
}

/** React hook — returns a stable play function */
export function useSfx() {
  return useCallback((id: string) => playSfx(id as SfxId), []);
}
