/**
 * Craft confirmation dialog.
 */

import { motion } from 'framer-motion';
import { Hammer, Check } from 'lucide-react';
import { ITEM_COLORS } from '../../constants/colors';
import { useT } from '../../hooks/useT';
import { formatBytes } from '../../lib/format';
import { ITEM_ICONS, type Recipe } from './inventoryConstants';

export function CraftConfirm({ recipe, onConfirm, onCancel, crafting }: {
  recipe: Recipe; onConfirm: () => void; onCancel: () => void; crafting: boolean;
}) {
  const t = useT();
  const Icon = ITEM_ICONS[recipe.output.itemType] || Hammer;
  const color = ITEM_COLORS[recipe.output.itemType] || '#666';
  const displayName = t('item.' + recipe.output.itemType + '.name') || recipe.name;
  const displayDesc = t('item.' + recipe.output.itemType + '.desc') || recipe.description;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg-glass-heavy)', border: '1px solid var(--border-bright)', borderRadius: 'var(--radius-lg)', padding: 20, width: 280, display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={20} style={{ color }} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{t('ui.craft_confirm').replace('{name}', displayName)}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{displayDesc}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {recipe.cost.data !== undefined && <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--data-color)', background: 'rgba(69,170,242,0.08)', padding: '2px 8px', borderRadius: 'var(--radius-sm)' }}>-{formatBytes(recipe.cost.data)}</span>}
          {recipe.cost.rp !== undefined && <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--rp-color)', background: 'rgba(167,139,250,0.08)', padding: '2px 8px', borderRadius: 'var(--radius-sm)' }}>-{recipe.cost.rp} RP</span>}
          {recipe.cost.credits !== undefined && <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--credits-color)', background: 'rgba(245,158,11,0.08)', padding: '2px 8px', borderRadius: 'var(--radius-sm)' }}>-{recipe.cost.credits} credits</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)', cursor: 'pointer' }}>{t('common.cancel')}</button>
          <button onClick={onConfirm} disabled={crafting} style={{ flex: 1, padding: '8px', borderRadius: 'var(--radius-sm)', background: 'var(--accent)', border: 'none', color: '#000', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', cursor: crafting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            {crafting ? '...' : <><Check size={11} /> {t('craft.craft')}</>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
