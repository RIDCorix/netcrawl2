import React, { useState, DragEvent } from 'react';
import { Package, Pickaxe, Shield, Radio, Cpu, MemoryStick } from 'lucide-react';
import { InventoryItem } from '../../store/gameStore';
import { ITEM_LABELS, ITEM_COLORS } from '../../constants/colors';

export const ITEM_ICONS: Record<string, any> = {
  pickaxe_basic: Pickaxe, pickaxe_iron: Pickaxe, pickaxe_diamond: Pickaxe,
  shield: Shield, beacon: Radio,
  cpu_basic: Cpu, cpu_advanced: Cpu,
  ram_basic: MemoryStick, ram_advanced: MemoryStick,
};

export const SLOT_ACCEPTS: Record<string, string[]> = {
  Pickaxe: ['pickaxe_basic', 'pickaxe_iron', 'pickaxe_diamond'],
  Shield: ['shield'],
  Beacon: ['beacon'],
  CPU: ['cpu_basic', 'cpu_advanced'],
  RAM: ['ram_basic', 'ram_advanced'],
};

export function EquipSlot({ slotName, acceptType, equipped, onEquip, onUnequip }: {
  slotName: string; acceptType: string; equipped: InventoryItem | null;
  onEquip: (t: string) => void; onUnequip: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const accepts = SLOT_ACCEPTS[acceptType] || [];
  const handleDragOver = (e: DragEvent) => {
    const t = e.dataTransfer.types.find(t => t.startsWith('item/'));
    if (t && accepts.includes(t.replace('item/', ''))) { e.preventDefault(); setDragOver(true); }
  };
  const handleDrop = (e: DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const t = e.dataTransfer.getData('itemType');
    if (t && accepts.includes(t)) onEquip(t);
  };
  const Icon = equipped ? (ITEM_ICONS[equipped.itemType] || Package) : null;
  const color = equipped ? (ITEM_COLORS[equipped.itemType] || '#666') : 'var(--border-bright)';

  return (
    <div onDragOver={handleDragOver} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}
      onClick={() => equipped && onUnequip()}
      style={{
        width: 90, height: 100, borderRadius: 'var(--radius-md)',
        border: `2px ${equipped ? 'solid' : 'dashed'} ${dragOver ? 'var(--accent)' : equipped ? color : 'var(--border-bright)'}`,
        background: dragOver ? 'var(--accent-dim)' : equipped ? 'var(--bg-elevated)' : 'var(--bg-primary)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
        cursor: equipped ? 'pointer' : 'default', transition: 'all 0.15s', position: 'relative',
      }}
      title={equipped ? 'Click to unequip' : `Drag ${acceptType}`}
    >
      {equipped ? (
        <>
          {Icon && <Icon size={24} style={{ color }} />}
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600, textAlign: 'center' }}>
            {ITEM_LABELS[equipped.itemType] || equipped.itemType}
          </span>
          <div style={{ position: 'absolute', top: -6, right: -6, width: 16, height: 16, borderRadius: '50%', background: 'var(--danger)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>x</div>
        </>
      ) : (
        <>
          <div style={{ width: 28, height: 28, borderRadius: 8, border: '1px dashed var(--border-bright)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 16, color: 'var(--text-muted)' }}>?</span>
          </div>
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textAlign: 'center' }}>{slotName}</span>
        </>
      )}
    </div>
  );
}

export function InvItem({ item, disabled }: { item: InventoryItem; disabled: boolean }) {
  const Icon = ITEM_ICONS[item.itemType] || Package;
  const color = ITEM_COLORS[item.itemType] || '#666';
  return (
    <div draggable={!disabled} onDragStart={e => {
      if (disabled) { e.preventDefault(); return; }
      e.dataTransfer.setData('itemType', item.itemType);
      e.dataTransfer.setData(`item/${item.itemType}`, '1');
    }} style={{
      width: 72, height: 80, borderRadius: 'var(--radius-sm)',
      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
      cursor: disabled ? 'not-allowed' : 'grab', opacity: disabled ? 0.3 : 1, position: 'relative',
    }}>
      <Icon size={20} style={{ color }} />
      <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600, textAlign: 'center' }}>
        {ITEM_LABELS[item.itemType] || item.itemType}
      </span>
      <div style={{ position: 'absolute', top: -5, right: -5, background: color, color: '#000', borderRadius: '999px', fontSize: 9, fontWeight: 800, fontFamily: 'var(--font-mono)', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{item.count}</div>
    </div>
  );
}
