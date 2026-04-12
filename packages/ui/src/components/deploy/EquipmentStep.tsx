/**
 * Deploy wizard Step 3: Hardware (CPU/RAM) + equipment slots + inventory.
 */

import { Cpu, MemoryStick, Check } from 'lucide-react';
import { InventoryItem } from '../../store/gameStore';
import { useT } from '../../hooks/useT';
import { EquipSlot, InvItem, SLOT_ACCEPTS } from './EquipSlot';

interface EquipmentStepProps {
  unitCount: number;
  currentUnitIdx: number;
  setCurrentUnitIdx: (i: number) => void;
  equippedPerUnit: Record<string, string>[];
  setEquippedPerUnit: React.Dispatch<React.SetStateAction<Record<string, string>[]>>;
  cpuPerUnit: number[];
  setCpuPerUnit: React.Dispatch<React.SetStateAction<number[]>>;
  ramPerUnit: number[];
  setRamPerUnit: React.Dispatch<React.SetStateAction<number[]>>;
  classItemSlots: { name: string; itemType: string; description: string }[];
  playerInventory: InventoryItem[];
  availableInventory: InventoryItem[];
  totalCompute: number;
  totalCapacity: number;
  usedCompute: number;
  currentCpu: number;
  currentRam: number;
  cpuAvailForUnit: number;
  ramAvailForUnit: number;
  allSlotsFilled: boolean;
}

