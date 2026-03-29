import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, ChevronDown, ChevronRight, X, PauseCircle, Square,
} from 'lucide-react';
import { useGameStore, Worker } from '../store/gameStore';
import { useState } from 'react';
import axios from 'axios';
import { getStatusConfig } from '../constants/status';
import { getWorkerIcon } from '../constants/workerIcons';
import { useT } from '../hooks/useT';

// ── Class Group ──────────────────────────────────────────────────────────────

function ClassGroup({ className, workers, onSuspend, onDismiss }: {
  className: string;
  workers: Worker[];
  onSuspend: (id: string) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(true);
  const ClassIcon = getWorkerIcon(workers[0]?.class_icon);
  const running = workers.filter(w => w.status === 'running' || w.status === 'moving' || w.status === 'harvesting').length;
  const pending = workers.filter(w => w.status === 'deploying').length;
  const errored = workers.filter(w => w.status === 'error' || w.status === 'crashed').length;
  const total = workers.length;

  return (
    <div style={{ marginBottom: 4 }}>
      {/* Class header */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          borderRadius: 'var(--radius-sm)',
        }}
      >
        {expanded ? <ChevronDown size={10} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={10} style={{ color: 'var(--text-muted)' }} />}
        <ClassIcon size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', flex: 1, textAlign: 'left' }}>
          {className}
        </span>
        {/* Badges */}
        {running > 0 && (
          <span style={{
            fontSize: 9, fontWeight: 800, fontFamily: 'var(--font-mono)',
            padding: '1px 5px', borderRadius: 'var(--radius-sm)',
            background: 'rgba(74,222,128,0.15)', color: '#4ade80',
            border: '1px solid rgba(74,222,128,0.25)',
          }}>
            {running}
          </span>
        )}
        {pending > 0 && (
          <span style={{
            fontSize: 9, fontWeight: 800, fontFamily: 'var(--font-mono)',
            padding: '1px 5px', borderRadius: 'var(--radius-sm)',
            background: 'rgba(96,165,250,0.15)', color: '#60a5fa',
            border: '1px solid rgba(96,165,250,0.25)',
          }}>
            {pending}
          </span>
        )}
        {errored > 0 && (
          <span style={{
            fontSize: 9, fontWeight: 800, fontFamily: 'var(--font-mono)',
            padding: '1px 5px', borderRadius: 'var(--radius-sm)',
            background: 'rgba(248,113,113,0.15)', color: '#f87171',
            border: '1px solid rgba(248,113,113,0.25)',
          }}>
            {errored}
          </span>
        )}
        <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {total}
        </span>
      </button>

      {/* Workers */}
      <AnimatePresence>
        {expanded && workers.map(w => (
          <WorkerRow key={w.id} worker={w} onSuspend={onSuspend} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}

// ── Worker Row ───────────────────────────────────────────────────────────────

function WorkerRow({ worker, onSuspend, onDismiss }: {
  worker: Worker;
  onSuspend: (id: string) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
}) {
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const config = getStatusConfig(worker.status);
  const { selectWorker } = useGameStore();

  const handleToggleLogs = async () => {
    if (!showLogs) {
      try {
        const res = await axios.get(`/api/worker/${worker.id}/logs`);
        setLogs(res.data.logs || []);
      } catch {}
    }
    setShowLogs(v => !v);
  };

  const handleAction = async (action: 'suspend' | 'dismiss') => {
    setBusy(true);
    try {
      if (action === 'suspend') await onSuspend(worker.id);
      else await onDismiss(worker.id);
    } finally { setBusy(false); }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.12 }}
      style={{ overflow: 'hidden' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px 4px 24px',
          cursor: 'pointer',
          borderRadius: 'var(--radius-sm)',
          transition: 'background 0.1s',
        }}
        onClick={() => selectWorker(worker.id)}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        {/* Status dot */}
        <span style={{ width: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              className={config.spin ? 'animate-pulse' : ''}>
          <svg width={8} height={8} viewBox="0 0 8 8">
            {config.dot === 'filled' && <circle cx={4} cy={4} r={3.5} fill={config.color} />}
            {config.dot === 'ring' && <circle cx={4} cy={4} r={3} fill="none" stroke={config.color} strokeWidth={1.5} />}
            {config.dot === 'x' && <><line x1={1.5} y1={1.5} x2={6.5} y2={6.5} stroke={config.color} strokeWidth={1.5} /><line x1={6.5} y1={1.5} x2={1.5} y2={6.5} stroke={config.color} strokeWidth={1.5} /></>}
          </svg>
        </span>

        {/* Node location */}
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          @ {worker.current_node}
        </span>

        {/* Status label */}
        <span style={{ fontSize: 9, color: config.color, fontFamily: 'var(--font-mono)', opacity: 0.7 }}>
          {config.label}
        </span>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 2 }} onClick={e => e.stopPropagation()}>
          <button onClick={handleToggleLogs} style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 1, display: 'flex' }}>
            {showLogs ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </button>

          {worker.status === 'running' && (
            <button onClick={() => handleAction('suspend')} disabled={busy}
              style={{ color: '#facc15', background: 'none', border: 'none', cursor: busy ? 'not-allowed' : 'pointer', padding: 1, display: 'flex', opacity: busy ? 0.4 : 1 }}>
              <PauseCircle size={11} />
            </button>
          )}

          {worker.status === 'suspending' && (
            <span className="animate-pulse" style={{ color: '#facc15', padding: 1, display: 'flex' }}>
              <Square size={11} />
            </span>
          )}

          {!['running', 'suspending'].includes(worker.status) && (
            <button onClick={() => handleAction('dismiss')} disabled={busy}
              style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: busy ? 'not-allowed' : 'pointer', padding: 1, display: 'flex', opacity: busy ? 0.4 : 0.6 }}>
              <X size={10} />
            </button>
          )}
        </div>
      </div>

      {/* Logs */}
      <AnimatePresence>
        {showLogs && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.12 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              margin: '2px 8px 6px 24px',
              padding: 8,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              maxHeight: 80,
              overflowY: 'auto',
            }}>
              {logs.length === 0 ? (
                <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>No logs</div>
              ) : logs.map((log, i) => (
                <div key={i} style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 1 }}>
                  <span style={{ color: 'rgba(255,255,255,0.12)' }}>{new Date(log.created_at).toLocaleTimeString()} </span>
                  {log.message}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main Panel ───────────────────────────────────────────────────────────────

export function WorkerListPanel() {
  const { workers } = useGameStore();
  const [collapsed, setCollapsed] = useState(false);
  const t = useT();

  const errorCount = workers.filter(w => w.status === 'error' || w.status === 'crashed').length;

  // Group by class_name
  const groups: Record<string, Worker[]> = {};
  for (const w of workers) {
    const key = w.class_name || 'Unknown';
    if (!groups[key]) groups[key] = [];
    groups[key].push(w);
  }

  const handleSuspend = async (workerId: string) => {
    try { await axios.post('/api/worker/suspend', { workerId }); } catch {}
  };

  const handleDismiss = async (workerId: string) => {
    try { await axios.post('/api/recall', { workerId }); } catch {}
  };

  return (
    <motion.div
      style={{
        position: 'fixed',
        left: 16,
        bottom: 16,
        width: 260,
        maxHeight: 'calc(100vh - 100px)',
        background: 'var(--bg-glass-heavy)',
        backdropFilter: 'blur(24px)',
        border: '1px solid var(--border-bright)',
        borderRadius: 'var(--radius-lg)',
        zIndex: 40,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed(v => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          borderBottom: collapsed ? 'none' : '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Users size={12} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
            WORKERS
          </span>
          {workers.length > 0 && (
            <span style={{
              fontSize: 9, fontWeight: 800, padding: '1px 5px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--accent-dim)', border: '1px solid rgba(0,212,170,0.25)',
              color: 'var(--accent)', fontFamily: 'var(--font-mono)',
            }}>
              {workers.length}
            </span>
          )}
          {errorCount > 0 && (
            <span style={{
              fontSize: 9, fontWeight: 800, padding: '1px 5px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(248,113,113,0.15)', color: '#f87171',
              border: '1px solid rgba(248,113,113,0.25)',
              fontFamily: 'var(--font-mono)',
            }}>
              {errorCount} err
            </span>
          )}
        </div>
        {collapsed ? <ChevronRight size={11} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={11} style={{ color: 'var(--text-muted)' }} />}
      </button>

      {/* Body */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '6px 4px', maxHeight: 400, overflowY: 'auto' }}>
              {workers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '14px 0', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
                  {t('worker.no_workers')}<br />
                  <span style={{ color: 'var(--text-secondary)' }}>Click a node to deploy.</span>
                </div>
              ) : (
                Object.entries(groups).map(([className, classWorkers]) => (
                  <ClassGroup
                    key={className}
                    className={className}
                    workers={classWorkers}
                    onSuspend={handleSuspend}
                    onDismiss={handleDismiss}
                  />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
