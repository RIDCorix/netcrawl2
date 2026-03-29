/**
 * LayerUnlockToast — shown when a new network layer is unlocked.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';
import { Globe } from 'lucide-react';
import { useGameStore } from '../store/gameStore';

export function LayerUnlockToast() {
  const { layerUnlockToasts, removeLayerUnlockToast, openLayerSelect } = useGameStore();

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      <AnimatePresence>
        {layerUnlockToasts.map((toast) => (
          <Toast
            key={toast.id}
            toast={toast}
            onDismiss={() => removeLayerUnlockToast(toast.id)}
            onOpen={() => { removeLayerUnlockToast(toast.id); openLayerSelect(); }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function Toast({
  toast,
  onDismiss,
  onOpen,
}: {
  toast: { id: number; name: string; emoji: string; timestamp: number };
  onDismiss: () => void;
  onOpen: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 8000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      style={{
        pointerEvents: 'auto',
        background: 'linear-gradient(135deg, rgba(0,212,170,0.15), var(--bg-elevated))',
        border: '1px solid rgba(0,212,170,0.5)',
        borderRadius: 12,
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        cursor: 'pointer',
        minWidth: 280,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}
      onClick={onOpen}
    >
      <div style={{
        width: 36, height: 36,
        borderRadius: 8,
        background: 'rgba(0,212,170,0.12)',
        border: '1px solid rgba(0,212,170,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, flexShrink: 0,
      }}>
        {toast.emoji}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <Globe size={11} style={{ color: '#00d4aa' }} />
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#00d4aa', fontWeight: 700, letterSpacing: '0.08em' }}>
            NEW LAYER UNLOCKED
          </span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
          {toast.name}
        </div>
        <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: 1 }}>
          Click to view &rarr;
        </div>
      </div>
    </motion.div>
  );
}
