/**
 * Procedural chiptune-style sound effects using Web Audio API.
 *
 * Each function takes an AudioContext and a destination GainNode,
 * creates its own short-lived oscillators / noise sources, and
 * cleans up automatically.
 */

// ─── Helpers ─────────────────────────────────────────────

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function createNoise(ctx: AudioContext, duration: number): AudioBufferSourceNode {
  const len = Math.ceil(ctx.sampleRate * duration);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

function playTone(
  ctx: AudioContext,
  dest: AudioNode,
  freq: number,
  startTime: number,
  duration: number,
  wave: OscillatorType = 'square',
  vol = 0.15,
): OscillatorNode {
  const osc = ctx.createOscillator();
  osc.type = wave;
  osc.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, startTime);
  g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(g);
  g.connect(dest);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
  return osc;
}

// ─── SFX definitions ────────────────────────────────────

/** Short high-frequency blip (UI button click) */
export function click(ctx: AudioContext, dest: GainNode): void {
  const t = ctx.currentTime;
  playTone(ctx, dest, 1200, t, 0.05, 'square', 0.08);
}

/** Very subtle, quiet tick */
export function hover(ctx: AudioContext, dest: GainNode): void {
  const t = ctx.currentTime;
  playTone(ctx, dest, 2000, t, 0.03, 'sine', 0.03);
}

/** Rising sweep + confirmation tone */
export function deploy(ctx: AudioContext, dest: GainNode): void {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(200, t);
  osc.frequency.exponentialRampToValueAtTime(800, t + 0.2);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  osc.connect(g);
  g.connect(dest);
  osc.start(t);
  osc.stop(t + 0.35);

  // Confirmation beep
  playTone(ctx, dest, 880, t + 0.25, 0.15, 'square', 0.1);
}

/** Coin-like pickup sound (quick ascending notes) */
export function collect(ctx: AudioContext, dest: GainNode): void {
  const t = ctx.currentTime;
  const notes = [72, 76, 79, 84]; // C5 E5 G5 C6
  notes.forEach((n, i) => {
    playTone(ctx, dest, midiToFreq(n), t + i * 0.05, 0.08, 'square', 0.1);
  });
}

/** Cash register / satisfying cha-ching */
export function deposit(ctx: AudioContext, dest: GainNode): void {
  const t = ctx.currentTime;
  // Bell-like tones
  playTone(ctx, dest, midiToFreq(76), t, 0.15, 'sine', 0.12);
  playTone(ctx, dest, midiToFreq(83), t + 0.08, 0.2, 'sine', 0.1);

  // High shimmer noise
  const noise = createNoise(ctx, 0.08);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 6000;
  filter.Q.value = 5;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.06, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  noise.connect(filter);
  filter.connect(g);
  g.connect(dest);
  noise.start(t + 0.05);
  noise.stop(t + 0.2);
}

/** Metallic hammering + sparkle */
export function craft(ctx: AudioContext, dest: GainNode): void {
  const t = ctx.currentTime;
  // Hammer hits (metallic noise bursts)
  for (let i = 0; i < 3; i++) {
    const hitTime = t + i * 0.12;
    const noise = createNoise(ctx, 0.05);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 3000 + i * 500;
    filter.Q.value = 10;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.15, hitTime);
    g.gain.exponentialRampToValueAtTime(0.001, hitTime + 0.06);
    noise.connect(filter);
    filter.connect(g);
    g.connect(dest);
    noise.start(hitTime);
    noise.stop(hitTime + 0.08);
  }
  // Sparkle
  playTone(ctx, dest, midiToFreq(96), t + 0.35, 0.2, 'sine', 0.06);
  playTone(ctx, dest, midiToFreq(100), t + 0.4, 0.15, 'sine', 0.04);
}

/** Triumphant ascending fanfare (3-4 notes) */
export function levelUp(ctx: AudioContext, dest: GainNode): void {
  const t = ctx.currentTime;
  const notes = [60, 64, 67, 72]; // C E G C
  notes.forEach((n, i) => {
    playTone(ctx, dest, midiToFreq(n), t + i * 0.12, 0.25, 'square', 0.1);
    // Harmony
    playTone(ctx, dest, midiToFreq(n + 12), t + i * 0.12, 0.2, 'sine', 0.05);
  });
}

/** Achievement jingle (5-6 note melody) */
export function questComplete(ctx: AudioContext, dest: GainNode): void {
  const t = ctx.currentTime;
  const notes = [67, 69, 71, 72, 76, 79]; // G A B C E G
  notes.forEach((n, i) => {
    const time = t + i * 0.1;
    playTone(ctx, dest, midiToFreq(n), time, 0.2, 'square', 0.08);
    playTone(ctx, dest, midiToFreq(n + 12), time, 0.15, 'triangle', 0.04);
  });
  // Final shimmer
  playTone(ctx, dest, midiToFreq(84), t + 0.6, 0.5, 'sine', 0.06);
}

