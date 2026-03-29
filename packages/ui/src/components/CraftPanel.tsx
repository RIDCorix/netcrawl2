import { motion, AnimatePresence } from 'framer-motion';
import { Pickaxe, Shield, Radio, Database, Cpu, Star, Hammer, X, Check } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { useState, useEffect } from 'react';
import axios from 'axios';
import { useT } from '../hooks/useT';

interface Recipe {
  id: string;
  name: string;
  description: string;
  output: { itemType: string; count: number; metadata?: { efficiency?: number } };
  cost: { data?: number; rp?: number; credits?: number };
  affordable: boolean;
}

const RECIPE_ICONS: Record<string, any> = {
  pickaxe_basic: Pickaxe,
  pickaxe_iron: Pickaxe,
  pickaxe_diamond: Pickaxe,
  shield: Shield,
  beacon: Radio,
};

const RECIPE_ICON_COLORS: Record<string, string> = {
  pickaxe_basic: 'var(--text-muted)',
  pickaxe_iron: '#9ca3af',
  pickaxe_diamond: '#60a5fa',
  shield: 'var(--success)',
  beacon: 'var(--accent)',
};

function RecipeCard({
  recipe,
  onCraft,
}: {
  recipe: Recipe;
  onCraft: (recipe: Recipe) => void;
}) {
  const t = useT();
  const Icon = RECIPE_ICONS[recipe.output.itemType] || Hammer;
  const iconColor = RECIPE_ICON_COLORS[recipe.output.itemType] || 'var(--text-muted)';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      style={{
        background: 'var(--bg-elevated)',
        border: `1px solid ${recipe.affordable ? 'var(--border)' : 'rgba(255,255,255,0.04)'}`,
        borderRadius: '8px',
        padding: '12px',
        opacity: recipe.affordable ? 1 : 0.55,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '8px',
            background: 'var(--bg-glass)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            border: '1px solid var(--border)',
          }}
        >
          <Icon size={18} style={{ color: iconColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {t('item.' + recipe.output.itemType + '.name') || recipe.name}
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.4 }}>
            {t('item.' + recipe.output.itemType + '.desc') || recipe.description}
          </div>
        </div>
      </div>

      {/* Cost */}
      <div className="flex flex-wrap gap-2">
        {recipe.cost.data !== undefined && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded text-xs" style={{ background: 'rgba(69,170,242,0.08)', color: 'var(--data-color)', fontFamily: 'var(--font-mono)' }}>
            <Database size={10} />
            {recipe.cost.data}
          </div>
        )}
        {recipe.cost.rp !== undefined && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded text-xs" style={{ background: 'rgba(167,139,250,0.08)', color: 'var(--rp-color)', fontFamily: 'var(--font-mono)' }}>
            <Cpu size={10} />
            {recipe.cost.rp}
          </div>
        )}
        {recipe.cost.credits !== undefined && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded text-xs" style={{ background: 'rgba(245,158,11,0.08)', color: 'var(--credits-color)', fontFamily: 'var(--font-mono)' }}>
            <Star size={10} />
            {recipe.cost.credits}
          </div>
        )}
      </div>

      <button
        disabled={!recipe.affordable}
        onClick={() => onCraft(recipe)}
        style={{
          background: recipe.affordable ? 'var(--accent)' : 'var(--bg-glass)',
          color: recipe.affordable ? '#000' : 'var(--text-muted)',
          border: 'none',
          borderRadius: '6px',
          padding: '5px 12px',
          fontSize: '12px',
          fontWeight: 700,
          fontFamily: 'var(--font-mono)',
          cursor: recipe.affordable ? 'pointer' : 'not-allowed',
          transition: 'all 0.15s',
          width: '100%',
        }}
      >
        {recipe.affordable ? 'Craft' : 'Cannot Afford'}
      </button>
    </motion.div>
  );
}

function ConfirmDialog({
  recipe,
  onConfirm,
  onCancel,
  crafting,
}: {
  recipe: Recipe;
  onConfirm: () => void;
  onCancel: () => void;
  crafting: boolean;
}) {
  const t = useT();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-glass-heavy)',
          backdropFilter: 'blur(24px)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '20px',
          width: 280,
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            Craft {t('item.' + recipe.output.itemType + '.name') || recipe.name}?
          </div>
          <button
            onClick={onCancel}
            style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}
          >
            <X size={14} />
          </button>
        </div>
        <div className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {t('item.' + recipe.output.itemType + '.desc') || recipe.description}
        </div>
        <div className="flex flex-wrap gap-2">
          {recipe.cost.data !== undefined && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded text-xs" style={{ background: 'rgba(69,170,242,0.08)', color: 'var(--data-color)', fontFamily: 'var(--font-mono)' }}>
              <Database size={10} /> -{recipe.cost.data} data
            </div>
          )}
          {recipe.cost.rp !== undefined && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded text-xs" style={{ background: 'rgba(167,139,250,0.08)', color: 'var(--rp-color)', fontFamily: 'var(--font-mono)' }}>
              <Cpu size={10} /> -{recipe.cost.rp} RP
            </div>
          )}
          {recipe.cost.credits !== undefined && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded text-xs" style={{ background: 'rgba(245,158,11,0.08)', color: 'var(--credits-color)', fontFamily: 'var(--font-mono)' }}>
              <Star size={10} /> -{recipe.cost.credits} credits
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              background: 'var(--bg-elevated)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '6px',
              fontSize: '12px',
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={crafting}
            style={{
              flex: 1,
              background: crafting ? 'var(--bg-elevated)' : 'var(--accent)',
              color: crafting ? 'var(--text-muted)' : '#000',
              border: 'none',
              borderRadius: '6px',
              padding: '6px',
              fontSize: '12px',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              cursor: crafting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
            }}
          >
            {crafting ? 'Crafting...' : (
              <>
                <Check size={12} />
                Confirm
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function CraftPanel() {
  const { resources } = useGameStore();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmRecipe, setConfirmRecipe] = useState<Recipe | null>(null);
  const [crafting, setCrafting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const fetchRecipes = async () => {
    try {
      const res = await axios.get('/api/recipes');
      setRecipes(res.data.recipes || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecipes();
  }, [resources]); // Re-fetch when resources change to update affordability

  const handleCraft = async () => {
    if (!confirmRecipe) return;
    setCrafting(true);
    try {
      await axios.post('/api/craft', { recipeId: confirmRecipe.id });
      setSuccessMsg(`Crafted ${confirmRecipe.name}!`);
      setTimeout(() => setSuccessMsg(''), 3000);
      setConfirmRecipe(null);
      fetchRecipes();
    } catch (err: any) {
      setSuccessMsg('Error: ' + (err.response?.data?.error || err.message));
      setTimeout(() => setSuccessMsg(''), 3000);
      setConfirmRecipe(null);
    } finally {
      setCrafting(false);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
          CRAFT
        </div>

        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-xs px-2 py-1.5 rounded"
            style={{
              background: successMsg.startsWith('Error') ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
              color: successMsg.startsWith('Error') ? 'var(--danger)' : 'var(--success)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {successMsg}
          </motion.div>
        )}

        {loading ? (
          <div className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Loading recipes...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {recipes.map(recipe => (
              <RecipeCard key={recipe.id} recipe={recipe} onCraft={setConfirmRecipe} />
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {confirmRecipe && (
          <ConfirmDialog
            recipe={confirmRecipe}
            onConfirm={handleCraft}
            onCancel={() => setConfirmRecipe(null)}
            crafting={crafting}
          />
        )}
      </AnimatePresence>
    </>
  );
}
