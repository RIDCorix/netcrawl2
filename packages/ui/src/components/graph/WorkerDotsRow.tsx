import React from 'react';
import { useGameStore, Worker } from '../../store/gameStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Pickaxe, Package, AlertTriangle } from 'lucide-react';
import { CLASS_COLORS } from '../../constants/colors';

export function WorkerDotsRow({ nodeId, show }: { nodeId: string; show: boolean }) {
  const selectWorker = useGameStore(s => s.selectWorker);
  const selectedWorkerId = useGameStore(s => s.selectedWorkerId);
  const allWorkers = useGameStore(s => s.workers);
  const workers = allWorkers.filter((w: any) => {
    const at = w.current_node || w.node_id;
    if (at !== nodeId) return false;
    if (w.status === 'moving') return false;
    return true;
  });

  if (!show) return null;

  const visibleWorkers = workers.filter((w: any) => !w.leaving);

  return (
    <div style={{
      position: 'absolute', top: -14, left: '50%',
      transform: 'translateX(-50%)', display: 'flex', gap: 4,
      pointerEvents: visibleWorkers.length === 0 ? 'none' : undefined,
    }}>
      <AnimatePresence initial={false}>
      {visibleWorkers.map((w: any, wi: number) => {
        const c = CLASS_COLORS[w.class_name] || '#a78bfa';
        const isActive = ['running', 'harvesting', 'idle', 'moving'].includes(w.status);
        const isSelected = w.id === selectedWorkerId;
        const hasHolding = Array.isArray(w.holding) ? w.holding.length > 0 : !!w.holding;
        const showAction = w.status === 'harvesting' || hasHolding;
        const isError = w.status === 'error' || w.status === 'crashed';
        const showInfoBubble = w.lastLog && !isError && (Date.now() - (w.lastLog.ts || 0) < 2000);
        const showErrorBubble = isError && w.lastLog;

        return (
          <motion.div
            key={w.id}
            layout
            initial={{ opacity: 0, scale: 0.3 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.3 }}
            transition={{ type: 'spring', stiffness: 500, damping: 32, mass: 0.6 }}
            title={`${w.class_name} (${w.status})\nid: ${w.id}\n@ ${w.current_node}`}
            onClick={(e) => { e.stopPropagation(); selectWorker(w.id); }}
            style={{
              position: 'relative',
              width: isSelected ? 12 : 8,
              height: isSelected ? 12 : 8,
              borderRadius: '50%',
              background: isError ? '#ef4444' : c,
              border: isSelected ? '2px solid #fff' : '1.5px solid rgba(0,0,0,0.5)',
              boxShadow: isSelected
                ? `0 0 8px ${c}, 0 0 16px ${c}`
                : isError
                  ? '0 0 6px #ef4444, 0 0 14px #ef444480'
                  : isActive ? `0 0 6px ${c}, 0 0 12px ${c}40` : `0 0 4px ${c}60`,
              cursor: 'pointer',
              animation: isError ? 'error-shake 3s ease-in-out infinite' : undefined,
            }}
          >
            {showAction && (
              <div style={{
                position: 'absolute', top: -16, left: '50%',
                transform: 'translateX(-50%)', pointerEvents: 'none',
                animation: 'worker-action-bounce 0.6s ease-in-out infinite', color: c,
              }}>
                {w.status === 'harvesting' ? <Pickaxe size={10} /> : <Package size={10} />}
              </div>
            )}
            {showErrorBubble && <WorkerBubble type="error" worker={w} workerIndex={wi} totalWorkers={workers.length} color="#ef4444" />}
            {showInfoBubble && <WorkerBubble type="info" worker={w} workerIndex={wi} totalWorkers={workers.length} color={w.lastLog.level === 'error' ? '#ef4444' : w.lastLog.level === 'warn' ? '#f59e0b' : c} />}
          </motion.div>
        );
      })}
      </AnimatePresence>
    </div>
  );
}

function WorkerBubble({ type, worker, workerIndex, totalWorkers, color }: {
  type: 'error' | 'info';
  worker: any;
  workerIndex: number;
  totalWorkers: number;
  color: string;
}) {
  const msg = (worker.lastLog.message || '').replace(/^\[(INFO|WARN|ERROR)\]\s*/i, '');
  const vLen = 28 + (totalWorkers - 1 - workerIndex) * 13;
  const totalH = vLen + 12;
  const isError = type === 'error';

  return (
    <div key={isError ? undefined : `b-${worker.lastLog.ts}`} style={{
      position: 'absolute', left: 2, bottom: 6,
      pointerEvents: 'none', whiteSpace: 'nowrap',
      animation: isError ? 'error-float 2.5s ease-in-out infinite' : 'bubble-fade 2s ease-out forwards',
      width: 0, height: 0, zIndex: isError ? 100 : undefined,
    }}>
      <svg width={140} height={totalH} style={{ position: 'absolute', left: 0, bottom: 0, overflow: 'visible' }}>
        <line x1="1" y1={totalH} x2="1" y2={12} stroke={color} strokeWidth="0.7" opacity={isError ? "0.5" : "0.4"} />
        <line x1="1" y1={12} x2="14" y2={1} stroke={color} strokeWidth="0.7" opacity={isError ? "0.5" : "0.4"} />
        <line x1="14" y1={1} x2="24" y2={1} stroke={color} strokeWidth="0.7" opacity={isError ? "0.3" : "0.25"} />
      </svg>
      <span style={{
        position: 'absolute', left: 14, bottom: totalH + 1,
        fontSize: 7, fontFamily: 'var(--font-mono)', fontWeight: isError ? 700 : 600,
        color, lineHeight: 1,
        borderBottom: `0.7px solid ${color}${isError ? '60' : '40'}`,
        padding: isError ? '0 2px 2px' : '0 1px 2px',
        maxWidth: isError ? 140 : 120, overflow: 'hidden', textOverflow: 'ellipsis',
        textShadow: isError ? '0 0 6px rgba(239,68,68,0.4)' : undefined,
      }}>
        {isError ? '⚠ ' : ''}{msg}
      </span>
    </div>
  );
}
