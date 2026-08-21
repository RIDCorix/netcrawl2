import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { apiFetch, SERVER_URL } from '../../lib/api';
import { useT } from '../../hooks/useT';

type SourceLocation = { lineno: number; col_offset: number; end_lineno: number; end_col_offset: number };
type EditorSession = {
  id: string;
  label: string;
  kind: 'desktop' | 'codespaces' | 'web';
  workspaceFolders: string[];
  expiresAt: number;
};
type CommandState = { id: string; outcome?: 'opened' | 'failed'; error?: string; expiresAt: number };

const EXTENSION_URL = 'https://github.com/RIDCorix/netcrawl2/releases/latest/download/netcrawl-editor-bridge.vsix';

export function EditorBridgePanel({
  nodeId,
  taskId,
  source,
  revision,
  selection,
}: {
  nodeId: string;
  taskId: string;
  source: string;
  revision: number;
  selection?: SourceLocation;
}) {
  const t = useT();
  const [sessions, setSessions] = useState<EditorSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [pairing, setPairing] = useState<{ code: string; expiresAt: number } | null>(null);
  const [command, setCommand] = useState<CommandState | null>(null);
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');

  const refreshSessions = async () => {
    const response = await apiFetch('/api/editor/sessions');
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Unable to load editors');
    const next = (body.sessions || []) as EditorSession[];
    setSessions(next);
    setSelectedSessionId(current => (next.some(session => session.id === current) ? current : next[0]?.id || ''));
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
    if (!command || command.outcome || command.expiresAt <= Date.now()) return;
    let active = true;
    const update = async () => {
      try {
        const response = await apiFetch(`/api/editor/commands/${command.id}`);
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Unable to read editor command');
        if (active) setCommand(body.command);
      } catch {
        if (active) {
          setCommand(current => (current ? { ...current, outcome: 'failed' } : current));
          setError(t('compute_lab.editor.open_failed'));
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
      setPairing(body);
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
      setCommand(body.command);
    } catch {
      setError(t('compute_lab.editor.open_failed'));
    }
  };

  const commandStatus = !command
    ? null
    : command.outcome === 'opened'
      ? { className: 'compute-lab-editor-state compute-lab-editor-state-opened', text: t('compute_lab.editor.opened') }
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
              text: t('compute_lab.editor.opening'),
            };

  return (
    <section className="compute-lab-panel compute-lab-editor" aria-label={t('compute_lab.editor.title')}>
      <div className="compute-lab-editor-heading">
        <strong className="compute-lab-heading">{t('compute_lab.editor.title')}</strong>
        <a href={EXTENSION_URL} target="_blank" rel="noreferrer">
          {t('compute_lab.editor.install')} <ExternalLink size={11} aria-hidden="true" />
        </a>
      </div>
      {sessions.length > 0 ? (
        <>
          <label htmlFor="compute-lab-editor-session">{t('compute_lab.editor.choose')}</label>
          <select
            id="compute-lab-editor-session"
            value={selectedSessionId}
            onChange={event => setSelectedSessionId(event.target.value)}
          >
            {sessions.map(session => (
              <option key={session.id} value={session.id}>
                {session.label} · {session.kind}
                {session.workspaceFolders.length ? ` · ${session.workspaceFolders.join(', ')}` : ''}
              </option>
            ))}
          </select>
          <button className="compute-lab-button-primary" onClick={() => void open()} disabled={!selectedSessionId}>
            {t('compute_lab.editor.open')}
          </button>
          <div className="compute-lab-editor-state compute-lab-editor-state-online">
            {t('compute_lab.editor.online')}
          </div>
        </>
      ) : (
        <div className="compute-lab-editor-state compute-lab-editor-state-offline">
          <strong>{t('compute_lab.editor.offline')}</strong>
          <span>{t('compute_lab.editor.offline_help')}</span>
        </div>
      )}
      <button onClick={() => void pair()}>
        {sessions.length ? t('compute_lab.editor.pair_another') : t('compute_lab.editor.pair')}
      </button>
      {pairing && (
        <div className="compute-lab-editor-pairing" role="status">
          <span>{t('compute_lab.editor.server')}</span>
          <code>{SERVER_URL}</code>
          <span>{t('compute_lab.editor.code')}</span>
          <strong>{pairing.code}</strong>
          <small>{t('compute_lab.editor.pair_hint')}</small>
        </div>
      )}
      {commandStatus && <div className={commandStatus.className}>{commandStatus.text}</div>}
      {(error || listError) && (
        <div className="compute-lab-editor-state compute-lab-editor-state-failed">{error || listError}</div>
      )}
    </section>
  );
}
