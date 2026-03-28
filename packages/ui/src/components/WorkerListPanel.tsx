import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, ChevronDown, ChevronRight, X, AlertCircle, CheckCircle,
  Loader, Zap, Play, PauseCircle, Square, RefreshCw,
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
  // legacy statuses
  idle:       { color: '#9ca3af', dot: '○', label: 'idle' },
  moving:     { color: '#60a5fa', dot: '◌', label: 'moving', spin: true },
  harvesting: { color: '#fde68a', dot: '●', label: 'harvesting' },
  dead:       { color: '#f87171', dot: '✕', label: 'dead' },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { color: '#6b7280', dot: '?', label: status };
  return (
    <span
      className="text-xs font-mono flex items-center gap-1"
      style={{ color: config.color }}
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
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '10px 12px',
        marginBottom: '8px',
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-xs font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {worker.class_name}
            </div>
            <StatusBadge status={worker.status} />
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            @ {worker.current_node || worker.node_id}
          </div>
          {hasCarrying && (
            <div className="text-xs mt-0.5" style={{ color: 'var(--energy-color)', fontFamily: 'var(--font-mono)' }}>
              carrying: {Object.entries(carrying).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${k}`).join(', ')}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 ml-2 shrink-0">
          <button
            onClick={handleToggleLogs}
            style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}
            title="View logs"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          {/* Running: show Suspend button */}
          {worker.status === 'running' && (
            <button
              onClick={handleSuspend}
              disabled={busy}
              title="Suspend worker (waits for current loop to finish)"
              style={{
                color: '#facc15',
                background: 'none',
                border: 'none',
                cursor: busy ? 'not-allowed' : 'pointer',
                padding: '2px',
                opacity: busy ? 0.5 : 1,
              }}
            >
              <PauseCircle size={14} />
            </button>
          )}

          {/* Suspending: show spinner (disabled) */}
          {worker.status === 'suspending' && (
            <span
              className="animate-pulse"
              title="Suspending..."
              style={{ color: '#facc15', padding: '2px', display: 'inline-flex' }}
            >
              <Square size={14} />
            </span>
          )}

          {/* Suspended or crashed: show Dismiss */}
          {(worker.status === 'suspended' || worker.status === 'crashed') && (
            <button
              onClick={handleDismiss}
              disabled={busy}
              title="Dismiss worker"
              style={{
                color: 'var(--danger)',
                background: 'none',
                border: 'none',
                cursor: busy ? 'not-allowed' : 'pointer',
                padding: '2px',
                opacity: busy ? 0.5 : 1,
              }}
            >
              <X size={14} />
            </button>
          )}

          {/* Fallback dismiss for other states */}
          {!['running', 'suspending', 'suspended', 'crashed'].includes(worker.status) && (
            <button
              onClick={handleDismiss}
              disabled={busy}
              style={{
                color: 'var(--danger)',
                background: 'none',
                border: 'none',
                cursor: busy ? 'not-allowed' : 'pointer',
                padding: '2px',
                opacity: busy ? 0.5 : 1,
              }}
              title="Recall worker"
            >
              <X size={14} />
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
          className="flex gap-2 mt-2"
        >
          {worker.status === 'crashed' && (
            <span className="text-xs" style={{ color: '#f87171', fontFamily: 'var(--font-mono)' }}>
              ✕ crashed
            </span>
          )}
          {worker.status === 'suspended' && (
            <span className="text-xs" style={{ color: '#9ca3af', fontFamily: 'var(--font-mono)' }}>
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
            <div
              style={{
                marginTop: '8px',
                borderTop: '1px solid var(--border)',
                paddingTop: '8px',
                maxHeight: '120px',
                overflowY: 'auto',
              }}
            >
              {logs.length === 0 ? (
                <div className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>No logs yet</div>
              ) : (
                logs.map((log: any, i: number) => (
                  <div key={i} className="text-xs mb-0.5" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    <span style={{ color: 'rgba(255,255,255,0.2)' }}>{new Date(log.created_at).toLocaleTimeString()} </span>
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
        backdropFilter: 'blur(20px)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        zIndex: 40,
        overflow: 'hidden',
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
          padding: '10px 14px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          borderBottom: collapsed ? 'none' : '1px solid var(--border)',
        }}
      >
        <div className="flex items-center gap-2">
          <Users size={14} style={{ color: 'var(--text-muted)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
            WORKERS
          </span>
          {workers.length > 0 && (
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{ background: 'var(--accent)', color: '#000', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '10px' }}
            >
              {workers.length}
            </span>
          )}
        </div>
        {collapsed ? <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
      </button>

      {/* Worker list */}
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
              <div
                style={{
                  padding: '8px 10px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <button
                  onClick={handleSuspendAll}
                  disabled={runningCount === 0 || suspendingAll}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    background: runningCount > 0 ? 'rgba(250,204,21,0.12)' : 'var(--bg-elevated)',
                    border: `1px solid ${runningCount > 0 ? 'rgba(250,204,21,0.3)' : 'var(--border)'}`,
                    borderRadius: '6px',
                    padding: '4px 10px',
                    color: runningCount > 0 ? '#facc15' : 'var(--text-muted)',
                    fontSize: '11px',
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

                {/* Progress indicator */}
                <AnimatePresence>
                  {hasAnySuspending && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="animate-pulse text-xs"
                      style={{ color: '#facc15', fontFamily: 'var(--font-mono)' }}
                    >
                      {suspendedCount}/{workers.length} done
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            <div style={{ padding: '10px', maxHeight: '320px', overflowY: 'auto' }}>
              {workers.length === 0 ? (
                <div className="text-xs text-center py-4" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  No workers deployed.<br />Click a node → Deploy.
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
