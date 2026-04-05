import {
  getGameState, saveGameState, getWorker, upsertWorker,
  addWorkerLog, Resources, Drop,
  getNodeChipEffects, incrementStat, setStatMax,
  addToPlayerInventory, awardXp, grantNodeXp,
  cacheGet, cacheSet, cacheKeys, getCacheRange, getCacheCapacity,
} from './db.js';
import { XP_REWARDS } from './levelSystem.js';
import { checkAchievements } from './achievements.js';
import { checkQuests } from './quests.js';
import { getActivePassives } from './db.js';
import { broadcastFullState } from './broadcastHelper.js';
import { getNeighborIds, edgeExists, bfsPath } from './graphUtils.js';
import { apiPoll, apiRespond, apiReject, getAPIPendingCount, getAPIStats } from './apiNodeEngine.js';
import { generatePuzzle, PuzzleInstance, DIFFICULTY_CONFIG, PUZZLE_TEMPLATES } from './puzzleDefinitions.js';

// ── Per-node puzzle state (in-memory) ───────────────────────────────────────
// Key: nodeId, value: current puzzle instance
const activePuzzles = new Map<string, PuzzleInstance>();
// Track cooldowns: nodeId -> timestamp when next puzzle is available
const puzzleCooldowns = new Map<string, number>();
// Stats
let totalSolves = 0;

// ── Per-worker action lock ──────────────────────────────────────────────────
// Each worker can only do one action at a time. The lock resolves when the
// action's delay is complete.

const workerLocks = new Map<string, Promise<void>>();

async function acquireLock(workerId: string): Promise<void> {
  while (workerLocks.has(workerId)) {
    await workerLocks.get(workerId);
  }
}

