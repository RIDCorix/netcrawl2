import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { audioEngine } from '../audio/engine';
import { playTrack } from '../audio/bgm';

/**
 * Initializes audio engine and reacts to settings changes.
 * Must be mounted once at the app root level.
 */
export function useAudioInit() {
  const { settings } = useGameStore();
  const initialized = useRef(false);
  const currentTrack = useRef<string | null>(null);

  // Sync volume whenever settings change
  useEffect(() => {
    audioEngine.setBgmVolume(settings.bgmVolume / 100);
    audioEngine.setSfxVolume(settings.sfxVolume / 100);
  }, [settings.bgmVolume, settings.sfxVolume]);

  // Start BGM on first user interaction
  useEffect(() => {
    if (initialized.current) {
      // Already initialized — just change track if needed
      if (settings.currentTrack !== currentTrack.current) {
        currentTrack.current = settings.currentTrack;
        playTrack(settings.currentTrack);
      }
      return;
    }

    const startAudio = () => {
      if (initialized.current) return;
      initialized.current = true;
      currentTrack.current = settings.currentTrack;

      audioEngine.ensureContext();
      audioEngine.setBgmVolume(settings.bgmVolume / 100);
      audioEngine.setSfxVolume(settings.sfxVolume / 100);
      playTrack(settings.currentTrack);

      document.removeEventListener('click', startAudio);
      document.removeEventListener('keydown', startAudio);
    };

    document.addEventListener('click', startAudio);
    document.addEventListener('keydown', startAudio);
    return () => {
      document.removeEventListener('click', startAudio);
      document.removeEventListener('keydown', startAudio);
    };
  }, [settings.currentTrack, settings.bgmVolume, settings.sfxVolume]);
}
