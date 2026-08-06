import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import axios from 'axios';
import { useT } from '../hooks/useT';
import { initialChapterZeroLoadState, reduceChapterZeroLoad } from '../lib/chapterZeroLoadState';
import narratorGhostUrl from '../assets/chapter0/narrator-ghost.png';

type Item = { type: string; count: number };
type TutorialState = {
  step: number;
  completed: boolean;
  expected: string | null;
  transition: string | null;
  world: {
    worker: { nodeId: string; holding: Item[]; equippedPickaxe: string; lastLog: string | null };
    mine: { drops: Item[] };
    resources: { data: number };
  };
};

const TOTAL_STEPS = 6;
const CHAR_INTERVAL_MS = 35;
const INTER_LINE_HOLD_MS = 1200;
const GLITCH_BURST_MS = 320;
const GLITCH_MIN_INTERVAL_MS = 4000;
const GLITCH_MAX_INTERVAL_MS = 7000;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function renderNarratorLine(text: string): ReactNode {
  // Highlight [bracket_fragment] tokens with the accent color / monospace.
  const parts = text.split(/(\[[^\]]+\])/g);
  return parts.map((part, idx) => {
    if (part.startsWith('[') && part.endsWith(']')) {
      return (
        <span key={idx} style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
          {part}
        </span>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

export function ChapterZeroRepl() {
  const t = useT();
  const [loadState, dispatchLoad] = useReducer(reduceChapterZeroLoad<TutorialState>, initialChapterZeroLoadState);
  const [command, setCommand] = useState('');
  const [inputError, setInputError] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const load = useCallback(() => {
    dispatchLoad({ type: 'retry' });
    axios
      .get('/api/tutorial/chapter-zero')
      .then(r => {
        dispatchLoad({ type: 'loaded', session: r.data });
        if (r.data.completed) setDismissed(true);
      })
      .catch(() => dispatchLoad({ type: 'failed' }));
  }, []);

  useEffect(load, [load]);

  const state = loadState.status === 'loaded' ? loadState.session : null;

  // Dialogue queue — each item is a fully-formed narrator line.
  const [dialogueQueue, setDialogueQueue] = useState<string[]>([]);
  const [activeMsg, setActiveMsg] = useState<string>('');
  const [charsShown, setCharsShown] = useState(0);
  const prevStepRef = useRef<number | null>(null);
  const seededRef = useRef(false);
  const seenCompletionRef = useRef(false);
  const [glitchTick, setGlitchTick] = useState(0);
  const [glitching, setGlitching] = useState(false);
  const reducedMotion = useMemo(() => prefersReducedMotion(), []);

  // Seed the queue on first load, then push ack + next hint (or outro) on each server step advance.
  useEffect(() => {
    if (!state) return;

    if (!seededRef.current) {
      seededRef.current = true;
      prevStepRef.current = state.step;
      if (state.completed) {
        seenCompletionRef.current = true;
        setDialogueQueue([
          t('tutorial.chapter_zero.outro_L1'),
          t('tutorial.chapter_zero.outro_L2'),
          t('tutorial.chapter_zero.outro_L3'),
        ]);
      } else if (state.step === 0) {
        setDialogueQueue([
          t('tutorial.chapter_zero.intro_L1'),
          t('tutorial.chapter_zero.intro_L2'),
          t('tutorial.chapter_zero.intro_L3'),
          t('tutorial.chapter_zero.hint_0'),
        ]);
      } else {
        setDialogueQueue([t(`tutorial.chapter_zero.hint_${state.step}`)]);
      }
      setGlitchTick(n => n + 1);
      return;
    }

    const prev = prevStepRef.current;
    if (prev !== null && state.step > prev) {
      const additions: string[] = [t(`tutorial.chapter_zero.ack_${prev}`)];
      if (state.completed) {
        if (!seenCompletionRef.current) {
          seenCompletionRef.current = true;
          additions.push(
            t('tutorial.chapter_zero.outro_L1'),
            t('tutorial.chapter_zero.outro_L2'),
            t('tutorial.chapter_zero.outro_L3'),
          );
        }
      } else {
        additions.push(t(`tutorial.chapter_zero.hint_${state.step}`));
      }
      setDialogueQueue(q => [...q, ...additions]);
      setGlitchTick(n => n + 1);
    }
    prevStepRef.current = state.step;
  }, [state, t]);

  // Advance to the next queued message when the display is idle.
  useEffect(() => {
    if (activeMsg === '' && dialogueQueue.length > 0) {
      const [head, ...rest] = dialogueQueue;
      setActiveMsg(head);
      setCharsShown(reducedMotion ? head.length : 0);
      setDialogueQueue(rest);
    }
  }, [activeMsg, dialogueQueue, reducedMotion]);

  // Typewriter tick.
  useEffect(() => {
    if (activeMsg === '' || reducedMotion) return;
    if (charsShown >= activeMsg.length) return;
    const id = window.setTimeout(() => setCharsShown(n => Math.min(n + 1, activeMsg.length)), CHAR_INTERVAL_MS);
    return () => window.clearTimeout(id);
  }, [activeMsg, charsShown, reducedMotion]);

  // Hold briefly on a finished line before pulling the next one.
  useEffect(() => {
    if (activeMsg === '') return;
    if (charsShown < activeMsg.length) return;
    if (dialogueQueue.length === 0) return;
    const id = window.setTimeout(() => setActiveMsg(''), INTER_LINE_HOLD_MS);
    return () => window.clearTimeout(id);
  }, [activeMsg, charsShown, dialogueQueue]);

  // Periodic random glitch bursts on the narrator avatar.
  useEffect(() => {
    if (reducedMotion) return;
    let cancelled = false;
    let timerId = 0;
    const schedule = () => {
      const wait = GLITCH_MIN_INTERVAL_MS + Math.random() * (GLITCH_MAX_INTERVAL_MS - GLITCH_MIN_INTERVAL_MS);
      timerId = window.setTimeout(() => {
        if (cancelled) return;
        setGlitchTick(n => n + 1);
        schedule();
      }, wait);
    };
    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [reducedMotion]);

  // Toggle the glitching class for the burst window.
  useEffect(() => {
    if (glitchTick === 0 || reducedMotion) return;
    setGlitching(true);
    const id = window.setTimeout(() => setGlitching(false), GLITCH_BURST_MS);
    return () => window.clearTimeout(id);
  }, [glitchTick, reducedMotion]);

  // Edge flash whenever the server reports a movement transition.
  const [edgeFlashTick, setEdgeFlashTick] = useState(0);
  const [edgeFlashing, setEdgeFlashing] = useState(false);
  useEffect(() => {
    if (!state) return;
    if (state.transition === 'moved_to_mine' || state.transition === 'returned_to_hub') {
      setEdgeFlashTick(n => n + 1);
    }
  }, [state]);
  useEffect(() => {
    if (edgeFlashTick === 0) return;
    setEdgeFlashing(true);
    const id = window.setTimeout(() => setEdgeFlashing(false), 400);
    return () => window.clearTimeout(id);
  }, [edgeFlashTick]);

  if (state?.completed && dismissed) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const response = await axios.post('/api/tutorial/chapter-zero', { command });
      dispatchLoad({ type: 'loaded', session: response.data });
      setCommand('');
      setInputError(false);
    } catch {
      setInputError(true);
    }
  };

  const skipTypewriter = () => {
    if (activeMsg && charsShown < activeMsg.length) setCharsShown(activeMsg.length);
  };

  const currentNodeId = state?.world.worker.nodeId ?? 'hub';
  const stepDisplay = state ? Math.min(state.step + (state.completed ? 0 : 1), TOTAL_STEPS) : 1;
  const stepIndicator = t('tutorial.chapter_zero.step_indicator', {
    current: String(stepDisplay).padStart(2, '0'),
    total: String(TOTAL_STEPS).padStart(2, '0'),
  });
  const showContinue = Boolean(state?.completed && activeMsg === '' && dialogueQueue.length === 0);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 400,
        background: 'rgba(0,0,0,.82)',
        display: 'grid',
        placeItems: 'center',
        padding: 20,
        overflow: 'auto',
      }}
    >
      <div className="chapter0-shell">
        {loadState.status === 'failed' ? (
          <div className="chapter0-failure">
            <p role="alert" style={{ color: 'var(--danger)', lineHeight: 1.7 }}>
              {t('tutorial.chapter_zero.load_error')}
            </p>
            <button
              onClick={load}
              style={{ background: 'var(--accent)', border: 0, padding: '8px 14px', fontWeight: 800 }}
            >
              {t('tutorial.chapter_zero.retry')}
            </button>
          </div>
        ) : loadState.status === 'loading' || !state ? (
          <p style={{ color: 'var(--text-secondary)', padding: 24 }}>{t('tutorial.chapter_zero.loading')}</p>
        ) : (
          <>
            {/* LEFT: REPL */}
            <section className="chapter0-repl">
              <header className="chapter0-repl-header">
                <span className="chapter0-title">{t('tutorial.chapter_zero.title')}</span>
                <span className="chapter0-step" aria-live="polite">
                  {stepIndicator}
                </span>
              </header>

              {!state.completed && state.expected && (
                <div className="chapter0-hint-line" aria-live="polite">
                  <span style={{ color: 'var(--accent)', marginRight: 6 }}>&gt;</span>
                  <code>{state.expected}</code>
                </div>
              )}

              {!state.completed ? (
                <form onSubmit={submit} className="chapter0-form">
                  <span style={{ color: 'var(--accent)', paddingTop: 8 }}>&gt;</span>
                  <input
                    autoFocus
                    value={command}
                    onChange={e => setCommand(e.target.value)}
                    aria-label={t('tutorial.chapter_zero.input')}
                    className="chapter0-input"
                  />
                  <button
                    type="submit"
                    style={{ background: 'var(--accent)', border: 0, padding: '8px 14px', fontWeight: 800 }}
                  >
                    {t('tutorial.chapter_zero.run')}
                  </button>
                </form>
              ) : (
                showContinue && (
                  <button
                    onClick={() => setDismissed(true)}
                    style={{
                      background: 'var(--accent)',
                      border: 0,
                      padding: '10px 16px',
                      fontWeight: 800,
                      marginTop: 8,
                    }}
                  >
                    {t('tutorial.chapter_zero.continue')}
                  </button>
                )
              )}

              {inputError && (
                <p role="alert" className="chapter0-error-msg">
                  {t('tutorial.chapter_zero.error')}
                </p>
              )}

              <div className="chapter0-state-row">
                <div className="chapter0-state-cell">
                  <span className="chapter0-state-label">{t('tutorial.chapter_zero.worker')}</span>
                  <span>{state.world.worker.nodeId}</span>
                  <span className="chapter0-state-sub">
                    {state.world.worker.lastLog === 'worker_ready' || state.world.worker.lastLog === 'Worker ready'
                      ? t('tutorial.chapter_zero.worker_ready')
                      : state.world.worker.lastLog || '—'}
                  </span>
                </div>
                <div className="chapter0-state-cell">
                  <span className="chapter0-state-label">{t('tutorial.chapter_zero.items')}</span>
                  <span>
                    {t('tutorial.chapter_zero.held').replace(
                      '{count}',
                      String(state.world.worker.holding.reduce((sum, item) => sum + item.count, 0)),
                    )}
                  </span>
                  <span className="chapter0-state-sub">
                    {t('tutorial.chapter_zero.drops').replace(
                      '{count}',
                      String(state.world.mine.drops.reduce((sum, item) => sum + item.count, 0)),
                    )}
                  </span>
                </div>
                <div className="chapter0-state-cell">
                  <span className="chapter0-state-label">{t('tutorial.chapter_zero.resources')}</span>
                  <span>{t('tutorial.chapter_zero.data').replace('{count}', String(state.world.resources.data))}</span>
                  <span className="chapter0-state-sub chapter0-state-sub-accent">
                    {state.transition ? t(`tutorial.chapter_zero.transition_${state.transition}`) : '—'}
                  </span>
                </div>
              </div>
            </section>

            {/* RIGHT COLUMN */}
            <div className="chapter0-right">
              {/* Network diagram */}
              <section className="chapter0-network" aria-label="network">
                <svg viewBox="0 0 320 220" className="chapter0-network-svg" role="presentation">
                  <line
                    x1={80}
                    y1={150}
                    x2={240}
                    y2={150}
                    stroke={edgeFlashing ? '#ffffff' : 'var(--accent)'}
                    strokeWidth={edgeFlashing ? 2.4 : 1.2}
                    opacity={0.85}
                  />
                  <line
                    x1={160}
                    y1={60}
                    x2={80}
                    y2={150}
                    stroke="var(--border)"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    opacity={0.5}
                  />
                  <line
                    x1={160}
                    y1={60}
                    x2={240}
                    y2={150}
                    stroke="var(--border)"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    opacity={0.5}
                  />
                  <NetworkNode
                    x={80}
                    y={150}
                    label={t('tutorial.chapter_zero.network_hub')}
                    active={currentNodeId === 'hub'}
                    reducedMotion={reducedMotion}
                  />
                  <NetworkNode
                    x={240}
                    y={150}
                    label={t('tutorial.chapter_zero.network_mine')}
                    active={currentNodeId === 'mine'}
                    reducedMotion={reducedMotion}
                  />
                  <NetworkNode
                    x={160}
                    y={60}
                    label={t('tutorial.chapter_zero.network_unknown')}
                    active={false}
                    offline
                    reducedMotion={reducedMotion}
                  />
                </svg>
              </section>

              {/* Narrator */}
              <section className="chapter0-narrator" onClick={skipTypewriter}>
                <div className={`chapter0-narrator-avatar${glitching ? ' chapter0-glitching' : ''}`}>
                  <img src={narratorGhostUrl} alt="" aria-hidden="true" draggable={false} />
                  {glitching && (
                    <>
                      <img
                        src={narratorGhostUrl}
                        alt=""
                        aria-hidden="true"
                        className="chapter0-glitch-layer chapter0-glitch-layer-r"
                        draggable={false}
                      />
                      <img
                        src={narratorGhostUrl}
                        alt=""
                        aria-hidden="true"
                        className="chapter0-glitch-layer chapter0-glitch-layer-b"
                        draggable={false}
                      />
                    </>
                  )}
                </div>
                <div className="chapter0-narrator-panel">
                  <div className="chapter0-narrator-label">{t('tutorial.chapter_zero.narrator_name')}</div>
                  <div className="chapter0-narrator-text" aria-live="polite">
                    {activeMsg ? renderNarratorLine(activeMsg.slice(0, charsShown)) : ' '}
                  </div>
                  {activeMsg && charsShown < activeMsg.length && !reducedMotion && (
                    <div className="chapter0-narrator-skip">{t('tutorial.chapter_zero.skip_dialogue')}</div>
                  )}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function NetworkNode({
  x,
  y,
  label,
  active,
  offline = false,
  reducedMotion,
}: {
  x: number;
  y: number;
  label: string;
  active: boolean;
  offline?: boolean;
  reducedMotion: boolean;
}) {
  const stroke = offline ? 'var(--text-muted)' : 'var(--accent)';
  return (
    <g>
      {active && !reducedMotion && (
        <circle
          cx={x}
          cy={y}
          r={18}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={1.5}
          className="chapter0-pulse-ring"
        />
      )}
      <circle
        cx={x}
        cy={y}
        r={14}
        fill={offline ? 'transparent' : 'rgba(0,0,0,0.4)'}
        stroke={stroke}
        strokeWidth={1.5}
        strokeDasharray={offline ? '4 3' : '0'}
      />
      <text
        x={x}
        y={y + 34}
        fill={offline ? 'var(--text-muted)' : 'var(--text-secondary)'}
        fontSize={10}
        fontFamily="var(--font-mono)"
        textAnchor="middle"
      >
        {label}
      </text>
    </g>
  );
}
