/**
 * Worker action dispatcher — routes actions to handlers.
 * Log/error actions are extracted into logActions.ts.
 * The remaining actions stay in the switch for now (tight coupling with shared state).
 */

import { getCurrentUserId } from '../store.js';
import type { Item } from '../types.js';
import { mergeItemStacks, MAX_STACK_SIZE } from '../types.js';
import { getGameState, saveGameState } from '../domain/gameState.js';
import { getWorker, upsertWorker, addWorkerLog } from '../domain/workers.js';
import { addToPlayerInventory } from '../domain/inventory.js';
import { getNodeChipEffects } from '../domain/chips.js';
import { incrementStat, setStatMax } from '../domain/achievements.js';
import { awardXp } from '../domain/level.js';
import { grantNodeXp } from '../domain/nodeXp.js';
import { cacheGet, cacheSet, cacheKeys, getCacheRange, getCacheCapacity } from '../domain/cache.js';
import { getActivePassives } from '../domain/questState.js';
import { checkLayerUnlocks } from '../domain/layers.js';
import { XP_REWARDS } from '../levelSystem.js';
import { checkAchievements } from '../achievements.js';
import { checkQuests } from '../quests.js';
import { computeNodeBuffer } from '../upgradeDefinitions.js';
import { broadcastFullState } from '../broadcastHelper.js';
import { broadcast } from '../websocket.js';
import { getNeighborIds, edgeExists, bfsPath } from '../graphUtils.js';
import { apiPoll, apiRespond, apiReject, getAPIStats } from '../apiNodeEngine.js';
import { generatePuzzle, PuzzleInstance, DIFFICULTY_CONFIG, PUZZLE_TEMPLATES } from '../puzzleDefinitions.js';

import { acquireLock, setLock, getLock } from './actionLock.js';
import { handleLog, handleReportError } from './logActions.js';
import { ACTION_DELAY, MOVE_DELAY, MINE_DELAY, getPassiveEffects, getItemTypeForNode, calcItemCount } from './helpers.js';

// ── Per-node puzzle state (in-memory) ───────────────────────────────────────
const activePuzzles = new Map<string, PuzzleInstance>();
const puzzleCooldowns = new Map<string, number>();
let totalSolves = 0;

// ── Main handler ────────────────────────────────────────────────────────────

