import { motion, AnimatePresence } from 'framer-motion';
import { X, Pickaxe, Shield, Radio, Gem, Package, Zap, Mountain, Database } from 'lucide-react';
import { useGameStore, InventoryItem } from '../store/gameStore';

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
        borderRadius: '8px',
        padding: '10px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '6px',
        minWidth: '80px',
        position: 'relative',
      }}
    >
      <Icon size={22} style={{ color }} />
      <div className="text-xs text-center font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', lineHeight: 1.3 }}>
        {label}
      </div>
      {item.metadata?.efficiency && (
        <div className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {item.metadata.efficiency}×
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          top: -6,
          right: -6,
          background: color,
          color: '#000',
          borderRadius: '999px',
          fontSize: '10px',
          fontWeight: 700,
          fontFamily: 'var(--font-mono)',
          width: '18px',
          height: '18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {item.count}
      </div>
    </motion.div>
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
          key="inventory-panel"
          initial={{ x: 340, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 340, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          style={{
            position: 'fixed',
            right: 16,
            top: 72,
            bottom: 16,
            width: 320,
            background: 'var(--bg-glass-heavy)',
            backdropFilter: 'blur(20px)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '16px',
            zIndex: 45,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package size={16} style={{ color: 'var(--accent)' }} />
              <span className="text-sm font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
                INVENTORY
              </span>
            </div>
            <button
              onClick={toggleInventory}
              style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Resources summary */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
            <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
              RESOURCES
            </div>
            <div className="flex gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Zap size={13} style={{ color: 'var(--energy-color)' }} />
                <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--energy-color)', fontFamily: 'var(--font-mono)' }}>
                  {resources.energy}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Mountain size={13} style={{ color: 'var(--ore-color)' }} />
                <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ore-color)', fontFamily: 'var(--font-mono)' }}>
                  {resources.ore}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Database size={13} style={{ color: 'var(--data-color)' }} />
                <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--data-color)', fontFamily: 'var(--font-mono)' }}>
                  {resources.data}
                </span>
              </div>
            </div>
          </div>

          {/* Equipment */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
            <div className="text-xs font-semibold mb-3" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
              EQUIPMENT
            </div>
            {equipment.length === 0 ? (
              <div className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                No equipment. Craft some in the Craft panel.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <AnimatePresence>
                  {equipment.map(item => (
                    <ItemCard key={item.id} item={item} />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Materials */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
            <div className="text-xs font-semibold mb-3" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
              ORES / MATERIALS
            </div>
            {materials.length === 0 ? (
              <div className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                No materials. Deploy a miner to collect drops.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <AnimatePresence>
                  {materials.map(item => (
                    <ItemCard key={item.id} item={item} />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
