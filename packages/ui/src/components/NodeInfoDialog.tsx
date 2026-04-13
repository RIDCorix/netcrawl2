/**
 * NodeInfoDialog — the generic modal shell for node-detail content.
 *
 * All dialog *content* now lives in pluggable modules under
 * `./nodeDialogs/plugins/**`. Each plugin is auto-discovered at build time
 * via Vite's `import.meta.glob`, so adding a new dialog is a one-file drop-in.
 *
 * This file is purely presentational and should not grow when new node types
 * or puzzles are added.
 */

import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Markdown } from './ui/markdown';
import type { NodeDialogConfig } from './nodeDialogs';

export type { NodeDialogConfig };
export { getDialogsForNode } from './nodeDialogs';
export type { ResolvedDialog } from './nodeDialogs';

export function NodeInfoDialog({ config, onClose }: { config: NodeDialogConfig; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(8px)', zIndex: 150,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 30 }}
        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-glass-heavy)', backdropFilter: 'blur(24px)',
          border: '1px solid var(--border-bright)', borderRadius: 'var(--radius-lg)',
          width: 880, maxWidth: 'calc(100vw - 48px)',
          height: 760, maxHeight: 'calc(100vh - 48px)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {config.dialogTitle}
          </span>
          <button onClick={onClose} style={{
            color: 'var(--text-muted)', background: 'var(--bg-elevated)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            cursor: 'pointer', padding: 4, display: 'flex',
          }}>
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px', fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
          <Markdown content={config.dialogContent} />
        </div>
      </motion.div>
    </motion.div>
  );
}
