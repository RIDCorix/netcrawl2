/**
 * Deploy wizard Step 1: Class selection, signature panel, and unit count.
 */

import { Package } from 'lucide-react';
import { InventoryItem } from '../../store/gameStore';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { getWorkerIcon } from '../../constants/workerIcons';
import { ITEM_COLORS } from '../../constants/colors';
import { useT } from '../../hooks/useT';
import { SLOT_ACCEPTS, ITEM_ICONS } from './EquipSlot';
import { Radio } from 'lucide-react';

export interface WorkerClassEntry {
  class_id: string;
  class_name: string;
  class_icon?: string;
  fields: Record<string, { type: string; field: string; description: string; item_type?: string }>;
  docstring: string;
  file: string;
  language: string;
}

interface ClassStepProps {
  workerClasses: WorkerClassEntry[];
  selectedClass: string;
  setSelectedClass: (id: string) => void;
  selectedClassEntry: WorkerClassEntry | undefined;
  classItemSlots: { name: string; itemType: string; description: string }[];
  routeSlots: { name: string; description: string; fieldType: 'route' | 'edge' }[];
  playerInventory: InventoryItem[];
  unitCount: number;
  setUnitCount: (n: number) => void;
  setEquippedPerUnit: React.Dispatch<React.SetStateAction<Record<string, string>[]>>;
  setCpuPerUnit: React.Dispatch<React.SetStateAction<number[]>>;
  setRamPerUnit: React.Dispatch<React.SetStateAction<number[]>>;
  setCurrentUnitIdx: React.Dispatch<React.SetStateAction<number>>;
}

export function ClassStep({
  workerClasses, selectedClass, setSelectedClass, selectedClassEntry,
  classItemSlots, routeSlots, playerInventory, unitCount, setUnitCount,
  setEquippedPerUnit, setCpuPerUnit, setRamPerUnit, setCurrentUnitIdx,
}: ClassStepProps) {
  const t = useT();

  const reqsMet = classItemSlots.every(slot => {
    const accepts = SLOT_ACCEPTS[slot.itemType] || [];
    const owned = playerInventory.filter(i => accepts.includes(i.itemType)).reduce((s, i) => s + i.count, 0);
    return owned >= unitCount;
  });

  const handleDecrement = () => {
    const n = Math.max(1, unitCount - 1);
    setUnitCount(n);
    setEquippedPerUnit(prev => prev.slice(0, n));
    setCpuPerUnit(prev => prev.slice(0, n));
    setRamPerUnit(prev => prev.slice(0, n));
    setCurrentUnitIdx(i => Math.min(i, n - 1));
  };

  const handleIncrement = () => {
    const n = unitCount + 1;
    setUnitCount(n);
    setEquippedPerUnit(prev => { const next = [...prev]; while (next.length < n) next.push({}); return next; });
    setCpuPerUnit(prev => { const next = [...prev]; while (next.length < n) next.push(0); return next; });
    setRamPerUnit(prev => { const next = [...prev]; while (next.length < n) next.push(0); return next; });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', marginBottom: 6 }}>{t('ui.worker_class')}</div>
        <Select value={selectedClass} onValueChange={setSelectedClass}>
          <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
          <SelectContent>
            {workerClasses.map(c => {
              const Icon = getWorkerIcon(c.class_icon);
              return <SelectItem key={c.class_id} value={c.class_id}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon size={14} /> {c.class_name}</span></SelectItem>;
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Class signature panel */}
      {selectedClassEntry && (
        <div style={{ padding: '14px 16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: `1px solid ${!reqsMet && classItemSlots.length > 0 ? 'rgba(255,71,87,0.3)' : 'var(--border)'}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {(() => { const Icon = getWorkerIcon(selectedClassEntry.class_icon); return <Icon size={18} style={{ color: 'var(--accent)' }} />; })()}
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {selectedClassEntry.class_name}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginLeft: 8 }}>
              ({selectedClassEntry.class_id})
            </span>
          </div>

          {selectedClassEntry.docstring && (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', lineHeight: 1.5 }}>
              {selectedClassEntry.docstring}
            </div>
          )}

          {classItemSlots.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', marginBottom: 6 }}>
                {t('ui.requires')}
              </div>
              {classItemSlots.map(slot => {
                const accepts = SLOT_ACCEPTS[slot.itemType] || [];
                const owned = playerInventory.filter(i => accepts.includes(i.itemType)).reduce((s, i) => s + i.count, 0);
                const met = owned >= unitCount;
                const Icon = ITEM_ICONS[accepts[0]] || Package;
                return (
                  <div key={slot.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                    <Icon size={14} style={{ color: met ? (ITEM_COLORS[accepts[0]] || '#666') : 'var(--danger)' }} />
                    <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: met ? 'var(--text-primary)' : 'var(--danger)', fontWeight: 600 }}>
                      {slot.itemType}
                    </span>
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, color: met ? 'var(--success)' : 'var(--danger)', marginLeft: 'auto' }}>
                      {owned}/{unitCount}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {routeSlots.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', marginBottom: 6 }}>
                {t('ui.spec')}
              </div>
              {routeSlots.map(slot => (
                <div key={slot.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  <Radio size={14} style={{ color: 'var(--accent-secondary)' }} />
                  <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600 }}>
                    Route {slot.name}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginLeft: 4 }}>
                    {slot.description}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            {selectedClassEntry.file.split('/').pop()} · {selectedClassEntry.language}
          </div>

          {!reqsMet && classItemSlots.length > 0 && (
            <div style={{
              fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--danger)',
              padding: '6px 10px', borderRadius: 'var(--radius-sm)',
              background: 'var(--danger-dim)', border: '1px solid rgba(255,71,87,0.2)',
            }}>
              {t('ui.not_enough_items')}
            </div>
          )}
        </div>
      )}

      {/* Unit count selector */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', marginBottom: 8 }}>
          {t('ui.deploy_count')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={handleDecrement}
            style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 16, fontFamily: 'var(--font-mono)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            -
          </button>
          <span style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', minWidth: 32, textAlign: 'center' }}>
            {unitCount}
          </span>
          <button onClick={handleIncrement}
            style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 16, fontFamily: 'var(--font-mono)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            +
          </button>
        </div>
      </div>
    </div>
  );
}
