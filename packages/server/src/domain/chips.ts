/**
 * Player chip inventory and node chip effects.
 */

import { resolveStore } from '../store.js';
import type { Chip } from '../types.js';

export function getPlayerChips(userId?: string): Chip[] {
  return resolveStore(userId).game_state.playerChips || [];
}

export function addPlayerChip(chip: Chip, userId?: string) {
  const s = resolveStore(userId);
  if (!s.game_state.playerChips) s.game_state.playerChips = [];
  s.game_state.playerChips.push(chip);
}

export function removePlayerChip(chipId: string, userId?: string): Chip | null {
  const chips = resolveStore(userId).game_state.playerChips || [];
  const idx = chips.findIndex(c => c.id === chipId);
  if (idx === -1) return null;
  const [removed] = chips.splice(idx, 1);
  return removed;
}

/** Get aggregated chip effects for a node */
export function getNodeChipEffects(nodeId: string, userId?: string): Record<string, number> {
  const state = resolveStore(userId).game_state;
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node) return {};

  const effects: Record<string, number> = {};
  const allInstalledChips: Chip[] = [];

  for (const n of state.nodes) {
    if (n.id === nodeId && Array.isArray(n.data.installedChips)) {
      for (const item of n.data.installedChips) {
        if (typeof item === 'object' && item.effect) {
          allInstalledChips.push(item as Chip);
        }
      }
    }
  }

  for (const chip of allInstalledChips) {
    const { type, value } = chip.effect;
    if (type.endsWith('_mult')) {
      effects[type] = (effects[type] || 1) * value;
    } else {
      effects[type] = (effects[type] || 0) + value;
    }
  }

  return effects;
}
