/**
 * NetCrawl2 Audio System
 *
 * Fully procedural audio — no external files required.
 * All BGM and SFX are generated at runtime using Web Audio API.
 */

// Engine (singleton)
export { AudioEngine, audioEngine } from './engine';

// BGM generator
export { startTrack, playTrack, TRACK_PRESETS } from './bgm';
export type { TrackConfig } from './bgm';

// SFX generator
export { SFX_REGISTRY, playSfx } from './sfx';
export {
  click,
  hover,
  deploy,
  collect,
  deposit,
  craft,
  levelUp,
  questComplete,
  error,
  notification,
  unlock,
  infection,
  repair,
  mine,
  move,
} from './sfx';
export type { SfxId } from './sfx';

// Music packs
export {
  MUSIC_PACKS,
  MUSIC_PACK_ORDER,
  getAllTrackIds,
  isFreePack,
} from './musicPacks';
export type { MusicPack } from './musicPacks';
