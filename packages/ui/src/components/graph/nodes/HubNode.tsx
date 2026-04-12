import React, { useEffect } from 'react';
import { useGameStore } from '../../../store/gameStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Database, AlertTriangle } from 'lucide-react';
import { NodeWrapper } from '../NodeWrapper';

function HubDepositBadge({ deposit, offset, onDone }: {
  deposit: { id: number; goodCount: number; badCount: number };
  offset: number;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 1500);
    return () => clearTimeout(t);
  }, [deposit.id]);

  const isBad = deposit.badCount > 0;
  const count = isBad ? deposit.badCount : deposit.goodCount;
  const color = isBad ? '#ef4444' : '#facc15';
  const Icon = isBad ? AlertTriangle : Database;
  const xBase = isBad ? 14 : -14;
  const xOffset = xBase + offset * (isBad ? 12 : -12);

  return (
    <motion.div
      initial={{ opacity: 0, y: -4, x: xOffset, scale: 0.6 }}
      animate={{ opacity: [0, 1, 1, 0], y: -46, x: xOffset, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.4, ease: 'easeOut', times: [0, 0.15, 0.7, 1] }}
      style={{
        position: 'absolute', top: -4, left: '50%', transform: 'translateX(-50%)',
        pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: 3,
        padding: '3px 7px', borderRadius: 999,
        background: `${color}20`, border: `1px solid ${color}`,
        boxShadow: `0 0 10px ${color}aa`, color,
        fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800,
        whiteSpace: 'nowrap', zIndex: 20,
      }}
    >
      <Icon size={11} />
      <span>+{count}</span>
    </motion.div>
  );
}

export function HubNode({ id, data, selected }: any) {
  const deposits = useGameStore(s => s.hubDeposits);
  const removeHubDeposit = useGameStore(s => s.removeHubDeposit);

  const recent = deposits[deposits.length - 1];
  const flashKind: 'good' | 'bad' | null = recent ? (recent.badCount > 0 ? 'bad' : 'good') : null;
  const flashKey = recent ? recent.id : 'idle';
  const flashColor = flashKind === 'bad' ? '#ef4444' : flashKind === 'good' ? '#facc15' : null;

  return (
    <NodeWrapper selected={selected} glowColor="var(--accent)" nodeId={id} showWorkerDots={data.showWorkerDots} edgeStyle={data.edgeStyle} fadeIn={data.fadeIn} routeIndices={data.routeIndices} style={{
      animation: 'hub-pulse 3s ease-in-out infinite',
      padding: '14px 20px',
      borderRadius: 'var(--radius-lg)',
    }}>
      {flashColor && (
        <motion.div
          key={flashKey}
          initial={{ opacity: 0, scale: 1 }}
          animate={{ opacity: [0, 0.9, 0], scale: [1, 1.08, 1.14] }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          style={{
            position: 'absolute', inset: -4, borderRadius: 'var(--radius-lg)',
            border: `2px solid ${flashColor}`,
            boxShadow: `0 0 18px ${flashColor}, 0 0 36px ${flashColor}80`,
            pointerEvents: 'none',
          }}
        />
      )}
      <AnimatePresence>
        {deposits.map((d, i) => (
          <HubDepositBadge key={d.id} deposit={d} offset={i} onDone={() => removeHubDeposit(d.id)} />
        ))}
      </AnimatePresence>
      <div data-tutorial="hub-node" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <Shield size={20} color="var(--accent)" />
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{data.label}</div>
        <div style={{ fontSize: 8, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>CENTRAL HUB</div>
      </div>
    </NodeWrapper>
  );
}
