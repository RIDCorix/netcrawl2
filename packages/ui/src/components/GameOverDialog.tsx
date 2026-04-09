/**
 * GameOverDialog — appears when the hub is destroyed (gameOver === true).
 * Offers to restore from the latest autosave snapshot or fully reset the game.
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, RotateCcw, Power } from 'lucide-react';
import axios from 'axios';
import { useGameStore } from '../store/gameStore';
import { apiFetch } from '../lib/api';

interface AutosaveInfo {
  exists: boolean;
  ts?: number;
  tick?: number;
}

function formatAgo(ts: number): string {
  const secs = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  return `${hours}h ago`;
}

export function GameOverDialog() {
  const gameOver = useGameStore(s => s.gameOver);
  const [info, setInfo] = useState<AutosaveInfo | null>(null);
  const [busy, setBusy] = useState<'restore' | 'reset' | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Inline two-step confirmation for "重新開始" — no browser confirm() dialog.
  const [confirmReset, setConfirmReset] = useState(false);

  // Fetch autosave metadata whenever the dialog opens
  useEffect(() => {
    if (!gameOver) {
      setInfo(null);
      setError(null);
      setConfirmReset(false);
      return;
    }
    axios.get('/api/autosave')
      .then(r => setInfo(r.data))
      .catch(() => setInfo({ exists: false }));
  }, [gameOver]);

  const handleRestore = async () => {
    setBusy('restore');
    setError(null);
    try {
      await axios.post('/api/autosave/restore');
      // Refetch full state so UI flips out of gameOver immediately
      const r = await apiFetch('/api/state');
      const data = await r.json();
      useGameStore.getState().updateFromServer(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Restore failed');
      setBusy(null);
    }
  };

  const handleReset = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setBusy('reset');
    setError(null);
    try {
      await axios.post('/api/reset');
      const r = await apiFetch('/api/state');
      const data = await r.json();
      useGameStore.getState().updateFromServer(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Reset failed');
      setBusy(null);
    }
  };

  return (
    <AnimatePresence>
      {gameOver && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(10px)',
            zIndex: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <motion.div
            initial={{ scale: 0.85, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            style={{
              background: 'var(--bg-glass-heavy)',
              backdropFilter: 'blur(24px)',
              border: '1px solid var(--danger)',
              borderRadius: 'var(--radius-lg)',
              width: 440,
              maxWidth: 'calc(100vw - 48px)',
              padding: '28px 28px 24px',
              boxShadow: '0 0 0 1px rgba(239,68,68,0.25), 0 0 48px rgba(239,68,68,0.25)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {/* Icon + title */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1, rotate: [0, -4, 4, 0] }}
                transition={{ delay: 0.1, duration: 0.5 }}
                style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: 'rgba(239,68,68,0.15)',
                  border: '1px solid rgba(239,68,68,0.5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <ShieldAlert size={28} style={{ color: 'var(--danger)' }} />
              </motion.div>
              <div style={{
                fontSize: 18, fontWeight: 800, letterSpacing: '0.15em',
                color: 'var(--danger)',
              }}>
                HUB DOWN
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
                基地已被感染摧毀。<br/>
                你可以回到最近的自動存檔點,或重新開始。
              </div>
            </div>

            {/* Autosave status */}
            <div style={{
              padding: '10px 14px',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 14,
              fontSize: 10,
              color: 'var(--text-muted)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span>最近存檔</span>
              <span style={{ color: info?.exists ? 'var(--accent)' : 'var(--text-muted)', fontWeight: 700 }}>
                {info == null ? '…'
                  : info.exists ? `tick ${info.tick} · ${formatAgo(info.ts!)}`
                  : '無'}
              </span>
            </div>

            {error && (
              <div style={{
                padding: '8px 12px', marginBottom: 12,
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 10, color: 'var(--danger)',
              }}>
                {error}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={handleRestore}
                disabled={!info?.exists || busy !== null}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '12px 16px',
                  background: info?.exists && busy === null ? 'var(--accent)' : 'var(--bg-elevated)',
                  color: info?.exists && busy === null ? '#000' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12, fontWeight: 800, letterSpacing: '0.08em',
                  cursor: info?.exists && busy === null ? 'pointer' : 'not-allowed',
                  transition: 'filter 0.15s',
                }}
                onMouseEnter={e => { if (info?.exists && busy === null) e.currentTarget.style.filter = 'brightness(1.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.filter = 'none'; }}
              >
                <RotateCcw size={14} />
                {busy === 'restore' ? 'RESTORING…' : '回到自動存檔點'}
              </button>
              <button
                onClick={handleReset}
                disabled={busy !== null}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '10px 16px',
                  background: confirmReset ? 'rgba(239,68,68,0.15)' : 'transparent',
                  color: confirmReset ? 'var(--danger)' : 'var(--text-muted)',
                  border: `1px solid ${confirmReset ? 'var(--danger)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-sm)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                  cursor: busy !== null ? 'not-allowed' : 'pointer',
                  opacity: busy !== null ? 0.5 : 1,
                  transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                }}
              >
                <Power size={12} />
                {busy === 'reset'
                  ? 'RESETTING…'
                  : confirmReset ? '確定要重新開始?進度將清空' : '重新開始'}
              </button>
              {confirmReset && busy === null && (
                <button
                  onClick={() => setConfirmReset(false)}
                  style={{
                    padding: '6px 12px',
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    border: 'none',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    cursor: 'pointer',
                    letterSpacing: '0.08em',
                  }}
                >
                  取消
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
