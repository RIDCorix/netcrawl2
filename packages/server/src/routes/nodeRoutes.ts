/**
 * Node building, upgrades, stat allocation, and chip management routes.
 */

import { Router, Request, Response } from 'express';
import type { Chip } from '../types.js';
import { getGameState, saveGameState } from '../domain/gameState.js';
import { getPlayerInventory } from '../domain/inventory.js';
import { getPlayerChips, removePlayerChip, addPlayerChip, getNodeChipEffects } from '../domain/chips.js';
import { incrementStat } from '../domain/achievements.js';
import { awardXp } from '../domain/level.js';
import {
  NODE_UPGRADE_DEFS, getUpgradeKey, getNodeXpThreshold, NODE_STAT_DEFS,
  MAX_CHIP_SLOTS, computeNodeBuffer, BASE_NODE_BUFFER,
} from '../upgradeDefinitions.js';
import { checkCost, deductCost } from '../stateHelpers.js';
import { broadcastFullState } from '../broadcastHelper.js';
import { checkAchievements } from '../achievements.js';
import { checkQuests } from '../quests.js';
import { XP_REWARDS } from '../levelSystem.js';
import { getUserId } from './helpers.js';

export const nodeRoutes = Router();

const BUILD_COSTS: Record<string, Record<string, number>> = {
  cache: { data: 150000, rp: 5 },
  api: { data: 200000, rp: 8 },
};

// POST /api/node/build
nodeRoutes.post('/node/build', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { nodeId, structureType } = req.body;
  if (!nodeId || !structureType) return res.status(400).json({ error: 'nodeId and structureType required' });

  const cost = BUILD_COSTS[structureType];
  if (!cost) return res.status(400).json({ error: `Unknown structure type: ${structureType}` });

  const state = getGameState(uid);
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node) return res.status(404).json({ error: 'Node not found' });
  if (node.type !== 'empty') return res.status(400).json({ error: 'Can only build on empty nodes' });
  if (!node.data.unlocked) return res.status(400).json({ error: 'Node is locked' });

  const resources = state.resources;
  const costError = checkCost(resources, cost);
  if (costError) return res.status(400).json({ error: costError });
  const newResources = deductCost(resources, cost);

  const newNodes = state.nodes.map((n: any) => {
    if (n.id !== nodeId) return n;
    if (structureType === 'cache') {
      return { ...n, type: 'cache', data: { ...n.data, label: 'Cache Node', upgradeLevel: 1, cacheRange: 1, cacheCapacity: 10 } };
    }
    if (structureType === 'api') {
      return { ...n, type: 'api', data: { ...n.data, label: 'API Node', upgradeLevel: 1, pendingRequests: 0 } };
    }
    return n;
  });

  saveGameState({ ...state, nodes: newNodes, resources: newResources }, uid);
  broadcastFullState(uid);
  incrementStat('total_structures_built', 1, uid);
  awardXp(XP_REWARDS.build_structure, uid);
  checkAchievements(uid);
  checkQuests(uid);
  res.json({ ok: true, nodeId, structureType });
});

// GET /api/node/build-options
nodeRoutes.get('/node/build-options', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const state = getGameState(uid);
  const resources = state.resources;
  const options = Object.entries(BUILD_COSTS).map(([type, cost]) => ({
    type, cost, affordable: !checkCost(resources, cost),
  }));
  res.json({ options });
});

// GET /api/node/upgrades
nodeRoutes.get('/node/upgrades', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const nodeId = req.query.nodeId as string;
  if (!nodeId) return res.status(400).json({ error: 'nodeId required' });

  const state = getGameState(uid);
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node) return res.status(404).json({ error: 'Node not found' });

  const key = getUpgradeKey(node.type, node.data.resource);
  const upgrades = NODE_UPGRADE_DEFS[key] || [];
  const currentLevel = node.data.upgradeLevel || 0;

  const nodeXp = node.data.nodeXp || 0;
  const nextLevel = currentLevel + 1;
  const nodeXpToNext = getNodeXpThreshold(key, nextLevel);
  const maxLevel = upgrades.length;

  const statDefs = NODE_STAT_DEFS[key] || NODE_STAT_DEFS[node.type] || [];
  const statAlloc: Record<string, number> = node.data.statAlloc || {};
  const enhancementPoints: number = node.data.enhancementPoints || 0;
  const spentPoints = Object.values(statAlloc).reduce((s: number, v: number) => s + v, 0);
  const availablePoints = enhancementPoints - spentPoints;

  const chipEffectsForBuf = getNodeChipEffects(nodeId, uid);
  const maxBuffer = computeNodeBuffer(node.type, chipEffectsForBuf);
  const currentBuffer = Array.isArray(node.data.items) ? node.data.items.length : 0;

  res.json({
    nodeId, nodeType: node.type, resource: node.data.resource,
    currentLevel, maxLevel,
    chipSlots: Math.min(MAX_CHIP_SLOTS, node.data.chipSlots || 0),
    maxChipSlots: MAX_CHIP_SLOTS,
    installedChips: node.data.installedChips || [],
    nodeXp, nodeXpToNext: nodeXpToNext || 0,
    enhancementPoints, availablePoints, statAlloc, statDefs,
    maxBuffer, currentBuffer,
    baseBuffer: BASE_NODE_BUFFER[node.type] ?? 0,
  });
});