export async function handleWorkerAction(workerId: string, action: string, payload: any, userId?: string): Promise<any> {
  const uid = userId || getCurrentUserId() || undefined;

  // Log action doesn't need a lock
  if (action === 'log') return handleLog(workerId, payload, uid);
  if (action === 'report_error') return handleReportError(workerId, payload, uid);

  // Acquire per-worker lock (serializes actions)
  await acquireLock(workerId);

  const worker = getWorker(workerId, uid);
  if (!worker) return { ok: false, error: 'Worker not found' };

  const state = getGameState(uid);
  const { nodes, edges, resources } = state;

  switch (action) {
    case 'move_edge': {
      const { edgeId } = payload;
      if (!edgeId) return { ok: false, error: 'edgeId required' };
      const currentNodeE = worker.current_node || worker.node_id;
      const edge = edges.find((e: any) => e.id === edgeId);
      if (!edge) return { ok: false, error: `Edge '${edgeId}' not found` };

      let targetNodeE: string;
      if (edge.source === currentNodeE) targetNodeE = edge.target;
      else if (edge.target === currentNodeE) targetNodeE = edge.source;
      else return { ok: false, error: `Edge '${edgeId}' is not connected to current node '${currentNodeE}'` };

      const moveEffectsE = getNodeChipEffects(targetNodeE, uid);
      const moveDelayE = Math.round(MOVE_DELAY * (moveEffectsE['move_speed_mult'] || 1));

      upsertWorker({ ...worker, status: 'moving', current_node: targetNodeE, previous_node: currentNodeE, move_id: Date.now() } as any, uid);
      grantNodeXp(targetNodeE, 'pass_through', uid);
      broadcastFullState(uid);
      setLock(workerId, moveDelayE);
      await getLock(workerId);

      const wE = getWorker(workerId, uid);
      if (wE && wE.status === 'moving') {
        const updatedE = { ...wE, status: 'running' } as any;
        delete updatedE.previous_node;
        upsertWorker(updatedE, uid);
        broadcastFullState(uid);
      }

      return { ok: true, travelTime: moveDelayE, edgeId, from: currentNodeE, to: targetNodeE };
    }

    case 'move': {
      const { targetNodeId } = payload;
      const currentNode = worker.current_node || worker.node_id;
      if (!edgeExists(edges, currentNode, targetNodeId)) {
        return { ok: false, error: `No edge between ${currentNode} and ${targetNodeId}` };
      }

      const moveEffects = getNodeChipEffects(targetNodeId, uid);
      const moveDelay = Math.round(MOVE_DELAY * (moveEffects['move_speed_mult'] || 1));

      upsertWorker({ ...worker, status: 'moving', current_node: targetNodeId, previous_node: currentNode, move_id: Date.now() } as any, uid);
      grantNodeXp(targetNodeId, 'pass_through', uid);
      broadcastFullState(uid);

      setLock(workerId, moveDelay);
      await getLock(workerId);

      const w = getWorker(workerId, uid);
      if (w && w.status === 'moving') {
        const updated = { ...w, status: 'running' } as any;
        delete updated.previous_node;
        upsertWorker(updated, uid);
        broadcastFullState(uid);
      }

      return { ok: true, travelTime: MOVE_DELAY };
    }

    case 'harvest':
      return { ok: false, error: 'harvest() is deprecated. Use mine() + collect() instead.' };

    case 'mine': {
      const currentNode = worker.current_node || worker.node_id;
      const nodeIdx = nodes.findIndex((n: any) => n.id === currentNode);
      if (nodeIdx === -1) return { ok: false, error: 'Node not found' };
      const node = nodes[nodeIdx];

      if (!node.data.mineable) return { ok: false, error: 'Node is not mineable' };
      if (node.data.depleted) return { ok: false, error: 'Node is depleted', reason: 'node_depleted', depletedUntil: node.data.depletedUntil };

      {
        const mineBufMax = computeNodeBuffer(node.type, getNodeChipEffects(currentNode, uid));
        const floorStacks = Array.isArray(node.data.items) ? node.data.items.length : 0;
        if (mineBufMax > 0 && floorStacks >= mineBufMax) {
          return { ok: false, error: 'Node buffer full', reason: 'node_buffer_full', maxBuffer: mineBufMax };
        }
      }

      if (node.data.capacity !== undefined) {
        if (node.data.mineCount >= node.data.capacity && !node.data.depleted) {
          const refillMs = node.data.refillMs || 5000;
          const freshS = getGameState(uid);
          const newN = freshS.nodes.map((n: any) => {
            if (n.id === node.id) {
              return { ...n, data: { ...n.data, depleted: true, depletedUntil: Date.now() + refillMs, mineCount: 0 } };
            }
            return n;
          });
          saveGameState({ ...freshS, nodes: newN }, uid);
          broadcastFullState(uid);
          return { ok: false, error: 'Node is depleted (refilling)', reason: 'node_depleted', depletedUntil: Date.now() + refillMs };
        }
      }
      if (!worker.equippedPickaxe) return { ok: false, error: 'No pickaxe equipped' };

      const mineChipEffects = getNodeChipEffects(currentNode, uid);
      const minePassives = getPassiveEffects();
      const mineMult = (mineChipEffects['harvest_speed_mult'] || 1) * (minePassives['global_harvest_speed_mult'] || 1);
      const mineDelay = Math.round(MINE_DELAY / mineMult);

      upsertWorker({ ...worker, status: 'harvesting' }, uid);
      broadcastFullState(uid);

      setLock(workerId, mineDelay);
      await getLock(workerId);

      const itemType = getItemTypeForNode(node);
      const efficiency = worker.equippedPickaxe.efficiency;
      const baseRate = node.data.rate || 1;
      const count = calcItemCount(baseRate, efficiency);
      const minedItem: Item = { type: itemType, count };

      const currentMineCount = (node.data.mineCount || 0) + 1;
      let depleted = false;
      let depletedUntil: number | undefined;
      let finalMineCount = currentMineCount;

      if (currentMineCount >= 999) {
        depleted = true;
        depletedUntil = Date.now() + 60000;
        finalMineCount = 0;
      }

      const freshState = getGameState(uid);
      const newNodes = freshState.nodes.map((n: any) => {
        if (n.id === node.id) {
          return {
            ...n,
            data: {
              ...n.data,
              items: mergeItemStacks(Array.isArray(n.data.items) ? n.data.items : [], [minedItem]),
              mineCount: finalMineCount,
              depleted,
              depletedUntil,
            },
          };
        }
        return n;
      });

      const w3 = getWorker(workerId, uid);
      if (w3) upsertWorker({ ...w3, status: 'running' }, uid);
      saveGameState({ ...freshState, nodes: newNodes }, uid);
      broadcastFullState(uid);
      incrementStat('total_mines', 1, uid);
      awardXp(XP_REWARDS.mine_node, uid);
      grantNodeXp(currentNode, 'mine', uid);
      checkAchievements(uid);
      checkQuests(uid);
      return { ok: true, item: { type: itemType, count }, drop: { type: itemType, count } };
    }

    case 'collect': {
      const capacity = 1 + (worker.equippedRam?.capacityBonus || 0);
      const currentNode = worker.current_node || worker.node_id;
      const nodeIdx = nodes.findIndex((n: any) => n.id === currentNode);
      if (nodeIdx === -1) return { ok: false, error: 'Node not found' };
      const node = nodes[nodeIdx];

      const nodeItems: Item[] = Array.isArray(node.data.items) ? [...node.data.items] : [];
      if (nodeItems.length === 0) return { ok: false, error: 'nothing_here', reason: 'nothing_here' };

      setLock(workerId, ACTION_DELAY);
      await getLock(workerId);

      const freshState2 = getGameState(uid);
      const freshNode = freshState2.nodes.find((n: any) => n.id === currentNode);
      const freshItems: Item[] = freshNode && Array.isArray(freshNode.data.items) ? [...freshNode.data.items] : [];
      if (freshItems.length === 0) return { ok: false, error: 'nothing_here', reason: 'nothing_here' };

      const w4 = getWorker(workerId, uid);
      const currentHolding: Item[] = (w4?.holding || []).map(h => ({ ...h }));

      const absorbInto = (holding: Item[], itemType: string, wanted: number): number => {
        let left = wanted;
        for (const h of holding) {
          if (left <= 0) break;
          if (h.type === itemType && h.count < MAX_STACK_SIZE) {
            const room = MAX_STACK_SIZE - h.count;
            const take = Math.min(room, left);
            h.count += take;
            left -= take;
          }
        }
        while (left > 0 && holding.length < capacity) {
          const take = Math.min(MAX_STACK_SIZE, left);
          holding.push({ type: itemType, count: take } as Item);
          left -= take;
        }
        return wanted - left;
      };

      const alreadyFullOfStacks = currentHolding.length >= capacity;
      const hasRoomInExisting = freshItems.some(fi =>
        currentHolding.some(h => h.type === fi.type && h.count < MAX_STACK_SIZE)
      );
      if (alreadyFullOfStacks && !hasRoomInExisting) {
        return { ok: false, error: 'inventory_full', reason: 'inventory_full', holdingCount: currentHolding.length, capacity };
      }

      const collected: Item[] = [];
      const remaining: Item[] = [];
      let budget = payload.count ?? Infinity;

      for (const floor of freshItems) {
        if (budget <= 0) { remaining.push(floor); continue; }
        if (payload.itemType && floor.type !== payload.itemType) { remaining.push(floor); continue; }
        const wanted = Math.min(floor.count, budget);
        const absorbed = absorbInto(currentHolding, floor.type, wanted);
        if (absorbed > 0) { collected.push({ type: floor.type, count: absorbed }); budget -= absorbed; }
        const leftover = floor.count - absorbed;
        if (leftover > 0) remaining.push({ type: floor.type, count: leftover });
      }

      if (payload.itemType && collected.length === 0) return { ok: false, error: 'item_not_found' };
      if (collected.length === 0) {
        return { ok: false, error: 'inventory_full', reason: 'inventory_full', holdingCount: currentHolding.length, capacity };
      }

      const newNodes2 = freshState2.nodes.map((n: any) => {
        if (n.id === currentNode) return { ...n, data: { ...n.data, items: remaining } };
        return n;
      });

      if (w4) upsertWorker({ ...w4, holding: currentHolding }, uid);
      saveGameState({ ...freshState2, nodes: newNodes2 }, uid);
      broadcastFullState(uid);
      return { ok: true, items: currentHolding, holdingCount: currentHolding.length, capacity };
    }

    case 'deposit': {
      const currentNode = worker.current_node || worker.node_id;
      if (currentNode !== 'hub') return { ok: false, error: 'Must be at Hub to deposit. Use drop() to leave items on the ground, or move to Hub first.', reason: 'not_at_hub' };

      setLock(workerId, ACTION_DELAY);
      await getLock(workerId);

      const w5 = getWorker(workerId, uid);
      if (!w5) return { ok: false, error: 'Worker not found' };

      const held = w5.holding || [];
      if (held.length === 0) return { ok: false, error: 'Nothing to deposit' };

      const freshState = getGameState(uid);
      const newResources = { ...freshState.resources } as Record<string, number>;

      let totalData = 0, totalRp = 0, penalty = 0;
      for (const item of held) {
        if (item.type === 'bad_data') { penalty += item.count; incrementStat('total_bad_data_deposited', item.count, uid); }
        else if (item.type === 'data_fragment') { totalData += item.count; incrementStat('total_data_deposited', item.count, uid); }
        else if (item.type === 'rp_shard') { totalRp += item.count; incrementStat('total_rp_deposited', item.count, uid); }
      }

      newResources['data'] = Math.max(0, (newResources['data'] || 0) + totalData - penalty);
      if (totalRp > 0) newResources['rp'] = (newResources['rp'] || 0) + totalRp;

      saveGameState({ ...freshState, resources: newResources as any }, uid);
      upsertWorker({ ...w5, holding: [], status: 'running' }, uid);
      broadcastFullState(uid);
      incrementStat('total_deposits', 1, uid);
      awardXp(XP_REWARDS.deposit_resources, uid);
      grantNodeXp('hub', 'deposit', uid);
      checkAchievements(uid);
      checkQuests(uid);
      return { ok: true, deposited: held, totalData, penalty };
    }

    case 'scan': {
      const currentNode = worker.current_node || worker.node_id;
      const neighborIds = getNeighborIds(edges, currentNode);
      const neighborNodes = nodes.filter((n: any) => neighborIds.includes(n.id)).map((n: any) => ({ ...n, adjacent: true }));
      return { ok: true, nodes: neighborNodes };
    }

    case 'repair': {
      const { nodeId } = payload;
      const currentNode = worker.current_node || worker.node_id;
      if (!edgeExists(edges, currentNode, nodeId) && currentNode !== nodeId) return { ok: false, error: 'Node not adjacent' };
      const node = nodes.find((n: any) => n.id === nodeId);
      if (!node || !node.data.infected) return { ok: false, error: 'Node is not infected' };
      const res = resources as unknown as Record<string, number>;
      if ((res.data || 0) < 500) return { ok: false, error: 'Not enough data (need 500)' };

      setLock(workerId, ACTION_DELAY);
      await getLock(workerId);

      const freshState4 = getGameState(uid);
      const newNodes3 = freshState4.nodes.map((n: any) => {
        if (n.id === nodeId) return { ...n, type: n.type === 'infected' ? 'resource' : n.type, data: { ...n.data, infected: false, infectionValue: 0 } };
        return n;
      });
      const newResources2 = { ...(freshState4.resources as any), data: (freshState4.resources as any).data - 500 };
      saveGameState({ ...freshState4, nodes: newNodes3, resources: newResources2 }, uid);
      broadcastFullState(uid);
      incrementStat('total_repairs', 1, uid);
      awardXp(XP_REWARDS.repair_infection, uid);
      checkAchievements(uid);
      checkQuests(uid);
      return { ok: true };
    }

    case 'findPath': {
      const { from, to } = payload;
      return { ok: true, path: bfsPath(edges, from, to) || [] };
    }

    case 'getResources':
      return { ok: true, resources: worker.carrying };

    case 'get_edges': {
      const curNode = worker.current_node || worker.node_id;
      const connectedEdges = edges
        .filter((e: any) => e.source === curNode || e.target === curNode)
        .map((e: any) => ({ id: e.id, otherNode: e.source === curNode ? e.target : e.source }));
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
        ok: true, id: nodeInfo.id, type: nodeInfo.type, label: nodeInfo.data.label,
        data: {
          resource: nodeInfo.data.resource, rate: nodeInfo.data.rate,
          difficulty: nodeInfo.data.difficulty, rewardResource: nodeInfo.data.rewardResource,
          unlocked: nodeInfo.data.unlocked, infected: nodeInfo.data.infected,
          mineable: nodeInfo.data.mineable, upgradeLevel: nodeInfo.data.upgradeLevel,
          solveCount: nodeInfo.data.solveCount,
        },
        edges: infoEdges,
      };
    }

    case 'compute': {
      const computeNode = worker.current_node || worker.node_id;
      const node = nodes.find((n: any) => n.id === computeNode);
      if (!node || node.type !== 'compute') return { ok: false, error: 'Not at a compute node' };

      const cooldownUntil = puzzleCooldowns.get(computeNode) || 0;
      if (Date.now() < cooldownUntil) {
        const remaining = Math.ceil((cooldownUntil - Date.now()) / 1000);
        return { ok: false, error: `Node on cooldown (${remaining}s)`, reason: 'cooldown', remaining };
      }

      const difficulty = node.data.difficulty || 'easy';
      let puzzle = activePuzzles.get(computeNode);
      if (!puzzle) {
        puzzle = generatePuzzle(difficulty, node.data.fixedPuzzleTemplate);
        activePuzzles.set(computeNode, puzzle);
      }

      setLock(workerId, ACTION_DELAY);
      await getLock(workerId);

      return { ok: true, taskId: puzzle.taskId, params: puzzle.params, hint: puzzle.hint, difficulty: puzzle.difficulty };
    }

    case 'submit': {
      const { taskId: submitTaskId, answer: submitAnswer } = payload;
      if (!submitTaskId || submitAnswer === undefined) return { ok: false, error: 'taskId and answer required' };

      const submitNode = worker.current_node || worker.node_id;
      const sNode = nodes.find((n: any) => n.id === submitNode);
      if (!sNode || sNode.type !== 'compute') return { ok: false, error: 'Not at a compute node' };

      const puzzle = activePuzzles.get(submitNode);
      if (!puzzle || puzzle.taskId !== submitTaskId) return { ok: false, error: 'Invalid or expired task', reason: 'invalid_task' };

      setLock(workerId, ACTION_DELAY);
      await getLock(workerId);

      const correct = String(puzzle.answer) === String(submitAnswer);
      activePuzzles.delete(submitNode);
      const difficulty = sNode.data.difficulty || 'easy';
      const config = DIFFICULTY_CONFIG[difficulty as keyof typeof DIFFICULTY_CONFIG];
      puzzleCooldowns.set(submitNode, Date.now() + (config?.cooldownMs || 10000));

      if (correct) {
        const template = PUZZLE_TEMPLATES.find(t => t.id === puzzle.templateId);
        const reward = (config?.baseReward || 5) * (template?.rewardMultiplier || 1);
        const rewardType = sNode.data.rewardResource || 'rp';

        const freshState = getGameState(uid);
        const newRes = { ...freshState.resources } as Record<string, number>;
        newRes[rewardType] = (newRes[rewardType] || 0) + reward;
        saveGameState({ ...freshState, resources: newRes as any }, uid);

        const newNodes = freshState.nodes.map((n: any) => {
          if (n.id === submitNode) return { ...n, data: { ...n.data, solveCount: (n.data.solveCount || 0) + 1 } };
          return n;
        });
        saveGameState({ ...getGameState(uid), nodes: newNodes }, uid);

        broadcastFullState(uid);
        totalSolves++;
        incrementStat('total_puzzles_solved', 1, uid);
        incrementStat(`puzzle_solved_${submitNode}`, 1, uid);
        if (submitNode === 's_comp1') incrementStat('compute_alpha_solved', 1, uid);
        if (submitNode === 'nw_locked1') incrementStat('observatory_solved', 1, uid);
        const puzzleDiff = sNode.data.difficulty || 'easy';
        awardXp(XP_REWARDS[`solve_puzzle_${puzzleDiff}`] || XP_REWARDS.solve_puzzle_easy, uid);
        grantNodeXp(submitNode, 'solve_puzzle', uid);
        checkAchievements(uid);
        checkQuests(uid);
        checkLayerUnlocks(uid);

        return { ok: true, correct: true, reward: { type: rewardType, amount: reward } };
      } else {
        return { ok: true, correct: false, expected: puzzle.answer, got: submitAnswer };
      }
    }

    case 'api_poll':
      return apiPoll(worker.current_node || worker.node_id, workerId);

    case 'api_respond': {
      const { requestId: apiReqId, responseData } = payload;
      if (!apiReqId) return { ok: false, error: 'requestId required' };
      return apiRespond(worker.current_node || worker.node_id, workerId, apiReqId, responseData);
    }

    case 'api_stats': {
      const currentNodeAS = worker.current_node || worker.node_id;
      const node = nodes.find((n: any) => n.id === currentNodeAS);
      if (!node || node.type !== 'api') return { ok: false, error: 'Not at an API node' };
      return { ok: true, ...getAPIStats(currentNodeAS) };
    }

    case 'api_reject': {
      const { requestId: rejReqId, statusCode } = payload;
      if (!rejReqId) return { ok: false, error: 'requestId required' };
      if (!statusCode) return { ok: false, error: 'statusCode required (e.g. 401, 400, 429, 500)' };
      return apiReject(worker.current_node || worker.node_id, workerId, rejReqId, statusCode);
    }

    case 'validate_token': {
      const currentNodeVT = worker.current_node || worker.node_id;
      const authNode = nodes.find((n: any) => n.id === currentNodeVT);
      if (!authNode || authNode.type !== 'auth') return { ok: false, error: 'Must be at an auth node to validate tokens', reason: 'not_at_auth_node' };
      if (!authNode.data.unlocked) return { ok: false, error: 'Auth node is locked' };
      const { token } = payload;
      if (!token) return { ok: false, error: 'token required' };
      const valid = typeof token === 'string' && token.length > 0;
      setLock(workerId, ACTION_DELAY / 2);
      await getLock(workerId);
      return { ok: true, valid, ttl: 30, token };
    }

    case 'get_service': {
      const { serviceNodeId } = payload;
      if (!serviceNodeId) return { ok: false, error: 'serviceNodeId required' };
      const serviceNode = nodes.find((n: any) => n.id === serviceNodeId);
      if (!serviceNode) return { ok: false, error: 'Service node not found', reason: 'not_found' };
      if (!serviceNode.data.unlocked) return { ok: false, error: 'Service node is locked', reason: 'not_reachable' };
      const workerNode = worker.current_node || worker.node_id;
      if (serviceNode.type === 'cache') {
        const range = getCacheRange(serviceNodeId);
        const path = bfsPath(edges, workerNode, serviceNodeId);
        const distance = path ? path.length - 1 : Infinity;
        if (distance > range) return { ok: false, error: `Cache node '${serviceNodeId}' is out of range (distance ${distance}, range ${range})`, reason: 'not_reachable' };
        return { ok: true, serviceType: 'cache', nodeId: serviceNodeId, range, capacity: getCacheCapacity(serviceNodeId), usedSlots: cacheKeys(serviceNodeId).length };
      }
      return { ok: false, error: `Node '${serviceNodeId}' is not a service node`, reason: 'not_a_service' };
    }

    case 'cache_get': {
      const { cacheNodeId, key: cacheKey } = payload;
      if (!cacheNodeId || !cacheKey) return { ok: false, error: 'cacheNodeId and key required' };
      const workerNodeCG = worker.current_node || worker.node_id;
      const rangeCG = getCacheRange(cacheNodeId);
      const pathCG = bfsPath(edges, workerNodeCG, cacheNodeId);
      const distCG = pathCG ? pathCG.length - 1 : Infinity;
      if (distCG > rangeCG) return { ok: false, error: 'Cache out of range', reason: 'not_reachable' };
      const val = cacheGet(cacheNodeId, cacheKey);
      if (val === undefined) return { ok: true, hit: false, value: null };
      grantNodeXp(cacheNodeId, 'cache_hit', uid);
      return { ok: true, hit: true, value: val };
    }

    case 'cache_set': {
      const { cacheNodeId: cacheNodeIdS, key: cacheKeyS, value: cacheValue, ttl: cacheTtl } = payload;
      if (!cacheNodeIdS || !cacheKeyS) return { ok: false, error: 'cacheNodeId and key required' };
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

    case 'scan_edges': {
      const curNodeSE = worker.current_node || worker.node_id;
      const connectedSE = edges
        .filter((e: any) => e.source === curNodeSE || e.target === curNodeSE)
        .map((e: any) => ({ edge_id: e.id, source_node_id: curNodeSE, target_node_id: e.source === curNodeSE ? e.target : e.source }));
      return { ok: true, edges: connectedSE };
    }

    case 'scan_edges_advanced': {
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
            edge_id: e.id, source_node_id: curNodeSEA, target_node_id: targetId,
            target_node_data: targetNode ? {
              ok: true, id: targetNode.id, type: targetNode.type, label: targetNode.data.label,
              data: { resource: targetNode.data.resource, rate: targetNode.data.rate, difficulty: targetNode.data.difficulty, rewardResource: targetNode.data.rewardResource, unlocked: targetNode.data.unlocked, infected: targetNode.data.infected, mineable: targetNode.data.mineable, upgradeLevel: targetNode.data.upgradeLevel, solveCount: targetNode.data.solveCount },
              edges: infoEdges,
            } : null,
          };
        });
      return { ok: true, edges: connectedSEA };
    }

    case 'discard': {
      const w6 = getWorker(workerId, uid);
      if (!w6 || (w6.holding || []).length === 0) return { ok: false, error: 'Nothing to discard', reason: 'nothing_held' };

      if (payload.itemType) {
        const holding = [...(w6.holding || [])];
        const idx = holding.findIndex((d: any) => d.type === payload.itemType);
        if (idx === -1) return { ok: false, error: 'Item type not found', reason: 'item_not_found' };
        const stack = holding[idx];
        const discardCount = payload.count ? Math.min(payload.count, stack.count) : stack.count;
        const discarded = { type: stack.type, count: discardCount };
        if (discardCount >= stack.count) holding.splice(idx, 1);
        else holding[idx] = { ...stack, count: stack.count - discardCount };
        upsertWorker({ ...w6, holding }, uid);
        broadcastFullState(uid);
        if (discarded.type === 'bad_data') { incrementStat('total_bad_data_discarded', discardCount, uid); checkQuests(uid); }
        return { ok: true, discarded };
      } else {
        const discarded = w6.holding;
        for (const item of discarded) { if (item.type === 'bad_data') incrementStat('total_bad_data_discarded', item.count, uid); }
        upsertWorker({ ...w6, holding: [] }, uid);
        broadcastFullState(uid);
        checkQuests(uid);
        return { ok: true, discarded };
      }
    }

    case 'drop': {
      const w7 = getWorker(workerId, uid);
      if (!w7 || (w7.holding || []).length === 0) return { ok: false, error: 'Nothing to drop', reason: 'nothing_held' };
      const dropNodeId = w7.current_node || w7.node_id;
      const freshStateDrop = getGameState(uid);
      const dropNode = freshStateDrop.nodes.find((n: any) => n.id === dropNodeId);
      if (!dropNode) return { ok: false, error: 'Node not found' };

      let dropped: Item[];
      const holding = [...(w7.holding || [])];
      if (payload.itemType) {
        const idx = holding.findIndex((d: any) => d.type === payload.itemType);
        if (idx === -1) return { ok: false, error: 'Item type not found' };
        const stack = holding[idx];
        const dropCount = payload.count ? Math.min(payload.count, stack.count) : stack.count;
        dropped = [{ type: stack.type, count: dropCount }];
        if (dropCount >= stack.count) holding.splice(idx, 1);
        else holding[idx] = { ...stack, count: stack.count - dropCount };
      } else {
        dropped = [...holding];
        holding.length = 0;
      }

      if (dropNodeId === 'hub') {
        const newResources = { ...freshStateDrop.resources } as Record<string, number>;
        let totalData = 0, totalRp = 0, penalty = 0;
        for (const item of dropped) {
          if (item.type === 'bad_data') { penalty += item.count; incrementStat('total_bad_data_deposited', item.count, uid); }
          else if (item.type === 'data_fragment') { totalData += item.count; incrementStat('total_data_deposited', item.count, uid); }
          else if (item.type === 'rp_shard') { totalRp += item.count; incrementStat('total_rp_deposited', item.count, uid); }
        }
        newResources['data'] = Math.max(0, (newResources['data'] || 0) + totalData - penalty);
        if (totalRp > 0) newResources['rp'] = (newResources['rp'] || 0) + totalRp;

        saveGameState({ ...freshStateDrop, resources: newResources as any }, uid);
        upsertWorker({ ...w7, holding, status: 'running' }, uid);
        broadcastFullState(uid);
        broadcast({
          type: 'HUB_DEPOSIT',
          payload: { workerId, ts: Date.now(), totalData, totalRp, penalty, goodCount: totalData + totalRp, badCount: penalty },
        }, uid);
        incrementStat('total_deposits', 1, uid);
        awardXp(XP_REWARDS.deposit_resources, uid);
        grantNodeXp('hub', 'deposit', uid);
        checkAchievements(uid);
        checkQuests(uid);
        return { ok: true, dropped, nodeId: dropNodeId, deposited: true, totalData, penalty };
      }

      const dropBufMax = computeNodeBuffer(dropNode.type, getNodeChipEffects(dropNodeId, uid));
      const existingItemsPre: Item[] = Array.isArray(dropNode.data.items) ? [...dropNode.data.items] : [];
      const existingTypes = new Set(existingItemsPre.map(i => i.type));
      let projectedStacks = existingItemsPre.length;
      const acceptedDrops: Item[] = [];
      const rejectedDrops: Item[] = [];
      for (const d of dropped) {
        if (existingTypes.has(d.type)) { acceptedDrops.push(d); continue; }
        if (dropBufMax === 0 || projectedStacks < dropBufMax) { acceptedDrops.push(d); existingTypes.add(d.type); projectedStacks += 1; }
        else rejectedDrops.push(d);
      }
      if (acceptedDrops.length === 0) return { ok: false, error: 'Node buffer full', reason: 'node_buffer_full', maxBuffer: dropBufMax };
      for (const r of rejectedDrops) holding.push(r);
      upsertWorker({ ...w7, holding }, uid);

      const newNodes = freshStateDrop.nodes.map((n: any) => {
        if (n.id === dropNodeId) return { ...n, data: { ...n.data, items: mergeItemStacks(existingItemsPre, acceptedDrops) } };
        return n;
      });
      saveGameState({ ...freshStateDrop, nodes: newNodes }, uid);
      broadcastFullState(uid);
      return { ok: true, dropped: acceptedDrops, rejected: rejectedDrops, nodeId: dropNodeId, maxBuffer: dropBufMax };
    }

    case 'has_items':
    case 'has_dropped_items': {
      const curNodeHDI = worker.current_node || worker.node_id;
      const nodeHDI = nodes.find((n: any) => n.id === curNodeHDI);
      if (!nodeHDI) return { ok: true, has_items: false };
      const floorItems = Array.isArray(nodeHDI.data.items) ? nodeHDI.data.items : [];
      return { ok: true, has_items: floorItems.length > 0, count: floorItems.length };
    }

    case 'findNearest': {
      const { from: fnFrom, nodeType: fnType } = payload;
      if (!fnFrom || !fnType) return { ok: false, error: 'from and nodeType required' };
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
          if (n && n.type === fnType && n.data.unlocked) { foundId = nid; break; }
          queue.push(nid);
        }
      }
      return { ok: true, nodeId: foundId };
    }

    default:
      return { ok: false, error: `Unknown action: ${action}` };
  }
}
