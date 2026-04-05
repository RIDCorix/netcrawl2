/**
 * Procedural BGM generator — creates ambient electronic music using
 * Web Audio API oscillators and noise.  Each "track" is a parameter set
 * that drives a small sequencer.
 *
 * Uses look-ahead scheduling: a timer fires every ~25ms and schedules
 * audio events 100ms into the future, giving the audio thread a
 * comfortable buffer.
 */

// ─── Track configuration ────────────────────────────────

export interface TrackConfig {
  id: string;
  name: string;
  tempo: number; // BPM
  scale: number[]; // semitones from root
  rootNote: number; // MIDI note number
  padWaveform: OscillatorType;
  arpWaveform: OscillatorType;
  arpPattern: number[]; // indices into scale[]
  bassEnabled: boolean;
  drumsEnabled: boolean;
  filterCutoff: number; // Hz
  reverbMix: number; // 0-1
  intensity: number; // 0-1
}

// ─── Presets ─────────────────────────────────────────────

const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10]; // natural minor
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const PHRYGIAN_SCALE = [0, 1, 3, 5, 7, 8, 10];
const DORIAN_SCALE = [0, 2, 3, 5, 7, 9, 10];
const HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11];

export const TRACK_PRESETS: Record<string, TrackConfig> = {
  default: {
    id: 'default',
    name: 'Ambient Flow',
    tempo: 85,
    scale: MINOR_SCALE,
    rootNote: 48, // C3
    padWaveform: 'sine',
    arpWaveform: 'triangle',
    arpPattern: [0, 2, 4, 2, 3, 5, 4, 2],
    bassEnabled: true,
    drumsEnabled: false,
    filterCutoff: 1200,
    reverbMix: 0.6,
    intensity: 0.3,
  },
  deep_space: {
    id: 'deep_space',
    name: 'Deep Space',
    tempo: 60,
    scale: PHRYGIAN_SCALE,
    rootNote: 36, // C2
    padWaveform: 'sine',
    arpWaveform: 'sine',
    arpPattern: [0, 4, 2, 6, 3, 5, 1, 4],
    bassEnabled: true,
    drumsEnabled: false,
    filterCutoff: 600,
    reverbMix: 0.8,
    intensity: 0.15,
  },
  neon_grid: {
    id: 'neon_grid',
    name: 'Neon Grid',
    tempo: 120,
    scale: DORIAN_SCALE,
    rootNote: 48,
    padWaveform: 'sawtooth',
    arpWaveform: 'square',
    arpPattern: [0, 0, 3, 2, 4, 4, 5, 3],
    bassEnabled: true,
    drumsEnabled: true,
    filterCutoff: 2400,
    reverbMix: 0.3,
    intensity: 0.7,
  },
  data_flow: {
    id: 'data_flow',
    name: 'Data Flow',
    tempo: 130,
    scale: MINOR_SCALE,
    rootNote: 45, // A2
    padWaveform: 'triangle',
    arpWaveform: 'square',
    arpPattern: [0, 2, 0, 3, 4, 2, 5, 0],
    bassEnabled: true,
    drumsEnabled: true,
    filterCutoff: 3200,
    reverbMix: 0.2,
    intensity: 0.6,
  },
  quantum_core: {
    id: 'quantum_core',
    name: 'Quantum Core',
    tempo: 100,
    scale: HARMONIC_MINOR,
    rootNote: 41, // F2
    padWaveform: 'sawtooth',
    arpWaveform: 'sawtooth',
    arpPattern: [0, 4, 2, 6, 5, 3, 1, 4],
    bassEnabled: true,
    drumsEnabled: true,
    filterCutoff: 1800,
    reverbMix: 0.5,
    intensity: 0.85,
  },
};

// ─── Helpers ─────────────────────────────────────────────

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Create a simple convolver-based reverb impulse response (synthetic).
 */
function createReverb(ctx: AudioContext, duration: number, decay: number): ConvolverNode {
  const rate = ctx.sampleRate;
  const length = rate * duration;
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = impulse;
  return conv;
}

