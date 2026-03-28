import { motion, AnimatePresence } from 'framer-motion';
import { X, Pickaxe, Shield, Radio, Package, Zap, Mountain, Database } from 'lucide-react';
import { useGameStore, InventoryItem } from '../store/gameStore';
import { CraftPanel } from './CraftPanel';

const ITEM_ICONS: Record<string, any> = {
  pickaxe_basic: Pickaxe,
  pickaxe_iron: Pickaxe,
  pickaxe_diamond: Pickaxe,
  shield: Shield,
  beacon: Radio,
  ore_chunk: Mountain,
  energy_crystal: Zap,
  data_shard: Database,
};

const ITEM_LABELS: Record<string, string> = {
  pickaxe_basic: 'Basic Pickaxe',
  pickaxe_iron: 'Iron Pickaxe',
  pickaxe_diamond: 'Diamond Pickaxe',
  shield: 'Shield',
  beacon: 'Beacon',
  ore_chunk: 'Ore Chunk',
  energy_crystal: 'Energy Crystal',
  data_shard: 'Data Shard',
};

const ITEM_COLORS: Record<string, string> = {
  pickaxe_basic: 'var(--text-muted)',
  pickaxe_iron: '#9ca3af',
  pickaxe_diamond: '#60a5fa',
  shield: 'var(--success)',
  beacon: 'var(--accent)',
  ore_chunk: 'var(--ore-color)',
  energy_crystal: 'var(--energy-color)',
  data_shard: 'var(--data-color)',
};

const EQUIPMENT_TYPES = ['pickaxe_basic', 'pickaxe_iron', 'pickaxe_diamond', 'shield', 'beacon'];
const MATERIAL_TYPES = ['ore_chunk', 'energy_crystal', 'data_shard'];

function ItemCard({ item }: { item: InventoryItem }) {
  const Icon = ITEM_ICONS[item.itemType] || Package;
  const label = ITEM_LABELS[item.itemType] || item.itemType;
  const color = ITEM_COLORS[item.itemType] || 'var(--text-muted)';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.15 }}
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        minWidth: 90,
        position: 'relative',
      }}
    >
      <Icon size={24} style={{ color }} />
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        textAlign: 'center',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-mono)',
        lineHeight: 1.3,
      }}>
        {label}
      </div>
      {item.metadata?.efficiency && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {item.metadata.efficiency}×
        </div>
      )}
      <div style={{
        position: 'absolute',
        top: -6,
        right: -6,
        background: color,
        color: '#000',
        borderRadius: '999px',
        fontSize: 10,
        fontWeight: 800,
        fontFamily: 'var(--font-mono)',
        width: 20,
        height: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {item.count}
      </div>
    </motion.div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 700,
      color: 'var(--text-muted)',
      fontFamily: 'var(--font-mono)',
      letterSpacing: '0.12em',
      marginBottom: 10,
      textTransform: 'uppercase',
    }}>
      {children}
    </div>
  );
}

export function InventoryPanel() {
  const { inventoryOpen, toggleInventory, playerInventory, resources } = useGameStore();

  const equipment = playerInventory.filter(i => EQUIPMENT_TYPES.includes(i.itemType));
  const materials = playerInventory.filter(i => MATERIAL_TYPES.includes(i.itemType));

  return (
    <AnimatePresence>
      {inventoryOpen && (
        <motion.div
          key="inventory-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(6px)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={toggleInventory}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-glass-heavy)',
              backdropFilter: 'blur(24px)',
              border: '1px solid var(--border-bright)',
              borderRadius: 'var(--radius-lg)',
              padding: 24,
              width: 640,
              maxWidth: 'calc(100vw - 64px)',
              maxHeight: 'calc(100vh - 120px)',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Package size={18} style={{ color: 'var(--accent)' }} />
                <span style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.1em',
                }}>
                  INVENTORY
                </span>
              </div>
              <button
                onClick={toggleInventory}
                style={{
                  color: 'var(--text-muted)',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Resources summary */}
            <div style={{
              display: 'flex',
              gap: 16,
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
            }}>
              {[
                { icon: Zap, label: 'Energy', value: resources.energy, color: 'var(--energy-color)' },
                { icon: Mountain, label: 'Ore', value: resources.ore, color: 'var(--ore-color)' },
                { icon: Database, label: 'Data', value: resources.data, color: 'var(--data-color)' },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <r.icon size={14} style={{ color: r.color }} />
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{r.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: r.color, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
                    {r.value.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>

            {/* Two-column layout: Items + Crafting */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* Left column: Items */}
              <div>
                <SectionLabel>Equipment</SectionLabel>
                {equipment.length === 0 ? (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    No equipment. Craft some below.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <AnimatePresence>
                      {equipment.map(item => <ItemCard key={item.id} item={item} />)}
                    </AnimatePresence>
                  </div>
                )}

                <div style={{ marginTop: 20 }}>
                  <SectionLabel>Materials</SectionLabel>
                  {materials.length === 0 ? (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      No materials yet.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      <AnimatePresence>
                        {materials.map(item => <ItemCard key={item.id} item={item} />)}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </div>

              {/* Right column: Crafting */}
              <div style={{
                borderLeft: '1px solid var(--border)',
                paddingLeft: 20,
              }}>
                <CraftPanel />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