function setLock(workerId: string, durationMs: number): void {
  const p = new Promise<void>(resolve => setTimeout(resolve, durationMs));
  workerLocks.set(workerId, p);
  p.then(() => workerLocks.delete(workerId));
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const ACTION_DELAY = 1000;
const MOVE_DELAY = 1000;
const MINE_DELAY = 1000;

/** Get aggregated passive multipliers from quest rewards */
function getPassiveEffects(): Record<string, number> {
  const passives = getActivePassives();
  const agg: Record<string, number> = {};
  for (const p of Object.values(passives)) {
    for (const [k, v] of Object.entries(p.effect)) {
      if (k.endsWith('_mult')) {
        agg[k] = (agg[k] || 1) * v;
      } else {
        agg[k] = (agg[k] || 0) + v;
      }
    }
  }
  return agg;
}

function generateUuid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getDropTypeForNode(node: any): Drop['type'] {
  // Some nodes have a chance to drop bad_data (used in Ch1 while-loop quest)
  const badDataChance = node.data.bad_data_chance || 0;
  if (badDataChance > 0 && Math.random() < badDataChance) {
    return 'bad_data';
  }
  return 'data_fragment';
}

function calcDropAmount(efficiency: number): number {
  if (efficiency >= 2.5) return 2 + (Math.random() < 0.5 ? 1 : 0);
  if (efficiency >= 1.5) return 1 + (Math.random() < 0.5 ? 1 : 0);
  return 1;
}

// ── Main handler ────────────────────────────────────────────────────────────

export async function handleWorkerAction(workerId: string, action: string, payload: any): Promise<any> {
  // Log action doesn't need a lock
  if (action === 'log') {
    addWorkerLog(workerId, payload.message);
    // Update lastLog on worker for speech bubble display (no full broadcast — too spammy)
    const w = getWorker(workerId);
    if (w) {
      upsertWorker({ ...w, lastLog: { message: payload.message, level: payload.level || 'info', ts: Date.now() } });
      // Send lightweight message instead of full state
      broadcast({ type: 'WORKER_LOG', payload: { workerId, message: payload.message, level: payload.level || 'info', ts: Date.now(), nodeId: w.current_node || w.node_id } });
    }
    return { ok: true };
  }

  // Report error — sets worker to 'error' status and returns equipped items
  if (action === 'report_error') {
    const w = getWorker(workerId);
    if (!w) return { ok: false, error: 'Worker not found' };
    addWorkerLog(workerId, `[ERROR] ${payload.message || 'Unknown error'}`);
    // Return equipped items to player inventory
    if (w.equippedPickaxe) {
      addToPlayerInventory(w.equippedPickaxe.itemType, 1);
    }
    if (w.holding) {
      addToPlayerInventory(w.holding.type, w.holding.amount);
    }
    upsertWorker({ ...w, status: 'error', pid: null, equippedPickaxe: null, holding: null });
    broadcastFullState();
    return { ok: true };
  }

  // Acquire per-worker lock (serializes actions)
  await acquireLock(workerId);

  const worker = getWorker(workerId);
  if (!worker) return { ok: false, error: 'Worker not found' };

  const state = getGameState();
  const { nodes, edges, resources } = state;

  switch (action) {
    case 'move_edge': {
      // Edge-based movement: resolve edge to target node
      const { edgeId } = payload;
      if (!edgeId) return { ok: false, error: 'edgeId required' };
      const currentNodeE = worker.current_node || worker.node_id;
      const edge = edges.find((e: any) => e.id === edgeId);
      if (!edge) return { ok: false, error: `Edge '${edgeId}' not found` };

      // Determine which end is the other side
      let targetNodeE: string;
      if (edge.source === currentNodeE) targetNodeE = edge.target;
      else if (edge.target === currentNodeE) targetNodeE = edge.source;
      else return { ok: false, error: `Edge '${edgeId}' is not connected to current node '${currentNodeE}'` };

      const moveEffectsE = getNodeChipEffects(targetNodeE);
      const moveDelayE = Math.round(MOVE_DELAY * (moveEffectsE['move_speed_mult'] || 1));

      upsertWorker({ ...worker, status: 'moving', current_node: targetNodeE, previous_node: currentNodeE, move_id: Date.now() } as any);
      grantNodeXp(targetNodeE, 'pass_through');
      broadcastFullState();
      setLock(workerId, moveDelayE);
      await workerLocks.get(workerId);

      const wE = getWorker(workerId);
      if (wE && wE.status === 'moving') {
        const updatedE = { ...wE, status: 'running' } as any;
        delete updatedE.previous_node;
        upsertWorker(updatedE);
        broadcastFullState();
      }

      return { ok: true, travelTime: moveDelayE, edgeId, from: currentNodeE, to: targetNodeE };
    }

    case 'move': {
      const { targetNodeId } = payload;
      const currentNode = worker.current_node || worker.node_id;
      if (!edgeExists(edges, currentNode, targetNodeId)) {
        return { ok: false, error: `No edge between ${currentNode} and ${targetNodeId}` };
      }

      // Apply move speed chip effects from target node
      const moveEffects = getNodeChipEffects(targetNodeId);
      const moveDelay = Math.round(MOVE_DELAY * (moveEffects['move_speed_mult'] || 1));

      upsertWorker({ ...worker, status: 'moving', current_node: targetNodeId, previous_node: currentNode, move_id: Date.now() } as any);
      grantNodeXp(targetNodeId, 'pass_through');
      broadcastFullState();

      setLock(workerId, moveDelay);
      await workerLocks.get(workerId);

      // Arrive
      const w = getWorker(workerId);
      if (w && w.status === 'moving') {
        const updated = { ...w, status: 'running' } as any;
        delete updated.previous_node;
        upsertWorker(updated);
        broadcastFullState();
      }

      return { ok: true, travelTime: MOVE_DELAY };
    }

    case 'harvest': {
      const currentNode = worker.current_node || worker.node_id;
      const node = nodes.find((n: any) => n.id === currentNode);
      if (!node || node.type !== 'resource') {
        return { ok: false, error: 'Not at a resource node' };
      }
      const chipEffects = getNodeChipEffects(currentNode);
      const passiveEffects = getPassiveEffects();
      const resourceType = node.data.resource as keyof Resources;
      const baseRate = node.data.rate || 1;
      const rateBonus = chipEffects['production_rate'] || 0;
      const harvestMult = (chipEffects['harvest_speed_mult'] || 1) * (passiveEffects['global_harvest_speed_mult'] || 1);
      const rate = Math.floor((baseRate + rateBonus) * harvestMult);
      const carrying = { ...worker.carrying } as Record<string, number>;
      const totalCarrying = Object.values(carrying).reduce((a, b) => a + b, 0);
      const ramBonus = worker.equippedRam?.capacityBonus || 0;
      const capacityBonus = ramBonus + (chipEffects['capacity_bonus'] || 0) + (passiveEffects['global_capacity_bonus'] || 0);
      const canCarry = Math.min(rate, (50 + capacityBonus) - totalCarrying);
      if (canCarry <= 0) return { ok: false, error: 'Carrying capacity full' };

      upsertWorker({ ...worker, status: 'harvesting' });
      broadcastFullState();

      carrying[resourceType] = (carrying[resourceType] || 0) + canCarry;

      const harvestDelay = Math.round(ACTION_DELAY / harvestMult);
      setLock(workerId, harvestDelay);
      await workerLocks.get(workerId);

      const w2 = getWorker(workerId);
      if (w2) {
        upsertWorker({ ...w2, carrying: carrying as any, status: 'running' });
        broadcastFullState();
      }

      return { ok: true, harvested: { [resourceType]: canCarry } };
    }

    case 'mine': {
      const currentNode = worker.current_node || worker.node_id;
      const nodeIdx = nodes.findIndex((n: any) => n.id === currentNode);
      if (nodeIdx === -1) return { ok: false, error: 'Node not found' };
      const node = nodes[nodeIdx];

      if (!node.data.mineable) return { ok: false, error: 'Node is not mineable' };
      if (node.data.depleted) return { ok: false, error: 'Node is depleted', reason: 'node_depleted', depletedUntil: node.data.depletedUntil };
      // Cluster nodes: capacity-based depletion with timed refill
      if (node.data.capacity !== undefined) {
        const currentDrops = Array.isArray(node.data.drops) ? node.data.drops.length : 0;
        if (node.data.mineCount >= node.data.capacity && !node.data.depleted) {
          // Auto-deplete with refillMs timer
          const refillMs = node.data.refillMs || 5000;
          const freshS = getGameState();
          const newN = freshS.nodes.map((n: any) => {
            if (n.id === node.id) {
              return { ...n, data: { ...n.data, depleted: true, depletedUntil: Date.now() + refillMs, mineCount: 0 } };
            }
            return n;
          });
          saveGameState({ ...freshS, nodes: newN });
          broadcastFullState();
          return { ok: false, error: 'Node is depleted (refilling)', reason: 'node_depleted', depletedUntil: Date.now() + refillMs };
        }
      }
      if (!worker.equippedPickaxe) return { ok: false, error: 'No pickaxe equipped' };

      const mineChipEffects = getNodeChipEffects(currentNode);
      const minePassives = getPassiveEffects();
      const mineMult = (mineChipEffects['harvest_speed_mult'] || 1) * (minePassives['global_harvest_speed_mult'] || 1);
      const mineDelay = Math.round(MINE_DELAY / mineMult);

      upsertWorker({ ...worker, status: 'harvesting' });
      broadcastFullState();

      setLock(workerId, mineDelay);
      await workerLocks.get(workerId);

      const dropType = getDropTypeForNode(node);
      const efficiency = worker.equippedPickaxe.efficiency;
      const amount = calcDropAmount(efficiency);
      const drop: Drop = { id: generateUuid(), type: dropType, amount };

      const currentDrops = Array.isArray(node.data.drops) ? [...node.data.drops] : [];
      const currentMineCount = (node.data.mineCount || 0) + 1;
      let depleted = false;
      let depletedUntil: number | undefined;
      let finalMineCount = currentMineCount;

      if (currentMineCount >= 999) {
        depleted = true;
        depletedUntil = Date.now() + 60000;
        finalMineCount = 0;
      }

      // Re-read state (might have changed during delay)
      const freshState = getGameState();
      const newNodes = freshState.nodes.map((n: any, i: number) => {
        if (n.id === node.id) {
          return {
            ...n,
            data: {
              ...n.data,
              drops: [...(Array.isArray(n.data.drops) ? n.data.drops : []), drop],
              mineCount: finalMineCount,
              depleted,
              depletedUntil,
            },
          };
        }
        return n;
      });

      const w3 = getWorker(workerId);
      if (w3) upsertWorker({ ...w3, status: 'running' });
      saveGameState({ ...freshState, nodes: newNodes });
      broadcastFullState();
      incrementStat('total_mines', 1);
      awardXp(XP_REWARDS.mine_node);
      grantNodeXp(currentNode, 'mine');
      checkAchievements();
      checkQuests();
      return { ok: true, drop: { type: dropType, amount } };
    }

    case 'collect': {
      if (worker.holding !== null) {
        return { ok: false, error: 'slot_full', reason: 'slot_full' };
      }
      const currentNode = worker.current_node || worker.node_id;
      const nodeIdx = nodes.findIndex((n: any) => n.id === currentNode);
      if (nodeIdx === -1) return { ok: false, error: 'Node not found' };
      const node = nodes[nodeIdx];

      const drops = Array.isArray(node.data.drops) ? [...node.data.drops] : [];
      if (drops.length === 0) return { ok: false, error: 'nothing_here', reason: 'nothing_here' };

      setLock(workerId, ACTION_DELAY);
      await workerLocks.get(workerId);

      // Re-read (drops might have changed)
      const freshState2 = getGameState();
      const freshNode = freshState2.nodes.find((n: any) => n.id === currentNode);
      const freshDrops = freshNode && Array.isArray(freshNode.data.drops) ? [...freshNode.data.drops] : [];
      if (freshDrops.length === 0) return { ok: false, error: 'nothing_here', reason: 'nothing_here' };

      const [pickedUp, ...remainingDrops] = freshDrops;
      const newNodes2 = freshState2.nodes.map((n: any) => {
        if (n.id === currentNode) {
          return { ...n, data: { ...n.data, drops: remainingDrops } };
        }
        return n;
      });

      const w4 = getWorker(workerId);
      if (w4) upsertWorker({ ...w4, holding: pickedUp });
      saveGameState({ ...freshState2, nodes: newNodes2 });
      broadcastFullState();
      return { ok: true, item: pickedUp };
    }

    case 'deposit': {
      const currentNode = worker.current_node || worker.node_id;
      if (currentNode !== 'hub') return { ok: false, error: 'Must be at hub to deposit' };

      setLock(workerId, ACTION_DELAY);
      await workerLocks.get(workerId);

      const w5 = getWorker(workerId);
      if (!w5) return { ok: false, error: 'Worker not found' };

      // New-style: deposit held drop → convert to resources
      if (w5.holding !== null) {
        const held = w5.holding;
        const freshState = getGameState();
        const newResources = { ...freshState.resources } as Record<string, number>;

        if (held.type === 'bad_data') {
          // Bad data SUBTRACTS resources as a penalty
          const penalty = held.amount;
          newResources['data'] = Math.max(0, (newResources['data'] || 0) - penalty);
          saveGameState({ ...freshState, resources: newResources as any });
          upsertWorker({ ...w5, holding: null, carrying: {}, status: 'running' });
          broadcastFullState();
          incrementStat('total_bad_data_deposited', penalty);
          incrementStat('total_deposits', 1);
          checkAchievements();
          checkQuests();
          return { ok: true, deposited: held, penalty, warning: `Bad data! Lost ${penalty} data.` };
        }

        const dropToResource: Record<string, string> = {
          data_fragment: 'data',
          rp_shard: 'rp',
        };
        const resourceKey = dropToResource[held.type];
        if (resourceKey) {
          newResources[resourceKey] = (newResources[resourceKey] || 0) + held.amount;
          saveGameState({ ...freshState, resources: newResources as any });
        }
        upsertWorker({ ...w5, holding: null, carrying: {}, status: 'running' });
        broadcastFullState();
        if (resourceKey) {
          incrementStat(`total_${resourceKey}_deposited`, held.amount);
          incrementStat('total_deposits', 1);
          awardXp(XP_REWARDS.deposit_resources);
          grantNodeXp('hub', 'deposit');
        }
        checkAchievements();
        checkQuests();
        return { ok: true, deposited: held };
      }

      // Backward compat: deposit carrying
      const carrying = w5.carrying as Record<string, number>;
      const freshState3 = getGameState();
      const newResources = { ...freshState3.resources } as Record<string, number>;
      Object.keys(carrying).forEach(k => {
        newResources[k] = (newResources[k] || 0) + (carrying[k] || 0);
      });
      upsertWorker({ ...w5, carrying: {}, status: 'running' });
      saveGameState({ ...freshState3, resources: newResources as any });
      broadcastFullState();
      for (const [k, v] of Object.entries(carrying)) {
        if (v > 0) incrementStat(`total_${k}_deposited`, v);
      }
      incrementStat('total_deposits', 1);
      awardXp(XP_REWARDS.deposit_resources);
      grantNodeXp('hub', 'deposit');
      checkAchievements();
      checkQuests();
      return { ok: true, deposited: carrying };
    }

    case 'scan': {
      const currentNode = worker.current_node || worker.node_id;
      const neighborIds = getNeighborIds(edges, currentNode);
      const neighborNodes = nodes
        .filter((n: any) => neighborIds.includes(n.id))
        .map((n: any) => ({ ...n, adjacent: true }));
      return { ok: true, nodes: neighborNodes };
    }

    case 'repair': {
      const { nodeId } = payload;
      const currentNode = worker.current_node || worker.node_id;
      if (!edgeExists(edges, currentNode, nodeId) && currentNode !== nodeId) {
        return { ok: false, error: 'Node not adjacent' };
      }
      const node = nodes.find((n: any) => n.id === nodeId);
      if (!node || !node.data.infected) return { ok: false, error: 'Node is not infected' };
      const res = resources as unknown as Record<string, number>;
      if ((res.data || 0) < 500) return { ok: false, error: 'Not enough data (need 500)' };

      setLock(workerId, ACTION_DELAY);
      await workerLocks.get(workerId);

      const freshState4 = getGameState();
      const newNodes3 = freshState4.nodes.map((n: any) => {
        if (n.id === nodeId) {
          return { ...n, type: n.type === 'infected' ? 'resource' : n.type, data: { ...n.data, infected: false, infectionValue: 0 } };
        }
        return n;
      });
      const newResources2 = { ...(freshState4.resources as any), data: (freshState4.resources as any).data - 500 };
      saveGameState({ ...freshState4, nodes: newNodes3, resources: newResources2 });
      broadcastFullState();
      incrementStat('total_repairs', 1);
      awardXp(XP_REWARDS.repair_infection);
      checkAchievements();
      checkQuests();
      return { ok: true };
    }

    case 'findPath': {
      const { from, to } = payload;
      const pathResult = bfsPath(edges, from, to);
      return { ok: true, path: pathResult || [] };
    }

    case 'getResources': {
      return { ok: true, resources: worker.carrying };
    }

    case 'get_edges': {
      // Return all edges connected to the worker's current node
      const curNode = worker.current_node || worker.node_id;
      const connectedEdges = edges
        .filter((e: any) => e.source === curNode || e.target === curNode)
        .map((e: any) => ({
          id: e.id,
          otherNode: e.source === curNode ? e.target : e.source,
        }));
      return { ok: true, edges: connectedEdges, currentNode: curNode };
    }

    case 'get_node_info': {
      const infoNode = worker.current_node || worker.node_id;
      const nodeInfo = nodes.find((n: any) => n.id === infoNode);
      if (!nodeInfo) return { ok: false, error: 'Node not found' };
      const infoEdges = edges
        .filter((e: any) => e.source === infoNode || e.target === infoNode)
        .map((e: any) => ({ id: e.id, otherNode: e.source === infoNode ? e.target : e.source }));
      return {
        ok: true,
        id: nodeInfo.id,
        type: nodeInfo.type,
        label: nodeInfo.data.label,
        data: {
          resource: nodeInfo.data.resource,
          rate: nodeInfo.data.rate,
          difficulty: nodeInfo.data.difficulty,
          rewardResource: nodeInfo.data.rewardResource,
          unlocked: nodeInfo.data.unlocked,
          infected: nodeInfo.data.infected,
          mineable: nodeInfo.data.mineable,
          upgradeLevel: nodeInfo.data.upgradeLevel,
          solveCount: nodeInfo.data.solveCount,
        },
        edges: infoEdges,
      };
    }

    case 'compute': {
      const computeNode = worker.current_node || worker.node_id;
      const node = nodes.find((n: any) => n.id === computeNode);
      if (!node || node.type !== 'compute') {
        return { ok: false, error: 'Not at a compute node' };
      }

      // Check cooldown
      const cooldownUntil = puzzleCooldowns.get(computeNode) || 0;
      if (Date.now() < cooldownUntil) {
        const remaining = Math.ceil((cooldownUntil - Date.now()) / 1000);
        return { ok: false, error: `Node on cooldown (${remaining}s)`, reason: 'cooldown', remaining };
      }

      // Generate puzzle if none active
      const difficulty = node.data.difficulty || 'easy';
      let puzzle = activePuzzles.get(computeNode);
      if (!puzzle) {
        puzzle = generatePuzzle(difficulty);
        activePuzzles.set(computeNode, puzzle);
      }

      setLock(workerId, ACTION_DELAY);
      await workerLocks.get(workerId);

      return {
        ok: true,
        taskId: puzzle.taskId,
        params: puzzle.params,
        hint: puzzle.hint,
        difficulty: puzzle.difficulty,
      };
    }

    case 'submit': {
      const { taskId: submitTaskId, answer: submitAnswer } = payload;
      if (!submitTaskId || submitAnswer === undefined) {
        return { ok: false, error: 'taskId and answer required' };
      }

      const submitNode = worker.current_node || worker.node_id;
      const sNode = nodes.find((n: any) => n.id === submitNode);
      if (!sNode || sNode.type !== 'compute') {
        return { ok: false, error: 'Not at a compute node' };
      }

      const puzzle = activePuzzles.get(submitNode);
      if (!puzzle || puzzle.taskId !== submitTaskId) {
        return { ok: false, error: 'Invalid or expired task', reason: 'invalid_task' };
      }

      setLock(workerId, ACTION_DELAY);
      await workerLocks.get(workerId);

      // Check answer
      const correct = String(puzzle.answer) === String(submitAnswer);

      // Clear puzzle and set cooldown regardless
      activePuzzles.delete(submitNode);
      const difficulty = sNode.data.difficulty || 'easy';
      const config = DIFFICULTY_CONFIG[difficulty as keyof typeof DIFFICULTY_CONFIG];
      puzzleCooldowns.set(submitNode, Date.now() + (config?.cooldownMs || 10000));

      if (correct) {
        // Award resources
        const template = PUZZLE_TEMPLATES.find(t => t.id === puzzle.templateId);
        const reward = (config?.baseReward || 5) * (template?.rewardMultiplier || 1);
        const rewardType = sNode.data.rewardResource || 'rp';

        const freshState = getGameState();
        const newRes = { ...freshState.resources } as Record<string, number>;
        newRes[rewardType] = (newRes[rewardType] || 0) + reward;
        saveGameState({ ...freshState, resources: newRes as any });

        // Update node solve count
        const newNodes = freshState.nodes.map((n: any) => {
          if (n.id === submitNode) {
            return { ...n, data: { ...n.data, solveCount: (n.data.solveCount || 0) + 1 } };
          }
          return n;
        });
        saveGameState({ ...getGameState(), nodes: newNodes });

        broadcastFullState();
        totalSolves++;
        incrementStat('total_puzzles_solved', 1);
        const puzzleDiff = sNode.data.difficulty || 'easy';
        awardXp(XP_REWARDS[`solve_puzzle_${puzzleDiff}`] || XP_REWARDS.solve_puzzle_easy);
        grantNodeXp(submitNode, 'solve_puzzle');
        checkAchievements();
        checkQuests();

        return { ok: true, correct: true, reward: { type: rewardType, amount: reward } };
      } else {
        return { ok: true, correct: false, expected: puzzle.answer, got: submitAnswer };
      }
    }

    // ── API Node actions ───────────────────────────────────────────────────

    case 'api_poll': {
      const currentNodeAP = worker.current_node || worker.node_id;
      return apiPoll(currentNodeAP, workerId);
    }

    case 'api_respond': {
      const currentNodeAR = worker.current_node || worker.node_id;
      const { requestId: apiReqId, responseData } = payload;
      if (!apiReqId) return { ok: false, error: 'requestId required' };
      return apiRespond(currentNodeAR, workerId, apiReqId, responseData);
    }

    case 'api_stats': {
      const currentNodeAS = worker.current_node || worker.node_id;
      const node = nodes.find((n: any) => n.id === currentNodeAS);
      if (!node || node.type !== 'api') return { ok: false, error: 'Not at an API node' };
      return { ok: true, ...getAPIStats(currentNodeAS) };
    }

    case 'api_reject': {
      const currentNodeRej = worker.current_node || worker.node_id;
      const { requestId: rejReqId, statusCode } = payload;
      if (!rejReqId) return { ok: false, error: 'requestId required' };
      if (!statusCode) return { ok: false, error: 'statusCode required (e.g. 401, 400, 429, 500)' };
      return apiReject(currentNodeRej, workerId, rejReqId, statusCode);
    }

    case 'validate_token': {
      // Worker must be AT an auth node to validate
      const currentNodeVT = worker.current_node || worker.node_id;
      const authNode = nodes.find((n: any) => n.id === currentNodeVT);
      if (!authNode || authNode.type !== 'auth') {
        return { ok: false, error: 'Must be at an auth node to validate tokens', reason: 'not_at_auth_node' };
      }
      if (!authNode.data.unlocked) {
        return { ok: false, error: 'Auth node is locked' };
      }
      const { token } = payload;
      if (!token) return { ok: false, error: 'token required' };
      // Auth nodes validate tokens: all non-null tokens are valid (simple model)
      // In future: could add revoke lists
      const valid = typeof token === 'string' && token.length > 0;
      const ttl = 30; // ticks
      setLock(workerId, ACTION_DELAY / 2); // half-speed validation
      await workerLocks.get(workerId);
      return { ok: true, valid, ttl, token };
    }

    // ── Service / Cache actions ──────────────────────────────────────────────

    case 'get_service': {
      const { serviceNodeId } = payload;
      if (!serviceNodeId) return { ok: false, error: 'serviceNodeId required' };
      const serviceNode = nodes.find((n: any) => n.id === serviceNodeId);
      if (!serviceNode) return { ok: false, error: 'Service node not found', reason: 'not_found' };
      if (!serviceNode.data.unlocked) return { ok: false, error: 'Service node is locked', reason: 'not_reachable' };

      // Check range: BFS distance from worker's current node to service node
      const workerNode = worker.current_node || worker.node_id;
      if (serviceNode.type === 'cache') {
        const range = getCacheRange(serviceNodeId);
        const path = bfsPath(edges, workerNode, serviceNodeId);
        const distance = path ? path.length - 1 : Infinity;
        if (distance > range) {
          return { ok: false, error: `Cache node '${serviceNodeId}' is out of range (distance ${distance}, range ${range})`, reason: 'not_reachable' };
        }
        return {
          ok: true,
          serviceType: 'cache',
          nodeId: serviceNodeId,
          range,
          capacity: getCacheCapacity(serviceNodeId),
          usedSlots: cacheKeys(serviceNodeId).length,
        };
      }

      return { ok: false, error: `Node '${serviceNodeId}' is not a service node`, reason: 'not_a_service' };
    }

    case 'cache_get': {
      const { cacheNodeId, key: cacheKey } = payload;
      if (!cacheNodeId || !cacheKey) return { ok: false, error: 'cacheNodeId and key required' };
      // Verify range
      const workerNodeCG = worker.current_node || worker.node_id;
      const rangeCG = getCacheRange(cacheNodeId);
      const pathCG = bfsPath(edges, workerNodeCG, cacheNodeId);
      const distCG = pathCG ? pathCG.length - 1 : Infinity;
      if (distCG > rangeCG) return { ok: false, error: 'Cache out of range', reason: 'not_reachable' };

      const val = cacheGet(cacheNodeId, cacheKey);
      if (val === undefined) return { ok: true, hit: false, value: null };
      grantNodeXp(cacheNodeId, 'cache_hit');
      return { ok: true, hit: true, value: val };
    }

    case 'cache_set': {
      const { cacheNodeId: cacheNodeIdS, key: cacheKeyS, value: cacheValue, ttl: cacheTtl } = payload;
      if (!cacheNodeIdS || !cacheKeyS) return { ok: false, error: 'cacheNodeId and key required' };
      // Verify range
      const workerNodeCS = worker.current_node || worker.node_id;
      const rangeCS = getCacheRange(cacheNodeIdS);
      const pathCS = bfsPath(edges, workerNodeCS, cacheNodeIdS);
      const distCS = pathCS ? pathCS.length - 1 : Infinity;
      if (distCS > rangeCS) return { ok: false, error: 'Cache out of range', reason: 'not_reachable' };

      const stored = cacheSet(cacheNodeIdS, cacheKeyS, cacheValue, cacheTtl || 0);
      if (!stored) return { ok: false, error: 'Cache is full' };
      return { ok: true };
    }

    case 'cache_keys': {
      const { cacheNodeId: cacheNodeIdK } = payload;
      if (!cacheNodeIdK) return { ok: false, error: 'cacheNodeId required' };
      const workerNodeCK = worker.current_node || worker.node_id;
      const rangeCK = getCacheRange(cacheNodeIdK);
      const pathCK = bfsPath(edges, workerNodeCK, cacheNodeIdK);
      const distCK = pathCK ? pathCK.length - 1 : Infinity;
      if (distCK > rangeCK) return { ok: false, error: 'Cache out of range', reason: 'not_reachable' };

      return { ok: true, keys: cacheKeys(cacheNodeIdK) };
    }

    // ── Sensor actions ────────────────────────────────────────────────────

    case 'scan_edges': {
      // BasicSensor: return edges with IDs only (no node type info)
      const curNodeSE = worker.current_node || worker.node_id;
      const connectedSE = edges
        .filter((e: any) => e.source === curNodeSE || e.target === curNodeSE)
        .map((e: any) => ({
          edge_id: e.id,
          source_node_id: curNodeSE,
          target_node_id: e.source === curNodeSE ? e.target : e.source,
        }));
      return { ok: true, edges: connectedSE };
    }

    case 'scan_edges_advanced': {
      // AdvancedSensor: return edges with full target node info
      const curNodeSEA = worker.current_node || worker.node_id;
      const connectedSEA = edges
        .filter((e: any) => e.source === curNodeSEA || e.target === curNodeSEA)
        .map((e: any) => {
          const targetId = e.source === curNodeSEA ? e.target : e.source;
          const targetNode = nodes.find((n: any) => n.id === targetId);
          const infoEdges = targetNode ? edges
            .filter((te: any) => te.source === targetId || te.target === targetId)
            .map((te: any) => ({ id: te.id, otherNode: te.source === targetId ? te.target : te.source }))
            : [];
          return {
            edge_id: e.id,
            source_node_id: curNodeSEA,
            target_node_id: targetId,
            target_node_data: targetNode ? {
              ok: true,
              id: targetNode.id,
              type: targetNode.type,
              label: targetNode.data.label,
              data: {
                resource: targetNode.data.resource,
                rate: targetNode.data.rate,
                difficulty: targetNode.data.difficulty,
                rewardResource: targetNode.data.rewardResource,
                unlocked: targetNode.data.unlocked,
                infected: targetNode.data.infected,
                mineable: targetNode.data.mineable,
                upgradeLevel: targetNode.data.upgradeLevel,
                solveCount: targetNode.data.solveCount,
              },
              edges: infoEdges,
            } : null,
          };
        });
      return { ok: true, edges: connectedSEA };
    }

    // ── Discard & drop check ────────────────────────────────────────────────

    case 'discard': {
      // Discard the currently held item without depositing
      const w6 = getWorker(workerId);
      if (!w6 || w6.holding === null) {
        return { ok: false, error: 'Nothing to discard', reason: 'nothing_held' };
      }
      const discarded = w6.holding;
      upsertWorker({ ...w6, holding: null });
      broadcastFullState();
      if (discarded.type === 'bad_data') {
        incrementStat('total_bad_data_discarded', 1);
        checkQuests();
      }
      return { ok: true, discarded };
    }

    case 'has_dropped_items': {
      // Check if the current node has any drops
      const curNodeHDI = worker.current_node || worker.node_id;
      const nodeHDI = nodes.find((n: any) => n.id === curNodeHDI);
      if (!nodeHDI) return { ok: true, has_items: false };
      const dropsHDI = Array.isArray(nodeHDI.data.drops) ? nodeHDI.data.drops : [];
      return { ok: true, has_items: dropsHDI.length > 0, count: dropsHDI.length };
    }

    // ── findNearest ───────────────────────────────────────────────────────

    case 'findNearest': {
      const { from: fnFrom, nodeType: fnType } = payload;
      if (!fnFrom || !fnType) return { ok: false, error: 'from and nodeType required' };
      // BFS to find nearest node of type
      const visited = new Set<string>();
      const queue: string[] = [fnFrom];
      visited.add(fnFrom);
      let foundId: string | null = null;
      while (queue.length > 0 && !foundId) {
        const current = queue.shift()!;
        const neighborsFN = getNeighborIds(edges, current);
        for (const nid of neighborsFN) {
          if (visited.has(nid)) continue;
          visited.add(nid);
          const n = nodes.find((nd: any) => nd.id === nid);
          if (n && n.type === fnType && n.data.unlocked) {
            foundId = nid;
            break;
          }
          queue.push(nid);
        }
      }
      return { ok: true, nodeId: foundId };
    }

    default:
      return { ok: false, error: `Unknown action: ${action}` };
  }
}