export function EquipmentStep({
  unitCount, currentUnitIdx, setCurrentUnitIdx,
  equippedPerUnit, setEquippedPerUnit,
  cpuPerUnit, setCpuPerUnit, ramPerUnit, setRamPerUnit,
  classItemSlots, playerInventory, availableInventory,
  totalCompute, totalCapacity, usedCompute,
  currentCpu, currentRam, cpuAvailForUnit, ramAvailForUnit,
  allSlotsFilled,
}: EquipmentStepProps) {
  const t = useT();
  const equipped = equippedPerUnit[currentUnitIdx] || {};
  const itemSlots = classItemSlots;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Unit tabs */}
      {unitCount > 1 && (
        <div style={{ display: 'flex', gap: 4 }}>
          {Array.from({ length: unitCount }).map((_, i) => {
            const unitFilled = classItemSlots.every(s => !!(equippedPerUnit[i] || {})[s.name]);
            return (
              <button key={i} onClick={() => setCurrentUnitIdx(i)} style={{
                padding: '4px 12px', borderRadius: 'var(--radius-sm)',
                background: i === currentUnitIdx ? 'var(--accent-dim)' : 'transparent',
                border: `1px solid ${i === currentUnitIdx ? 'rgba(0,212,170,0.25)' : 'var(--border)'}`,
                color: i === currentUnitIdx ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                Unit {i + 1}
                {unitFilled && <Check size={10} style={{ color: 'var(--success)' }} />}
              </button>
            );
          })}
        </div>
      )}

      {/* Hardware: CPU + RAM */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
          HARDWARE
        </div>

        {/* Summary badges */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
            borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700,
          }}>
            <Cpu size={12} style={{ color: usedCompute > totalCompute ? 'var(--danger)' : '#f59e0b' }} />
            <span style={{ color: usedCompute > totalCompute ? 'var(--danger)' : 'var(--text-primary)' }}>{usedCompute}</span>
            <span style={{ color: 'var(--text-muted)' }}>/</span>
            <span style={{ color: '#f59e0b' }}>{totalCompute}</span>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
            borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700,
          }}>
            <MemoryStick size={12} style={{ color: '#a78bfa' }} />
            <span style={{ color: '#a78bfa' }}>{totalCapacity}</span>
          </div>
        </div>

        {/* CPU row */}
        <HardwareRow
          icon={<Cpu size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />}
          label="CPU"
          value={currentCpu}
          max={cpuAvailForUnit}
          onDecrement={() => setCpuPerUnit(prev => { const n = [...prev]; n[currentUnitIdx] = Math.max(0, (n[currentUnitIdx] || 0) - 1); return n; })}
          onIncrement={() => setCpuPerUnit(prev => { const n = [...prev]; n[currentUnitIdx] = (n[currentUnitIdx] || 0) + 1; return n; })}
        />

        {/* RAM row */}
        <HardwareRow
          icon={<MemoryStick size={14} style={{ color: '#a78bfa', flexShrink: 0 }} />}
          label="RAM"
          value={currentRam}
          max={ramAvailForUnit}
          onDecrement={() => setRamPerUnit(prev => { const n = [...prev]; n[currentUnitIdx] = Math.max(0, (n[currentUnitIdx] || 0) - 1); return n; })}
          onIncrement={() => setRamPerUnit(prev => { const n = [...prev]; n[currentUnitIdx] = (n[currentUnitIdx] || 0) + 1; return n; })}
        />
      </div>

      {/* Equipment slots (class-defined items) */}
      {classItemSlots.length > 0 && (
        <>
          <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, var(--border-bright), transparent)' }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
            {t('ui.equipment')}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {itemSlots.map(slot => (
              <EquipSlot key={slot.name} slotName={slot.name} acceptType={slot.itemType}
                equipped={equipped[slot.name] ? playerInventory.find(i => i.itemType === equipped[slot.name]) || null : null}
                onEquip={t => {
                  setEquippedPerUnit(prev => {
                    const next = [...prev];
                    next[currentUnitIdx] = { ...(next[currentUnitIdx] || {}), [slot.name]: t };
                    return next;
                  });
                }}
                onUnequip={() => {
                  setEquippedPerUnit(prev => {
                    const next = [...prev];
                    const u = { ...(next[currentUnitIdx] || {}) };
                    delete u[slot.name];
                    next[currentUnitIdx] = u;
                    return next;
                  });
                }} />
            ))}
          </div>
          {!allSlotsFilled && <div style={{ fontSize: 10, color: 'var(--warning)', fontFamily: 'var(--font-mono)' }}>
            {unitCount > 1 ? `Fill equipment for all ${unitCount} units` : 'Drag items from below to fill slots'}
          </div>}
        </>
      )}

      {/* Inventory (for drag-drop) */}
      {classItemSlots.length > 0 && (
        <>
          <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, var(--border-bright), transparent)' }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>{t('ui.inventory')}</div>
          {availableInventory.filter(i => !['cpu_basic', 'cpu_advanced', 'ram_basic', 'ram_advanced'].includes(i.itemType)).length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textAlign: 'center', padding: '12px 0' }}>{t('ui.no_items_craft')}</div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {availableInventory.filter(i => !['cpu_basic', 'cpu_advanced', 'ram_basic', 'ram_advanced'].includes(i.itemType)).map(item => (
                <InvItem key={item.itemType} item={item}
                  disabled={!itemSlots.some(s => (SLOT_ACCEPTS[s.itemType] || []).includes(item.itemType))} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Hardware row (extracted to remove duplication between CPU/RAM) ───────

function HardwareRow({ icon, label, value, max, onDecrement, onIncrement }: {
  icon: React.ReactNode; label: string; value: number; max: number;
  onDecrement: () => void; onIncrement: () => void;
}) {
  const btnStyle = (disabled: boolean): React.CSSProperties => ({
    width: 26, height: 26, borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    color: 'var(--text-primary)', fontSize: 14, fontFamily: 'var(--font-mono)',
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.3 : 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {icon}
      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', flex: 1 }}>{label}</span>
      <button onClick={onDecrement} disabled={value <= 0} style={btnStyle(value <= 0)}>-</button>
      <span style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', minWidth: 24, textAlign: 'center' }}>
        {value}
      </span>
      <button onClick={onIncrement} disabled={value >= max} style={btnStyle(value >= max)}>+</button>
      <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>({max})</span>
    </div>
  );
}
