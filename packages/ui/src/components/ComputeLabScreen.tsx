import { Fragment, useEffect, useRef, useState } from 'react';
import { type ComputeLabRunSnapshot, useGameStore } from '../store/gameStore';
import { apiFetch } from '../lib/api';
import { useT } from '../hooks/useT';

type Run = ComputeLabRunSnapshot;
type Task = {
  taskId: string;
  description: string;
  params: Record<string, unknown>;
  difficulty: string;
  functionSignature: string;
  starterSource: string;
  cost?: { cooldownSeconds: number; reward: number; rewardType: string };
};
type SubmissionSuccess = {
  nodeSolveCount: number;
  quest: { current: number; target: number; completed: boolean };
};
type TraceFrame = Run['frames'][number];
type SourceLocation = NonNullable<TraceFrame['location']>;
type StepCardProps = {
  frame: TraceFrame;
  source: string;
  stale: boolean;
  t: ReturnType<typeof useT>;
};

function sourceExcerpt(source: string, location: SourceLocation) {
  const lines = source.split('\n');
  const startLine = lines[location.lineno - 1];
  const endLine = lines[location.end_lineno - 1];
  if (startLine === undefined || endLine === undefined) return null;

  // CPython reports UTF-8 byte offsets; JavaScript slices UTF-16 code units.
  // Convert each endpoint independently and retain intervening newlines so
  // multiline expressions can be highlighted as one source range.
  const byteColumnToCodeUnit = (line: string, byteColumn: number) => {
    let bytes = 0;
    let codeUnits = 0;
    for (const character of line) {
      if (bytes >= byteColumn) break;
      bytes += new TextEncoder().encode(character).length;
      codeUnits += character.length;
    }
    return bytes === byteColumn ? codeUnits : null;
  };
  const startColumn = byteColumnToCodeUnit(startLine, location.col_offset);
  const endColumn = byteColumnToCodeUnit(endLine, location.end_col_offset);
  if (startColumn === null || endColumn === null) return null;

  const selectedLines = lines.slice(location.lineno - 1, location.end_lineno);
  if (selectedLines.length === 1) {
    return {
      before: startLine.slice(0, startColumn),
      selected: startLine.slice(startColumn, endColumn),
      after: startLine.slice(endColumn),
    };
  }
  selectedLines[0] = selectedLines[0].slice(startColumn);
  selectedLines[selectedLines.length - 1] = selectedLines[selectedLines.length - 1].slice(0, endColumn);
  return {
    before: startLine.slice(0, startColumn),
    selected: selectedLines.join('\n'),
    after: endLine.slice(endColumn),
  };
}

function StepSource({ frame, source, stale, t }: StepCardProps) {
  if (frame.source === undefined || frame.location === undefined) return null;
  const excerpt = stale ? null : sourceExcerpt(source, frame.location);
  if (stale)
    return (
      <div>
        <small>{t('compute_lab.old_trace')}</small>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{frame.source}</pre>
      </div>
    );
  return excerpt ? (
    <pre style={{ whiteSpace: 'pre-wrap' }}>
      {excerpt.before}
      <mark>{excerpt.selected}</mark>
      {excerpt.after}
    </pre>
  ) : (
    <pre style={{ whiteSpace: 'pre-wrap' }}>{frame.source}</pre>
  );
}

/**
 * Translate a semantic word, and say so plainly when there is no translation.
 *
 * This is the only place the screen knows any vocabulary at all. Delete every
 * entry behind it and each card still renders the same structure with the same
 * source, values and locals — only the words get less specific. That property,
 * not a longer table, is what makes a construct nobody anticipated look exactly
 * like one that was.
 */
function word(t: ReturnType<typeof useT>, namespace: string, name: string, fallback: string) {
  const key = `compute_lab.${namespace}.${name}`;
  const translated = t(key);
  return translated === key ? fallback : translated;
}

/**
 * Detail values are the runner's data, so a bare one reads as the runner's word:
 * "Went to none" rather than "Went to neither part". Strings pass through the
 * same translate-or-show-plainly rule as every other word on this card, so an
 * unfamiliar one is still shown rather than dropped.
 */
function formatDetail(t: ReturnType<typeof useT>, value: unknown) {
  return typeof value === 'string' ? word(t, 'value', value, value) : JSON.stringify(value);
}

