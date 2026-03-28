import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, ChevronDown, ChevronRight, X, AlertCircle, CheckCircle,
  Loader, Zap, PauseCircle, Square,
} from 'lucide-react';
import { useGameStore, Worker } from '../store/gameStore';
import { useState } from 'react';
import axios from 'axios';

// ── Status badge ─────────────────────────────────────────────────────────────

interface StatusConfig {
  label: string;
  color: string;
  dot: string;
  spin?: boolean;
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  running:    { color: '#4ade80', dot: '●', label: 'running' },
  suspending: { color: '#facc15', dot: '⏸', label: 'suspending...', spin: true },
  suspended:  { color: '#9ca3af', dot: '○', label: 'suspended' },
  deploying:  { color: '#60a5fa', dot: '◌', label: 'deploying', spin: true },
  crashed:    { color: '#f87171', dot: '✕', label: 'crashed' },
  idle:       { color: '#9ca3af', dot: '○', label: 'idle' },
  moving:     { color: '#60a5fa', dot: '◌', label: 'moving', spin: true },
  harvesting: { color: '#fde68a', dot: '●', label: 'harvesting' },
  dead:       { color: '#f87171', dot: '✕', label: 'dead' },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { color: '#6b7280', dot: '?', label: status };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '1px 6px',
        borderRadius: 'var(--radius-sm)',
        background: `color-mix(in srgb, ${config.color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${config.color} 20%, transparent)`,
        fontSize: 9,
        fontFamily: 'var(--font-mono)',
        fontWeight: 700,
        color: config.color,
        letterSpacing: '0.05em',
      }}
    >
      <span className={config.spin ? 'animate-pulse' : ''}>{config.dot}</span>
      {config.label}
    </span>
  );
}

// ── Worker card ───────────────────────────────────────────────────────────────

