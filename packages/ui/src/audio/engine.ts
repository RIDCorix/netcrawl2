/**
 * AudioEngine — singleton Web Audio API manager for BGM and SFX.
 *
 * Lazily creates the AudioContext on the first user interaction to comply
 * with browser autoplay policies.
 */

const FADE_DURATION = 1.5; // seconds

export class AudioEngine {
  private static _instance: AudioEngine | null = null;

  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  private _bgmVolume = 0.5;
  private _sfxVolume = 0.7;
  private _muted = false;
  private _prevBgmVolume = 0.5;
  private _prevSfxVolume = 0.7;

  // Current BGM state
  private currentTrackId: string | null = null;
  private bgmSources: AudioBufferSourceNode[] = [];
  private bgmOscillators: OscillatorNode[] = [];
  private bgmGainNodes: GainNode[] = [];
  private bgmSchedulerHandle: number | null = null;
  private bgmStopCallback: (() => void) | null = null;
  private _bgmPaused = false;
  private _bgmPauseTime = 0;

  private constructor() {}

  static get instance(): AudioEngine {
    if (!AudioEngine._instance) {
      AudioEngine._instance = new AudioEngine();
    }
    return AudioEngine._instance;
  }

  /** Ensure the AudioContext exists (call from a user-gesture handler). */
  ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);

      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = this._bgmVolume;
      this.bgmGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this._sfxVolume;
      this.sfxGain.connect(this.masterGain);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  get bgmGainNode(): GainNode | null {
    return this.bgmGain;
  }

  get sfxGainNode(): GainNode | null {
    return this.sfxGain;
  }

  get bgmVolume(): number {
    return this._bgmVolume;
  }

  get sfxVolume(): number {
    return this._sfxVolume;
  }

  get muted(): boolean {
    return this._muted;
  }

  get currentBgmTrack(): string | null {
    return this.currentTrackId;
  }

  get isBgmPaused(): boolean {
    return this._bgmPaused;
  }

  // ─── Volume ────────────────────────────────────────────

  setBgmVolume(v: number): void {
    this._bgmVolume = Math.max(0, Math.min(1, v));
    if (this.bgmGain && !this._muted) {
      this.bgmGain.gain.value = this._bgmVolume;
    }
  }

  setSfxVolume(v: number): void {
    this._sfxVolume = Math.max(0, Math.min(1, v));
    if (this.sfxGain && !this._muted) {
      this.sfxGain.gain.value = this._sfxVolume;
    }
  }

  mute(): void {
    if (this._muted) return;
    this._muted = true;
    this._prevBgmVolume = this._bgmVolume;
    this._prevSfxVolume = this._sfxVolume;
    if (this.bgmGain) this.bgmGain.gain.value = 0;
    if (this.sfxGain) this.sfxGain.gain.value = 0;
  }

  unmute(): void {
    if (!this._muted) return;
    this._muted = false;
    if (this.bgmGain) this.bgmGain.gain.value = this._prevBgmVolume;
    if (this.sfxGain) this.sfxGain.gain.value = this._prevSfxVolume;
  }

  toggleMute(): void {
    if (this._muted) this.unmute();
    else this.mute();
  }

  // ─── BGM ───────────────────────────────────────────────

  /**
   * Play a BGM track. If a track is already playing, crossfade to the new one.
   * `startFn` is called with the AudioContext and the BGM GainNode;
   * it should return a cleanup function.
   */
  playBgm(
    trackId: string,
    startFn: (ctx: AudioContext, dest: GainNode) => (() => void),
  ): void {
    const ctx = this.ensureContext();
    if (!this.bgmGain) return;

    // If already playing the same track, do nothing
    if (this.currentTrackId === trackId && !this._bgmPaused) return;

    // Crossfade: fade out old
    if (this.currentTrackId) {
      this._fadeOutAndStop();
    }

    this._bgmPaused = false;

    // Create a sub-gain for this track so we can fade it in
    const trackGain = ctx.createGain();
    trackGain.gain.setValueAtTime(0, ctx.currentTime);
    trackGain.gain.linearRampToValueAtTime(1, ctx.currentTime + FADE_DURATION);
    trackGain.connect(this.bgmGain);

    this.bgmGainNodes = [trackGain];
    this.currentTrackId = trackId;

    const cleanup = startFn(ctx, trackGain);
    this.bgmStopCallback = cleanup;
  }

  stopBgm(): void {
    this._fadeOutAndStop();
    this.currentTrackId = null;
    this._bgmPaused = false;
  }

  pauseBgm(): void {
    if (!this.ctx || this._bgmPaused) return;
    this._bgmPaused = true;
    this._bgmPauseTime = this.ctx.currentTime;
    this.ctx.suspend();
  }

  resumeBgm(): void {
    if (!this.ctx || !this._bgmPaused) return;
    this._bgmPaused = false;
    this.ctx.resume();
  }

  /**
   * Play a one-shot SFX.
   * `sfxFn` receives the AudioContext and the SFX gain node and is expected
   * to schedule all its own nodes.
   */
  playSfx(sfxFn: (ctx: AudioContext, dest: GainNode) => void): void {
    const ctx = this.ensureContext();
    if (!this.sfxGain) return;
    sfxFn(ctx, this.sfxGain);
  }

  // ─── Internal ──────────────────────────────────────────

  private _fadeOutAndStop(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    for (const g of this.bgmGainNodes) {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0, now + FADE_DURATION);
    }

    // Schedule cleanup after fade
    const cb = this.bgmStopCallback;
    const nodes = [...this.bgmGainNodes];
    setTimeout(() => {
      cb?.();
      for (const g of nodes) {
        try { g.disconnect(); } catch { /* already disconnected */ }
      }
    }, FADE_DURATION * 1000 + 100);

    this.bgmGainNodes = [];
    this.bgmStopCallback = null;
  }
}

export const audioEngine = AudioEngine.instance;
