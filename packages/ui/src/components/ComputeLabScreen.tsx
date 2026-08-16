import { useEffect, useRef, useState } from 'react';
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
};
type SubmissionSuccess = {
  nodeSolveCount: number;
  quest: { current: number; target: number; completed: boolean };
};
const TERMINAL = new Set(['trace_ready', 'syntax', 'runtime', 'timeout', 'limit', 'disconnected']);

type TraceExpression = Extract<Run['frames'][number], { phase: 'eval' }>['expression'];
type ExpressionCardProps = {
  expression: TraceExpression;
  source: string;
  stale: boolean;
  t: ReturnType<typeof useT>;
};

function sourceExcerpt(source: string, location: TraceExpression['location']) {
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

function ExpressionSource({ expression, source, stale, t }: ExpressionCardProps) {
  const excerpt = stale ? null : sourceExcerpt(source, expression.location);
  if (stale)
    return (
      <div>
        <small>{t('compute_lab.old_trace')}</small>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{expression.source}</pre>
      </div>
    );
  return excerpt ? (
    <pre style={{ whiteSpace: 'pre-wrap' }}>
      {excerpt.before}
      <mark>{excerpt.selected}</mark>
      {excerpt.after}
    </pre>
  ) : (
    <pre style={{ whiteSpace: 'pre-wrap' }}>{expression.source}</pre>
  );
}

function RegisteredExpressionCard(props: ExpressionCardProps) {
  return (
    <div style={{ border: '1px solid var(--accent)', padding: 10, marginTop: 10 }}>
      <strong>
        {props.t('compute_lab.expression')} · {props.expression.node_type}
      </strong>
      <ExpressionSource {...props} />
      <code>→ {JSON.stringify(props.expression.value)}</code>
    </div>
  );
}

function GenericExpressionCard(props: ExpressionCardProps) {
  const { expression, t } = props;
  const location = expression.location;
  return (
    <div
      data-testid="compute-lab-generic-expression"
      style={{ border: '1px dashed var(--accent)', padding: 10, marginTop: 10 }}
    >
      <strong>
        {t('compute_lab.expression_fallback')} · {expression.node_type}
      </strong>
      <ExpressionSource {...props} />
      <div>
        <code>{JSON.stringify(expression.value)}</code>
      </div>
      <small>
        {t('compute_lab.source_location')}: {location.lineno}:{location.col_offset}–{location.end_lineno}:
        {location.end_col_offset}
      </small>
    </div>
  );
}

const EXPRESSION_CARD_REGISTRY: Record<string, (props: ExpressionCardProps) => JSX.Element> = {
  BinOp: RegisteredExpressionCard,
  BoolOp: RegisteredExpressionCard,
  Call: RegisteredExpressionCard,
  Compare: RegisteredExpressionCard,
  Subscript: RegisteredExpressionCard,
};

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
    if (run && ['syntax', 'runtime', 'limit', 'timeout', 'disconnected'].includes(run.status))
      setFrameIndex(Math.max(0, run.frames.length - 1));
  }, [run?.status, run?.frames.length]);

  if (!computeLabOpen) return null;
  const stale = Boolean(
    run &&
    (!sourceNode || !task || run.nodeId !== sourceNode.id || run.taskId !== task.taskId || run.revision !== revision),
  );
  const frame = run?.frames[frameIndex];
  const expression = frame?.phase === 'eval' ? frame.expression : undefined;
  const control = frame?.phase === 'control' ? frame.control : undefined;
  const returnValue = frame?.phase === 'return' ? frame.value : undefined;
  const frameError = frame?.phase === 'error' || frame?.phase === 'limit' ? frame.error : undefined;
  const ExpressionCard = expression ? EXPRESSION_CARD_REGISTRY[expression.node_type] || GenericExpressionCard : null;
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

  const submit = async () => {
    if (!task || !run || stale) return;
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
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={startRun} disabled={!task || !codeServerConnected} style={{ minHeight: 44 }}>
                {t('compute_lab.run')}
              </button>
              <button
                onClick={submit}
                disabled={!run || run.status !== 'trace_ready' || stale}
                style={{ minHeight: 44 }}
              >
                {t('compute_lab.submit')}
              </button>
            </div>
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
              {run ? `${run.status} · ${frameIndex + 1}/${run.frames.length}` : t('compute_lab.run_to_trace')}
            </div>
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
                <div>
                  <strong>{frame.phase.toUpperCase()}</strong>
                  {frame.line ? ` · line ${frame.line}` : ''}
                </div>
                {expression && ExpressionCard && (
                  <ExpressionCard expression={expression} source={source} stale={stale} t={t} />
                )}
                {control && (
                  <div style={{ border: '1px solid var(--border-bright)', padding: 10, marginTop: 10 }}>
                    <strong>
                      {t('compute_lab.control')} · {control.node_type} ·{' '}
                      {t(`compute_lab.control_event.${control.event}`)}
                    </strong>
                    {control.event === 'iteration' && (
                      <div>{t('compute_lab.control_detail.iteration', { iteration: control.iteration })}</div>
                    )}
                    {control.event === 'test' && (
                      <div>
                        {t('compute_lab.control_detail.test')} → {t(`compute_lab.boolean.${String(control.test)}`)}
                      </div>
                    )}
                    {control.event === 'branch' && (
                      <div>
                        {t('compute_lab.control_detail.branch')} → {t(`compute_lab.control_branch.${control.branch}`)}
                      </div>
                    )}
                    {control.event === 'iteration' &&
                      control.targetBindings &&
                      Object.keys(control.targetBindings).length > 0 && (
                        <div>
                          {t('compute_lab.control_detail.bindings')} →{' '}
                          {Object.entries(control.targetBindings)
                            .map(([name, value]) => `${name}: ${JSON.stringify(value)}`)
                            .join(', ')}
                        </div>
                      )}
                  </div>
                )}
                {returnValue !== undefined && (
                  <div>
                    return: <code>{JSON.stringify(returnValue)}</code>
                  </div>
                )}
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
                {run?.status === 'limit' && frame.phase === 'limit' && (
                  <div role="alert">{t('compute_lab.limit_reached')}</div>
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
