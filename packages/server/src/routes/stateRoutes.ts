/**
 * State & resource routes — GET /state, POST /gather, POST /unlock
 */

import { Router, Request, Response } from 'express';
import { getGameState, getVisibleState, saveGameState } from '../domain/gameState.js';
import { getWorkers } from '../domain/workers.js';
import { getPlayerLevelSummary } from '../domain/level.js';
import { incrementStat } from '../domain/achievements.js';
import { awardXp } from '../domain/level.js';
import { grantNodeXp } from '../domain/nodeXp.js';
import { getAllWorkerClasses } from '../workerRegistry.js';
import { isCodeServerConnected } from '../codeServerTracker.js';
import { checkCost, deductCost } from '../stateHelpers.js';
import { broadcastFullState } from '../broadcastHelper.js';
import { getUpgradeKey, getNodeXpThreshold } from '../upgradeDefinitions.js';
import { checkAchievements } from '../achievements.js';
import { checkQuests } from '../quests.js';
import { XP_REWARDS } from '../levelSystem.js';
import { getUserId } from './helpers.js';

export const stateRoutes = Router();

// GET /api/state
stateRoutes.get('/state', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const state = getGameState(uid);
  const { nodes, edges } = getVisibleState(2, uid);
  const workers = getWorkers(uid);
  const workerClasses = getAllWorkerClasses(uid);
  const codeServerConnected = isCodeServerConnected(uid);
  res.json({ ...state, nodes, edges, workers, workerClasses, codeServerConnected });
});

// POST /api/gather
stateRoutes.post('/gather', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { nodeId } = req.body;
  const state = getGameState(uid);
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node) return res.status(404).json({ error: 'Node not found' });
  if (!node.data.unlocked) return res.status(400).json({ error: 'Node not unlocked' });

  const resourceType = node.data.resource as string;
  if (!resourceType) return res.status(400).json({ error: 'Not a resource node' });

  const newResources = { ...state.resources };
  (newResources as any)[resourceType] = ((newResources as any)[resourceType] || 0) + 10;
  saveGameState({ ...state, resources: newResources }, uid);
  grantNodeXp(nodeId, 'harvest', uid);
  broadcastFullState(uid);
  res.json({ ok: true, resources: newResources });
});

// POST /api/unlock
stateRoutes.post('/unlock', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { nodeId } = req.body;
  const state = getGameState(uid);
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node) return res.status(404).json({ error: 'Node not found' });
  if (node.data.unlocked) return res.status(400).json({ error: 'Already unlocked' });

  const neighborIds = new Set<string>();
  for (const e of state.edges) {
    if (e.source === nodeId) neighborIds.add(e.target);
    else if (e.target === nodeId) neighborIds.add(e.source);
  }
  const hasUnlockedNeighbor = state.nodes.some(
    (n: any) => neighborIds.has(n.id) && n.data?.unlocked,
  );
  if (!hasUnlockedNeighbor) {
    return res.status(400).json({ error: 'No unlocked adjacent node — explore outward first' });
  }

  const cost = (node.data.unlockCost as Record<string, number>) || {};
  const resources = state.resources as unknown as Record<string, number>;

  const costError = checkCost(resources, cost);
  if (costError) return res.status(400).json({ error: costError });
  const newResources = deductCost(resources, cost);

  const newNodes = state.nodes.map((n: any) => {
    if (n.id === nodeId) {
      const key = getUpgradeKey(n.type, n.data.resource);
      const threshold = getNodeXpThreshold(key, 1);
      return { ...n, data: { ...n.data, unlocked: true, nodeXp: 0, nodeXpToNext: threshold } };
    }
    return n;
  });

  saveGameState({ ...state, nodes: newNodes, resources: newResources as any }, uid);
  broadcastFullState(uid);
  incrementStat('total_nodes_unlocked', 1, uid);
  awardXp(XP_REWARDS.unlock_node, uid);
  checkAchievements(uid);
  checkQuests(uid);
  res.json({ ok: true, resources: newResources });
});
