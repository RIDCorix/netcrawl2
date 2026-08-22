import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ChevronDown, ExternalLink, Play } from 'lucide-react';
import { apiFetch, SERVER_URL } from '../../lib/api';
import { useT } from '../../hooks/useT';
import type { ComputeLabRunSnapshot } from '../../store/gameStore';

type SourceLocation = { lineno: number; col_offset: number; end_lineno: number; end_col_offset: number };
type EditorSession = {
  id: string;
  label: string;
  kind: 'desktop' | 'codespaces' | 'web';
  workspaceFolders: string[];
  expiresAt: number;
};
type CommandState = {
  id: string;
  type: 'open_problem' | 'run_problem';
  outcome?: 'opened' | 'run_started' | 'failed';
  error?: string;
  runId?: string;
  expiresAt: number;
};

const EXTENSION_URL = 'https://github.com/RIDCorix/netcrawl2/releases/latest/download/netcrawl-editor-bridge.vsix';
const TERMINAL_STATUSES = new Set(['trace_ready', 'syntax', 'runtime', 'timeout', 'limit', 'disconnected']);

export function EditorBridgePanel({
  nodeId,
  taskId,
  source,
  revision,
  selection,
  run,
  codeServerConnected,
  children,
}: {
  nodeId: string;
  taskId: string;
  source: string;
  revision: number;
  selection?: SourceLocation;
  run?: ComputeLabRunSnapshot;
  codeServerConnected: boolean;
  children: ReactNode;
}) {
  const t = useT();
  const [sessions, setSessions] = useState<EditorSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [pairing, setPairing] = useState<{ code: string; expiresAt: number; sessionIds: string[] } | null>(null);
  const [clock, setClock] = useState(Date.now());
  const [pairingSuccess, setPairingSuccess] = useState(false);
  const [command, setCommand] = useState<CommandState | null>(null);
  const [bound, setBound] = useState(false);
  const [problemPath, setProblemPath] = useState('');
  const [connectionOpen, setConnectionOpen] = useState(true);
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const hadOnlineEditor = useRef(false);

  const refreshSessions = async () => {
    const response = await apiFetch('/api/editor/sessions');
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Unable to load editors');
    const next = (body.sessions || []) as EditorSession[];
    setSessions(next);
    setSelectedSessionId(current => {
      const nextId = next.some(session => session.id === current) ? current : next[0]?.id || '';
      if (nextId !== current) {
        setBound(false);
        setProblemPath('');
      }
      return nextId;
    });
    if (next.length > 0 && !hadOnlineEditor.current) {
      hadOnlineEditor.current = true;
      setConnectionOpen(false);
    } else if (next.length === 0) {
      hadOnlineEditor.current = false;
      setConnectionOpen(true);
    }
  };

  useEffect(() => {
    let active = true;
    const update = () =>
      refreshSessions()
        .then(() => {
          if (active) setListError('');
        })
        .catch(() => {
          if (active) setListError(t('compute_lab.editor.list_failed'));
        });
    void update();
    const timer = setInterval(update, 3_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!pairing) return;
    const timer = setInterval(() => setClock(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [pairing]);

  useEffect(() => {
    if (!pairing || !sessions.some(session => !pairing.sessionIds.includes(session.id))) return;
    setPairing(null);
    setPairingSuccess(true);
    setConnectionOpen(false);
  }, [pairing, sessions]);

  useEffect(() => {
    if (!selectedSessionId) {
      setBound(false);
      setProblemPath('');
      return;
    }
    setBound(false);
    setProblemPath('');
    let active = true;
    const params = new URLSearchParams({ sessionId: selectedSessionId, nodeId, taskId });
    apiFetch(`/api/editor/problem-status?${params}`)
      .then(async response => ({ response, body: await response.json() }))
      .then(({ response, body }) => {
        if (!active) return;
        if (!response.ok) throw new Error(body.error || 'Unable to read problem status');
        setBound(Boolean(body.bound));
        setProblemPath(String(body.relativePath || ''));
      })
      .catch(() => {
        if (active) setBound(false);
      });
    return () => {
      active = false;
    };
  }, [selectedSessionId, nodeId, taskId]);

  useEffect(() => {
    if (!command || command.outcome || command.expiresAt <= Date.now()) return;
    let active = true;
    const update = async () => {
      try {
        const response = await apiFetch(`/api/editor/commands/${command.id}`);
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Unable to read editor command');
        if (!active) return;
        setCommand(body.command);
        if (body.command.type === 'open_problem' && body.command.outcome === 'opened') setBound(true);
      } catch {
        if (active) {
          setCommand(current => (current ? { ...current, outcome: 'failed' } : current));
          setError(t('compute_lab.editor.command_failed'));
        }
      }
    };
    const timer = setInterval(() => void update(), 500);
    void update();
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [command?.id, command?.outcome, command?.expiresAt]);

  const pair = async () => {
    setError('');
    try {
      const response = await apiFetch('/api/editor/pairing-tickets', { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to create pairing code');
      setPairing({ ...body, sessionIds: sessions.map(session => session.id) });
      setPairingSuccess(false);
      setConnectionOpen(true);
    } catch {
      setError(t('compute_lab.editor.pair_failed'));
    }
  };

  const open = async () => {
    if (!selectedSessionId) return;
    setError('');
    setCommand(null);
    try {
      const response = await apiFetch('/api/editor/commands/open', {
        method: 'POST',
        body: JSON.stringify({ sessionId: selectedSessionId, nodeId, taskId, source, revision, selection }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(
          body.reason === 'editor_disconnected'
            ? t('compute_lab.editor.disconnected')
            : t('compute_lab.editor.open_failed'),
        );
        void refreshSessions().catch(() => undefined);
        return;
      }
      setBound(false);
      setProblemPath(String(body.command.relativePath || ''));
      setCommand(body.command);
    } catch {
      setError(t('compute_lab.editor.open_failed'));
    }
  };

  const startRun = async () => {
    if (!codeServerConnected || !selectedSessionId || !bound) return;
    setError('');
    setCommand(null);
    try {
      const response = await apiFetch('/api/editor/commands/run', {
        method: 'POST',
        body: JSON.stringify({ sessionId: selectedSessionId, nodeId, taskId }),
      });
      const body = await response.json();
      if (!response.ok) {
        const key =
          body.reason === 'editor_disconnected'
            ? 'compute_lab.editor.disconnected'
            : body.reason === 'invalid_editor_file'
              ? 'compute_lab.editor.open_first'
              : body.reason === 'run_in_progress'
                ? 'compute_lab.editor.already_running'
                : 'compute_lab.editor.run_failed';
        setError(t(key));
        if (body.reason === 'invalid_editor_file') setBound(false);
        return;
      }
      setCommand(body.command);
    } catch {
      setError(t('compute_lab.editor.run_failed'));
    }
  };

  const selected = sessions.find(session => session.id === selectedSessionId);
  const pairingExpired = Boolean(pairing && pairing.expiresAt <= clock);
  const commandPending = Boolean(command && !command.outcome && command.expiresAt > Date.now());
  const commandRunActive = Boolean(
    command?.type === 'run_problem' &&
    (commandPending ||
      (command.outcome === 'run_started' && (!run || run.id !== command.runId || !TERMINAL_STATUSES.has(run.status)))),
  );
  const runActive = Boolean(run && !TERMINAL_STATUSES.has(run.status));
  const busy = commandRunActive || runActive;
  const commandTerminalRun =
    command?.type === 'run_problem' &&
    command.outcome === 'run_started' &&
    run &&
    run.id === command.runId &&
    TERMINAL_STATUSES.has(run.status)
      ? run
      : undefined;
  const commandStatus = !command
    ? null
    : command.outcome === 'opened'
      ? { className: 'compute-lab-editor-state compute-lab-editor-state-opened', text: t('compute_lab.editor.opened') }
      : command.outcome === 'run_started'
        ? commandTerminalRun
          ? {
              className: `compute-lab-editor-state ${
                commandTerminalRun.status === 'trace_ready'
                  ? 'compute-lab-editor-state-opened'
                  : 'compute-lab-editor-state-failed'
              }`,
              text: t('compute_lab.editor.run_finished', {
                outcome: t(`compute_lab.outcome.${commandTerminalRun.status}`),
              }),
            }
          : {
              className: 'compute-lab-editor-state compute-lab-editor-state-running',
              text: t('compute_lab.editor.running'),
            }
        : command.outcome === 'failed'
          ? {
              className: 'compute-lab-editor-state compute-lab-editor-state-failed',
              text: t('compute_lab.editor.failed', { error: command.error || '' }),
            }
          : command.expiresAt <= Date.now()
            ? {
                className: 'compute-lab-editor-state compute-lab-editor-state-failed',
                text: t('compute_lab.editor.expired'),
              }
            : {
                className: 'compute-lab-editor-state compute-lab-editor-state-pending',
                text: t(
                  command.type === 'run_problem' ? 'compute_lab.editor.run_queued' : 'compute_lab.editor.opening',
                ),
              };

  const pairingCard = pairing && (
    <div
      className={`compute-lab-editor-pairing${pairingExpired ? ' compute-lab-editor-state-failed' : ''}`}
      role="status"
    >
      <span>{t('compute_lab.editor.server')}</span>
      <code>{SERVER_URL}</code>
      <span>{t('compute_lab.editor.code')}</span>
      <strong>{pairingExpired ? t('compute_lab.editor.pairing_expired') : pairing.code}</strong>
      <small>{t(pairingExpired ? 'compute_lab.editor.pairing_retry' : 'compute_lab.editor.pair_hint')}</small>
    </div>
  );

  return (
    <section className="compute-lab-panel compute-lab-visualization" aria-label={t('compute_lab.trace')}>
      {!codeServerConnected || !selectedSessionId ? (
        <div className="compute-lab-pair-blocked">
          <strong className="compute-lab-heading">{t('compute_lab.trace')}</strong>
          <div className="compute-lab-editor-state compute-lab-editor-state-offline">
            <strong>
              {t(
                !selectedSessionId || codeServerConnected
                  ? 'compute_lab.editor.offline'
                  : 'compute_lab.editor.code_server_offline',
              )}
            </strong>
            <span>
              {t(
                !selectedSessionId || codeServerConnected
                  ? 'compute_lab.editor.offline_help'
                  : 'compute_lab.editor.code_server_offline_help',
              )}
            </span>
          </div>
          <button
            className="compute-lab-button-primary compute-lab-pair-primary"
            data-testid="compute-lab-pair-primary"
            onClick={() => void pair()}
          >
            {t(pairingExpired ? 'compute_lab.editor.pair_retry' : 'compute_lab.editor.pair')}
          </button>
          {pairingCard}
          {(error || listError) && (
            <div className="compute-lab-editor-state compute-lab-editor-state-failed">{error || listError}</div>
          )}
          <a className="compute-lab-extension-link" href={EXTENSION_URL} target="_blank" rel="noreferrer">
            {t('compute_lab.editor.install')} <ExternalLink size={11} aria-hidden="true" />
          </a>
        </div>
      ) : (
        <>
          <div className="compute-lab-editor-toolbar">
            <div className="compute-lab-solution-heading">
              <div>
                <strong className="compute-lab-heading">{t('compute_lab.solution.title')}</strong>
                <p>{t('compute_lab.solution.instructions')}</p>
              </div>
              <span className="compute-lab-solution-path">{problemPath || t('compute_lab.solution.file_pending')}</span>
            </div>
            <div className="compute-lab-editor-actions">
              <div
                className={`compute-lab-editor-state ${bound ? 'compute-lab-editor-state-online' : 'compute-lab-editor-state-pending'}`}
              >
                {bound
                  ? t('compute_lab.editor.ready', { editor: selected?.label || '' })
                  : t('compute_lab.editor.open_first')}
              </div>
              <button onClick={() => void open()} disabled={commandPending}>
                {t(bound ? 'compute_lab.editor.reopen' : 'compute_lab.editor.open')}
              </button>
              <button
                className="compute-lab-button-primary compute-lab-run-solution"
                data-testid="compute-lab-run-solution"
                onClick={() => void startRun()}
                disabled={!bound || busy}
              >
                <Play size={14} aria-hidden="true" />
                {t(busy ? 'compute_lab.solution.running' : 'compute_lab.solution.run')}
              </button>
            </div>
          </div>
          {commandStatus && <div className={commandStatus.className}>{commandStatus.text}</div>}
          {pairingSuccess && (
            <div className="compute-lab-editor-state compute-lab-editor-state-online" role="status">
              {t('compute_lab.editor.pair_success')}
            </div>
          )}
          {(error || listError) && (
            <div className="compute-lab-editor-state compute-lab-editor-state-failed">{error || listError}</div>
          )}
          <details
            className="compute-lab-editor-details"
            open={connectionOpen}
            onToggle={event => setConnectionOpen(event.currentTarget.open)}
          >
            <summary>
              <span>{t('compute_lab.editor.connected_as', { editor: selected?.label || '' })}</span>
              <ChevronDown size={14} aria-hidden="true" />
            </summary>
            <div className="compute-lab-editor-controls">
              <label htmlFor="compute-lab-editor-session">{t('compute_lab.editor.choose')}</label>
              <select
                id="compute-lab-editor-session"
                value={selectedSessionId}
                onChange={event => {
                  setBound(false);
                  setProblemPath('');
                  setSelectedSessionId(event.target.value);
                  setCommand(null);
                  setError('');
                }}
              >
                {sessions.map(session => (
                  <option key={session.id} value={session.id}>
                    {session.label} · {session.kind}
                    {session.workspaceFolders.length ? ` · ${session.workspaceFolders.join(', ')}` : ''}
                  </option>
                ))}
              </select>
              <button onClick={() => void pair()}>{t('compute_lab.editor.pair_another')}</button>
              {pairingCard}
            </div>
          </details>
          <div className="compute-lab-trace-region">{children}</div>
        </>
      )}
    </section>
  );
}
