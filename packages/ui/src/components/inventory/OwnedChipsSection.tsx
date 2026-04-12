/**
 * Owned chips display section.
 */

import { Cpu } from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import { RARITY_COLORS } from '../../constants/colors';
import { useT } from '../../hooks/useT';

export function OwnedChipsSection({ search }: { search: string }) {
  const { playerChips } = useGameStore();
  const t = useT();
  if (playerChips.length === 0) return null;

  const q = search.toLowerCase();
  const filtered = q
    ? playerChips.filter(c => (t('chip.' + c.chipType + '.name') || c.name).toLowerCase().includes(q) || c.chipType.toLowerCase().includes(q) || c.rarity.includes(q))
    : playerChips;

  return (
    <>
      <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, var(--border-bright), transparent)' }} />
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <Cpu size={12} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>{t('ui.chips')}</span>
          <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>({playerChips.length})</span>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {filtered.map(chip => {
            const color = RARITY_COLORS[chip.rarity];
            const chipName = t('chip.' + chip.chipType + '.name') || chip.name;
            const dimmed = q && !chipName.toLowerCase().includes(q);
            return (
              <div key={chip.id} title={`${chipName}\n${chip.rarity}\n${chip.effect.type}: ${chip.effect.value}`} style={{
                width: 64, height: 72, borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-elevated)', border: `1px solid ${color}40`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                opacity: dimmed ? 0.2 : 1, transition: 'opacity 0.15s',
              }}>
                <Cpu size={16} style={{ color }} />
                <div style={{ fontSize: 7, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', textAlign: 'center', lineHeight: 1.1, padding: '0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                  {chipName}
                </div>
                <div style={{ fontSize: 6, color, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', fontWeight: 700 }}>{chip.rarity}</div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
