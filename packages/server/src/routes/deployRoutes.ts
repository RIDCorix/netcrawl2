/**
 * Worker deployment routes — deploy, deploy-queue, deploy-ack.
 */

import { Router, Request, Response } from 'express';
import { FLOP_COSTS } from '../types.js';
import { getGameState } from '../domain/gameState.js';
import { getWorker, upsertWorker, addWorkerLog, allocateFlop, releaseFlop } from '../domain/workers.js';
import { addToPlayerInventory, removeFromPlayerInventory, getItemEfficiency, getCpuComputePoints, getRamCapacityBonus, getItemComputeCost } from '../domain/inventory.js';
import { incrementStat, addToStatArray, setStatMax, getStatArray } from '../domain/achievements.js';
import { awardXp } from '../domain/level.js';
import {
  getWorkerClass, enqueueDeploy, drainDeployQueue,
} from '../workerRegistry.js';
import { broadcastFullState } from '../broadcastHelper.js';
import { markCodeServerSeen } from '../codeServerTracker.js';
import { checkAchievements } from '../achievements.js';
import { checkQuests } from '../quests.js';
import { XP_REWARDS } from '../levelSystem.js';
import { getUserId, returnWorkerItems } from './helpers.js';

export const deployRoutes = Router();

deployRoutes.post('/deploy', async (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { nodeId, classId, equippedItems, routes } = req.body;
  if (!nodeId || !classId) {
    return res.status(400).json({ error: 'nodeId and classId are required' });
  }

  const workerClass = getWorkerClass(classId, uid);
  if (!workerClass) {
    return res.status(400).json({ error: `Unknown worker class: ${classId}` });
  }

  const state = getGameState(uid);
  const node = state.nodes.find((n: any) => n.id === nodeId);
  if (!node) return res.status(404).json({ error: 'Node not found' });

  const flopCost = FLOP_COSTS.worker;
  if (!allocateFlop(flopCost, uid)) {
    const { used, total } = state.flop;
    return res.status(400).json({ ok: false, error: `Not enough FLOP capacity. Current: ${used}/${total}` });
  }

  // Handle CPU modules
  const cpuCount: number = Number(equippedItems?.cpuCount) || 0;
  const cpuItemType: string = equippedItems?.cpuType || 'cpu_basic';
  let equippedCpu: { itemType: string; computePoints: number; count: number } | null = null;
  if (cpuCount > 0) {
    const removed = removeFromPlayerInventory(cpuItemType, cpuCount, uid);
    if (!removed) {
      releaseFlop(flopCost, uid);
      return res.status(400).json({ error: `Not enough ${cpuItemType} (need ${cpuCount})` });
    }
    equippedCpu = { itemType: cpuItemType, computePoints: getCpuComputePoints(cpuItemType) * cpuCount, count: cpuCount };
  }

  // Handle RAM modules
  const ramCount: number = Number(equippedItems?.ramCount) || 0;
  const ramItemType: string = equippedItems?.ramType || 'ram_basic';
  let equippedRam: { itemType: string; capacityBonus: number; count: number } | null = null;
  if (ramCount > 0) {
    const removed = removeFromPlayerInventory(ramItemType, ramCount, uid);
    if (!removed) {
      releaseFlop(flopCost, uid);
      if (equippedCpu) addToPlayerInventory(equippedCpu.itemType, equippedCpu.count, undefined, uid);
      return res.status(400).json({ error: `Not enough ${ramItemType} (need ${ramCount})` });
    }
    equippedRam = { itemType: ramItemType, capacityBonus: getRamCapacityBonus(ramItemType) * ramCount, count: ramCount };
  }

  // Handle equipped pickaxe
  let equippedPickaxe: { itemType: string; efficiency: number } | null = null;
  const pickaxeItemType = equippedItems?.pickaxe;
  if (pickaxeItemType) {
    const baseCompute = 1;
    const totalCompute = baseCompute + (equippedCpu?.computePoints || 0);
    let totalCost = getItemComputeCost(pickaxeItemType);
    if (totalCost > totalCompute) {
      releaseFlop(flopCost, uid);
      if (equippedCpu) addToPlayerInventory(equippedCpu.itemType, equippedCpu.count, undefined, uid);
      if (equippedRam) addToPlayerInventory(equippedRam.itemType, equippedRam.count, undefined, uid);
      return res.status(400).json({ error: `Not enough compute (need ${totalCost}, have ${totalCompute}). Add more CPU.` });
    }
    const removed = removeFromPlayerInventory(pickaxeItemType, 1, uid);
    if (!removed) {
      releaseFlop(flopCost, uid);
      if (equippedCpu) addToPlayerInventory(equippedCpu.itemType, equippedCpu.count, undefined, uid);
      if (equippedRam) addToPlayerInventory(equippedRam.itemType, equippedRam.count, undefined, uid);
      return res.status(400).json({ error: `Not enough ${pickaxeItemType} in inventory` });
    }
    equippedPickaxe = { itemType: pickaxeItemType, efficiency: getItemEfficiency(pickaxeItemType) };
  }

  const workerId = `worker_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Build injected fields
  const injectedFields: Record<string, any> = {};
  if (equippedPickaxe) {
    injectedFields['pickaxe'] = { itemType: equippedPickaxe.itemType, efficiency: equippedPickaxe.efficiency };
  }
  if (routes && typeof routes === 'object') {
    for (const [fieldName, edgeId] of Object.entries(routes)) {
      if (typeof edgeId === 'string') {
        injectedFields[fieldName] = edgeId;
      } else if (Array.isArray(edgeId)) {
        injectedFields[fieldName] = edgeId;
      }
    }
  }

  upsertWorker({
    id: workerId,
    node_id: nodeId,
    class_name: workerClass.class_name,
    class_icon: workerClass.class_icon || 'Bot',
    commit_hash: 'HEAD',
    status: 'deploying',
    current_node: nodeId,
    carrying: {},
    pid: null,
    deployed_at: new Date().toISOString(),
    holding: [],
    equippedPickaxe,
    equippedCpu,
    equippedRam,
    deployConfig: { classId, equippedItems: equippedItems || {}, injectedFields },
  }, uid);

  enqueueDeploy({
    id: workerId,
    workerId,
    nodeId,
    classId,
    equippedItems: equippedItems || {},
    injectedFields,
    createdAt: new Date().toISOString(),
  }, uid);

  broadcastFullState(uid);
  incrementStat('total_workers_deployed', 1, uid);
  addToStatArray('deployed_class_ids', classId, uid);
  setStatMax('total_worker_classes_deployed', getStatArray('deployed_class_ids', uid).length, uid);
  awardXp(XP_REWARDS.deploy_worker, uid);
  checkAchievements(uid);
  checkQuests(uid);
  res.json({ ok: true, workerId, status: 'queued' });
});

deployRoutes.get('/deploy-queue', (req: Request, res: Response) => {
  const uid = getUserId(req);
  markCodeServerSeen(uid);
  const pending = drainDeployQueue(uid);
  res.json({ requests: pending });
});

deployRoutes.post('/deploy-ack', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { workerId, pid, error: spawnError } = req.body;
  if (!workerId) return res.status(400).json({ error: 'workerId required' });

  const worker = getWorker(workerId, uid);
  if (!worker) return res.status(404).json({ error: 'Worker not found' });

  if (spawnError) {
    returnWorkerItems(worker, uid);
    releaseFlop(FLOP_COSTS.worker, uid);
    upsertWorker({ ...worker, status: 'crashed' }, uid);
    addWorkerLog(workerId, `[ERROR] Spawn failed: ${spawnError}`, uid);
  } else {
    upsertWorker({ ...worker, status: 'running', pid: pid || null }, uid);
    addWorkerLog(workerId, `[INFO] Worker spawned (PID ${pid})`, uid);
  }

  broadcastFullState(uid);
  res.json({ ok: true });
});
