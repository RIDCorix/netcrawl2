/**
 * Node XP system — grant XP to nodes, auto-upgrade when threshold reached.
 */

import { resolveStore } from '../store.js';
import { getUpgradeKey, getNodeXpForAction, getNodeXpThreshold, NODE_UPGRADE_DEFS } from '../upgradeDefinitions.js';

/**
 * Grant XP to a specific node. Nodes gain XP through usage interactions.
 * When nodeXp >= threshold, auto-upgrades and grants enhancement points.
 */
export function grantNodeXp(nodeId: string, action: string, userId?: string): boolean {
  const state = resolveStore(userId).game_state;
  const nodeIdx = state.nodes.findIndex((n: any) => n.id === nodeId);
  if (nodeIdx === -1) return false;

  const node = state.nodes[nodeIdx];
  const key = getUpgradeKey(node.type, node.data.resource);
  const xpAmount = getNodeXpForAction(key, action);
  if (xpAmount <= 0) return false;

  const currentLevel = node.data.upgradeLevel || 0;
  const upgrades = NODE_UPGRADE_DEFS[key];
  if (!upgrades) return false;

  const maxLevel = upgrades.length;
  if (currentLevel >= maxLevel) return false;

  const threshold = getNodeXpThreshold(key, currentLevel + 1);
  if (threshold <= 0) return false;

  const currentXp = node.data.nodeXp || 0;
  const newXp = Math.min(currentXp + xpAmount, threshold);

  if (newXp >= threshold) {
    const nextUpgrade = upgrades.find(u => u.level === currentLevel + 1);
    if (nextUpgrade) {
      const newLevel = nextUpgrade.level;
      const nextThreshold = getNodeXpThreshold(key, newLevel + 1);
      const data = {
        ...node.data,
        upgradeLevel: newLevel,
        nodeXp: 0,
        nodeXpToNext: nextThreshold,
        enhancementPoints: (node.data.enhancementPoints || 0) + (nextUpgrade.enhancementPoints || 2),
        statAlloc: node.data.statAlloc || {},
      };
      if (nextUpgrade.effects.rateBonus) data.rate = (data.rate || 0) + nextUpgrade.effects.rateBonus;
      if (nextUpgrade.effects.chipSlots !== undefined) data.chipSlots = nextUpgrade.effects.chipSlots;
      if (nextUpgrade.effects.autoCollect) data.autoCollect = true;
      if (nextUpgrade.effects.defenseBonus) data.defense = (data.defense || 0) + nextUpgrade.effects.defenseBonus;

      state.nodes[nodeIdx] = { ...node, data };
      return true;
    }
  }

  state.nodes[nodeIdx] = {
    ...node,
    data: { ...node.data, nodeXp: newXp, nodeXpToNext: threshold },
  };

  return true;
}

/**
 * Sweep all nodes and auto-upgrade any that have full XP.
 * Call on game load to handle saves from before auto-upgrade existed.
 */
export function sweepNodeAutoUpgrades(userId?: string): boolean {
  const state = resolveStore(userId).game_state;
  let changed = false;

  for (let i = 0; i < state.nodes.length; i++) {
    const node = state.nodes[i];
    const key = getUpgradeKey(node.type, node.data.resource);
    const upgrades = NODE_UPGRADE_DEFS[key];
    if (!upgrades) continue;

    const currentLevel = node.data.upgradeLevel || 0;
    if (currentLevel >= upgrades.length) continue;

    const threshold = getNodeXpThreshold(key, currentLevel + 1);
    if (threshold <= 0) continue;

    const nodeXp = node.data.nodeXp || 0;
    if (nodeXp < threshold) continue;

    const nextUpgrade = upgrades.find(u => u.level === currentLevel + 1);
    if (!nextUpgrade) continue;

    const newLevel = nextUpgrade.level;
    const nextThreshold = getNodeXpThreshold(key, newLevel + 1);
    const data = {
      ...node.data,
      upgradeLevel: newLevel,
      nodeXp: 0,
      nodeXpToNext: nextThreshold,
      enhancementPoints: (node.data.enhancementPoints || 0) + (nextUpgrade.enhancementPoints || 2),
      statAlloc: node.data.statAlloc || {},
    };
    if (nextUpgrade.effects.rateBonus) data.rate = (data.rate || 0) + nextUpgrade.effects.rateBonus;
    if (nextUpgrade.effects.chipSlots !== undefined) data.chipSlots = nextUpgrade.effects.chipSlots;
    if (nextUpgrade.effects.autoCollect) data.autoCollect = true;
    if (nextUpgrade.effects.defenseBonus) data.defense = (data.defense || 0) + nextUpgrade.effects.defenseBonus;

    state.nodes[i] = { ...node, data };
    changed = true;
  }

  return changed;
}
