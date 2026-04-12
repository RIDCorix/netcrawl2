/**
 * Quest & passive routes.
 */

import { Router, Request, Response } from 'express';
import { getActivePassives, getQuestStatus, setQuestStatus } from '../domain/questState.js';
import { getPlayerLevelSummary } from '../domain/level.js';
import { claimQuestReward, getQuestList, getQuestEdges } from '../quests.js';
import { broadcastFullState } from '../broadcastHelper.js';
import { getUserId } from './helpers.js';

export const questRoutes = Router();

questRoutes.get('/quests', (req: Request, res: Response) => {
  const uid = getUserId(req);
  res.json({ quests: getQuestList(uid), edges: getQuestEdges() });
});

questRoutes.post('/quests/:questId/claim', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const questId = req.params.questId as string;
  const result = claimQuestReward(questId, uid);
  if (!result.ok) return res.status(400).json({ error: result.error });
  broadcastFullState(uid);
  res.json({ ok: true });
});

questRoutes.post('/quests/claim-all', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const questList = getQuestList(uid);
  let claimed = 0;
  for (const q of questList) {
    if (q.status === 'completed') {
      const result = claimQuestReward(q.id, uid);
      if (result.ok) claimed++;
    }
  }
  broadcastFullState(uid);
  res.json({ ok: true, claimed });
});

questRoutes.post('/quests/:questId/skip', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const questId = req.params.questId as string;
  const status = getQuestStatus(questId, uid);
  if (status === 'claimed') return res.status(400).json({ error: 'Already claimed' });

  setQuestStatus(questId, 'completed', uid);
  const result = claimQuestReward(questId, uid);
  if (!result.ok) return res.status(400).json({ error: result.error });
  broadcastFullState(uid);
  res.json({ ok: true, skipped: true });
});

questRoutes.get('/passives', (req: Request, res: Response) => {
  const uid = getUserId(req);
  res.json({ passives: getActivePassives(uid) });
});

questRoutes.get('/level', (req: Request, res: Response) => {
  const uid = getUserId(req);
  res.json(getPlayerLevelSummary(uid));
});