/**
 * Where in its own calls the run currently is.
 *
 * R-21 #12: the outermost and the innermost are both visible at once, and the
 * middle is a count rather than a list — so recursion 400 deep reads in two
 * lines instead of scrolling past four hundred identical ones. Rendered only
 * when the runner sent a chain, and keyed on nothing but the entry's own shape,
 * so it is not a rendering rule per construct.
 */
function CallStack({ stack, t }: { stack: NonNullable<TraceFrame['stack']>; t: ReturnType<typeof useT> }) {
  const between = stack
    .slice(1, -1)
    .reduce((total, entry) => total + ('hidden' in entry ? entry.hidden : (entry.count ?? 1)), 0);
  const label = (entry: NonNullable<TraceFrame['stack']>[number]) =>
    'hidden' in entry
      ? t('compute_lab.stack.more', { count: entry.hidden })
      : entry.count && entry.count > 1
        ? `${entry.source} ${t('compute_lab.stack.repeat', { count: entry.count })}`
        : entry.source;
  return (
    <div data-testid="compute-lab-call-stack" style={{ color: 'var(--text-muted)', margin: '6px 0' }}>
      <small>{t('compute_lab.stack.title')}</small>
      <div>
        <code>{label(stack[0])}</code>
      </div>
      {between > 0 && <div>{t('compute_lab.stack.more', { count: between })}</div>}
      {stack.length > 1 && (
        <div>
          <code>{label(stack[stack.length - 1])}</code>
        </div>
      )}
    </div>
  );
}

/** The whole trace. One card, every construct, anticipated or not. */
function StepCard(props: StepCardProps) {
  const { frame, t } = props;
  const detail = Object.entries(frame.detail || {});
  return (
    <div data-testid="compute-lab-step" style={{ border: '1px solid var(--accent)', padding: 10, marginTop: 10 }}>
      <strong>
        {word(t, 'step', frame.kind, t('compute_lab.step.unknown'))}
        {frame.source === undefined ? '' : ` ${frame.source}`}
      </strong>
      {frame.stack && frame.stack.length > 0 && <CallStack stack={frame.stack} t={t} />}
      <StepSource {...props} />
      {Object.prototype.hasOwnProperty.call(frame, 'value') && (
        <div>
          <code>→ {typeof frame.value === 'string' ? frame.value : JSON.stringify(frame.value)}</code>
        </div>
      )}
      {detail.length > 0 && (
        <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 10px', margin: '8px 0 0' }}>
          {detail.map(([name, value]) => (
            <Fragment key={name}>
              <dt style={{ color: 'var(--text-muted)' }}>{word(t, 'detail', name, name)}</dt>
              <dd style={{ margin: 0 }}>
                <code>{formatDetail(t, value)}</code>
              </dd>
            </Fragment>
          ))}
        </dl>
      )}
    </div>
  );
}

const TERMINAL_STATUSES = ['trace_ready', 'syntax', 'runtime', 'timeout', 'limit', 'disconnected'] as const;

function lastIndexOfKind(frames: readonly TraceFrame[], kind: string) {
  for (let index = frames.length - 1; index >= 0; index--) if (frames[index].kind === kind) return index;
  return -1;
}

/**
 * Where a finished run should open.
 *
 * A run that succeeded is about its answer, so it opens on the return. A run
 * that stopped is about where it stopped — which is the last step that names a
 * piece of the player's code, not the terminal marker that follows it. The
 * marker carries only a status message, and the outcome panel above already
 * says that in words; landing on it would show the player a card with no code
 * in it at the exact moment they need to see where things went wrong.
 */
function landingFrame(frames: readonly TraceFrame[]) {
  const returned = lastIndexOfKind(frames, 'result');
  if (returned >= 0) return returned;
  for (let index = frames.length - 1; index >= 0; index--) if (frames[index].source !== undefined) return index;
  return Math.max(0, frames.length - 1);
}

/**
 * What a stopped run was doing when observation ended.
 *
 * R-21 #7: "the loop finished" and "we stopped watching" must be different
 * sentences, and neither may require the reader to know what 1,200 means.
 */
function lastRepetition(frames: readonly TraceFrame[]) {
  const index = lastIndexOfKind(frames, 'repetition');
  if (index < 0) return undefined;
  const frame = frames[index];
  const iteration = frame.detail?.iteration;
  return { loop: frame.source || '', iteration: typeof iteration === 'number' ? iteration : 0 };
}

