import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Cpu } from 'lucide-react';
import { useGameStore, Chip, ChipRarity } from '../store/gameStore';
import { useState } from 'react';
import axios from 'axios';

const RARITY_COLORS: Record<ChipRarity, string> = {
  common: '#9ca3af',
  uncommon: '#4ade80',
  rare: '#60a5fa',
  legendary: '#f59e0b',
};

function ChipCard({ chip, small, onAction, actionIcon }: {
  chip: Chip; small?: boolean; onAction?: () => void; actionIcon?: React.ReactNode;
}) {
  const color = RARITY_COLORS[chip.rarity];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: small ? '4px 8px' : '6px 10px',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--bg-primary)',
      border: `1px solid ${color}40`,
      minWidth: 0,
    }}>
      <Cpu size={small ? 10 : 12} style={{ color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: small ? 9 : 10, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {chip.name}
        </div>
        <div style={{ fontSize: small ? 8 : 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {chip.effect.type}: {chip.effect.value}
        </div>
      </div>
      {onAction && (
        <button onClick={onAction} style={{
          color: 'var(--text-muted)', background: 'none', border: 'none',
          cursor: 'pointer', padding: 2, display: 'flex', flexShrink: 0,
        }}>
          {actionIcon || <X size={10} />}
        </button>
      )}
    </div>
  );
}

export function ChipSlotManager({ nodeId, chipSlots, installedChips }: {
  nodeId: string;
  chipSlots: number;
  installedChips: Chip[];
}) {
  const { playerChips } = useGameStore();
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy] = useState(false);

  const freeSlots = chipSlots - installedChips.length;

  const handleInsert = async (chipId: string) => {
    setBusy(true);
    try {
      await axios.post('/api/node/chip/insert', { nodeId, chipId });
      setShowPicker(false);
    } catch {} finally { setBusy(false); }
  };

  const handleRemove = async (chipId: string) => {
    setBusy(true);
    try {
      await axios.post('/api/node/chip/remove', { nodeId, chipId });
    } catch {} finally { setBusy(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Cpu size={11} style={{ color: 'var(--text-muted)' }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
          CHIP SLOTS
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {installedChips.length}/{chipSlots}
        </span>
      </div>

      {/* Installed chips */}
      {installedChips.map(chip => (
        <ChipCard key={chip.id} chip={chip} small onAction={() => handleRemove(chip.id)} />
      ))}

      {/* Empty slots */}
      {freeSlots > 0 && !showPicker && (
        <button
          onClick={() => setShowPicker(true)}
          disabled={playerChips.length === 0}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            padding: '6px', borderRadius: 'var(--radius-sm)',
            border: '1px dashed var(--border-bright)',
            background: 'transparent', color: 'var(--text-muted)',
            fontSize: 10, fontFamily: 'var(--font-mono)', cursor: 'pointer',
            opacity: playerChips.length === 0 ? 0.4 : 1,
          }}
        >
          <Plus size={10} />
          {playerChips.length === 0 ? 'No chips available' : `Insert chip (${freeSlots} free)`}
        </button>
      )}

      {/* Chip picker */}
      <AnimatePresence>
        {showPicker && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              padding: 8, borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              display: 'flex', flexDirection: 'column', gap: 4,
              maxHeight: 120, overflowY: 'auto',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Select chip to install:</span>
                <button onClick={() => setShowPicker(false)} style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 1, display: 'flex' }}>
                  <X size={10} />
                </button>
              </div>
              {playerChips.map(chip => (
                <ChipCard key={chip.id} chip={chip} small onAction={() => handleInsert(chip.id)} actionIcon={<Plus size={10} />} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
