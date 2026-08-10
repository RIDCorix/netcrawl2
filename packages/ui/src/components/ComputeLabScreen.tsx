import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useGameStore } from '../store/gameStore';
import { useT } from '../hooks/useT';

const nodeStyle: CSSProperties = {
  minWidth: 116,
  minHeight: 76,
  padding: 12,
  borderRadius: 10,
  border: '1px solid var(--border-bright)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: 4,
  fontFamily: 'var(--font-mono)',
  textAlign: 'center',
  flex: '0 0 auto',
};

/** Local overlay only: it never switches layers, moves workers, or pauses ticks. */
export function ComputeLabScreen() {
  const { computeLabOpen, computeLabSourceNodeId, computeLab, closeComputeLab } = useGameStore();
  const t = useT();
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const session = computeLab.sessions.find(s => s.sourceNodeId === computeLabSourceNodeId && s.operatorId === 'add');

  useEffect(() => {
    if (!computeLabOpen) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeComputeLab();
      }
      if (event.key === 'Tab') {
        const focusable = Array.from(
          dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]') || [],
        );
        const current = focusable.indexOf(document.activeElement as HTMLElement);
        const next = event.shiftKey
          ? current <= 0
            ? focusable.length - 1
            : current - 1
          : current === focusable.length - 1
            ? 0
            : current + 1;
        if (focusable.length) {
          event.preventDefault();
          focusable[next].focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [computeLabOpen, closeComputeLab]);

  if (!computeLabOpen) return null;
  const task = session?.task;
  const params = task?.params || {};
  const status = session?.status || 'available';
  const result =
    status === 'mastered'
      ? t('compute_lab.mastered')
      : session?.lastAttempt && !session.lastAttempt.correct
        ? t('compute_lab.retry')
        : t('compute_lab.waiting');
  const entries = [
    ['START', t('compute_lab.request')],
    ['OPERATOR', '+'],
    ['INPUT A', task ? String(params.a ?? '—') : '—'],
    ['INPUT B', task ? String(params.b ?? '—') : '—'],
    ['RESULT', result],
  ];

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
        background: 'rgba(3, 8, 15, .96)',
        padding: 'max(18px, 4vw)',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      <style>{`@media (max-width: 680px) { .compute-lab-chain { flex-direction: column !important; align-items: stretch !important; } .compute-lab-arrow { transform: rotate(90deg); } }`}</style>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--accent)' }}>
            {t('compute_lab.title')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('compute_lab.subtitle')}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            aria-label={t('compute_lab.zoom_out')}
            onClick={() => setZoom(z => Math.max(0.75, z - 0.1))}
            style={{ minWidth: 44, minHeight: 44 }}
          >
            −
          </button>
          <button
            aria-label={t('compute_lab.zoom_in')}
            onClick={() => setZoom(z => Math.min(1.35, z + 0.1))}
            style={{ minWidth: 44, minHeight: 44 }}
          >
            +
          </button>
          <button ref={closeRef} onClick={closeComputeLab} style={{ minWidth: 44, minHeight: 44 }}>
            {t('compute_lab.exit')}
          </button>
        </div>
      </header>
      {!session ? (
        <div role="status" style={{ color: 'var(--text-muted)' }}>
          {t('compute_lab.empty')}
        </div>
      ) : (
        <main
          tabIndex={0}
          aria-live="polite"
          style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', outline: 'none' }}
        >
          <div
            className="compute-lab-chain"
            style={{
              margin: 'auto',
              transform: `scale(${zoom})`,
              transformOrigin: 'center',
              transition: 'transform .15s',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            {entries.map(([label, value], index) => (
              <div key={label} style={{ display: 'contents' }}>
                {index > 0 && (
                  <span
                    className="compute-lab-arrow"
                    aria-hidden="true"
                    style={{ color: 'var(--accent)', fontSize: 24 }}
                  >
                    →
                  </span>
                )}
                <button tabIndex={0} title={String(value)} style={nodeStyle}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{label}</span>
                  <strong>{value}</strong>
                </button>
              </div>
            ))}
          </div>
        </main>
      )}
      <footer style={{ color: 'var(--text-muted)', fontSize: 12 }}>
        {status === 'active' ? t('compute_lab.worker_hint') : t('compute_lab.return_hint')}
      </footer>
    </div>
  );
}
