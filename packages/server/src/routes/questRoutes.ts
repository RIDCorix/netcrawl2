/**
 * Quest & passive routes.
 */

import { Router, Request, Response } from 'express';
import { getActivePassives, getQuestStatus, setQuestStatus } from '../domain/questState.js';
import {
  advanceChapterZeroStageTo,
  skipChapterZeroToHandoff,
  getChapterZero,
  runChapterZeroCodeEditor,
  submitChapterZeroCommand,
  grantChapterZeroDeployItems,
  setChapterZeroDeploySelection,
  verifyChapterZeroDeploy,
} from '../domain/questState.js';
import type { ChapterZeroStage } from '../domain/chapterZero.js';
import { getPlayerLevelSummary } from '../domain/level.js';
import { checkQuests, claimQuestReward, getQuestList, getQuestEdges } from '../quests.js';
import { broadcastFullState } from '../broadcastHelper.js';
import { getUserId } from './helpers.js';

export const questRoutes = Router();

questRoutes.get('/tutorial/chapter-zero', (req: Request, res: Response) => {
  res.json(getChapterZero(getUserId(req)));
});

questRoutes.post('/tutorial/chapter-zero/command', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const result = submitChapterZeroCommand(String(req.body?.command || ''), uid);
  if (!result.ok) return res.status(400).json(result);
  checkQuests(uid);
  broadcastFullState(uid);
  res.json(result);
});

const VALID_STAGES: ChapterZeroStage[] = [
  'cold_open',
  'voice_arrival',
  'choice_intro',
  'direct_commands',
  'code_editor',
  'complete',
  'hello_preview',
  'hello_deploy_open',
  'hello_deploy_confirm',
  'hello_deploy_execute',
  'hello_log',
  'miner_preview',
  'miner_deploy_open',
  'miner_edge_select',
  'miner_pickaxe_equip',
  'miner_deploy_confirm',
  'miner_deploy_execute',
  'handoff',
];

questRoutes.post('/tutorial/chapter-zero/stage', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const action = String(req.body?.action || '');

  if (action === 'advance') {
    const to = String(req.body?.to || '') as ChapterZeroStage;
    if (!VALID_STAGES.includes(to)) return res.status(400).json({ ok: false, error: 'invalid_stage' });
    const result = advanceChapterZeroStageTo(to, uid);
    if (!result.ok) return res.status(400).json(result);
    checkQuests(uid);
    broadcastFullState(uid);
    return res.json(result);
  }

  if (action === 'code-run') {
    const onStartup = String(req.body?.on_startup || '');
    const onLoop = String(req.body?.on_loop || '');
    const result = runChapterZeroCodeEditor(onStartup, onLoop, uid);
    checkQuests(uid);
    broadcastFullState(uid);
    return res.json(result);
  }

  if (action === 'grant-deploy-items') {
    const result = grantChapterZeroDeployItems(uid);
    if (!result.ok) return res.status(400).json(result);
    broadcastFullState(uid);
    return res.json(result);
  }

  if (action === 'set-deploy-edge') {
    const edgeId = req.body?.edgeId ? String(req.body.edgeId) : null;
    const result = setChapterZeroDeploySelection('selectedEdgeId', edgeId, uid);
    if (!result.ok) return res.status(400).json(result);
    broadcastFullState(uid);
    return res.json(result);
  }

  if (action === 'set-deploy-pickaxe') {
    const pickaxeType = req.body?.pickaxeType ? String(req.body.pickaxeType) : null;
    const result = setChapterZeroDeploySelection('selectedPickaxeType', pickaxeType, uid);
    if (!result.ok) return res.status(400).json(result);
    broadcastFullState(uid);
    return res.json(result);
  }

  if (action === 'verify-deploy') {
    const workerId = String(req.body?.workerId || '');
    if (!workerId) return res.status(400).json({ ok: false, error: 'workerId required' });
    const result = verifyChapterZeroDeploy(workerId, uid);
    if (!result.ok) return res.status(400).json(result);
    checkQuests(uid);
    broadcastFullState(uid);
    return res.json(result);
  }

  if (action === 'skip') {
    const result = skipChapterZeroToHandoff(uid);
    checkQuests(uid);
    broadcastFullState(uid);
    return res.json(result);
  }

  return res.status(400).json({ ok: false, error: 'unknown_action' });
});

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
