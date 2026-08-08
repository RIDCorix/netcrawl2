import { ReactNode, useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import axios from 'axios';
import { useT } from '../hooks/useT';
import { initialChapterZeroLoadState, reduceChapterZeroLoad } from '../lib/chapterZeroLoadState';
import narratorGhostUrl from '../assets/chapter0/narrator-ghost.png';
import { ChapterZeroParticles } from './chapter0/ChapterZeroParticles';
import { ChapterZeroGraph } from './chapter0/ChapterZeroGraph';
import { ChapterZeroCodeEditor } from './chapter0/ChapterZeroCodeEditor';
import { useChapterZeroDialogue } from './chapter0/useChapterZeroDialogue';

type Item = { type: string; count: number };
type Stage =
  | 'cold_open'
  | 'voice_arrival'
  | 'choice_intro'
  | 'direct_commands'
  | 'code_editor'
  | 'complete'
  | 'edge_select'
  | 'pickaxe_equip'
  | 'deploy_confirm'
  | 'deploy_execute'
  | 'deploy_verified'
  | 'handoff';

const DEPLOY_STAGES: Stage[] = [
  'edge_select',
  'pickaxe_equip',
  'deploy_confirm',
  'deploy_execute',
  'deploy_verified',
  'handoff',
];

type TutorialState = {
  version: 3;
  stage: Stage;
  step: number;
  expected: string | null;
  transition: string | null;
  transcript: string[];
  world: {
    worker: { nodeId: 'hub' | 'mine'; holding: Item[]; equippedPickaxe: 'pickaxe_basic'; lastLog: string | null };
    mine: { drops: Item[] };
    resources: { data: number };
    deployTutorial: {
      grantedItems: boolean;
      selectedEdgeId: string | null;
      selectedPickaxeType: string | null;
      workerId: string | null;
    };
  };
};

type CodeRunResponse = {
  ok: true;
  session: TutorialState;
  ticks: {
    phase: 'on_startup' | 'on_loop';
    tick: number;
    statements: { expression: string; transition: string | null; effect: string | null; error: string | null }[];
  }[];
  passed: boolean;
  failureReason: 'stuck_at_mine' | 'no_deposit' | 'syntax' | 'unknown_ref' | null;
};

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function renderNarratorLine(text: string): ReactNode {
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

  const load = useCallback(() => {
    dispatchLoad({ type: 'retry' });
    axios
      .get('/api/tutorial/chapter-zero')
      .then(r => {
        dispatchLoad({ type: 'loaded', session: r.data });
      })
      .catch(() => dispatchLoad({ type: 'failed' }));
  }, []);

  useEffect(load, [load]);

  const state = loadState.status === 'loaded' ? loadState.session : null;

  useEffect(() => {
    const onTutorialSession = (event: Event) => {
      const session = (event as CustomEvent).detail;
      if (session?.stage) dispatchLoad({ type: 'loaded', session });
    };
    window.addEventListener('chapter-zero-deploy-session', onTutorialSession);
    return () => window.removeEventListener('chapter-zero-deploy-session', onTutorialSession);
  }, []);

  const advanceStage = useCallback(
    async (to: Stage) => {
      try {
        const response = await axios.post('/api/tutorial/chapter-zero/stage', { action: 'advance', to });
        dispatchLoad({ type: 'loaded', session: response.data });
      } catch {
        // Server rejected — refetch to resync.
        load();
      }
    },
    [load],
  );

  const submitCommand = useCallback(async (command: string): Promise<{ ok: boolean }> => {
    try {
      const response = await axios.post('/api/tutorial/chapter-zero/command', { command });
      dispatchLoad({ type: 'loaded', session: response.data });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }, []);

  const submitCodeRun = useCallback(async (onStartup: string, onLoop: string): Promise<CodeRunResponse | null> => {
    try {
      const response = await axios.post<CodeRunResponse>('/api/tutorial/chapter-zero/stage', {
        action: 'code-run',
        on_startup: onStartup,
        on_loop: onLoop,
      });
      return response.data;
    } catch {
      return null;
    }
  }, []);

  // Deployment continues through the real game map UI. The former overlay guide
  // was removed because its dimming layer obscured the target node.
  if (state && (DEPLOY_STAGES as Stage[]).includes(state.stage)) {
    return null;
  }

  if (loadState.status === 'failed') {
    return (
      <div className="chapter0-overlay">
        <div className="chapter0-shell">
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
        </div>
      </div>
    );
  }

  if (loadState.status === 'loading' || !state) {
    return (
      <div className="chapter0-overlay">
        <p style={{ color: 'var(--text-secondary)', padding: 24 }}>{t('tutorial.chapter_zero.loading')}</p>
      </div>
    );
  }

  if (state.stage === 'cold_open') {
    return <ColdOpen advance={() => advanceStage('voice_arrival')} />;
  }

  if (state.stage === 'voice_arrival') {
    return <VoiceArrival advance={() => advanceStage('choice_intro')} />;
  }

  return (
    <Shell
      state={state}
      submitCommand={submitCommand}
      advanceStage={advanceStage}
    submitCodeRun={submitCodeRun}
    commitSession={session => dispatchLoad({ type: 'loaded', session })}
  />
  );
}

/* ─── Stage 1: Cold Open ────────────────────────────────────────────── */

function ColdOpen({ advance }: { advance: () => void }) {
  const t = useT();
  const reducedMotion = useMemo(() => prefersReducedMotion(), []);
  const lines = useMemo(
    () => [
      t('tutorial.chapter_zero.cold_open.L1'),
      t('tutorial.chapter_zero.cold_open.L2'),
      t('tutorial.chapter_zero.cold_open.L3'),
    ],
    [t],
  );
  const dialogue = useChapterZeroDialogue(lines, reducedMotion);
  const [fading, setFading] = useState(false);

  const onAdvance = () => {
    if (fading) return;
    if (!dialogue.done) {
      dialogue.advance();
      return;
    }
    setFading(true);
    window.setTimeout(advance, reducedMotion ? 200 : 1500);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        onAdvance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onAdvance]);

  return (
    <div
      className={`chapter0-overlay chapter0-coldopen${fading ? ' chapter0-coldopen-fading' : ''}`}
      onClick={onAdvance}
    >
      <ChapterZeroParticles density={30} reducedMotion={reducedMotion} />
      <div className="chapter0-coldopen-text">
        {renderNarratorLine(dialogue.currentLine.slice(0, dialogue.charsShown))}
      </div>
      <div className="chapter0-continue-hint" aria-live="polite">
        {dialogue.lineFullyShown && !dialogue.done && t('tutorial.chapter_zero.continue_hint')}
        {dialogue.done && !fading && t('tutorial.chapter_zero.continue_hint')}
      </div>
    </div>
  );
}

/* ─── Stage 2: Voice Arrival ────────────────────────────────────────── */

function VoiceArrival({ advance }: { advance: () => void }) {
  const t = useT();
  const reducedMotion = useMemo(() => prefersReducedMotion(), []);
  const lines = useMemo(
    () => [
      t('tutorial.chapter_zero.voice_arrival.L1'),
      t('tutorial.chapter_zero.voice_arrival.L2'),
      t('tutorial.chapter_zero.voice_arrival.L3'),
      t('tutorial.chapter_zero.voice_arrival.L4'),
    ],
    [t],
  );
  const dialogue = useChapterZeroDialogue(lines, reducedMotion);
  const showPickup = dialogue.done;
  const [fading, setFading] = useState(false);
  const finish = () => {
    if (fading) return;
    if (reducedMotion) return advance();
    setFading(true);
    window.setTimeout(advance, 220);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === ' ' || e.key === 'Enter') && !dialogue.done) {
        e.preventDefault();
        dialogue.advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialogue]);

  return (
    <div
      className={`chapter0-overlay chapter0-voicearrival${fading ? ' chapter0-screen-fading' : ''}`}
      onClick={() => !dialogue.done && dialogue.advance()}
    >
      <ChapterZeroParticles density={60} reducedMotion={reducedMotion} />
      <div className="chapter0-voicearrival-panel">
        <NarratorAvatar reducedMotion={reducedMotion} glitchTick={dialogue.index} />
        <div className="chapter0-narrator-panel">
          <div className="chapter0-narrator-label">{t('tutorial.chapter_zero.narrator_name')}</div>
          <div className="chapter0-narrator-text" aria-live="polite">
            {dialogue.currentLine ? renderNarratorLine(dialogue.currentLine.slice(0, dialogue.charsShown)) : ' '}
          </div>
          {showPickup ? (
            <button className="chapter0-pickup-btn" onClick={finish}>
              {t('tutorial.chapter_zero.voice_arrival.pickup_cta')}
            </button>
          ) : (
            <div className="chapter0-narrator-skip">{t('tutorial.chapter_zero.continue_hint')}</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Stage 3-5: Shell (terminal + graph + narrator) ────────────────── */

export const DIRECT_MOVE_NARRATOR_KEYS = [
  'tutorial.chapter_zero.code_editor.intro_L1',
  'tutorial.chapter_zero.code_editor.intro_L2',
  'tutorial.chapter_zero.code_editor.intro_L3',
  'tutorial.chapter_zero.code_editor.intro_L4',
  'tutorial.chapter_zero.direct_commands.hint_move_L3',
] as const;

export function chapterZeroEditorPresentation(
  stage: 'direct_commands' | 'code_editor' | 'complete',
  step: number,
  dialogueIndex: number,
  dialogueDone: boolean,
) {
  const loopUnlocked = (stage === 'code_editor' && step >= 1) || stage === 'complete';
  const highlight: 'class' | 'identity' | 'edge' | 'startup' | 'loop' =
    stage === 'direct_commands' && step === 0
      ? (['class', 'identity', 'edge', 'startup', 'startup'][Math.min(dialogueIndex, 4)] as
          | 'class'
          | 'identity'
          | 'edge'
          | 'startup')
      : stage === 'code_editor' && step >= 1
        ? 'loop'
        : 'startup';
  const disabled = !dialogueDone || stage === 'complete' || (stage === 'direct_commands' && step >= 2);
  return { loopUnlocked, highlight, disabled };
}

export function ChapterZeroInstructionEditor({
  stage,
  step,
  dialogueIndex,
  dialogueDone,
  running,
  onDirectCommand,
  onCodeRun,
}: {
  stage: 'direct_commands' | 'code_editor' | 'complete';
  step: number;
  dialogueIndex: number;
  dialogueDone: boolean;
  running: boolean;
  onDirectCommand: (command: string) => void | Promise<void>;
  onCodeRun: (startup: string, loop: string) => void | Promise<void>;
}) {
  const presentation = chapterZeroEditorPresentation(stage, step, dialogueIndex, dialogueDone);

  return (
    <ChapterZeroCodeEditor
      onRun={(startup, loop) =>
        stage === 'direct_commands' ? onDirectCommand(startup.trim()) : onCodeRun(startup, loop)
      }
      running={running}
      disabled={presentation.disabled}
      loopUnlocked={presentation.loopUnlocked}
      highlight={presentation.highlight}
    />
  );
}

function Shell({
  state,
  submitCommand,
  advanceStage,
  submitCodeRun,
  commitSession,
}: {
  state: TutorialState;
  submitCommand: (command: string) => Promise<{ ok: boolean }>;
  advanceStage: (to: Stage) => void;
  submitCodeRun: (a: string, b: string) => Promise<CodeRunResponse | null>;
  commitSession: (session: TutorialState) => void;
}) {
  const t = useT();
  const reducedMotion = useMemo(() => prefersReducedMotion(), []);
  const [inputError, setInputError] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<CodeRunResponse | null>(null);
  const [visualWorkerAt, setVisualWorkerAt] = useState(state.world.worker.nodeId);
  const [screenFading, setScreenFading] = useState(false);

  useEffect(() => setVisualWorkerAt(state.world.worker.nodeId), [state.world.worker.nodeId]);

  // Build the narrator queue for this stage.
  const narratorLines = useMemo(() => {
    if (state.stage === 'choice_intro' && state.step === 0) {
      return [t('tutorial.chapter_zero.choice_intro.prompt')];
    }
    if (state.stage === 'choice_intro' && state.step >= 1) {
      return [
        t('tutorial.chapter_zero.choice_intro.ack_1'),
        t('tutorial.chapter_zero.choice_intro.ack_2'),
        t('tutorial.chapter_zero.choice_intro.ack_3'),
      ];
    }
    if (state.stage === 'direct_commands' && state.step === 0) {
      return DIRECT_MOVE_NARRATOR_KEYS.map(key => t(key));
    }
    if (state.stage === 'direct_commands' && state.step === 1) {
      return [
        t('tutorial.chapter_zero.direct_commands.ack_move'),
        t('tutorial.chapter_zero.direct_commands.hint_collect_L1'),
      ];
    }
    if (state.stage === 'direct_commands' && state.step >= 2) {
      return [
        t('tutorial.chapter_zero.direct_commands.ack_collect_L1'),
        t('tutorial.chapter_zero.direct_commands.ack_collect_L2'),
      ];
    }
    if (state.stage === 'code_editor' && state.step === 0 && !runResult) {
      return [t('tutorial.chapter_zero.code_editor.startup_checkpoint')];
    }
    if (state.stage === 'code_editor' && state.step >= 1 && (!runResult || !runResult.failureReason)) {
      return [
        t('tutorial.chapter_zero.code_editor.loop_intro_L1'),
        t('tutorial.chapter_zero.code_editor.loop_intro_L2'),
      ];
    }
    if (state.stage === 'code_editor' && runResult && !runResult.passed) {
      const key =
        runResult.failureReason === 'syntax'
          ? 'tutorial.chapter_zero.code_editor.fail_syntax'
          : runResult.failureReason === 'unknown_ref'
            ? 'tutorial.chapter_zero.code_editor.fail_unknown_ref'
            : runResult.failureReason === 'no_deposit'
              ? 'tutorial.chapter_zero.code_editor.fail_no_deposit'
              : 'tutorial.chapter_zero.code_editor.fail_stuck_at_mine';
      return [t(key)];
    }
    if (state.stage === 'complete') {
      return [
        t('tutorial.chapter_zero.code_editor.outro_L1'),
        t('tutorial.chapter_zero.code_editor.outro_L2'),
        t('tutorial.chapter_zero.code_editor.outro_L3'),
      ];
    }
    return [];
  }, [state.stage, state.step, runResult, t]);

  const dialogue = useChapterZeroDialogue(narratorLines, reducedMotion);
  const [glitchTick, setGlitchTick] = useState(0);
  useEffect(() => setGlitchTick(n => n + 1), [state.stage, state.step, dialogue.index]);

  // Edge flash on movement transitions.
  const [edgeFlashing, setEdgeFlashing] = useState(false);
  useEffect(() => {
    if (state.transition === 'moved_to_mine' || state.transition === 'returned_to_hub') {
      setEdgeFlashing(true);
      const id = window.setTimeout(() => setEdgeFlashing(false), 400);
      return () => window.clearTimeout(id);
    }
  }, [state.transition]);

  const echoChoice = async (choiceText: string) => {
    if (state.stage !== 'choice_intro' || state.step !== 0) return;
    // Client-side echo: append the player's choice + self.info() to transcript
    // by relying on the server to also append. Server currently doesn't record
    // the choice text (fine — it's cosmetic). We call the command endpoint;
    // the local echo happens by re-fetching state.
    // NOTE: the transcript is now client-managed for choice preview so the
    // player sees their own selection instantly, then the server updates.
    // We do this via a local "preview transcript" overlay.
    setChoicePreview(choiceText);
    await submitCommand('self.info()');
  };

  const [choicePreview, setChoicePreview] = useState<string | null>(null);
  useEffect(() => {
    if (state.stage !== 'choice_intro') setChoicePreview(null);
  }, [state.stage]);

  const onPanelClick = () => {
    if (!dialogue.done) {
      dialogue.advance();
      return;
    }
    // Once dialogue is fully consumed for the ack sequences, auto-advance.
    if (state.stage === 'choice_intro' && state.step >= 1) fadeToStage('direct_commands');
    else if (state.stage === 'direct_commands' && state.step >= 2) fadeToStage('code_editor');
    else if (state.stage === 'complete') fadeToStage('edge_select');
  };

  const fadeToStage = (stage: Stage) => {
    if (screenFading) return;
    if (reducedMotion) return advanceStage(stage);
    setScreenFading(true);
    window.setTimeout(() => {
      advanceStage(stage);
      setScreenFading(false);
    }, 220);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        onPanelClick();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialogue, state.stage, state.step, onPanelClick]);

  const stepIndicator = t('tutorial.chapter_zero.step_indicator', {
    current: stageIndex(state.stage),
    total: '05',
  });

  const runCode = async (a: string, b: string) => {
    setRunning(true);
    setRunResult(null);
    const result = await submitCodeRun(a, b);
    if (result) {
      for (const tick of result.ticks) {
        for (const statement of tick.statements) {
          if (statement.transition === 'moved_to_mine' || statement.transition === 'returned_to_hub') {
            setEdgeFlashing(true);
            setVisualWorkerAt(statement.transition === 'moved_to_mine' ? 'mine' : 'hub');
            if (!reducedMotion) await new Promise(resolve => window.setTimeout(resolve, 460));
            setEdgeFlashing(false);
          }
        }
      }
      commitSession(result.session);
    }
    setRunResult(result);
    setRunning(false);
  };

  const runDirectCommand = async (commandBody: string) => {
    const commandLine = commandBody
      .split('\n')
      .map(line => line.trim())
      .find(line => line && !line.startsWith('#') && line !== 'pass');
    if (!commandLine) {
      setInputError(true);
      return;
    }
    setRunning(true);
    const result = await submitCommand(commandLine);
    setInputError(!result.ok);
    setRunning(false);
  };

  const showEditor = state.stage === 'direct_commands' || state.stage === 'code_editor' || state.stage === 'complete';

  return (
    <div className="chapter0-overlay">
      <div
        key={state.stage}
        className={`chapter0-shell chapter0-stage-fade${screenFading ? ' chapter0-screen-fading' : ''}`}
      >
        {/* LEFT: terminal or editor */}
        <section className="chapter0-repl">
          <header className="chapter0-repl-header">
            <span className="chapter0-title">{t('tutorial.chapter_zero.title')}</span>
            <span className="chapter0-step" aria-live="polite">
              {stepIndicator}
            </span>
          </header>

          {showEditor ? (
            <>
              <ChapterZeroInstructionEditor
                stage={state.stage as 'direct_commands' | 'code_editor' | 'complete'}
                step={state.step}
                dialogueIndex={dialogue.index}
                dialogueDone={dialogue.done}
                running={running}
                onDirectCommand={runDirectCommand}
                onCodeRun={runCode}
              />
              {inputError && (
                <p role="alert" className="chapter0-error-msg">
                  {t('tutorial.chapter_zero.error')}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="chapter0-transcript" aria-live="polite">
                {state.transcript.length === 0 && !choicePreview && <div className="chapter0-transcript-empty">—</div>}
                {choicePreview && (
                  <div className="chapter0-transcript-line chapter0-transcript-player"># player: {choicePreview}</div>
                )}
                {state.transcript.map((line, i) => (
                  <div
                    key={i}
                    className={`chapter0-transcript-line${
                      line.startsWith('#') ? ' chapter0-transcript-comment' : ''
                    }${line.startsWith('!') ? ' chapter0-transcript-error' : ''}`}
                  >
                    {line}
                  </div>
                ))}
              </div>
              {inputError && (
                <p role="alert" className="chapter0-error-msg">
                  {t('tutorial.chapter_zero.error')}
                </p>
              )}
            </>
          )}
        </section>

        {/* RIGHT COLUMN */}
        <div className="chapter0-right">
          {state.stage !== 'choice_intro' && (
            <section className="chapter0-network" aria-label="network">
              <ChapterZeroGraph workerAt={visualWorkerAt} edgeFlashing={edgeFlashing} reducedMotion={reducedMotion} />
            </section>
          )}

          <section className="chapter0-narrator" onClick={onPanelClick} role="button" tabIndex={0}>
            <NarratorAvatar reducedMotion={reducedMotion} glitchTick={glitchTick} />
            <div className="chapter0-narrator-panel">
              <div className="chapter0-narrator-label">{t('tutorial.chapter_zero.narrator_name')}</div>
              <div
                className={`chapter0-narrator-text${dialogue.fading ? ' chapter0-dialogue-fading' : ' chapter0-dialogue-entering'}`}
                key={`${state.stage}-${state.step}-${dialogue.index}`}
                aria-live="polite"
              >
                {dialogue.currentLine ? renderNarratorLine(dialogue.currentLine.slice(0, dialogue.charsShown)) : ' '}
              </div>
              {state.stage === 'choice_intro' && state.step === 0 && dialogue.done && (
                <div className="chapter0-choice-row">
                  {(['cold', 'confused', 'curious'] as const).map(kind => (
                    <button
                      key={kind}
                      className="chapter0-choice-btn"
                      onClick={e => {
                        e.stopPropagation();
                        echoChoice(t(`tutorial.chapter_zero.choice_intro.choice_${kind}`));
                      }}
                    >
                      {t(`tutorial.chapter_zero.choice_intro.choice_${kind}`)}
                    </button>
                  ))}
                </div>
              )}
              {state.stage === 'complete' && dialogue.done && (
                <button
                  className="chapter0-continue-btn"
                  onClick={e => {
                    e.stopPropagation();
                    fadeToStage('edge_select');
                  }}
                >
                  {t('tutorial.chapter_zero.deploy.continue_to_deploy')}
                </button>
              )}
              {!dialogue.done && (
                <div className="chapter0-narrator-skip">{t('tutorial.chapter_zero.continue_hint')}</div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ─── Narrator avatar with float + glitch ───────────────────────────── */

function NarratorAvatar({ reducedMotion, glitchTick }: { reducedMotion: boolean; glitchTick: number }) {
  const [glitching, setGlitching] = useState(false);
  useEffect(() => {
    if (glitchTick === 0 || reducedMotion) return;
    setGlitching(true);
    const id = window.setTimeout(() => setGlitching(false), 320);
    return () => window.clearTimeout(id);
  }, [glitchTick, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return;
    let cancelled = false;
    let id = 0;
    const schedule = () => {
      const wait = 4000 + Math.random() * 3000;
      id = window.setTimeout(() => {
        if (cancelled) return;
        setGlitching(true);
        window.setTimeout(() => setGlitching(false), 320);
        schedule();
      }, wait);
    };
    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [reducedMotion]);

  return (
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
  );
}

function stageIndex(stage: Stage): string {
  const order: Stage[] = ['cold_open', 'voice_arrival', 'choice_intro', 'direct_commands', 'code_editor', 'complete'];
  return String(Math.min(order.indexOf(stage) + 1, 5)).padStart(2, '0');
}
