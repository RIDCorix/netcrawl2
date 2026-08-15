/**
 * Worker deployment routes — deploy, deploy-queue, deploy-ack.
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { FLOP_COSTS } from '../types.js';
import { getGameState } from '../domain/gameState.js';
import {
  getWorker,
  upsertWorker,
  addWorkerLog,
  allocateFlop,
  releaseFlop,
  releaseWorkerFlop,
} from '../domain/workers.js';
import {
  addToPlayerInventory,
  removeFromPlayerInventory,
  getItemEfficiency,
  getCpuComputePoints,
  getRamCapacityBonus,
  getItemComputeCost,
} from '../domain/inventory.js';
import { incrementStat, addToStatArray, setStatMax, getStatArray } from '../domain/achievements.js';
import { awardXp } from '../domain/level.js';
import {
  getWorkerClass,
  enqueueDeploy,
  leaseDeployQueue,
  acknowledgeDeployCommand,
  acknowledgeLegacyDeploy,
} from '../workerRegistry.js';
import { broadcastFullState } from '../broadcastHelper.js';
import { markCodeServerSeen } from '../codeServerTracker.js';
import { checkAchievements } from '../achievements.js';
import { checkQuests } from '../quests.js';
import { XP_REWARDS } from '../levelSystem.js';
import { getUserId, returnWorkerItems } from './helpers.js';
import { decideDeployAck, isPickaxeItemType, resolvePickaxeSelection } from '../deployEquipment.js';

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
  if (node.type === 'compute') {
    if ((node.data?.solveCount || 0) <= 0)
      return res.status(403).json({ error: 'Solve this node in Compute Lab before automating it', reason: 'compute_lab_required' });
    if (!workerClass.capabilities?.includes('compute_automation'))
      return res.status(403).json({ error: 'Select a Compute automation worker', reason: 'compute_worker_required' });
  }

  const flopCost = FLOP_COSTS.worker;
  if (!allocateFlop(flopCost, uid)) {
    const { used, total } = state.flop;
    return res.status(400).json({ error: `Not enough FLOP capacity. Current: ${used}/${total}` });
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
    equippedCpu = {
      itemType: cpuItemType,
      computePoints: getCpuComputePoints(cpuItemType) * cpuCount,
      count: cpuCount,
    };
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
    equippedRam = {
      itemType: ramItemType,
      capacityBonus: getRamCapacityBonus(ramItemType) * ramCount,
      count: ramCount,
    };
  }

  // Handle equipped pickaxe
  let equippedPickaxe: { itemType: string; efficiency: number } | null = null;
  const pickaxeSelection = resolvePickaxeSelection(workerClass.fields, equippedItems);
  if (pickaxeSelection) {
    const pickaxeItemType = pickaxeSelection.itemType;
    if (!isPickaxeItemType(pickaxeItemType)) {
      releaseFlop(flopCost, uid);
      if (equippedCpu) addToPlayerInventory(equippedCpu.itemType, equippedCpu.count, undefined, uid);
      if (equippedRam) addToPlayerInventory(equippedRam.itemType, equippedRam.count, undefined, uid);
      return res.status(400).json({ error: `${pickaxeItemType} is not a valid Pickaxe` });
    }
    const baseCompute = 1;
    const totalCompute = baseCompute + (equippedCpu?.computePoints || 0);
    const totalCost = getItemComputeCost(pickaxeItemType);
    if (totalCost > totalCompute) {
      releaseFlop(flopCost, uid);
      if (equippedCpu) addToPlayerInventory(equippedCpu.itemType, equippedCpu.count, undefined, uid);
      if (equippedRam) addToPlayerInventory(equippedRam.itemType, equippedRam.count, undefined, uid);
      return res
        .status(400)
        .json({ error: `Not enough compute (need ${totalCost}, have ${totalCompute}). Add more CPU.` });
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
  if (equippedPickaxe && pickaxeSelection) {
    injectedFields[pickaxeSelection.fieldName] = {
      itemType: equippedPickaxe.itemType,
      efficiency: equippedPickaxe.efficiency,
    };
  }
  if (routes && typeof routes === 'object') {
    const routeMetadata: Record<string, any[]> = {};
    for (const [fieldName, edgeId] of Object.entries(routes)) {
      if (typeof edgeId === 'string') {
        injectedFields[fieldName] = edgeId;
      } else if (Array.isArray(edgeId)) {
        injectedFields[fieldName] = edgeId;
        routeMetadata[fieldName] = edgeId.map(id => {
          const edge = state.edges.find((candidate: any) => candidate.id === id);
          return edge ? { id: edge.id, source: edge.source, target: edge.target } : { id };
        });
      }
    }
    if (Object.keys(routeMetadata).length > 0) {
      // Sidecar keeps bare route arrays compatible with SDK <=1.2.1.
      injectedFields.__netcrawl_route_metadata__ = routeMetadata;
    }
  }

  upsertWorker(
    {
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
      flopAllocated: true,
      equippedPickaxe,
      equippedCpu,
      equippedRam,
      deployConfig: { classId, equippedItems: equippedItems || {}, injectedFields },
      desiredState: 'running',
      generation: 1,
      executionToken: randomUUID(),
    },
    uid,
  );

  enqueueDeploy(
    {
      id: workerId,
      workerId,
      nodeId,
      classId,
      equippedItems: equippedItems || {},
      injectedFields,
      createdAt: new Date().toISOString(),
      generation: 1,
      executionToken: getWorker(workerId, uid)!.executionToken,
      initialHolding: [],
    },
    uid,
  );

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
  const pending = leaseDeployQueue(`legacy:${uid || '__default__'}`, uid);
  res.json({ requests: pending });
});

deployRoutes.post('/deploy-ack', (req: Request, res: Response) => {
  const uid = getUserId(req);
  const { workerId, pid, error: spawnError, commandId, sessionId, generation } = req.body;
  if (!workerId) return res.status(400).json({ error: 'workerId required' });

  const worker = getWorker(workerId, uid);
  if (!worker) return res.status(404).json({ error: 'Worker not found' });

  if (commandId) {
    const commandAck = acknowledgeDeployCommand(commandId, sessionId, Number(generation), uid);
    if (commandAck === 'stale' || worker.generation !== Number(generation)) {
      return res.status(409).json({ ok: false, reason: 'stale_execution' });
    }
    if (commandAck === 'duplicate') return res.json({ ok: true, duplicate: true });
  } else {
    // SDK 1.2.2 and older acknowledge legacy deploy-queue commands without a
    // command/session fence. Keep this branch during client coexistence; SDK
    // 1.2.3+ uses the session-fenced runtime command ACK route instead.
    acknowledgeLegacyDeploy(workerId, worker.generation || 0, uid);
  }

  // ACKs can be retried or arrive out of order. Only the first ACK may change
  // a worker that is still awaiting spawn confirmation.
  const ackDecision = decideDeployAck(worker.status, Boolean(spawnError));
  if (ackDecision === 'duplicate') {
    return res.json({ ok: true, duplicate: true });
  }

  if (ackDecision === 'spawn_failed') {
    returnWorkerItems(worker, uid);
    releaseWorkerFlop(workerId, FLOP_COSTS.worker, uid);
    upsertWorker(
      {
        ...worker,
        status: 'crashed',
        desiredState: 'suspended',
        pid: null,
        equippedPickaxe: null,
        equippedCpu: null,
        equippedRam: null,
        holding: [],
        flopAllocated: false,
      },
      uid,
    );
    addWorkerLog(workerId, `[ERROR] Spawn failed: ${spawnError}`, uid);
  } else {
    upsertWorker({ ...worker, status: 'running', pid: pid || null, desiredState: 'running' }, uid);
    addWorkerLog(workerId, `[INFO] Worker spawned (PID ${pid})`, uid);
  }

  broadcastFullState(uid);
  res.json({ ok: true });
});
