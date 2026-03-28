import { motion, AnimatePresence } from 'framer-motion';
import { X, Pickaxe, Shield, Radio, Package, Zap, Mountain, Database, Search, Hammer, Check } from 'lucide-react';
import { useGameStore, InventoryItem } from '../store/gameStore';
import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';

// ── Item config ─────────────────────────────────────────────────────────────

const ITEM_ICONS: Record<string, any> = {
  pickaxe_basic: Pickaxe, pickaxe_iron: Pickaxe, pickaxe_diamond: Pickaxe,
  shield: Shield, beacon: Radio,
  ore_chunk: Mountain, energy_crystal: Zap, data_shard: Database,
};

const ITEM_LABELS: Record<string, string> = {
  pickaxe_basic: 'Basic Pickaxe', pickaxe_iron: 'Iron Pickaxe', pickaxe_diamond: 'Diamond Pickaxe',
  shield: 'Shield', beacon: 'Beacon',
  ore_chunk: 'Ore Chunk', energy_crystal: 'Energy Crystal', data_shard: 'Data Shard',
};

const ITEM_COLORS: Record<string, string> = {
  pickaxe_basic: '#9ca3af', pickaxe_iron: '#c0c0c0', pickaxe_diamond: '#60a5fa',
  shield: '#4ade80', beacon: '#00d4aa',
  ore_chunk: '#a78bfa', energy_crystal: '#ffd32a', data_shard: '#45aaf2',
};

// ── Categories ──────────────────────────────────────────────────────────────

const INV_TABS = [
  { key: 'all', label: 'All' },
  { key: 'equipment', label: 'Equipment', types: ['pickaxe_basic', 'pickaxe_iron', 'pickaxe_diamond', 'shield', 'beacon'] },
  { key: 'materials', label: 'Materials', types: ['ore_chunk', 'energy_crystal', 'data_shard'] },
];

const CRAFT_TABS = [
  { key: 'all', label: 'All' },
  { key: 'tools', label: 'Tools', ids: ['pickaxe_basic', 'pickaxe_iron', 'pickaxe_diamond'] },
  { key: 'gear', label: 'Gear', ids: ['shield', 'beacon'] },
];

// ── Recipe type ─────────────────────────────────────────────────────────────

interface Recipe {
  id: string;
  name: string;
  description: string;
  output: { itemType: string; count: number; metadata?: { efficiency?: number } };
  cost: { ore?: number; energy?: number; data?: number };
  affordable: boolean;
}

// ── Grid slot ───────────────────────────────────────────────────────────────

function ItemSlot({ item, dimmed }: { item: InventoryItem; dimmed: boolean }) {
  const Icon = ITEM_ICONS[item.itemType] || Package;
  const color = ITEM_COLORS[item.itemType] || '#666';
  const label = ITEM_LABELS[item.itemType] || item.itemType;

  return (
    <div style={{
      width: 64, height: 72,
      borderRadius: 'var(--radius-sm)',
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
      position: 'relative',
      opacity: dimmed ? 0.2 : 1,
      transition: 'opacity 0.15s',
    }} title={label}>
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
    </div>
  );
}

