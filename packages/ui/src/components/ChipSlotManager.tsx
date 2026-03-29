import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Cpu } from 'lucide-react';
import { useGameStore, Chip } from '../store/gameStore';
import { useState } from 'react';
import axios from 'axios';
import { RARITY_COLORS } from '../constants/colors';
import { useT } from '../hooks/useT';

const GRID_COLS = 4;
const GRID_ROWS = 2;
const MAX_SLOTS_DISPLAY = GRID_COLS * GRID_ROWS; // 8 slots max in grid

function ChipCard({ chip, small, onAction, actionIcon }: {
  chip: Chip; small?: boolean; onAction?: () => void; actionIcon?: React.ReactNode;
}) {
  const t = useT();
  const color = RARITY_COLORS[chip.rarity];
  const chipName = t('chip.' + chip.chipType + '.name') || chip.name;
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
          {chipName}
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

/** A single grid slot — filled or empty */
function GridSlot({ chip, onRemove, onInsert, disabled }: {
  chip?: Chip;
  onRemove?: (chipId: string) => void;
  onInsert?: () => void;
  disabled?: boolean;
}) {
  const t = useT();
  if (chip) {
    const color = RARITY_COLORS[chip.rarity];
    const chipName = t('chip.' + chip.chipType + '.name') || chip.name;
    return (
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        title={`${chipName}\n${chip.effect.type}: ${chip.effect.value}`}
        style={{
          position: 'relative',
          aspectRatio: '1',
          borderRadius: 'var(--radius-sm)',
          background: `color-mix(in srgb, ${color} 10%, var(--bg-primary))`,
          border: `1px solid ${color}50`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          cursor: 'pointer',
          overflow: 'hidden',
        }}
        onClick={() => onRemove?.(chip.id)}
      >
        <Cpu size={14} style={{ color }} />
        <div style={{
          fontSize: 7, fontWeight: 700, fontFamily: 'var(--font-mono)',
          color: 'var(--text-primary)', textAlign: 'center',
          lineHeight: 1.1, padding: '0 2px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          width: '100%',
        }}>
          {chipName.replace('Chip ', '').replace('Module', 'Mod')}
        </div>
        {/* Rarity dot */}
        <div style={{
          position: 'absolute', top: 3, right: 3,
          width: 5, height: 5, borderRadius: '50%',
          background: color,
          boxShadow: `0 0 4px ${color}`,
        }} />
        {/* Remove hover indicator */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(255,71,87,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: 0,
          transition: 'opacity 0.15s',
        }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
        >
          <X size={12} style={{ color: 'var(--danger)' }} />
        </div>
      </motion.div>
    );
  }

  // Empty slot
  return (
    <button
      onClick={onInsert}
      disabled={disabled}
      style={{
        aspectRatio: '1',
        borderRadius: 'var(--radius-sm)',
        border: '1px dashed var(--border-bright)',
        background: 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.3 : 0.5,
        transition: 'opacity 0.15s',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.opacity = '0.8'; }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.opacity = '0.5'; }}
    >
      <Plus size={10} style={{ color: 'var(--text-muted)' }} />
    </button>
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

  const displaySlots = Math.min(chipSlots, MAX_SLOTS_DISPLAY);

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

  // Build grid items: installed chips fill first, then empty slots
  const gridItems: Array<{ type: 'chip'; chip: Chip } | { type: 'empty' }> = [];
  for (let i = 0; i < displaySlots; i++) {
    if (i < installedChips.length) {
      gridItems.push({ type: 'chip', chip: installedChips[i] });
    } else {
      gridItems.push({ type: 'empty' });
    }
  }

  const hasEmptySlots = installedChips.length < chipSlots;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Cpu size={11} style={{ color: 'var(--text-muted)' }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
          CHIP SLOTS
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {installedChips.length}/{chipSlots}
        </span>
      </div>

      {/* 4x2 Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
        gap: 4,
      }}>
        {gridItems.map((item, i) =>
          item.type === 'chip' ? (
            <GridSlot
              key={item.chip.id}
              chip={item.chip}
              onRemove={handleRemove}
            />
          ) : (
            <GridSlot
              key={`empty-${i}`}
              onInsert={() => setShowPicker(true)}
              disabled={playerChips.length === 0}
            />
          )
        )}
      </div>

      {/* Chip picker dropdown */}
      <AnimatePresence>
        {showPicker && hasEmptySlots && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              padding: 8, borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              display: 'flex', flexDirection: 'column', gap: 4,
              maxHeight: 140, overflowY: 'auto',
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
