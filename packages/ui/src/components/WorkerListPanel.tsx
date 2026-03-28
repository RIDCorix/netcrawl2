import { motion, AnimatePresence } from 'framer-motion';
import { Users, ChevronDown, ChevronRight, X, AlertCircle, CheckCircle, Loader, Zap, SkipForward } from 'lucide-react';
import { useGameStore, Worker } from '../store/gameStore';
import { useState } from 'react';
import axios from 'axios';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  idle: { label: 'IDLE', color: 'var(--text-muted)', icon: CheckCircle },
  moving: { label: 'MOVING', color: 'var(--accent)', icon: Loader },
  harvesting: { label: 'HARVESTING', color: 'var(--energy-color)', icon: Zap },
  dead: { label: 'DEAD', color: 'var(--danger)', icon: AlertCircle },
  crashed: { label: 'CRASHED', color: 'var(--danger)', icon: AlertCircle },
};

function WorkerCard({ worker }: { worker: Worker }) {
  const [expanded, setExpanded] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [recalling, setRecalling] = useState(false);
  const config = STATUS_CONFIG[worker.status] || STATUS_CONFIG.idle;
  const Icon = config.icon;

  const handleToggleLogs = async () => {
    if (!expanded) {
      try {
        const res = await axios.get(`/api/worker/${worker.id}/logs`);
        setLogs(res.data.logs || []);
      } catch {}
    }
    setExpanded(v => !v);
  };

  const handleRecall = async () => {
    setRecalling(true);
    try {
      await axios.post('/api/recall', { workerId: worker.id });
    } catch (err: any) {
      console.error('Recall failed:', err.response?.data?.error);
    } finally {
      setRecalling(false);
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
          <div className="flex items-center gap-2">
            <div className="text-xs font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {worker.class_name}
            </div>
            <div
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs"
              style={{ background: 'rgba(255,255,255,0.06)', color: config.color }}
            >
              <Icon size={10} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}>{config.label}</span>
            </div>
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

        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={handleToggleLogs}
            style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}
            title="View logs"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <button
            onClick={handleRecall}
            disabled={recalling}
            style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: recalling ? 'not-allowed' : 'pointer', padding: '2px', opacity: recalling ? 0.5 : 1 }}
            title="Recall worker"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Logs */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
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

export function WorkerListPanel() {
  const { workers } = useGameStore();
  const [collapsed, setCollapsed] = useState(false);

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
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '10px', maxHeight: '320px', overflowY: 'auto' }}>
              {workers.length === 0 ? (
                <div className="text-xs text-center py-4" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  No workers deployed.<br />Click a node → Deploy.
                </div>
              ) : (
                <AnimatePresence>
                  {workers.map(w => <WorkerCard key={w.id} worker={w} />)}
                </AnimatePresence>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
