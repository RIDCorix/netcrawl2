/**
 * Player inventory management — add/remove items, item stat lookups.
 */

import { resolveStore } from '../store.js';
import type { InventoryItem } from '../types.js';

export function getPlayerInventory(userId?: string): InventoryItem[] {
  return resolveStore(userId).game_state.playerInventory || [];
}

export function addToPlayerInventory(itemType: string, count: number, metadata?: { efficiency?: number }, userId?: string) {
  const s = resolveStore(userId);
  const inv = s.game_state.playerInventory || [];
  const existing = inv.find(i => i.itemType === itemType);
  if (existing) {
    existing.count += count;
  } else {
    inv.push({
      id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      itemType: itemType as InventoryItem['itemType'],
      count,
      metadata,
    });
  }
  s.game_state.playerInventory = inv;
}

export function removeFromPlayerInventory(itemType: string, count: number, userId?: string): boolean {
  const s = resolveStore(userId);
  const inv = s.game_state.playerInventory || [];
  const existing = inv.find(i => i.itemType === itemType);
  if (!existing || existing.count < count) return false;
  existing.count -= count;
  if (existing.count === 0) {
    s.game_state.playerInventory = inv.filter(i => i.itemType !== itemType);
  }
  return true;
}

export function getItemEfficiency(itemType: string): number {
  const effMap: Record<string, number> = {
    pickaxe_basic: 1.0,
    pickaxe_iron: 1.5,
    pickaxe_diamond: 2.5,
  };
  return effMap[itemType] ?? 1.0;
}

/** Compute points provided by a CPU item */
export function getCpuComputePoints(itemType: string): number {
  const cpuMap: Record<string, number> = {
    cpu_basic: 1,
    cpu_advanced: 2,
  };
  return cpuMap[itemType] ?? 0;
}

/** Carrying capacity bonus provided by a RAM item */
export function getRamCapacityBonus(itemType: string): number {
  const ramMap: Record<string, number> = {
    ram_basic: 2,
    ram_advanced: 4,
  };
  return ramMap[itemType] ?? 0;
}

/** Compute points required to equip an item */
export function getItemComputeCost(itemType: string): number {
  const costMap: Record<string, number> = {
    pickaxe_basic: 1,
    pickaxe_iron: 1,
    pickaxe_diamond: 2,
    shield: 0,
    beacon: 1,
  };
  return costMap[itemType] ?? 0;
}
