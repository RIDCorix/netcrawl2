import {
  getGameState, saveGameState, getWorker, upsertWorker,
  addWorkerLog, getWorkers, Resources, Drop,
  getNodeChipEffects, incrementStat, setStatMax,
} from './db.js';
import { broadcast } from './websocket.js';
import { checkAchievements } from './achievements.js';
import { checkQuests } from './quests.js';
import { getActivePassives } from './db.js';
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

function edgeExists(edges: any[], from: string, to: string): boolean {
  return edges.some(e =>
    (e.source === from && e.target === to) ||
    (e.source === to && e.target === from)
  );
}

function getNeighborIds(edges: any[], nodeId: string): string[] {
  const neighbors: string[] = [];
  for (const e of edges) {
    if (e.source === nodeId) neighbors.push(e.target);
    else if (e.target === nodeId) neighbors.push(e.source);
  }
  return neighbors;
}

function bfsPath(edges: any[], start: string, end: string): string[] | null {
  if (start === end) return [start];
  const queue: string[][] = [[start]];
  const visited = new Set<string>([start]);
  while (queue.length > 0) {
    const path = queue.shift()!;
    const current = path[path.length - 1];
    const neighbors = getNeighborIds(edges, current);
    for (const n of neighbors) {
      if (!visited.has(n)) {
        const newPath = [...path, n];
        if (n === end) return newPath;
        visited.add(n);
        queue.push(newPath);
      }
    }
  }
  return null;
}

function broadcastFullState() {
  const state = getGameState();
  broadcast({ type: 'STATE_UPDATE', payload: { ...state, workers: getWorkers() } });
}

function generateUuid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getDropTypeForNode(node: any): Drop['type'] {
  const resource = node.data?.resource;
  if (resource === 'energy') return 'energy_crystal';
  if (resource === 'data') return 'data_shard';
  return 'ore_chunk';
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
      const capacityBonus = (chipEffects['capacity_bonus'] || 0) + (passiveEffects['global_capacity_bonus'] || 0);
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
        const dropToResource: Record<string, string> = {
          ore_chunk: 'ore',
          energy_crystal: 'energy',
          data_shard: 'data',
        };
        const resourceKey = dropToResource[held.type];
        const freshState = getGameState();
        if (resourceKey) {
          const newResources = { ...freshState.resources } as Record<string, number>;
          newResources[resourceKey] = (newResources[resourceKey] || 0) + held.amount;
          saveGameState({ ...freshState, resources: newResources as any });
        }
        upsertWorker({ ...w5, holding: null, carrying: {}, status: 'running' });
        broadcastFullState();
        // Track achievement stats
        if (resourceKey) {
          incrementStat(`total_${resourceKey}_deposited`, held.amount);
          incrementStat('total_deposits', 1);
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
      if ((res.energy || 0) < 30) return { ok: false, error: 'Not enough energy (need 30)' };

      setLock(workerId, ACTION_DELAY);
      await workerLocks.get(workerId);

      const freshState4 = getGameState();
      const newNodes3 = freshState4.nodes.map((n: any) => {
        if (n.id === nodeId) {
          return { ...n, type: n.type === 'infected' ? 'resource' : n.type, data: { ...n.data, infected: false } };
        }
        return n;
      });
      const newResources2 = { ...(freshState4.resources as any), energy: (freshState4.resources as any).energy - 30 };
      saveGameState({ ...freshState4, nodes: newNodes3, resources: newResources2 });
      broadcastFullState();
      incrementStat('total_repairs', 1);
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
        const rewardType = sNode.data.rewardResource || 'data';

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
        checkAchievements();
        checkQuests();

        return { ok: true, correct: true, reward: { type: rewardType, amount: reward } };
      } else {
        return { ok: true, correct: false, expected: puzzle.answer, got: submitAnswer };
      }
    }

    default:
      return { ok: false, error: `Unknown action: ${action}` };
  }
}
