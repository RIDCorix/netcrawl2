/**
 * Dev console routes — direct game state manipulation for debugging.
 */

import { Router, Request, Response } from 'express';
import { getGameState, saveGameState } from '../domain/gameState.js';
import { addToPlayerInventory } from '../domain/inventory.js';
import { getQuestStatus, setQuestStatus } from '../domain/questState.js';
import { getLayerManager, isLayerUnlocked } from '../domain/layers.js';
import { QUESTS } from '../questDefinitions.js';
import { LAYER_DEFS } from '../layerDefinitions.js';
import { broadcastFullState } from '../broadcastHelper.js';
import { getUserId } from './helpers.js';

export const devRoutes = Router();

const DEV_ITEM_TYPES: string[] = [
  'pickaxe_basic', 'pickaxe_iron', 'pickaxe_diamond', 'fullstack_pickaxe',
  'shield', 'beacon', 'scanner', 'signal_booster', 'overclock_kit',
  'antivirus_module', 'memory_allocator',
  'cpu_basic', 'cpu_advanced', 'ram_basic', 'ram_advanced',
  'chip_pack_basic', 'chip_pack_premium',
  'data_fragment', 'rp_shard',
];

devRoutes.get('/dev/completions', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const state = getGameState(uid);
  res.json({
    items: DEV_ITEM_TYPES,
    nodes: state.nodes.map((n: any) => ({
      id: n.id, label: n.data?.label || n.id, unlocked: !!n.data?.unlocked,
    })),
    quests: QUESTS.map(q => ({
      id: q.id, name: q.name, status: getQuestStatus(q.id, uid) || 'locked',
    })),
    maps: LAYER_DEFS.map(l => ({
      id: l.id, name: l.name, unlocked: isLayerUnlocked(l.id, uid),
    })),
  });
});

devRoutes.post('/dev/give', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { itemType, count } = req.body || {};
  const n = Number(count);
  if (!itemType || typeof itemType !== 'string' || !Number.isFinite(n) || n <= 0) {
    return res.status(400).json({ error: 'itemType and positive count required' });
  }
  addToPlayerInventory(itemType, Math.floor(n), undefined, uid);
  broadcastFullState(uid);
  res.json({ ok: true, message: `Gave ${Math.floor(n)}× ${itemType}` });
});

devRoutes.post('/dev/nodes/:action', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { action } = req.params;
  const { nodeId } = req.body || {};
  if (action !== 'lock' && action !== 'unlock') {
    return res.status(400).json({ error: "action must be 'lock' or 'unlock'" });
  }
  const state = getGameState(uid);
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node) return res.status(404).json({ error: `node not found: ${nodeId}` });
  const newNodes = state.nodes.map((n: any) =>
    n.id === nodeId ? { ...n, data: { ...n.data, unlocked: action === 'unlock' } } : n
  );
  saveGameState({ ...state, nodes: newNodes }, uid);
  broadcastFullState(uid);
  res.json({ ok: true, message: `${action}ed node ${nodeId}` });
});

devRoutes.post('/dev/quests/:action', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { action } = req.params;
  const { questId } = req.body || {};
  if (action !== 'lock' && action !== 'unlock') {
    return res.status(400).json({ error: "action must be 'lock' or 'unlock'" });
  }
  const quest = QUESTS.find(q => q.id === questId);
  if (!quest) return res.status(404).json({ error: `quest not found: ${questId}` });
  setQuestStatus(questId, action === 'unlock' ? 'available' : 'locked', uid);
  broadcastFullState(uid);
  res.json({ ok: true, message: `${action}ed quest ${questId}` });
});

devRoutes.post('/dev/maps/:action', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { action } = req.params;
  const { layerId } = req.body || {};
  const id = Number(layerId);
  if (action !== 'lock' && action !== 'unlock') {
    return res.status(400).json({ error: "action must be 'lock' or 'unlock'" });
  }
  const def = LAYER_DEFS.find(l => l.id === id);
  if (!def) return res.status(404).json({ error: `layer not found: ${layerId}` });
  const lm = getLayerManager(uid);
  if (!lm.unlockedLayers) lm.unlockedLayers = [0];
  if (action === 'unlock') {
    if (!lm.unlockedLayers.includes(id)) lm.unlockedLayers.push(id);
  } else {
    if (id === 0) return res.status(400).json({ error: 'cannot lock base layer (0)' });
    if (lm.currentLayer === id) {
      return res.status(400).json({ error: `cannot lock the active layer ${id}` });
    }
    lm.unlockedLayers = lm.unlockedLayers.filter((x: number) => x !== id);
  }
  broadcastFullState(uid);
  res.json({ ok: true, message: `${action}ed map ${id} (${def.name})` });
});
