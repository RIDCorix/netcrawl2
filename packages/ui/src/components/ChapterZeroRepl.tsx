import { FormEvent, useCallback, useEffect, useReducer, useState } from 'react';
import axios from 'axios';
import { Terminal } from 'lucide-react';
import { useT } from '../hooks/useT';
import { initialChapterZeroLoadState, reduceChapterZeroLoad } from '../lib/chapterZeroLoadState';

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

export function ChapterZeroRepl() {
  const t = useT();
  const [loadState, dispatchLoad] = useReducer(reduceChapterZeroLoad<TutorialState>, initialChapterZeroLoadState);
  const [command, setCommand] = useState('');
  const [error, setError] = useState(false);
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

  if (state?.completed && dismissed) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const response = await axios.post('/api/tutorial/chapter-zero', { command });
      dispatchLoad({ type: 'loaded', session: response.data });
      setCommand('');
      setError(false);
    } catch {
      setError(true);
    }
  };

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
      }}
    >
      <div
        style={{
          width: 560,
          maxWidth: '100%',
          background: 'var(--bg-glass-heavy)',
          border: '1px solid var(--accent)',
          borderRadius: 'var(--radius-lg)',
          padding: 24,
          fontFamily: 'var(--font-mono)',
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--accent)', fontWeight: 800 }}>
          <Terminal size={18} />
          {t('tutorial.chapter_zero.title')}
        </div>
        {loadState.status === 'failed' ? (
          <>
            <p role="alert" style={{ color: 'var(--danger)', lineHeight: 1.7 }}>
              {t('tutorial.chapter_zero.load_error')}
            </p>
            <button
              onClick={load}
              style={{ background: 'var(--accent)', border: 0, padding: '8px 14px', fontWeight: 800 }}
            >
              {t('tutorial.chapter_zero.retry')}
            </button>
          </>
        ) : loadState.status === 'loading' || !state ? (
          <p style={{ color: 'var(--text-secondary)' }}>{t('tutorial.chapter_zero.loading')}</p>
        ) : (
          <>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              {state.completed ? t('tutorial.chapter_zero.complete') : t(`tutorial.chapter_zero.step_${state.step}`)}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
              <div style={{ padding: 10, background: '#050807', border: '1px solid var(--border)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 9 }}>{t('tutorial.chapter_zero.worker')}</div>
                <div>{state.world.worker.nodeId}</div>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                  {state.world.worker.lastLog === 'Worker ready'
                    ? t('tutorial.chapter_zero.worker_ready')
                    : state.world.worker.lastLog || '—'}
                </div>
              </div>
              <div style={{ padding: 10, background: '#050807', border: '1px solid var(--border)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 9 }}>{t('tutorial.chapter_zero.items')}</div>
                <div>
                  {t('tutorial.chapter_zero.held').replace(
                    '{count}',
                    String(state.world.worker.holding.reduce((sum, item) => sum + item.count, 0)),
                  )}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                  {t('tutorial.chapter_zero.drops').replace(
                    '{count}',
                    String(state.world.mine.drops.reduce((sum, item) => sum + item.count, 0)),
                  )}
                </div>
              </div>
              <div style={{ padding: 10, background: '#050807', border: '1px solid var(--border)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 9 }}>{t('tutorial.chapter_zero.resources')}</div>
                <div>{t('tutorial.chapter_zero.data').replace('{count}', String(state.world.resources.data))}</div>
                <div style={{ fontSize: 10, color: 'var(--accent)' }}>
                  {state.transition ? t(`tutorial.chapter_zero.transition_${state.transition}`) : '—'}
                </div>
              </div>
            </div>
            {!state.completed ? (
              <>
                <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 8 }}>
                  {t('tutorial.chapter_zero.expected')} <code>{state.expected}</code>
                </div>
                <form onSubmit={submit} style={{ display: 'flex', gap: 8 }}>
                  <span style={{ color: 'var(--accent)', paddingTop: 8 }}>&gt;</span>
                  <input
                    autoFocus
                    value={command}
                    onChange={e => setCommand(e.target.value)}
                    aria-label={t('tutorial.chapter_zero.input')}
                    style={{
                      flex: 1,
                      padding: 8,
                      background: '#050807',
                      border: '1px solid var(--border-bright)',
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  />
                  <button
                    type="submit"
                    style={{ background: 'var(--accent)', border: 0, padding: '8px 14px', fontWeight: 800 }}
                  >
                    {t('tutorial.chapter_zero.run')}
                  </button>
                </form>
                {error && (
                  <p role="alert" style={{ color: 'var(--danger)', fontSize: 11 }}>
                    {t('tutorial.chapter_zero.error')}
                  </p>
                )}
                <div style={{ marginTop: 14, fontSize: 10, color: 'var(--text-muted)' }}>{state.step + 1} / 6</div>
              </>
            ) : (
              <button
                onClick={() => setDismissed(true)}
                style={{ background: 'var(--accent)', border: 0, padding: '8px 14px', fontWeight: 800 }}
              >
                {t('tutorial.chapter_zero.continue')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
