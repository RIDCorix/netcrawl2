/**
 * Inventory item grid slot + empty slot placeholder.
 */

import { Package } from 'lucide-react';
import { useGameStore, InventoryItem } from '../../store/gameStore';
import { useState, useEffect, useCallback } from 'react';
import { ITEM_LABELS, ITEM_COLORS } from '../../constants/colors';
import { useT } from '../../hooks/useT';
import { WikiHoverHint } from '../ui/WikiHoverHint';
import { useCtrlTrigger } from '../../hooks/useModifierKey';
import { wikiIdForItem } from '../../wiki/content';
import { ITEM_ICONS } from './inventoryConstants';

export function ItemSlot({ item, dimmed }: { item: InventoryItem; dimmed: boolean }) {
  const t = useT();
  const openWiki = useGameStore(s => s.openWiki);
  const Icon = ITEM_ICONS[item.itemType] || Package;
  const color = ITEM_COLORS[item.itemType] || '#666';
  const label = t('item.' + item.itemType + '.name') || ITEM_LABELS[item.itemType] || item.itemType;

  const [hover, setHover] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const wikiId = wikiIdForItem(item.itemType);
  const hasWiki = !!wikiId && !dimmed;

  const trigger = useCallback(() => { if (wikiId) openWiki(wikiId); }, [wikiId, openWiki]);
  useCtrlTrigger(hover && hasWiki, trigger);

  useEffect(() => { if (!hover) setCursor(null); }, [hover]);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseMove={e => hasWiki && setCursor({ x: e.clientX, y: e.clientY })}
      style={{
        width: 64, height: 72,
        borderRadius: 'var(--radius-sm)',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
        position: 'relative',
        opacity: dimmed ? 0.2 : 1,
        transition: 'opacity 0.15s',
      }}
      title={label}
    >
      <Icon size={18} style={{ color }} />
      <span style={{ fontSize: 8, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600, textAlign: 'center', lineHeight: 1.1, padding: '0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
        {label}
      </span>
      <div style={{
        position: 'absolute', top: -4, right: -4,
        background: color, color: '#000',
        borderRadius: '999px', fontSize: 8, fontWeight: 800, fontFamily: 'var(--font-mono)',
        width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {item.count}
      </div>
      <WikiHoverHint visible={hover && hasWiki} cursor={cursor} accentColor={color} />
    </div>
  );
}

export function EmptySlot() {
  return (
    <div style={{
      width: 64, height: 72,
      borderRadius: 'var(--radius-sm)',
      border: '1px dashed var(--border)',
      background: 'var(--bg-primary)',
      opacity: 0.3,
    }} />
  );
}
