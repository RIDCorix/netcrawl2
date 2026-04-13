/**
 * Crafting recipe slot with hover tooltip + craft family column.
 * Newly unlocked recipes show a flashing "pending" state until the player clicks to reveal.
 */

import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Hammer, Lock, Sparkles } from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import { ITEM_LABELS, ITEM_COLORS } from '../../constants/colors';
import { useT } from '../../hooks/useT';
import { formatResource } from '../../lib/format';
import { ITEM_ICONS, type Recipe, type CraftFamily } from './inventoryConstants';

export function CraftSlot({ recipe, dimmed, onCraft }: { recipe: Recipe; dimmed: boolean; onCraft: () => void }) {
  const t = useT();
  const { resources, pendingUnlocks, revealRecipe } = useGameStore();
  const [hover, setHover] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const isPending = pendingUnlocks.includes(recipe.id);
  const locked = !recipe.unlocked || (isPending && !revealing);
  const Icon = locked ? (isPending ? Sparkles : Lock) : (ITEM_ICONS[recipe.output.itemType] || Hammer);
  const color = ITEM_COLORS[recipe.output.itemType] || '#666';
  const displayName = locked ? '???' : (t('item.' + recipe.output.itemType + '.name') || recipe.name);
  const displayDesc = t('item.' + recipe.output.itemType + '.desc') || recipe.description;

  const COST_CONFIG: Record<string, { label: string; color: string; owned: number }> = {
    data: { label: 'Data', color: 'var(--data-color)', owned: resources.data },
    rp: { label: 'RP', color: 'var(--rp-color)', owned: resources.rp },
    credits: { label: 'Credits', color: 'var(--credits-color)', owned: resources.credits },
  };

  const canCraft = !locked && recipe.affordable && !dimmed;

  const handleClick = () => {
    if (isPending && !revealing) {
      setRevealing(true);
      setTimeout(() => {
        revealRecipe(recipe.id);
      }, 500);
      return;
    }
    if (canCraft) onCraft();
  };

  const rect = hover && ref.current ? ref.current.getBoundingClientRect() : null;

  return (
    <div ref={ref} style={{ position: 'relative' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        onClick={handleClick}
        disabled={!canCraft && !isPending}
        style={{
          width: 64, height: 72,
          borderRadius: 'var(--radius-sm)',
          background: revealing
            ? 'rgba(250, 204, 21, 0.15)'
            : locked ? 'var(--bg-primary)' : recipe.affordable ? 'var(--bg-elevated)' : 'var(--bg-primary)',
          border: `1px ${locked && !isPending ? 'dashed' : 'solid'} ${
            isPending ? 'rgba(250, 204, 21, 0.6)' : canCraft ? color : 'var(--border)'
          }`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
          cursor: isPending ? 'pointer' : canCraft ? 'pointer' : 'default',
          opacity: dimmed ? 0.15 : revealing ? 1 : locked && !isPending ? 0.35 : recipe.affordable || isPending ? 1 : 0.4,
          transition: 'all 0.15s',
          position: 'relative',
          padding: 0,
          animation: isPending && !revealing ? 'unlock-flash 1.5s ease-in-out infinite' : revealing ? 'unlock-burst 0.5s ease-out forwards' : 'none',
        }}
      >
        <Icon
          size={locked ? 14 : 18}
          style={{
            color: isPending
              ? 'rgba(250, 204, 21, 0.9)'
              : locked ? 'var(--text-muted)' : recipe.affordable ? color : 'var(--text-muted)',
          }}
        />
        <span style={{
          fontSize: 8, fontFamily: 'var(--font-mono)',
          color: isPending ? 'rgba(250, 204, 21, 0.9)' : locked ? 'var(--text-muted)' : 'var(--text-primary)',
          fontWeight: 600, textAlign: 'center', lineHeight: 1.1,
          padding: '0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%',
        }}>
          {isPending && !revealing ? t('ui.new_unlock') || 'NEW!' : displayName}
        </span>
        {!locked && (
          <div style={{ position: 'absolute', bottom: -2, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 1 }}>
            {recipe.cost.data !== undefined && <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--data-color)' }} />}
            {recipe.cost.rp !== undefined && <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--rp-color)' }} />}
            {recipe.cost.credits !== undefined && <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--credits-color)' }} />}
          </div>
        )}
      </button>

      {hover && !dimmed && rect && createPortal(
        <div style={{
          position: 'fixed',
          top: rect.top - 6,
          left: rect.left + rect.width / 2,
          transform: 'translate(-50%, -100%)',
          zIndex: 9999, pointerEvents: 'none',
          background: 'var(--bg-glass-heavy)', backdropFilter: 'blur(16px)',
          border: '1px solid var(--border-bright)', borderRadius: 'var(--radius-md)',
          padding: '8px 10px', minWidth: 140, whiteSpace: 'nowrap',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>
          {isPending && !revealing ? (
            <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(250, 204, 21, 0.9)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Sparkles size={10} /> {t('ui.click_to_unlock') || 'Click to unlock!'}
            </div>
          ) : locked ? (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Lock size={10} /> {t('ui.recipe_locked')}
              </div>
              {recipe.unlockHint && (
                <div style={{ fontSize: 8, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {t('ui.unlock_from')}: {recipe.unlockHint}
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>
                {t('item.' + recipe.output.itemType + '.name') || recipe.name}
              </div>
              <div style={{ fontSize: 8, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
                {displayDesc}
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {Object.entries(recipe.cost).map(([key, needed]) => {
                  const cfg = COST_CONFIG[key];
                  if (!cfg || !needed) return null;
                  const enough = cfg.owned >= needed;
                  return (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>
                      <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 700, color: enough ? 'var(--success)' : 'var(--danger)' }}>
                        {formatResource(key, cfg.owned)}/{formatResource(key, needed as number)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

export function CraftFamilyColumn({ family, recipes, dimmer, onCraft }: {
  family: CraftFamily;
  recipes: Recipe[];
  dimmer: (r: Recipe) => boolean;
  onCraft: (r: Recipe) => void;
}) {
  const familyRecipes = family.recipeIds
    .map(id => recipes.find(r => r.id === id))
    .filter(Boolean) as Recipe[];
  if (familyRecipes.length === 0) return null;

  const FamilyIcon = family.icon;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6,
        padding: '2px 8px', borderRadius: 'var(--radius-sm)',
        background: `color-mix(in srgb, ${family.color} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${family.color} 25%, transparent)`,
      }}>
        <FamilyIcon size={10} style={{ color: family.color }} />
        <span style={{ fontSize: 8, fontWeight: 800, fontFamily: 'var(--font-mono)', color: family.color, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {family.title}
        </span>
      </div>
      {familyRecipes.map((recipe, i) => (
        <div key={recipe.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {i > 0 && (
            <div style={{
              width: 1, height: 8,
              background: recipe.unlocked ? `color-mix(in srgb, ${family.color} 50%, transparent)` : 'var(--border)',
              transition: 'background 0.2s',
            }} />
          )}
          <CraftSlot recipe={recipe} dimmed={dimmer(recipe)} onCraft={() => onCraft(recipe)} />
        </div>
      ))}
    </div>
  );
}