function EmptySlot() {
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

// ── Craft slot ──────────────────────────────────────────────────────────────

function CraftSlot({ recipe, dimmed, onCraft }: { recipe: Recipe; dimmed: boolean; onCraft: () => void }) {
  const Icon = ITEM_ICONS[recipe.output.itemType] || Hammer;
  const color = ITEM_COLORS[recipe.output.itemType] || '#666';

  return (
    <button
      onClick={recipe.affordable && !dimmed ? onCraft : undefined}
      disabled={!recipe.affordable || dimmed}
      style={{
        width: 64, height: 72,
        borderRadius: 'var(--radius-sm)',
        background: recipe.affordable ? 'var(--bg-elevated)' : 'var(--bg-primary)',
        border: `1px solid ${recipe.affordable && !dimmed ? color : 'var(--border)'}`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
        cursor: recipe.affordable && !dimmed ? 'pointer' : 'default',
        opacity: dimmed ? 0.15 : recipe.affordable ? 1 : 0.4,
        transition: 'all 0.15s',
        position: 'relative',
        padding: 0,
      }}
      title={`${recipe.name}\n${recipe.description}\n${Object.entries(recipe.cost).map(([k, v]) => `${v} ${k}`).join(', ')}`}
    >
      <Icon size={18} style={{ color: recipe.affordable ? color : 'var(--text-muted)' }} />
      <span style={{ fontSize: 8, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600, textAlign: 'center', lineHeight: 1.1, padding: '0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
        {recipe.name}
      </span>
      {/* Cost indicators */}
      <div style={{ position: 'absolute', bottom: -2, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 1 }}>
        {recipe.cost.energy !== undefined && <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--energy-color)' }} />}
        {recipe.cost.ore !== undefined && <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--ore-color)' }} />}
        {recipe.cost.data !== undefined && <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--data-color)' }} />}
      </div>
    </button>
  );
}

// ── Tab bar ─────────────────────────────────────────────────────────────────

function TabBar({ tabs, active, onChange, hasResults }: {
  tabs: { key: string; label: string }[];
  active: string;
  onChange: (key: string) => void;
  hasResults: Record<string, boolean>;
}) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {tabs.map(tab => {
        const isActive = tab.key === active;
        const has = hasResults[tab.key] !== false;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            style={{
              padding: '4px 10px', borderRadius: 'var(--radius-sm)',
              background: isActive ? 'var(--accent-dim)' : 'transparent',
              border: isActive ? '1px solid rgba(0,212,170,0.25)' : '1px solid transparent',
              color: !has ? 'var(--text-muted)' : isActive ? 'var(--accent)' : 'var(--text-secondary)',
              fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: isActive ? 700 : 500,
              cursor: 'pointer', transition: 'all 0.1s',
              opacity: !has ? 0.4 : 1,
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Confirm craft dialog ────────────────────────────────────────────────────

function CraftConfirm({ recipe, onConfirm, onCancel, crafting }: {
  recipe: Recipe; onConfirm: () => void; onCancel: () => void; crafting: boolean;
}) {
  const Icon = ITEM_ICONS[recipe.output.itemType] || Hammer;
  const color = ITEM_COLORS[recipe.output.itemType] || '#666';

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
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>Craft {recipe.name}?</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{recipe.description}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {recipe.cost.energy !== undefined && <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--energy-color)', background: 'rgba(255,211,42,0.08)', padding: '2px 8px', borderRadius: 'var(--radius-sm)' }}>-{recipe.cost.energy} energy</span>}
          {recipe.cost.ore !== undefined && <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ore-color)', background: 'rgba(167,139,250,0.08)', padding: '2px 8px', borderRadius: 'var(--radius-sm)' }}>-{recipe.cost.ore} ore</span>}
          {recipe.cost.data !== undefined && <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--data-color)', background: 'rgba(69,170,242,0.08)', padding: '2px 8px', borderRadius: 'var(--radius-sm)' }}>-{recipe.cost.data} data</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)', cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} disabled={crafting} style={{ flex: 1, padding: '8px', borderRadius: 'var(--radius-sm)', background: 'var(--accent)', border: 'none', color: '#000', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', cursor: crafting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            {crafting ? '...' : <><Check size={11} /> Craft</>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main panel ──────────────────────────────────────────────────────────────

export function InventoryPanel() {
  const { inventoryOpen, toggleInventory, playerInventory, resources } = useGameStore();
  const [search, setSearch] = useState('');
  const [invTab, setInvTab] = useState('all');
  const [craftTab, setCraftTab] = useState('all');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [confirmRecipe, setConfirmRecipe] = useState<Recipe | null>(null);
  const [crafting, setCrafting] = useState(false);
  const [craftMsg, setCraftMsg] = useState('');

  useEffect(() => {
    if (!inventoryOpen) return;
    axios.get('/api/recipes').then(r => setRecipes(r.data.recipes || [])).catch(() => {});
  }, [inventoryOpen, resources]);

  // Filter items
  const filteredItems = useMemo(() => {
    let items = playerInventory;
    const tabDef = INV_TABS.find(t => t.key === invTab);
    if (tabDef?.types) items = items.filter(i => tabDef.types!.includes(i.itemType));
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(i => (ITEM_LABELS[i.itemType] || i.itemType).toLowerCase().includes(q));
    }
    return items;
  }, [playerInventory, invTab, search]);

  // Filter recipes
  const filteredRecipes = useMemo(() => {
    let r = recipes;
    const tabDef = CRAFT_TABS.find(t => t.key === craftTab);
    if (tabDef?.ids) r = r.filter(rec => tabDef.ids!.includes(rec.id));
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(rec => rec.name.toLowerCase().includes(q) || rec.description.toLowerCase().includes(q));
    }
    return r;
  }, [recipes, craftTab, search]);

  // Tab result availability (for dimming)
  const invTabResults = useMemo(() => {
    const q = search.toLowerCase();
    const result: Record<string, boolean> = {};
    for (const tab of INV_TABS) {
      let items = playerInventory;
      if (tab.types) items = items.filter(i => tab.types!.includes(i.itemType));
      if (q) items = items.filter(i => (ITEM_LABELS[i.itemType] || i.itemType).toLowerCase().includes(q));
      result[tab.key] = items.length > 0;
    }
    return result;
  }, [playerInventory, search]);

  const craftTabResults = useMemo(() => {
    const q = search.toLowerCase();
    const result: Record<string, boolean> = {};
    for (const tab of CRAFT_TABS) {
      let r = recipes;
      if (tab.ids) r = r.filter(rec => tab.ids!.includes(rec.id));
      if (q) r = r.filter(rec => rec.name.toLowerCase().includes(q) || rec.description.toLowerCase().includes(q));
      result[tab.key] = r.length > 0;
    }
    return result;
  }, [recipes, search]);

  // Is a specific item dimmed by search?
  const isItemDimmed = (itemType: string) => {
    if (!search) return false;
    return !(ITEM_LABELS[itemType] || itemType).toLowerCase().includes(search.toLowerCase());
  };

  const isRecipeDimmed = (recipe: Recipe) => {
    if (!search) return false;
    const q = search.toLowerCase();
    return !recipe.name.toLowerCase().includes(q) && !recipe.description.toLowerCase().includes(q);
  };

  const handleCraft = async () => {
    if (!confirmRecipe) return;
    setCrafting(true);
    try {
      await axios.post('/api/craft', { recipeId: confirmRecipe.id });
      setCraftMsg(`Crafted ${confirmRecipe.name}!`);
      setTimeout(() => setCraftMsg(''), 2000);
      setConfirmRecipe(null);
    } catch (err: any) {
      setCraftMsg('Error: ' + (err.response?.data?.error || err.message));
      setTimeout(() => setCraftMsg(''), 3000);
      setConfirmRecipe(null);
    } finally {
      setCrafting(false);
    }
  };

  // Pad grid to fill row
  const GRID_COLS = 7;
  const emptySlots = Math.max(0, GRID_COLS - (filteredItems.length % GRID_COLS));
  const craftEmptySlots = Math.max(0, GRID_COLS - (filteredRecipes.length % GRID_COLS));

  return (
    <>
      <AnimatePresence>
        {inventoryOpen && (
          <motion.div
            key="inv-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={toggleInventory}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.92, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 28, stiffness: 350 }}
              onClick={e => e.stopPropagation()}
              style={{
                background: 'var(--bg-glass-heavy)', backdropFilter: 'blur(24px)',
                border: '1px solid var(--border-bright)', borderRadius: 'var(--radius-lg)',
                padding: 20, width: 560, maxWidth: 'calc(100vw - 48px)',
                maxHeight: 'calc(100vh - 80px)', overflowY: 'auto',
                display: 'flex', flexDirection: 'column', gap: 14,
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Package size={16} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>INVENTORY</span>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>[E]</span>
                </div>
                <button onClick={toggleInventory} style={{ color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', padding: 4, display: 'flex' }}>
                  <X size={14} />
                </button>
              </div>

              {/* Search */}
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search items & recipes..."
                  style={{
                    width: '100%', padding: '8px 10px 8px 30px',
                    background: 'var(--bg-primary)', border: '1px solid var(--border-bright)',
                    borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
                    fontSize: 12, fontFamily: 'var(--font-mono)', outline: 'none',
                  }}
                />
              </div>

              {/* ── Crafting section ── */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Hammer size={12} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>CRAFTING</span>
                  </div>
                  <TabBar tabs={CRAFT_TABS} active={craftTab} onChange={setCraftTab} hasResults={craftTabResults} />
                </div>
                {craftMsg && (
                  <div style={{ fontSize: 10, padding: '4px 8px', borderRadius: 'var(--radius-sm)', marginBottom: 6, background: craftMsg.startsWith('Error') ? 'var(--danger-dim)' : 'rgba(46,213,115,0.1)', color: craftMsg.startsWith('Error') ? 'var(--danger)' : 'var(--success)', fontFamily: 'var(--font-mono)' }}>
                    {craftMsg}
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {filteredRecipes.map(r => (
                    <CraftSlot key={r.id} recipe={r} dimmed={isRecipeDimmed(r)} onCraft={() => setConfirmRecipe(r)} />
                  ))}
                  {filteredRecipes.length % GRID_COLS !== 0 && Array.from({ length: craftEmptySlots }).map((_, i) => <EmptySlot key={`ce-${i}`} />)}
                </div>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, var(--border-bright), transparent)' }} />

              {/* ── Inventory grid ── */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Package size={12} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>ITEMS</span>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>({playerInventory.reduce((s, i) => s + i.count, 0)})</span>
                  </div>
                  <TabBar tabs={INV_TABS} active={invTab} onChange={setInvTab} hasResults={invTabResults} />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {filteredItems.length === 0 ? (
                    <div style={{ width: '100%', textAlign: 'center', padding: '16px 0', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {search ? 'No items match your search.' : 'No items yet.'}
                    </div>
                  ) : (
                    <>
                      {filteredItems.map(item => (
                        <ItemSlot key={item.itemType} item={item} dimmed={isItemDimmed(item.itemType)} />
                      ))}
                      {filteredItems.length % GRID_COLS !== 0 && Array.from({ length: emptySlots }).map((_, i) => <EmptySlot key={`ie-${i}`} />)}
                    </>
                  )}
                </div>
              </div>

              {/* ── Resources bar ── */}
              <div style={{
                display: 'flex', gap: 12, padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-primary)', border: '1px solid var(--border)',
              }}>
                {[
                  { icon: Zap, label: 'Energy', value: resources.energy, color: 'var(--energy-color)' },
                  { icon: Mountain, label: 'Ore', value: resources.ore, color: 'var(--ore-color)' },
                  { icon: Database, label: 'Data', value: resources.data, color: 'var(--data-color)' },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <r.icon size={11} style={{ color: r.color }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: r.color, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{r.value.toLocaleString()}</span>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{r.label}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Craft confirm dialog */}
      <AnimatePresence>
        {confirmRecipe && <CraftConfirm recipe={confirmRecipe} onConfirm={handleCraft} onCancel={() => setConfirmRecipe(null)} crafting={crafting} />}
      </AnimatePresence>
    </>
  );
}
