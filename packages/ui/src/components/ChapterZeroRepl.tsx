import { FormEvent, useEffect, useState } from 'react';
import axios from 'axios';
import { Terminal } from 'lucide-react';
import { useT } from '../hooks/useT';

type TutorialState = { step: number; completed: boolean; expected: string | null };

export function ChapterZeroRepl() {
  const t = useT();
  const [state, setState] = useState<TutorialState | null>(null);
  const [command, setCommand] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    axios.get('/api/tutorial/chapter-zero').then(r => setState(r.data));
  }, []);

  if (!state || state.completed) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const response = await axios.post('/api/tutorial/chapter-zero', { command });
      setState(response.data);
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
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          {t(`tutorial.chapter_zero.step_${state.step}`)}
        </p>
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
      </div>
    </div>
  );
}
