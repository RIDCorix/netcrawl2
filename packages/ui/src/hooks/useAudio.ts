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
  const currentTrack = useRef('');

  // Sync volume whenever settings change
  useEffect(() => {
    audioEngine.setBgmVolume(settings.bgmVolume / 100);
    audioEngine.setSfxVolume(settings.sfxVolume / 100);
  }, [settings.bgmVolume, settings.sfxVolume]);

  // Start/change BGM track
  useEffect(() => {
    if (settings.currentTrack !== currentTrack.current) {
      currentTrack.current = settings.currentTrack;
      // Start BGM on first user interaction (click anywhere)
      if (!initialized.current) {
        const startAudio = () => {
          audioEngine.ensureContext();
          audioEngine.setBgmVolume(settings.bgmVolume / 100);
          audioEngine.setSfxVolume(settings.sfxVolume / 100);
          playTrack(settings.currentTrack);
          initialized.current = true;
          document.removeEventListener('click', startAudio);
          document.removeEventListener('keydown', startAudio);
        };
        document.addEventListener('click', startAudio, { once: false });
        document.addEventListener('keydown', startAudio, { once: false });
        return () => {
          document.removeEventListener('click', startAudio);
          document.removeEventListener('keydown', startAudio);
        };
      } else {
        playTrack(settings.currentTrack);
      }
    }
  }, [settings.currentTrack, settings.bgmVolume, settings.sfxVolume]);
}