// ─── Sequencer ───────────────────────────────────────────

const LOOK_AHEAD = 0.1; // seconds
const SCHEDULE_INTERVAL = 25; // ms

/**
 * Start playing a procedural BGM track.  Returns a cleanup function.
 */
export function startTrack(
  ctx: AudioContext,
  dest: GainNode,
  trackId: string,
): () => void {
  const cfg = TRACK_PRESETS[trackId];
  if (!cfg) {
    console.warn(`[bgm] Unknown track: ${trackId}`);
    return () => {};
  }

  const bpm = cfg.tempo;
  const beatDur = 60 / bpm; // seconds per beat
  const sixteenth = beatDur / 4;
  const barLength = beatDur * 4; // 4/4 time
  const totalBars = 16; // loop length
  const loopDuration = barLength * totalBars;

  // Reverb
  const reverb = createReverb(ctx, 2, 3);
  const reverbGain = ctx.createGain();
  reverbGain.gain.value = cfg.reverbMix;
  reverb.connect(reverbGain);
  reverbGain.connect(dest);

  const dryGain = ctx.createGain();
  dryGain.gain.value = 1 - cfg.reverbMix * 0.5;
  dryGain.connect(dest);

  // Master filter
  const masterFilter = ctx.createBiquadFilter();
  masterFilter.type = 'lowpass';
  masterFilter.frequency.value = cfg.filterCutoff;
  masterFilter.Q.value = 1;
  masterFilter.connect(dryGain);
  masterFilter.connect(reverb);

  // Track active nodes for cleanup
  const activeNodes: (OscillatorNode | AudioBufferSourceNode)[] = [];
  let alive = true;

  // ─── Pad layer ──────────────────────────────────
  function schedulePad(time: number): void {
    const chordDegrees = [0, 2, 4]; // root triad from scale
    for (const deg of chordDegrees) {
      const note = cfg.rootNote + 12 + cfg.scale[deg % cfg.scale.length];
      const osc = ctx.createOscillator();
      osc.type = cfg.padWaveform;
      osc.frequency.value = midiToFreq(note);
      // Slight detune for warmth
      osc.detune.value = (Math.random() - 0.5) * 8;

      const g = ctx.createGain();
      const vol = 0.06 * cfg.intensity;
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(vol, time + barLength * 0.5);
      g.gain.setValueAtTime(vol, time + barLength * 3);
      g.gain.linearRampToValueAtTime(0, time + barLength * 4 - 0.05);

      osc.connect(g);
      g.connect(masterFilter);
      osc.start(time);
      osc.stop(time + barLength * 4);
      activeNodes.push(osc);
    }
  }

  // ─── Arp layer ──────────────────────────────────
  function scheduleArpNote(time: number, stepIndex: number): void {
    const patIdx = stepIndex % cfg.arpPattern.length;
    const scaleDeg = cfg.arpPattern[patIdx];
    const octaveShift = Math.floor(scaleDeg / cfg.scale.length) * 12;
    const note = cfg.rootNote + 24 + cfg.scale[scaleDeg % cfg.scale.length] + octaveShift;

    const osc = ctx.createOscillator();
    osc.type = cfg.arpWaveform;
    osc.frequency.value = midiToFreq(note);

    const g = ctx.createGain();
    const vol = 0.08 * cfg.intensity;
    const dur = sixteenth * 0.8;
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);

    osc.connect(g);
    g.connect(masterFilter);
    osc.start(time);
    osc.stop(time + dur + 0.05);
    activeNodes.push(osc);
  }

  // ─── Bass layer ─────────────────────────────────
  function scheduleBassNote(time: number, bar: number): void {
    if (!cfg.bassEnabled) return;
    // Simple root/fifth pattern
    const pattern = [0, 0, 4, 3]; // scale degrees per bar
    const deg = pattern[bar % pattern.length];
    const note = cfg.rootNote + cfg.scale[deg % cfg.scale.length];

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = midiToFreq(note);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    filter.Q.value = 5;

    const g = ctx.createGain();
    const vol = 0.1 * cfg.intensity;
    g.gain.setValueAtTime(vol, time);
    g.gain.setValueAtTime(vol, time + beatDur * 3.5);
    g.gain.exponentialRampToValueAtTime(0.001, time + beatDur * 4 - 0.05);

    osc.connect(filter);
    filter.connect(g);
    g.connect(masterFilter);
    osc.start(time);
    osc.stop(time + beatDur * 4);
    activeNodes.push(osc);
  }

  // ─── Drums layer ────────────────────────────────
  function createNoiseBuffer(): AudioBuffer {
    const len = ctx.sampleRate * 0.1;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  let noiseBuf: AudioBuffer | null = null;

  function scheduleKick(time: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(30, time + 0.12);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3 * cfg.intensity, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

    osc.connect(g);
    g.connect(masterFilter);
    osc.start(time);
    osc.stop(time + 0.25);
    activeNodes.push(osc);
  }

  function scheduleHiHat(time: number, open: boolean): void {
    if (!noiseBuf) noiseBuf = createNoiseBuffer();
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 8000;

    const g = ctx.createGain();
    const dur = open ? 0.12 : 0.04;
    g.gain.setValueAtTime(0.12 * cfg.intensity, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);

    src.connect(filter);
    filter.connect(g);
    g.connect(masterFilter);
    src.start(time);
    src.stop(time + dur + 0.01);
    activeNodes.push(src);
  }

  function scheduleDrumBar(time: number, bar: number): void {
    if (!cfg.drumsEnabled) return;
    // Kick on beats 1, 3
    scheduleKick(time);
    scheduleKick(time + beatDur * 2);
    // Hi-hat on every 8th note
    for (let i = 0; i < 8; i++) {
      const open = i % 4 === 2;
      scheduleHiHat(time + (beatDur / 2) * i, open);
    }
  }

  // ─── Scheduling loop ───────────────────────────

  const startTime = ctx.currentTime + 0.05;
  let nextNoteTime = startTime;
  let currentStep = 0; // in 16th notes
  let currentBar = 0;

  const stepsPerBar = 16; // 16 sixteenth notes per bar
  const totalSteps = stepsPerBar * totalBars;

  function schedule(): void {
    if (!alive) return;
    const horizon = ctx.currentTime + LOOK_AHEAD;

    while (nextNoteTime < horizon) {
      const stepInBar = currentStep % stepsPerBar;

      // Bar start events
      if (stepInBar === 0) {
        scheduleBassNote(nextNoteTime, currentBar);
        scheduleDrumBar(nextNoteTime, currentBar);

        // Pad every 4 bars
        if (currentBar % 4 === 0) {
          schedulePad(nextNoteTime);
        }
      }

      // Arp on every other 16th note (8th notes)
      if (stepInBar % 2 === 0) {
        scheduleArpNote(nextNoteTime, currentStep / 2);
      }

      // Advance
      nextNoteTime += sixteenth;
      currentStep++;
      if (currentStep >= totalSteps) {
        currentStep = 0;
        currentBar = 0;
      } else {
        currentBar = Math.floor(currentStep / stepsPerBar);
      }
    }
  }

  const timer = setInterval(schedule, SCHEDULE_INTERVAL);
  schedule(); // initial fill

  // Cleanup
  return () => {
    alive = false;
    clearInterval(timer);
    for (const n of activeNodes) {
      try { n.stop(); } catch { /* already stopped */ }
      try { n.disconnect(); } catch { /* ok */ }
    }
    activeNodes.length = 0;
    try { masterFilter.disconnect(); } catch { /* ok */ }
    try { reverb.disconnect(); } catch { /* ok */ }
    try { reverbGain.disconnect(); } catch { /* ok */ }
    try { dryGain.disconnect(); } catch { /* ok */ }
  };
}

/**
 * Convenience: start a track through the AudioEngine.
 */
export function playTrack(trackId: string): void {
  import('./engine').then(({ audioEngine }) => {
    audioEngine.playBgm(trackId, (ctx: AudioContext, dest: GainNode) =>
      startTrack(ctx, dest, trackId),
    );
  });
}
