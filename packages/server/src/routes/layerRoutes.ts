/**
 * Layer switching & listing routes.
 */

import { Router, Request, Response } from 'express';
import { getGameState } from '../domain/gameState.js';
import { getWorkers } from '../domain/workers.js';
import { getLayerManager, isLayerUnlocked, switchActiveLayer } from '../domain/layers.js';
import { getStat } from '../domain/achievements.js';
import { LAYER_DEFS } from '../layerDefinitions.js';
import { broadcastFullState } from '../broadcastHelper.js';
import { getUserId } from './helpers.js';

export const layerRoutes = Router();

layerRoutes.get('/layers', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const state = getGameState(uid);
  const layerManager = getLayerManager(uid);

  const layers = LAYER_DEFS.map(def => {
    const unlocked = isLayerUnlocked(def.id, uid);
    const isActive = (layerManager?.currentLayer ?? 0) === def.id;
    const progress: Record<string, number> = {};
    const thresh = def.unlockThresholds;
    if (thresh) {
      if (thresh.total_data_deposited !== undefined) progress.total_data_deposited = getStat('total_data_deposited', uid);
      if (thresh.rp !== undefined) progress.rp = state.resources.rp;
      if (thresh.credits !== undefined) progress.credits = state.resources.credits;
    }
    return { ...def, unlocked, isActive, progress };
  });

  res.json({ layers, activeLayer: layerManager?.currentLayer ?? 0 });
});

layerRoutes.post('/layer/switch', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { layerId } = req.body;
  if (layerId === undefined || typeof layerId !== 'number') {
    return res.status(400).json({ error: 'layerId (number) required' });
  }

  const activeWorkers = getWorkers(uid).filter((w: any) =>
    ['running', 'moving', 'harvesting'].includes(w.status)
  );
  if (activeWorkers.length > 0) {
    return res.status(400).json({
      error: 'Recall all active workers before switching layers',
      reason: 'workers_running',
      count: activeWorkers.length,
    });
  }

  const result = switchActiveLayer(layerId, uid);
  if (!result.ok) return res.status(400).json({ error: result.error });

  broadcastFullState(uid);
  res.json({ ok: true, layerId });
});
