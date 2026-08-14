import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useGameStore } from '../store/gameStore';
import { useT } from '../hooks/useT';

const ADD_NODE_ID = 'e_op_add';

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

/** A local, unlocked-map view. It never changes the active game layer. */
export function ComputeLabScreen() {
  const { computeLabOpen, computeLabSourceNodeId, nodes, selectNode, closeComputeLab } = useGameStore();
  const t = useT();
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const source = nodes.find(node => node.id === computeLabSourceNodeId);
  const available = source?.id === ADD_NODE_ID && source.type === 'compute' && source.data.unlocked === true;

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
  const entries = [
    ['START', t('compute_lab.start_deploy')],
    ['OPERATOR', '+'],
    ['INPUT A', t('compute_lab.read_only')],
    ['INPUT B', t('compute_lab.read_only')],
    ['RESULT', t('compute_lab.read_only')],
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
      {!available ? (
        <main role="status" style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--text-muted)' }}>
          {t('compute_lab.locked')}
        </main>
      ) : (
        <main
          tabIndex={0}
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
                {label === 'START' ? (
                  <button
                    title={value}
                    onClick={() => {
                      selectNode(ADD_NODE_ID);
                      closeComputeLab();
                    }}
                    style={{ ...nodeStyle, borderColor: 'var(--accent)', cursor: 'pointer' }}
                  >
                    <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{label}</span>
                    <strong>{value}</strong>
                  </button>
                ) : (
                  <div role="img" aria-label={`${label}: ${value}`} title={value} style={nodeStyle}>
                    <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{label}</span>
                    <strong>{value}</strong>
                  </div>
                )}
              </div>
            ))}
          </div>
        </main>
      )}
      <footer style={{ color: 'var(--text-muted)', fontSize: 12 }}>
        {available ? t('compute_lab.return_hint') : t('compute_lab.locked_hint')}
      </footer>
    </div>
  );
}