function WorkerCard({ worker, onSuspend, onDismiss }: {
  worker: Worker;
  onSuspend: (id: string) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const config = STATUS_CONFIG[worker.status] ?? STATUS_CONFIG.idle;

  const handleToggleLogs = async () => {
    if (!expanded) {
      try {
        const res = await axios.get(`/api/worker/${worker.id}/logs`);
        setLogs(res.data.logs || []);
      } catch {}
    }
    setExpanded(v => !v);
  };

  const handleSuspend = async () => {
    setBusy(true);
    try {
      await onSuspend(worker.id);
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = async () => {
    setBusy(true);
    try {
      await onDismiss(worker.id);
    } finally {
      setBusy(false);
    }
  };

  const carrying = worker.carrying || {};
  const hasCarrying = Object.values(carrying).some(v => v > 0);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.15 }}
      style={{
        background: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '10px 12px',
        marginBottom: 6,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Status color accent */}
      <div style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 2,
        background: config.color,
        borderRadius: '2px 0 0 2px',
      }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
            }}>
              {worker.class_name}
            </span>
            <StatusBadge status={worker.status} />
          </div>
          <div style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            marginTop: 2,
          }}>
            @ {worker.current_node || worker.node_id}
          </div>
          {hasCarrying && (
            <div style={{
              fontSize: 10,
              color: 'var(--energy-color)',
              fontFamily: 'var(--font-mono)',
              marginTop: 2,
            }}>
              carrying: {Object.entries(carrying).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${k}`).join(', ')}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 8, flexShrink: 0 }}>
          <button
            onClick={handleToggleLogs}
            style={{
              color: 'var(--text-muted)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 2,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>

          {/* Running: show Suspend button */}
          {worker.status === 'running' && (
            <button
              onClick={handleSuspend}
              disabled={busy}
              title="Suspend worker"
              style={{
                color: '#facc15',
                background: 'none',
                border: 'none',
                cursor: busy ? 'not-allowed' : 'pointer',
                padding: 2,
                opacity: busy ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <PauseCircle size={14} />
            </button>
          )}

          {/* Suspending: show spinner */}
          {worker.status === 'suspending' && (
            <span
              className="animate-pulse"
              title="Suspending..."
              style={{ color: '#facc15', padding: 2, display: 'inline-flex' }}
            >
              <Square size={14} />
            </span>
          )}

          {/* Suspended / crashed / other: show Dismiss */}
          {!['running', 'suspending'].includes(worker.status) && (
            <button
              onClick={handleDismiss}
              disabled={busy}
              title="Dismiss worker"
              style={{
                color: 'var(--danger)',
                background: 'none',
                border: 'none',
                cursor: busy ? 'not-allowed' : 'pointer',
                padding: 2,
                opacity: busy ? 0.4 : 0.7,
                display: 'flex',
                alignItems: 'center',
                transition: 'opacity 0.15s',
              }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Action row for suspended/crashed */}
      {(worker.status === 'suspended' || worker.status === 'crashed') && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.15 }}
          style={{ display: 'flex', gap: 8, marginTop: 6 }}
        >
          {worker.status === 'crashed' && (
            <span style={{ fontSize: 10, color: 'var(--danger)', fontFamily: 'var(--font-mono)' }}>
              ✕ crashed
            </span>
          )}
          {worker.status === 'suspended' && (
            <span style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'var(--font-mono)' }}>
              ready to redeploy
            </span>
          )}
        </motion.div>
      )}

      {/* Logs */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              marginTop: 8,
              borderTop: '1px solid var(--border)',
              paddingTop: 8,
              maxHeight: 100,
              overflowY: 'auto',
            }}>
              {logs.length === 0 ? (
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>No logs</div>
              ) : (
                logs.map((log: any, i: number) => (
                  <div key={i} style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>
                    <span style={{ color: 'rgba(255,255,255,0.15)' }}>{new Date(log.created_at).toLocaleTimeString()} </span>
                    {log.message}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── WorkerListPanel ───────────────────────────────────────────────────────────

export function WorkerListPanel() {
  const { workers } = useGameStore();
  const [collapsed, setCollapsed] = useState(false);
  const [suspendingAll, setSuspendingAll] = useState(false);

  const runningCount = workers.filter(w => w.status === 'running').length;
  const suspendingCount = workers.filter(w => w.status === 'suspending').length;
  const suspendedCount = workers.filter(w => w.status === 'suspended').length;
  const hasAnySuspending = suspendingCount > 0;

  const handleSuspend = async (workerId: string) => {
    try {
      await axios.post('/api/worker/suspend', { workerId });
    } catch (err: any) {
      console.error('Suspend failed:', err.response?.data?.error || err.message);
    }
  };

  const handleDismiss = async (workerId: string) => {
    try {
      await axios.post('/api/recall', { workerId });
    } catch (err: any) {
      console.error('Dismiss failed:', err.response?.data?.error || err.message);
    }
  };

  const handleSuspendAll = async () => {
    setSuspendingAll(true);
    try {
      await axios.post('/api/worker/suspend-all');
    } catch (err: any) {
      console.error('Suspend all failed:', err.response?.data?.error || err.message);
    } finally {
      setSuspendingAll(false);
    }
  };

  return (
    <motion.div
      style={{
        position: 'fixed',
        left: 16,
        bottom: 16,
        width: 280,
        background: 'var(--bg-glass-heavy)',
        backdropFilter: 'blur(24px)',
        border: '1px solid var(--border-bright)',
        borderRadius: 'var(--radius-lg)',
        zIndex: 40,
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setCollapsed(v => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          borderBottom: collapsed ? 'none' : '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Users size={13} style={{ color: 'var(--accent)' }} />
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.12em',
          }}>
            WORKERS
          </span>
          {workers.length > 0 && (
            <span style={{
              fontSize: 9,
              fontWeight: 800,
              padding: '1px 6px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--accent-dim)',
              border: '1px solid rgba(0, 212, 170, 0.25)',
              color: 'var(--accent)',
              fontFamily: 'var(--font-mono)',
            }}>
              {workers.length}
            </span>
          )}
        </div>
        {collapsed ? (
          <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />
        ) : (
          <ChevronDown size={12} style={{ color: 'var(--text-muted)' }} />
        )}
      </button>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            {/* Suspend All toolbar */}
            {workers.length > 0 && (
              <div style={{
                padding: '8px 10px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}>
                <button
                  onClick={handleSuspendAll}
                  disabled={runningCount === 0 || suspendingAll}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    background: runningCount > 0 ? 'rgba(250,204,21,0.12)' : 'var(--bg-elevated)',
                    border: `1px solid ${runningCount > 0 ? 'rgba(250,204,21,0.3)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-sm)',
                    padding: '4px 10px',
                    color: runningCount > 0 ? '#facc15' : 'var(--text-muted)',
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                    cursor: runningCount > 0 ? 'pointer' : 'not-allowed',
                    opacity: suspendingAll ? 0.6 : 1,
                    transition: 'all 0.15s',
                  }}
                >
                  <PauseCircle size={12} />
                  Suspend All
                </button>

                <AnimatePresence>
                  {hasAnySuspending && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="animate-pulse"
                      style={{ fontSize: 10, color: '#facc15', fontFamily: 'var(--font-mono)' }}
                    >
                      {suspendedCount}/{workers.length} done
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            <div style={{ padding: 10, maxHeight: 320, overflowY: 'auto' }}>
              {workers.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '16px 0',
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  lineHeight: 1.6,
                }}>
                  No workers deployed.<br />
                  <span style={{ color: 'var(--text-secondary)' }}>Click a node to deploy.</span>
                </div>
              ) : (
                <AnimatePresence>
                  {workers.map(w => (
                    <WorkerCard
                      key={w.id}
                      worker={w}
                      onSuspend={handleSuspend}
                      onDismiss={handleDismiss}
                    />
                  ))}
                </AnimatePresence>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
