import { motion, AnimatePresence } from 'framer-motion';
import { X, Package, Database, Search, Hammer, Cpu, Star } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { ITEM_LABELS } from '../constants/colors';
import { useT } from '../hooks/useT';
import { formatResource } from '../lib/format';
import { INV_TABS_DEF, CRAFT_TABS_DEF, CRAFT_FAMILIES, type Recipe } from './inventory/inventoryConstants';
import { ItemSlot, EmptySlot } from './inventory/ItemSlot';
import { CraftFamilyColumn } from './inventory/CraftSlot';
import { CraftConfirm } from './inventory/CraftConfirm';
import { TabBar } from './inventory/TabBar';
import { ChipPackSection } from './inventory/ChipPackSection';
import { OwnedChipsSection } from './inventory/OwnedChipsSection';

export function InventoryPanel() {
  const t = useT();
  const { inventoryOpen, toggleInventory, playerInventory, resources } = useGameStore();
  const [search, setSearch] = useState('');
  const [invTab, setInvTab] = useState('all');
  const [craftTab, setCraftTab] = useState('all');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [confirmRecipe, setConfirmRecipe] = useState<Recipe | null>(null);
  const [crafting, setCrafting] = useState(false);
  const [craftMsg, setCraftMsg] = useState('');

  const INV_TABS = useMemo(() => INV_TABS_DEF.map(tab => ({ ...tab, label: t(tab.labelKey) })), [t]);
  const CRAFT_TABS = useMemo(() => CRAFT_TABS_DEF.map(tab => ({ ...tab, label: t(tab.labelKey) })), [t]);

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
  }, [playerInventory, invTab, search, INV_TABS]);

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
  }, [recipes, craftTab, search, CRAFT_TABS]);

  // Tab result availability
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
  }, [playerInventory, search, INV_TABS]);

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
  }, [recipes, search, CRAFT_TABS]);

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

  const GRID_COLS = 7;
  const emptySlots = Math.max(0, GRID_COLS - (filteredItems.length % GRID_COLS));

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
                padding: 20, width: 720, maxWidth: 'calc(100vw - 48px)',
                maxHeight: 'calc(100vh - 80px)', overflowY: 'auto',
                display: 'flex', flexDirection: 'column', gap: 14,
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Package size={16} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>{t('ui.inventory')}</span>
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
                  type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search items & recipes..."
                  style={{
                    width: '100%', padding: '8px 10px 8px 30px',
                    background: 'var(--bg-primary)', border: '1px solid var(--border-bright)',
                    borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
                    fontSize: 12, fontFamily: 'var(--font-mono)', outline: 'none',
                  }}
                />
              </div>

              {/* Crafting section */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Hammer size={12} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>{t('ui.crafting')}</span>
                  </div>
                  <TabBar tabs={CRAFT_TABS} active={craftTab} onChange={setCraftTab} hasResults={craftTabResults} />
                </div>
                {craftMsg && (
                  <div style={{ fontSize: 10, padding: '4px 8px', borderRadius: 'var(--radius-sm)', marginBottom: 6, background: craftMsg.startsWith('Error') ? 'var(--danger-dim)' : 'rgba(46,213,115,0.1)', color: craftMsg.startsWith('Error') ? 'var(--danger)' : 'var(--success)', fontFamily: 'var(--font-mono)' }}>
                    {craftMsg}
                  </div>
                )}
                {craftTab === 'shop' ? (
                  <ChipPackSection />
                ) : (
                  <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 4 }}>
                    {CRAFT_FAMILIES
                      .filter(fam => {
                        const tabDef = CRAFT_TABS_DEF.find(t => t.key === craftTab);
                        if (!tabDef?.ids) return true;
                        return fam.recipeIds.some(id => tabDef.ids!.includes(id));
                      })
                      .map(fam => (
                        <CraftFamilyColumn key={fam.id} family={fam} recipes={recipes} dimmer={isRecipeDimmed} onCraft={r => setConfirmRecipe(r)} />
                      ))
                    }
                  </div>
                )}
              </div>

              <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, var(--border-bright), transparent)' }} />

              {/* Inventory grid */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Package size={12} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>{t('ui.items')}</span>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>({playerInventory.reduce((s, i) => s + i.count, 0)})</span>
                  </div>
                  <TabBar tabs={INV_TABS} active={invTab} onChange={setInvTab} hasResults={invTabResults} />
                </div>
                {invTab === 'chips' ? (
                  <OwnedChipsSection search={search} />
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {filteredItems.length === 0 ? (
                      <div style={{ width: '100%', textAlign: 'center', padding: '16px 0', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {search ? t('ui.no_items_match') : t('ui.no_items_yet')}
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
                )}
              </div>

              {/* Resources bar */}
              <div style={{
                display: 'flex', gap: 12, padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-primary)', border: '1px solid var(--border)',
              }}>
                {[
                  { icon: Database, label: 'Data', value: resources.data, kind: 'data', color: 'var(--data-color)' },
                  { icon: Cpu, label: 'RP', value: resources.rp, kind: 'rp', color: 'var(--rp-color)' },
                  { icon: Star, label: t('ui.credits'), value: resources.credits, kind: 'credits', color: 'var(--credits-color)' },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <r.icon size={11} style={{ color: r.color }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: r.color, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{formatResource(r.kind, r.value)}</span>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{r.label}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmRecipe && <CraftConfirm recipe={confirmRecipe} onConfirm={handleCraft} onCancel={() => setConfirmRecipe(null)} crafting={crafting} />}
      </AnimatePresence>
    </>
  );
}