// POST /api/node/stat/allocate
nodeRoutes.post('/node/stat/allocate', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { nodeId, statKey, delta } = req.body;
  if (!nodeId || !statKey || delta === undefined) return res.status(400).json({ error: 'nodeId, statKey, delta required' });

  const state = getGameState(uid);
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node) return res.status(404).json({ error: 'Node not found' });
  if (!node.data.unlocked && node.type !== 'hub') return res.status(400).json({ error: 'Node is locked' });

  const key = getUpgradeKey(node.type, node.data.resource);
  const statDefs = NODE_STAT_DEFS[key] || NODE_STAT_DEFS[node.type] || [];
  const statDef = statDefs.find(s => s.key === statKey);
  if (!statDef) return res.status(400).json({ error: 'Invalid stat for this node' });

  const statAlloc: Record<string, number> = { ...(node.data.statAlloc || {}) };
  const currentAlloc = statAlloc[statKey] || 0;
  const enhancementPoints: number = node.data.enhancementPoints || 0;
  const spentPoints = Object.values(statAlloc).reduce((s: number, v: number) => s + v, 0);
  const available = enhancementPoints - spentPoints;

  const d = Number(delta);
  if (d === 1) {
    if (available <= 0) return res.status(400).json({ error: 'No enhancement points available' });
    if (currentAlloc >= statDef.maxPoints) return res.status(400).json({ error: 'Stat is at max' });
  } else if (d === -1) {
    if (currentAlloc <= 0) return res.status(400).json({ error: 'Stat is already at 0' });
  } else {
    return res.status(400).json({ error: 'delta must be +1 or -1' });
  }

  statAlloc[statKey] = currentAlloc + d;

  const data = { ...node.data, statAlloc };
  if (statKey === 'rate') data.rate = (data.baseRate || data.rate || 0) + (statAlloc.rate || 0) * statDef.perPoint;
  if (statKey === 'defense') data.defense = (data.baseDefense || 0) + (statAlloc.defense || 0) * statDef.perPoint;
  if (statKey === 'chipSlots') {
    data.chipSlots = Math.min(MAX_CHIP_SLOTS, (data.baseChipSlots || 1) + (statAlloc.chipSlots || 0) * statDef.perPoint);
  }

  const newNodes = state.nodes.map((n: any) => n.id === nodeId ? { ...n, data } : n);
  saveGameState({ ...state, nodes: newNodes }, uid);
  broadcastFullState(uid);
  checkQuests(uid);

  res.json({
    ok: true, statAlloc,
    availablePoints: enhancementPoints - Object.values(statAlloc).reduce((s: number, v: number) => s + v, 0),
  });
});

// POST /api/node/chip/insert
nodeRoutes.post('/node/chip/insert', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { nodeId, chipId } = req.body;
  if (!nodeId || !chipId) return res.status(400).json({ error: 'nodeId and chipId required' });

  const state = getGameState(uid);
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node) return res.status(404).json({ error: 'Node not found' });

  const installed = node.data.installedChips || [];
  const slots = Math.min(MAX_CHIP_SLOTS, node.data.chipSlots || 0);
  if (installed.length >= slots) return res.status(400).json({ error: 'No free chip slots' });

  const chip = removePlayerChip(chipId, uid);
  if (!chip) return res.status(400).json({ error: 'Chip not found in inventory' });

  const newNodes = state.nodes.map((n: any) => {
    if (n.id !== nodeId) return n;
    return { ...n, data: { ...n.data, installedChips: [...installed, chip] } };
  });

  saveGameState({ ...state, nodes: newNodes }, uid);
  broadcastFullState(uid);
  incrementStat('total_chips_installed', 1, uid);
  awardXp(XP_REWARDS.install_chip, uid);
  checkAchievements(uid);
  checkQuests(uid);
  res.json({ ok: true });
});

// POST /api/node/chip/remove
nodeRoutes.post('/node/chip/remove', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { nodeId, chipId } = req.body;
  if (!nodeId || !chipId) return res.status(400).json({ error: 'nodeId and chipId required' });

  const state = getGameState(uid);
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node) return res.status(404).json({ error: 'Node not found' });

  const installed = (node.data.installedChips || []) as Chip[];
  const chipIdx = installed.findIndex((c: Chip) => c.id === chipId);
  if (chipIdx === -1) return res.status(400).json({ error: 'Chip not installed on this node' });

  const [removed] = installed.splice(chipIdx, 1);
  addPlayerChip(removed, uid);

  const newNodes = state.nodes.map((n: any) => {
    if (n.id !== nodeId) return n;
    return { ...n, data: { ...n.data, installedChips: [...installed] } };
  });

  saveGameState({ ...state, nodes: newNodes }, uid);
  broadcastFullState(uid);
  res.json({ ok: true });
});
