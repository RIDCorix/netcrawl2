import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Database, Cpu, Star, Plus, Minus } from 'lucide-react';
import axios from 'axios';
import { GameNode, Resources } from '../../store/gameStore';
import { useT } from '../../hooks/useT';
import { formatResource } from '../../lib/format';
import { SectionLabel, Divider } from '../ui/primitives';

export function CostBadge({ cost }: { cost: Partial<Resources> }) {
  const icons: any = { data: Database, rp: Cpu, credits: Star };
  const colors: any = { data: 'var(--data-color)', rp: 'var(--rp-color)', credits: 'var(--credits-color)' };
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {Object.entries(cost).map(([key, val]) => {
        const Icon = icons[key];
        return (
          <div key={key} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '3px 10px', borderRadius: 'var(--radius-sm)',
            background: `color-mix(in srgb, ${colors[key]} 10%, transparent)`,
            border: `1px solid color-mix(in srgb, ${colors[key]} 20%, transparent)`,
            fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600, color: colors[key],
          }}>
            {Icon && <Icon size={10} />}
            {formatResource(key, val as number)}
          </div>
        );
      })}
    </div>
  );
}

export function ActionButton({ onClick, children, variant = 'primary', disabled = false }: {
  onClick: () => void;
  children: React.ReactNode;
  variant?: 'primary' | 'danger' | 'secondary';
  disabled?: boolean;
}) {
  const styles: any = {
    primary: { bg: 'var(--accent)', text: '#000' },
    danger: { bg: 'var(--danger)', text: '#fff' },
    secondary: { bg: 'var(--bg-elevated)', text: 'var(--text-primary)' },
  };
  const s = styles[variant];
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: disabled ? 'var(--bg-elevated)' : s.bg,
      color: disabled ? 'var(--text-muted)' : s.text,
      border: disabled ? '1px solid var(--border)' : 'none',
      borderRadius: 'var(--radius-sm)', padding: '10px 16px',
      fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)',
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
      transition: 'all 0.15s', width: '100%', letterSpacing: '0.03em',
    }}>
      {children}
    </button>
  );
}

export function StatusMessage({ msg }: { msg: string }) {
  if (!msg) return null;
  const isError = msg.startsWith('Error') || msg.includes('failed') || msg.includes('enough');
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        fontSize: 11, padding: '6px 10px', borderRadius: 'var(--radius-sm)',
        background: isError ? 'var(--danger-dim)' : 'rgba(46, 213, 115, 0.1)',
        border: `1px solid ${isError ? 'rgba(255, 71, 87, 0.2)' : 'rgba(46, 213, 115, 0.2)'}`,
        color: isError ? 'var(--danger)' : 'var(--success)', fontFamily: 'var(--font-mono)',
      }}
    >
      {msg}
    </motion.div>
  );
}

function StatRow({ statKey, name, current, max, canAdd, canSub, onAllocate }: {
  statKey: string; name: string; current: number; max: number;
  canAdd: boolean; canSub: boolean; onAllocate: (delta: number) => void;
}) {
  const pct = max > 0 ? (current / max) * 100 : 0;
  const STAT_COLORS: Record<string, string> = { rate: 'var(--data-color)', defense: 'var(--accent)', chipSlots: 'var(--rp-color)' };
  const color = STAT_COLORS[statKey] || 'var(--accent)';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button onClick={() => onAllocate(-1)} disabled={!canSub} style={{
        width: 22, height: 22, borderRadius: 'var(--radius-sm)',
        background: canSub ? 'var(--bg-elevated)' : 'transparent',
        border: `1px solid ${canSub ? 'var(--border-bright)' : 'var(--border)'}`,
        color: canSub ? 'var(--text-secondary)' : 'var(--text-muted)',
        cursor: canSub ? 'pointer' : 'not-allowed', opacity: canSub ? 1 : 0.3,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0,
      }}>
        <Minus size={10} />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
          <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{name}</span>
          <span style={{ fontSize: 10, fontWeight: 800, fontFamily: 'var(--font-mono)', color }}>{current}/{max}</span>
        </div>
        <div style={{ display: 'flex', gap: 2, height: 6 }}>
          {Array.from({ length: max }).map((_, i) => (
            <div key={i} style={{
              flex: 1, borderRadius: 2,
              background: i < current ? color : 'var(--bg-primary)',
              border: `1px solid ${i < current ? 'transparent' : 'var(--border)'}`,
              transition: 'background 0.2s',
            }} />
          ))}
        </div>
      </div>
      <button onClick={() => onAllocate(1)} disabled={!canAdd} style={{
        width: 22, height: 22, borderRadius: 'var(--radius-sm)',
        background: canAdd ? `color-mix(in srgb, ${color} 15%, transparent)` : 'transparent',
        border: `1px solid ${canAdd ? color : 'var(--border)'}`,
        color: canAdd ? color : 'var(--text-muted)',
        cursor: canAdd ? 'pointer' : 'not-allowed', opacity: canAdd ? 1 : 0.3,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0,
      }}>
        <Plus size={10} />
      </button>
    </div>
  );
}

export function NodeEnhanceSection({ nodeId, node }: { nodeId: string; node: GameNode }) {
  const t = useT();
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const fetchData = () => {
    axios.get(`/api/node/upgrades?nodeId=${nodeId}`).then(r => setData(r.data)).catch(() => {});
  };

  useEffect(() => { fetchData(); }, [nodeId, node.data.upgradeLevel, node.data.nodeXp, node.data.enhancementPoints, node.data.statAlloc]);

  const handleAllocate = async (statKey: string, delta: number) => {
    setBusy(true);
    try { await axios.post('/api/node/stat/allocate', { nodeId, statKey, delta }); }
    catch {} finally { setBusy(false); }
  };

  if (!data) return null;
  const { statDefs, statAlloc, availablePoints, enhancementPoints } = data;
  if (!statDefs || statDefs.length === 0) return null;

  return (
    <>
      <Divider />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <SectionLabel>{t('ui.enhance')}</SectionLabel>
          <span style={{
            fontSize: 10, fontWeight: 800, fontFamily: 'var(--font-mono)',
            padding: '2px 8px', borderRadius: 'var(--radius-sm)',
            background: availablePoints > 0 ? 'var(--accent-dim)' : 'var(--bg-elevated)',
            color: availablePoints > 0 ? 'var(--accent)' : 'var(--text-muted)',
            border: `1px solid ${availablePoints > 0 ? 'var(--accent)' : 'var(--border)'}`,
          }}>
            {availablePoints} / {enhancementPoints} EP
          </span>
        </div>
        {availablePoints > 0 && (
          <div style={{
            fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-mono)',
            padding: '4px 8px', borderRadius: 'var(--radius-sm)',
            background: 'var(--accent-dim)', textAlign: 'center',
          }}>
            {t('ui.ep_available').replace('{n}', String(availablePoints))}
          </div>
        )}
        {statDefs.map((stat: any) => {
          const current = statAlloc[stat.key] || 0;
          const statName = t(`stat.${stat.key}.name`);
          return (
            <StatRow
              key={stat.key} statKey={stat.key}
              name={statName === `stat.${stat.key}.name` ? stat.name : statName}
              current={current} max={stat.maxPoints}
              canAdd={availablePoints > 0 && current < stat.maxPoints && !busy}
              canSub={current > 0 && !busy}
              onAllocate={(d) => handleAllocate(stat.key, d)}
            />
          );
        })}
      </div>
    </>
  );
}

export function toSnakeCase(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
