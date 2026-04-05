import { useCallback, useRef } from 'react';
import { useGameStore } from '../store/gameStore';

/** Lazy-initialized AudioContext for SFX */
let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function getVolume(): number {
  return useGameStore.getState().settings.sfxVolume / 100;
}

/** Quick oscillator helper */
function osc(
  ctx: AudioContext, gain: GainNode,
  freq: number, type: OscillatorType,
  startTime: number, duration: number,
  startGain = 0.3, endGain = 0,
) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, startTime);
  g.gain.setValueAtTime(startGain * getVolume(), startTime);
  g.gain.exponentialRampToValueAtTime(Math.max(endGain, 0.001) * getVolume(), startTime + duration);
  o.connect(g).connect(gain);
  o.start(startTime);
  o.stop(startTime + duration);
}

/** Noise burst helper */
function noise(ctx: AudioContext, gain: GainNode, startTime: number, duration: number, volume = 0.1) {
  const bufSize = ctx.sampleRate * duration;
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.setValueAtTime(volume * getVolume(), startTime);
  g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  src.connect(g).connect(gain);
  src.start(startTime);
  src.stop(startTime + duration);
}

// ── SFX definitions ──────────────────────────────────────────────

function playClick() {
  const ctx = getCtx();
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const t = ctx.currentTime;
  osc(ctx, master, 800, 'sine', t, 0.06, 0.2);
}

function playHover() {
  const ctx = getCtx();
  const master = ctx.createGain();
  master.connect(ctx.destination);
  osc(ctx, master, 1200, 'sine', ctx.currentTime, 0.03, 0.05);
}

function playDeploy() {
  const ctx = getCtx();
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(200, t);
  o.frequency.exponentialRampToValueAtTime(800, t + 0.2);
  g.gain.setValueAtTime(0.15 * getVolume(), t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.3);
  osc(ctx, master, 600, 'sine', t + 0.2, 0.15, 0.2);
}

function playCollect() {
  const ctx = getCtx();
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const t = ctx.currentTime;
  osc(ctx, master, 523, 'sine', t, 0.08, 0.25);
  osc(ctx, master, 659, 'sine', t + 0.06, 0.08, 0.25);
  osc(ctx, master, 784, 'sine', t + 0.12, 0.1, 0.2);
}

function playDeposit() {
  const ctx = getCtx();
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const t = ctx.currentTime;
  osc(ctx, master, 440, 'triangle', t, 0.1, 0.2);
  osc(ctx, master, 554, 'triangle', t + 0.07, 0.1, 0.2);
  osc(ctx, master, 659, 'triangle', t + 0.14, 0.15, 0.25);
  noise(ctx, master, t + 0.14, 0.08, 0.05);
}

function playCraft() {
  const ctx = getCtx();
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const t = ctx.currentTime;
  noise(ctx, master, t, 0.05, 0.15);
  noise(ctx, master, t + 0.1, 0.05, 0.12);
  osc(ctx, master, 1200, 'sine', t + 0.15, 0.15, 0.15);
  osc(ctx, master, 1500, 'sine', t + 0.2, 0.15, 0.1);
}

function playLevelUp() {
  const ctx = getCtx();
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const t = ctx.currentTime;
  const notes = [523, 659, 784, 1047];
  notes.forEach((f, i) => osc(ctx, master, f, 'sine', t + i * 0.12, 0.2, 0.25));
}

function playQuestComplete() {
  const ctx = getCtx();
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const t = ctx.currentTime;
  const notes = [523, 659, 784, 659, 784, 1047];
  notes.forEach((f, i) => osc(ctx, master, f, 'triangle', t + i * 0.1, 0.18, 0.2));
}

function playError() {
  const ctx = getCtx();
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const t = ctx.currentTime;
  osc(ctx, master, 200, 'sawtooth', t, 0.15, 0.15);
  osc(ctx, master, 150, 'sawtooth', t + 0.1, 0.2, 0.12);
}

function playNotification() {
  const ctx = getCtx();
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const t = ctx.currentTime;
  osc(ctx, master, 880, 'sine', t, 0.1, 0.15);
  osc(ctx, master, 1100, 'sine', t + 0.12, 0.15, 0.12);
}

function playUnlock() {
  const ctx = getCtx();
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(300, t);
  o.frequency.exponentialRampToValueAtTime(1200, t + 0.3);
  g.gain.setValueAtTime(0.2 * getVolume(), t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.4);
}

function playMine() {
  const ctx = getCtx();
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const t = ctx.currentTime;
  noise(ctx, master, t, 0.04, 0.2);
  osc(ctx, master, 120, 'sine', t, 0.08, 0.15);
}

function playMove() {
  const ctx = getCtx();
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(600, t);
  o.frequency.exponentialRampToValueAtTime(400, t + 0.1);
  g.gain.setValueAtTime(0.08 * getVolume(), t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.1);
}

// ── SFX map ──────────────────────────────────────────────────────

const SFX_MAP: Record<string, () => void> = {
  click: playClick,
  hover: playHover,
  deploy: playDeploy,
  collect: playCollect,
  deposit: playDeposit,
  craft: playCraft,
  levelUp: playLevelUp,
  questComplete: playQuestComplete,
  error: playError,
  notification: playNotification,
  unlock: playUnlock,
  mine: playMine,
  move: playMove,
};

export function playSfx(id: keyof typeof SFX_MAP) {
  const vol = useGameStore.getState().settings.sfxVolume;
  if (vol === 0) return;
  try { SFX_MAP[id]?.(); } catch {}
}

/** React hook for SFX — returns a stable play function */
export function useSfx() {
  const play = useCallback((id: string) => {
    playSfx(id as keyof typeof SFX_MAP);
  }, []);
  return play;
}