/** Low buzzer / descending tone */
export function error(ctx: AudioContext, dest: GainNode): void {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(300, t);
  osc.frequency.exponentialRampToValueAtTime(100, t + 0.3);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  osc.connect(g);
  g.connect(dest);
  osc.start(t);
  osc.stop(t + 0.4);

  // Second buzz
  playTone(ctx, dest, 90, t + 0.15, 0.25, 'square', 0.08);
}

/** Gentle 2-note chime */
export function notification(ctx: AudioContext, dest: GainNode): void {
  const t = ctx.currentTime;
  playTone(ctx, dest, midiToFreq(76), t, 0.2, 'sine', 0.1); // E5
  playTone(ctx, dest, midiToFreq(79), t + 0.15, 0.3, 'sine', 0.08); // G5
}

/** Key turning + door opening sweep */
export function unlock(ctx: AudioContext, dest: GainNode): void {
  const t = ctx.currentTime;
  // Key turning clicks
  for (let i = 0; i < 3; i++) {
    const noise = createNoise(ctx, 0.02);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.1, t + i * 0.06);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.03);
    noise.connect(g);
    g.connect(dest);
    noise.start(t + i * 0.06);
    noise.stop(t + i * 0.06 + 0.04);
  }
  // Opening sweep
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(300, t + 0.2);
  osc.frequency.exponentialRampToValueAtTime(1200, t + 0.5);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.1, t + 0.2);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
  osc.connect(g);
  g.connect(dest);
  osc.start(t + 0.2);
  osc.stop(t + 0.6);
}

/** Dark distorted pulse */
export function infection(ctx: AudioContext, dest: GainNode): void {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(80, t);
  osc.frequency.setValueAtTime(60, t + 0.1);
  osc.frequency.setValueAtTime(90, t + 0.2);

  // Distortion via waveshaper
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i / 128) - 1;
    curve[i] = Math.tanh(x * 4);
  }
  shaper.curve = curve;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.15, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

  osc.connect(shaper);
  shaper.connect(g);
  g.connect(dest);
  osc.start(t);
  osc.stop(t + 0.4);
}

/** Healing/cleansing ascending shimmer */
export function repair(ctx: AudioContext, dest: GainNode): void {
  const t = ctx.currentTime;
  const notes = [72, 76, 79, 84, 88]; // C E G C E (ascending)
  notes.forEach((n, i) => {
    const time = t + i * 0.06;
    playTone(ctx, dest, midiToFreq(n), time, 0.3 - i * 0.03, 'sine', 0.06);
  });
  // Shimmer overlay
  playTone(ctx, dest, midiToFreq(91), t + 0.2, 0.4, 'sine', 0.03);
}

/** Pick hitting rock (noise burst + low thud) */
export function mine(ctx: AudioContext, dest: GainNode): void {
  const t = ctx.currentTime;
  // Impact noise
  const noise = createNoise(ctx, 0.06);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2000;
  filter.Q.value = 3;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.2, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  noise.connect(filter);
  filter.connect(g);
  g.connect(dest);
  noise.start(t);
  noise.stop(t + 0.1);

  // Low thud
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.15, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  osc.connect(g2);
  g2.connect(dest);
  osc.start(t);
  osc.stop(t + 0.15);
}

/** Whoosh/swipe sound */
export function move(ctx: AudioContext, dest: GainNode): void {
  const t = ctx.currentTime;
  const noise = createNoise(ctx, 0.15);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(500, t);
  filter.frequency.exponentialRampToValueAtTime(4000, t + 0.08);
  filter.frequency.exponentialRampToValueAtTime(800, t + 0.15);
  filter.Q.value = 2;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(0.1, t + 0.04);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

  noise.connect(filter);
  filter.connect(g);
  g.connect(dest);
  noise.start(t);
  noise.stop(t + 0.2);
}

// ─── SFX registry (for use with audioEngine.playSfx) ────

export type SfxId =
  | 'click'
  | 'hover'
  | 'deploy'
  | 'collect'
  | 'deposit'
  | 'craft'
  | 'levelUp'
  | 'questComplete'
  | 'error'
  | 'notification'
  | 'unlock'
  | 'infection'
  | 'repair'
  | 'mine'
  | 'move';

export const SFX_REGISTRY: Record<SfxId, (ctx: AudioContext, dest: GainNode) => void> = {
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
};

/**
 * Convenience: play a named SFX through the AudioEngine.
 */
export function playSfx(id: SfxId): void {
  import('./engine').then(({ audioEngine }) => {
    const fn = SFX_REGISTRY[id];
    if (fn) {
      audioEngine.playSfx(fn);
    }
  });
}
