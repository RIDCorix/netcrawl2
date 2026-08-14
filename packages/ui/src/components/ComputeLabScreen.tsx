import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { apiFetch } from '../lib/api';
import { useT } from '../hooks/useT';

type Frame = {
  sequence: number;
  phase: string;
  line?: number;
  locals?: Record<string, unknown>;
  changed?: string[];
  expression?: { source: string; value: unknown };
  value?: unknown;
  error?: { message: string };
};
type Run = { id: string; revision: number; status: string; frames: Frame[]; returnValue?: unknown };
type Task = {
  taskId: string;
  params: Record<string, unknown>;
  hint: string;
  difficulty: string;
  functionSignature: string;
};
const TERMINAL = new Set(['trace_ready', 'syntax', 'runtime', 'timeout', 'limit', 'disconnected']);

/** Focused code workspace. Its only visual model is program state, never map geography. */
export function ComputeLabScreen() {
  const { computeLabOpen, computeLabSourceNodeId, nodes, closeComputeLab, codeServerConnected } = useGameStore();
  const t = useT();
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const sourceNode = nodes.find(node => node.id === computeLabSourceNodeId);
  const available = sourceNode?.type === 'compute' && sourceNode.data.unlocked === true;
  const [task, setTask] = useState<Task | null>(null);
  const [source, setSource] = useState(
    'def solve(params):\n    # Return the answer for this task.\n    return params["a"] + params["b"]\n',
  );
  const [revision, setRevision] = useState(0);
  const [run, setRun] = useState<Run | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [message, setMessage] = useState<{ key: string; vars?: Record<string, string | number> } | null>(null);

  useEffect(() => {
    if (!computeLabOpen || !available || !sourceNode) return;
    const key = `netcrawl-compute-lab:${sourceNode.id}`;
    const saved = localStorage.getItem(key);
    if (saved) setSource(saved);
    closeRef.current?.focus();
    apiFetch('/api/compute-lab/tasks', { method: 'POST', body: JSON.stringify({ nodeId: sourceNode.id }) })
      .then(async response => ({ response, body: await response.json() }))
      .then(({ response, body }) => {
        if (!response.ok) throw new Error(body.error || 'Unable to load task');
        setTask(body);
        setMessage(null);
      })
      .catch(() => setMessage({ key: 'compute_lab.task_load_failed' }));
  }, [computeLabOpen, available, sourceNode?.id]);

  useEffect(() => {
    if (!sourceNode || !computeLabOpen) return;
    localStorage.setItem(`netcrawl-compute-lab:${sourceNode.id}`, source);
  }, [source, sourceNode?.id, computeLabOpen]);

  useEffect(() => {
    if (!run || TERMINAL.has(run.status)) return;
    const timer = window.setInterval(() => {
      apiFetch(`/api/compute-lab/runs/${run.id}`)
        .then(response => response.json())
        .then(body => {
          if (body.run) {
            setRun(body.run);
            setFrameIndex(Math.max(0, body.run.frames.length - 1));
          }
        })
        .catch(() => setMessage({ key: 'compute_lab.connection_lost' }));
    }, 350);
    return () => window.clearInterval(timer);
  }, [run?.id, run?.status]);

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

  if (!computeLabOpen) return null;
  const stale = Boolean(run && run.revision !== revision);
  const frame = run?.frames[frameIndex];
  const updateSource = (value: string) => {
    setSource(value);
    setRevision(current => current + 1);
  };
  const startRun = async () => {
    if (!task || !sourceNode) return;
    setMessage(null);
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
    setRun({ id: body.runId, revision, status: body.status, frames: [] });
    setFrameIndex(0);
  };
  const submit = async () => {
    if (!task || !run || stale) return;
    const response = await apiFetch('/api/compute-lab/submissions', {
      method: 'POST',
      body: JSON.stringify({ taskId: task.taskId, runId: run.id }),
    });
    const body = await response.json();
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
              <p style={{ color: 'var(--text-muted)' }}>{task?.hint || t('compute_lab.loading')}</p>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(task?.params || {}, null, 2)}</pre>
            </div>
            <label htmlFor="compute-lab-editor">
              <strong>{task?.functionSignature || 'def solve(params):'}</strong>
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
          </section>
          <section
            aria-label={t('compute_lab.trace')}
            style={{ border: '1px solid var(--border-bright)', padding: 14, minHeight: 400 }}
          >
            <strong>{t('compute_lab.trace')}</strong>
            <div style={{ color: 'var(--text-muted)', margin: '8px 0' }}>
              {run ? `${run.status} · ${frameIndex + 1}/${run.frames.length}` : t('compute_lab.run_to_trace')}
            </div>
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
                {frame.expression && (
                  <div>
                    eval:{' '}
                    <code>
                      {frame.expression.source} → {JSON.stringify(frame.expression.value)}
                    </code>
                  </div>
                )}
                {frame.value !== undefined && (
                  <div>
                    return: <code>{JSON.stringify(frame.value)}</code>
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
                {frame.error && <div role="alert">{frame.error.message}</div>}
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
