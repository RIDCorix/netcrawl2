import { motion, AnimatePresence } from 'framer-motion';
import { X, PauseCircle, Square, MapPin, Clock, Pickaxe, Package, Database, Cpu, Star, MemoryStick, Maximize2, AlertTriangle } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { CLASS_COLORS } from '../constants/colors';
import { InvCell } from './ui/InvCell';
import { getWorkerIcon } from '../constants/workerIcons';
import { getStatusConfig } from '../constants/status';
import { useT } from '../hooks/useT';

export function WorkerDetailPanel() {
  const { selectedWorkerId, selectWorker, workers, nodes } = useGameStore();
  const t = useT();
  const tn = (label: string) => { const k = `n.${label}`; const v = t(k); return v === k ? label : v; };
  const [logs, setLogs] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [logDialogOpen, setLogDialogOpen] = useState(false);

  const worker = workers.find(w => w.id === selectedWorkerId);
  const workerNode = worker ? nodes.find(n => n.id === worker.current_node) : null;
  const status = worker ? getStatusConfig(worker.status) : getStatusConfig('idle');
  const classColor = worker ? (CLASS_COLORS[worker.class_name] || '#a78bfa') : '#a78bfa';

  // Fetch logs when worker changes
  useEffect(() => {
    if (!selectedWorkerId) return;
    const fetchLogs = () => {
      axios.get(`/api/worker/${selectedWorkerId}/logs`)
        .then(r => setLogs(r.data.logs || []))
        .catch(() => {});
    };
    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [selectedWorkerId]);

  const handleSuspend = async () => {
    if (!worker) return;
    setBusy(true);
    try { await axios.post('/api/worker/suspend', { workerId: worker.id }); } catch {} finally { setBusy(false); }
  };

  const handleDismiss = async () => {
    if (!worker) return;
    setBusy(true);
    try {
      await axios.post('/api/recall', { workerId: worker.id });
      selectWorker(null);
    } catch {} finally { setBusy(false); }
  };

  return (
    <>
    <AnimatePresence>
      {selectedWorkerId && worker && (
        <motion.div
          key={`worker-${selectedWorkerId}`}
          initial={{ x: 340, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 340, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 350 }}
          style={{
            position: 'fixed',
            right: 16,
            top: 72,
            bottom: 16,
            width: 320,
            background: 'var(--bg-glass-heavy)',
            backdropFilter: 'blur(24px)',
            border: '1px solid var(--border-bright)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px',
            zIndex: 40,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {/* Accent bar */}
          <div style={{
            position: 'absolute', top: 0, left: 20, right: 20, height: 2,
            borderRadius: '0 0 2px 2px',
            background: `linear-gradient(90deg, transparent, ${classColor}, transparent)`,
          }} />

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: classColor, fontFamily: 'var(--font-mono)', letterSpacing: '0.12em' }}>
                {t('ui.worker_unit')}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                {(() => { const Icon = getWorkerIcon(worker.class_icon); return <Icon size={20} style={{ color: classColor }} />; })()}
                {worker.class_name}
              </div>
            </div>
            <button
              onClick={() => selectWorker(null)}
              style={{
                color: 'var(--text-muted)', background: 'var(--bg-elevated)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={14} />
            </button>
          </div>

          {/* ID */}
          <div style={{
            fontSize: 11, padding: '5px 10px', borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-primary)', border: '1px solid var(--border)',
            color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            id: <span style={{ color: 'var(--text-secondary)' }}>{worker.id}</span>
          </div>

          {/* Status badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 12px', borderRadius: 'var(--radius-md)',
            background: `color-mix(in srgb, ${status.color} 8%, transparent)`,
            border: `1px solid color-mix(in srgb, ${status.color} 20%, transparent)`,
          }}>
            <svg width={12} height={12} viewBox="0 0 8 8">
              {status.dot === 'filled' && <circle cx={4} cy={4} r={3.5} fill={status.color} />}
              {status.dot === 'ring' && <circle cx={4} cy={4} r={3} fill="none" stroke={status.color} strokeWidth={1.5} />}
              {status.dot === 'x' && <><line x1={1.5} y1={1.5} x2={6.5} y2={6.5} stroke={status.color} strokeWidth={1.5} /><line x1={6.5} y1={1.5} x2={1.5} y2={6.5} stroke={status.color} strokeWidth={1.5} /></>}
            </svg>
            <span style={{ fontSize: 13, fontWeight: 700, color: status.color, fontFamily: 'var(--font-mono)' }}>
              {status.label}
            </span>
          </div>

          {/* Info grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <MapPin size={12} style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Node:</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                {workerNode?.data?.label ? tn(workerNode.data.label) : worker.current_node}
              </span>
            </div>

            {worker.deployed_at && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={12} style={{ color: 'var(--text-muted)' }} />
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{t('ui.deployed')}</span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  {new Date(worker.deployed_at).toLocaleTimeString()}
                </span>
              </div>
            )}

            {worker.equippedPickaxe && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Pickaxe size={12} style={{ color: 'var(--text-muted)' }} />
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{t('ui.pickaxe')}</span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  {worker.equippedPickaxe.itemType} ({worker.equippedPickaxe.efficiency}×)
                </span>
              </div>
            )}

          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, var(--border-bright), transparent)' }} />

          {/* Logs — compact with expand button */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
                {t('ui.logs')} {logs.length > 0 && <span style={{ fontWeight: 600, opacity: 0.5 }}>({logs.length})</span>}
              </div>
              {logs.length > 0 && (
                <button onClick={() => setLogDialogOpen(true)} style={{
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', padding: '2px 6px', cursor: 'pointer',
                  color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3,
                  fontSize: 9, fontFamily: 'var(--font-mono)',
                }}>
                  <Maximize2 size={9} /> {t('ui.expand')}
                </button>
              )}
            </div>
            <div style={{
              background: 'var(--bg-primary)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', padding: 10,
              maxHeight: 120, overflowY: 'auto', minHeight: 40,
            }}>
              {logs.length === 0 ? (
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{t('ui.no_logs')}</div>
              ) : logs.slice(-20).map((log, i) => (
                <div key={i} style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>
                  <span style={{ color: 'var(--text-muted)', opacity: 0.5 }}>{new Date(log.created_at).toLocaleTimeString()} </span>
                  <span style={{
                    color: log.message.includes('[ERROR]') ? 'var(--danger)'
                         : log.message.includes('[WARN]') ? '#facc15'
                         : 'var(--text-secondary)',
                  }}>
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Worker Inventory Grid — below logs */}
          {(() => {
            const items: { type: string; count: number }[] = [];
            if (worker.holding) items.push({ type: worker.holding.type, count: worker.holding.amount });
            const carrying = worker.carrying || {};
            if ((carrying as any).data > 0) items.push({ type: 'data', count: (carrying as any).data });
            if ((carrying as any).rp > 0) items.push({ type: 'rp', count: (carrying as any).rp });
            if ((carrying as any).credits > 0) items.push({ type: 'credits', count: (carrying as any).credits });

            const baseCapacity = 1;
            const ramBonus = (worker as any).equippedRam?.capacityBonus || 0;
            const capacityLabel = ramBonus > 0 ? `${baseCapacity}+${ramBonus}` : `${baseCapacity}`;
            const totalItems = items.reduce((s, i) => s + i.count, 0);

            const INV_ICONS: Record<string, any> = { data_fragment: Database, rp_shard: Cpu, bad_data: AlertTriangle, data: Database, rp: Cpu, credits: Star };
            const INV_COLORS: Record<string, string> = { data_fragment: '#45aaf2', rp_shard: '#a78bfa', bad_data: '#ef4444', data: 'var(--data-color)', rp: 'var(--rp-color)', credits: 'var(--credits-color)' };
            const INV_LABELS: Record<string, string> = { data_fragment: 'Data Fragment', rp_shard: 'RP Shard', bad_data: 'Bad Data', data: 'Data', rp: 'RP', credits: 'Credits' };

            return (
              <>
                <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, var(--border-bright), transparent)' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Package size={11} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
                      {t('ui.inventory_label')}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      ({totalItems}/{capacityLabel})
                    </span>
                  </div>
                  {items.length === 0 ? (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', padding: '4px 0', textAlign: 'center' }}>
                      {t('ui.empty')}
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 3 }}>
                      {items.map(item => (
                        <InvCell
                          key={item.type}
                          icon={INV_ICONS[item.type] || Package}
                          color={INV_COLORS[item.type] || 'var(--text-muted)'}
                          label={INV_LABELS[item.type] || item.type}
                          count={item.count}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </>
            );
          })()}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
            {worker.status === 'running' && (
              <button onClick={handleSuspend} disabled={busy} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '10px', borderRadius: 'var(--radius-sm)',
                background: 'rgba(250,204,21,0.1)', border: '1px solid rgba(250,204,21,0.25)',
                color: '#facc15', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)',
                cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1,
              }}>
                <PauseCircle size={14} /> {t('ui.suspend')}
              </button>
            )}

            {worker.status === 'suspending' && (
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '10px', borderRadius: 'var(--radius-sm)',
                background: 'rgba(250,204,21,0.05)', border: '1px solid rgba(250,204,21,0.15)',
                color: '#facc15', fontSize: 12, fontFamily: 'var(--font-mono)',
              }}>
                <Square size={14} className="animate-pulse" /> {t('ui.suspending')}
              </div>
            )}

            {!['running', 'suspending'].includes(worker.status) && (
              <button onClick={handleDismiss} disabled={busy} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '10px', borderRadius: 'var(--radius-sm)',
                background: 'var(--danger-dim)', border: '1px solid rgba(255,71,87,0.25)',
                color: 'var(--danger)', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)',
                cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1,
              }}>
                <X size={14} /> {t('ui.dismiss')}
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* Log dialog — full-screen overlay */}
    {logDialogOpen && createPortal(
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={() => setLogDialogOpen(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 32,
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          onClick={e => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 600, maxHeight: '80vh',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--bg-glass-heavy)', backdropFilter: 'blur(24px)',
            border: '1px solid var(--border-bright)',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
              {t('ui.logs')} — {worker?.class_name}
            </span>
            <button onClick={() => setLogDialogOpen(false)} style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', padding: 4, cursor: 'pointer',
              color: 'var(--text-muted)', display: 'flex',
            }}>
              <X size={12} />
            </button>
          </div>
          {/* Log content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
            {logs.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{t('ui.no_logs')}</div>
            ) : logs.map((log, i) => (
              <div key={i} style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 3, lineHeight: 1.5 }}>
                <span style={{ color: 'var(--text-muted)', opacity: 0.5, marginRight: 8 }}>{new Date(log.created_at).toLocaleTimeString()}</span>
                <span style={{
                  color: log.message.includes('[ERROR]') ? 'var(--danger)'
                       : log.message.includes('[WARN]') ? '#facc15'
                       : 'var(--text-secondary)',
                }}>
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>,
      document.body
    )}
    </>
  );
}
