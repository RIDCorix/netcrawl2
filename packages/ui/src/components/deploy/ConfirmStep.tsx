/**
 * Deploy wizard Step 4: Confirmation summary before deploying.
 */

import { useT } from '../../hooks/useT';
import { ITEM_LABELS } from '../../constants/colors';
import type { WorkerClassEntry } from './ClassStep';

interface ConfirmStepProps {
  selectedClassEntry: WorkerClassEntry | undefined;
  unitCount: number;
  nodeName: string;
  routes: Record<string, { id: string; source: string; target: string }[]>;
  equipped: Record<string, string>;
  getNodeLabel: (id: string) => string;
}

export function ConfirmStep({ selectedClassEntry, unitCount, nodeName, routes, equipped, getNodeLabel }: ConfirmStepProps) {
  const t = useT();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>{t('ui.confirm_deploy')}</div>
      <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>
          <span style={{ color: 'var(--text-muted)' }}>Class: </span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{selectedClassEntry?.class_name}</span>
          <span style={{ color: 'var(--accent)', fontWeight: 700, marginLeft: 8 }}>x{unitCount}</span>
        </div>
        <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>
          <span style={{ color: 'var(--text-muted)' }}>Node: </span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{nodeName}</span>
        </div>
        {Object.entries(routes).map(([name, edges]) => (
          <div key={name} style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>
            <span style={{ color: 'var(--text-muted)' }}>{name}: </span>
            <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
              {edges.map((e, i) => (i === 0 ? getNodeLabel(e.source) + ' → ' : '') + getNodeLabel(e.target)).join(' → ')}
            </span>
          </div>
        ))}
        {Object.entries(equipped).map(([name, itemType]) => (
          <div key={name} style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>
            <span style={{ color: 'var(--text-muted)' }}>{name}: </span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{ITEM_LABELS[itemType] || itemType}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
