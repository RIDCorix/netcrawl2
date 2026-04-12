import React from 'react';
import { motion } from 'framer-motion';
import { Database, Cpu, AlertTriangle, Package } from 'lucide-react';

const DROP_ICON: Record<string, any> = {
  data_fragment: Database,
  rp_shard: Cpu,
  bad_data: AlertTriangle,
};
const DROP_COLOR: Record<string, string> = {
  data_fragment: '#45aaf2',
  rp_shard: '#a78bfa',
  bad_data: '#ef4444',
};

export function DropsIndicator({ items, maxBuffer }: { items: any[]; maxBuffer?: number }) {
  if (!items || items.length === 0) return null;

  const byType = new Map<string, number>();
  for (const it of items) {
    const type = it.type;
    const count = it.count ?? it.amount ?? 1;
    byType.set(type, (byType.get(type) || 0) + count);
  }
  const entries = Array.from(byType.entries());
  const VISIBLE = 4;
  const visible = entries.slice(0, VISIBLE);
  const hidden = entries.length - VISIBLE;

  const stacks = items.length;
  const cap = maxBuffer ?? 0;
  const full = cap > 0 && stacks >= cap;

  return (
    <motion.div
      initial={{ opacity: 0, y: -2 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -2 }}
      style={{
        position: 'absolute', bottom: -18, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 3,
        padding: '2px 5px', borderRadius: 999,
        background: 'color-mix(in srgb, var(--bg-primary) 85%, transparent)',
        backdropFilter: 'blur(10px)',
        border: `1px solid ${full ? '#ef4444' : 'color-mix(in srgb, var(--accent) 35%, var(--border))'}`,
        boxShadow: full ? '0 0 8px rgba(239,68,68,0.5), 0 1px 4px rgba(0,0,0,0.4)' : '0 1px 4px rgba(0,0,0,0.4)',
        zIndex: 3, pointerEvents: 'none', fontFamily: 'var(--font-mono)',
      }}
    >
      {visible.map(([type, count]) => {
        const Icon = DROP_ICON[type] || Package;
        const color = DROP_COLOR[type] || '#facc15';
        return (
          <div key={type} style={{
            display: 'flex', alignItems: 'center', gap: 2,
            padding: '1px 4px 1px 2px', borderRadius: 999,
            background: `color-mix(in srgb, ${color} 20%, transparent)`, color,
          }}>
            <Icon size={9} style={{ color }} />
            <span style={{ fontSize: 9, fontWeight: 800, lineHeight: 1 }}>{count > 999 ? '999+' : count}</span>
          </div>
        );
      })}
      {hidden > 0 && <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-muted)', padding: '0 2px', lineHeight: 1 }}>+{hidden}</div>}
      {cap > 0 && (
        <div style={{ marginLeft: 2, paddingLeft: 4, borderLeft: '1px solid var(--border)', fontSize: 8, fontWeight: 700, color: full ? '#ef4444' : 'var(--text-muted)', lineHeight: 1 }}>
          {stacks}/{cap}
        </div>
      )}
    </motion.div>
  );
}

export function DepletedOverlay({ depletedUntil }: { depletedUntil?: number }) {
  const remaining = depletedUntil ? Math.max(0, Math.ceil((depletedUntil - Date.now()) / 1000)) : 0;
  return (
    <div style={{
      position: 'absolute', inset: 0, borderRadius: 'var(--radius-lg)',
      background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1,
    }}>
      <span style={{ color: 'var(--danger)', fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
        {remaining > 0 ? `${remaining}s` : 'depleted'}
      </span>
    </div>
  );
}