/** Focused code workspace. Its only visual model is program state, never map geography. */
export function ComputeLabScreen() {
  const {
    computeLabOpen,
    computeLabSourceNodeId,
    nodes,
    closeComputeLab,
    codeServerConnected,
    connected,
    computeLabRuns,
    upsertComputeLabRun,
  } = useGameStore();
  const t = useT();
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const sourceNode = nodes.find(node => node.id === computeLabSourceNodeId);
  const available = sourceNode?.type === 'compute' && sourceNode.data.unlocked === true;
  const [task, setTask] = useState<Task | null>(null);
  const [source, setSource] = useState('');
  const [revision, setRevision] = useState(0);
  const [draftNodeId, setDraftNodeId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [message, setMessage] = useState<{ key: string; vars?: Record<string, string | number> } | null>(null);
  const [submissionSuccess, setSubmissionSuccess] = useState<SubmissionSuccess | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const wasConnected = useRef(connected);
  const run = runId ? (computeLabRuns[runId] as Run | undefined) : undefined;

  useEffect(() => {
    if (!computeLabOpen || !available || !sourceNode) return;
    let cancelled = false;
    const key = `netcrawl-compute-lab:${sourceNode.id}`;
    const saved = localStorage.getItem(key);
    const savedRevision = Number(localStorage.getItem(`${key}:revision`));
    setTask(null);
    setRunId(null);
    setFrameIndex(0);
    // A cooldown belongs to the node that started it; carrying it to another
    // node would disable RUN there for no reason the player can see.
    setCooldownUntil(0);
    setRevision(Number.isSafeInteger(savedRevision) && savedRevision >= 0 ? savedRevision : 0);
    setDraftNodeId(sourceNode.id);
    setSource(saved ?? '');
    closeRef.current?.focus();
    apiFetch('/api/compute-lab/tasks', { method: 'POST', body: JSON.stringify({ nodeId: sourceNode.id }) })
      .then(async response => ({ response, body: await response.json() }))
      .then(({ response, body }) => {
        if (cancelled) return;
        if (!response.ok) throw new Error(body.error || 'Unable to load task');
        setTask(body);
        if (saved === null) setSource(body.starterSource);
        setMessage(null);
        setSubmissionSuccess(null);
      })
      .catch(() => {
        if (!cancelled) setMessage({ key: 'compute_lab.task_load_failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [computeLabOpen, available, sourceNode?.id]);

  useEffect(() => {
    if (!sourceNode || !computeLabOpen || draftNodeId !== sourceNode.id) return;
    const key = `netcrawl-compute-lab:${sourceNode.id}`;
    localStorage.setItem(key, source);
    localStorage.setItem(`${key}:revision`, String(revision));
  }, [source, revision, sourceNode?.id, computeLabOpen, draftNodeId]);

  useEffect(() => {
    const reconnected = !wasConnected.current && connected;
    wasConnected.current = connected;
    if (!runId || (run && !reconnected)) return;
    apiFetch(`/api/compute-lab/runs/${runId}`)
      .then(response => response.json())
      .then(body => {
        if (body.run) upsertComputeLabRun(body.run);
      })
      .catch(() => setMessage({ key: 'compute_lab.connection_lost' }));
  }, [connected, run, runId, upsertComputeLabRun]);

  useEffect(() => {
    if (!computeLabOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeComputeLab();
      }
      if (event.key === 'Tab') {
        const items = Array.from(
          dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled])') || [],
        );
        const current = items.indexOf(document.activeElement as HTMLElement);
        if (items.length) {
          event.preventDefault();
          items[(current + (event.shiftKey ? items.length - 1 : 1)) % items.length].focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [computeLabOpen, closeComputeLab]);

  useEffect(() => {
    if (run && (TERMINAL_STATUSES as readonly string[]).includes(run.status)) setFrameIndex(landingFrame(run.frames));
  }, [run?.status, run?.frames.length]);

  // A cooldown the player cannot see counting down is indistinguishable from a
  // button that is broken.
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const timer = setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      if (tick >= cooldownUntil) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownUntil]);

  if (!computeLabOpen) return null;
  const stale = Boolean(
    run &&
    (!sourceNode || !task || run.nodeId !== sourceNode.id || run.taskId !== task.taskId || run.revision !== revision),
  );
  const frame = run?.frames[frameIndex];
  const frameError = frame?.error;
  const terminal = run && (TERMINAL_STATUSES as readonly string[]).includes(run.status) ? run.status : undefined;
  const stoppedAt = terminal === 'limit' || terminal === 'timeout' ? lastRepetition(run?.frames || []) : undefined;
  const updateSource = (value: string) => {
    setSource(value);
    setRevision(current => current + 1);
  };
  const startRun = async () => {
    if (!task || !sourceNode) return;
    setMessage(null);
    setSubmissionSuccess(null);
    const response = await apiFetch('/api/compute-lab/runs', {
      method: 'POST',
      body: JSON.stringify({ taskId: task.taskId, source, revision, nodeId: sourceNode.id }),
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage({
        key: body.reason === 'disconnected' ? 'compute_lab.runner_offline' : 'compute_lab.run_start_failed',
      });
      return;
    }
    if (!useGameStore.getState().computeLabRuns[body.runId]) {
      upsertComputeLabRun({
        id: body.runId,
        nodeId: sourceNode.id,
        taskId: task.taskId,
        revision,
        status: body.status,
        frames: [],
      });
    }
    setRunId(body.runId);
    setFrameIndex(0);
  };

  const cooldownRemaining = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const submit = async () => {
    if (!task || !run || stale) return;
    if (task.cost) setCooldownUntil(Date.now() + task.cost.cooldownSeconds * 1000);
    const response = await apiFetch('/api/compute-lab/submissions', {
      method: 'POST',
      body: JSON.stringify({ taskId: task.taskId, runId: run.id }),
    });
    const body = await response.json();
    if (body.correct) {
      setSubmissionSuccess({
        nodeSolveCount: Number(body.nodeSolveCount || 0),
        quest: {
          current: Number(body.quest?.current || 0),
          target: Number(body.quest?.target || 1),
          completed: body.quest?.completed === true,
        },
      });
    } else {
      setSubmissionSuccess(null);
    }
    setMessage(
      body.correct
        ? {
            key: 'compute_lab.submit_correct',
            vars: { amount: body.reward?.amount || 0, type: body.reward?.type || '' },
          }
        : body.correct === false
          ? { key: 'compute_lab.submit_wrong', vars: { expected: String(body.expected), got: String(body.got) } }
          : { key: 'compute_lab.submit_failed' },
    );
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('compute_lab.title')}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        overflow: 'auto',
        background: 'rgba(3, 8, 15, .98)',
        padding: 'max(18px, 4vw)',
        color: 'var(--text-primary)',
      }}
    >
      <header
        style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 16 }}
      >
        <div>
          <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{t('compute_lab.title')}</strong>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('compute_lab.workspace_subtitle')}</div>
        </div>
        <button ref={closeRef} onClick={closeComputeLab} style={{ minWidth: 44, minHeight: 44 }}>
          {t('compute_lab.exit')}
        </button>
      </header>
      {!available ? (
        <main role="status">{t('compute_lab.locked')}</main>
      ) : (
        <main style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(300px, 1fr)', gap: 18 }}>
          <section style={{ display: 'grid', gap: 12 }}>
            <div>
              <strong>{t('compute_lab.challenge')}</strong>
              <p>{t('compute_lab.task_description', { description: task?.description || '' })}</p>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(task?.params || {}, null, 2)}</pre>
            </div>
            <label htmlFor="compute-lab-editor">
              <pre style={{ whiteSpace: 'pre-wrap' }}>{task?.functionSignature || 'class ProblemSolver:'}</pre>
            </label>
            <textarea
              id="compute-lab-editor"
              value={source}
              onChange={event => updateSource(event.target.value)}
              spellCheck={false}
              style={{
                minHeight: 300,
                resize: 'vertical',
                fontFamily: 'var(--font-mono)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                padding: 14,
              }}
            />
            {task?.cost && (
              <div data-testid="compute-lab-submit-cost" style={{ color: 'var(--text-muted)' }}>
                {t('compute_lab.submit_cost', {
                  cooldown: task.cost.cooldownSeconds,
                  amount: task.cost.reward,
                  type: task.cost.rewardType,
                })}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={startRun}
                disabled={!task || !codeServerConnected || cooldownRemaining > 0}
                style={{ minHeight: 44 }}
              >
                {t('compute_lab.run')}
              </button>
              <button
                onClick={submit}
                disabled={!run || run.status !== 'trace_ready' || stale || cooldownRemaining > 0}
                style={{ minHeight: 44 }}
              >
                {t('compute_lab.submit')}
              </button>
            </div>
            {cooldownRemaining > 0 && (
              <div role="status" data-testid="compute-lab-cooldown">
                {t('compute_lab.cooldown_remaining', { seconds: cooldownRemaining })}
              </div>
            )}
            {!codeServerConnected && <div role="status">{t('compute_lab.runner_offline')}</div>}
            {message && <div role="status">{t(message.key, message.vars)}</div>}
            {submissionSuccess && (
              <div role="status">
                <div>{t('compute_lab.node_solve_count', { count: submissionSuccess.nodeSolveCount })}</div>
                <div>
                  {t('compute_lab.operators_progress', {
                    current: submissionSuccess.quest.current,
                    target: submissionSuccess.quest.target,
                  })}
                </div>
                {submissionSuccess.quest.completed && <div>{t('compute_lab.operators_completed')}</div>}
              </div>
            )}
          </section>
          <section
            aria-label={t('compute_lab.trace')}
            style={{ border: '1px solid var(--border-bright)', padding: 14, minHeight: 400 }}
          >
            <strong>{t('compute_lab.trace')}</strong>
            <div style={{ color: 'var(--text-muted)', margin: '8px 0' }}>
              {run
                ? t('compute_lab.step_position', { current: frameIndex + 1, total: run.frames.length })
                : t('compute_lab.run_to_trace')}
            </div>
            {terminal && (
              <div
                role="status"
                data-testid="compute-lab-outcome"
                style={{ border: '1px solid var(--border-bright)', padding: 10, marginBottom: 12 }}
              >
                <strong>{t(`compute_lab.outcome.${terminal}`)}</strong>
                <div>{t(`compute_lab.outcome_action.${terminal}`)}</div>
                {stoppedAt && stoppedAt.iteration > 0 && (
                  <div>
                    {t('compute_lab.outcome_stopped_in', { loop: stoppedAt.loop, iteration: stoppedAt.iteration })}
                  </div>
                )}
                {terminal !== 'trace_ready' && frame?.line !== undefined && (
                  <div>{t('compute_lab.outcome_last_line', { line: frame.line })}</div>
                )}
              </div>
            )}
            {stale && (
              <div role="status" data-testid="compute-lab-stale-trace" style={{ marginBottom: 10 }}>
                {t('compute_lab.old_trace')}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button onClick={() => setFrameIndex(0)} disabled={!run?.frames.length}>
                |&lt;
              </button>
              <button onClick={() => setFrameIndex(current => Math.max(0, current - 1))} disabled={!run?.frames.length}>
                ‹
              </button>
              <input
                aria-label="Trace step"
                type="range"
                min="0"
                max={Math.max(0, (run?.frames.length || 1) - 1)}
                value={frameIndex}
                onChange={event => setFrameIndex(Number(event.target.value))}
                disabled={!run?.frames.length}
              />
              <button
                onClick={() => setFrameIndex(current => Math.min((run?.frames.length || 1) - 1, current + 1))}
                disabled={!run?.frames.length}
              >
                ›
              </button>
              <button
                onClick={() => setFrameIndex(Math.max(0, (run?.frames.length || 1) - 1))}
                disabled={!run?.frames.length}
              >
                &gt;|
              </button>
            </div>
            {frame ? (
              <>
                <StepCard frame={frame} source={source} stale={stale} t={t} />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                  {Object.entries(frame.locals || {}).map(([name, value]) => (
                    <code
                      key={name}
                      style={{
                        border: `1px solid ${frame.changed?.includes(name) ? 'var(--accent)' : 'var(--border-bright)'}`,
                        padding: 6,
                      }}
                    >
                      {name}: {JSON.stringify(value)}
                    </code>
                  ))}
                </div>
                {frameError && (
                  <div role="alert">
                    {frameError.kind === 'invalid_trace_frame'
                      ? t('compute_lab.invalid_trace_frame')
                      : frameError.message}
                  </div>
                )}
              </>
            ) : (
              <p>{t('compute_lab.run_to_trace')}</p>
            )}
          </section>
        </main>
      )}
    </div>
  );
}
