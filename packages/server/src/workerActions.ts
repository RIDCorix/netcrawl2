import {
  getGameState, saveGameState, getWorker, upsertWorker,
  addWorkerLog, getWorkers, Resources, Drop,
  addToPlayerInventory,
} from './db.js';
import { broadcast } from './websocket.js';

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
  if (efficiency >= 2.5) {
    // 2-3 drops
    return 2 + (Math.random() < 0.5 ? 1 : 0);
  } else if (efficiency >= 1.5) {
    // 1-2 drops
    return 1 + (Math.random() < 0.5 ? 1 : 0);
  } else {
    // always 1
    return 1;
  }
}

export async function handleWorkerAction(workerId: string, action: string, payload: any): Promise<any> {
  const worker = getWorker(workerId);
  if (!worker) return { ok: false, error: 'Worker not found' };

  const state = getGameState();
  const { nodes, edges, resources } = state;

  switch (action) {
    case 'move': {
      const { targetNodeId } = payload;
      const currentNode = worker.current_node || worker.node_id;
      if (!edgeExists(edges, currentNode, targetNodeId)) {
        return { ok: false, error: `No edge between ${currentNode} and ${targetNodeId}` };
      }
      upsertWorker({ ...worker, status: 'moving', current_node: targetNodeId });
      broadcastFullState();
      setTimeout(() => {
        const w = getWorker(workerId);
        if (w && w.status === 'moving') {
          upsertWorker({ ...w, status: 'idle' });
          broadcastFullState();
        }
      }, 1000);
      return { ok: true, travelTime: 1000 };
    }

    case 'harvest': {
      const currentNode = worker.current_node || worker.node_id;
      const node = nodes.find((n: any) => n.id === currentNode);
      if (!node || node.type !== 'resource') {
        return { ok: false, error: 'Not at a resource node' };
      }
      const resourceType = node.data.resource as keyof Resources;
      const rate = node.data.rate || 1;
      const carrying = { ...worker.carrying } as Record<string, number>;
      const totalCarrying = Object.values(carrying).reduce((a, b) => a + b, 0);
      const canCarry = Math.min(rate, 50 - totalCarrying);
      if (canCarry <= 0) return { ok: false, error: 'Carrying capacity full' };
      carrying[resourceType] = (carrying[resourceType] || 0) + canCarry;
      upsertWorker({ ...worker, status: 'harvesting', carrying: carrying as any });
      setTimeout(() => {
        const w = getWorker(workerId);
        if (w) { upsertWorker({ ...w, status: 'idle' }); broadcastFullState(); }
      }, 500);
      broadcastFullState();
      return { ok: true, harvested: { [resourceType]: canCarry } };
    }

    case 'mine': {
      const currentNode = worker.current_node || worker.node_id;
      const nodeIdx = nodes.findIndex((n: any) => n.id === currentNode);
      if (nodeIdx === -1) return { ok: false, error: 'Node not found' };
      const node = nodes[nodeIdx];

      if (!node.data.mineable) {
        return { ok: false, error: 'Node is not mineable' };
      }
      if (node.data.depleted) {
        return { ok: false, error: 'Node is depleted', depletedUntil: node.data.depletedUntil };
      }
      if (!worker.equippedPickaxe) {
        return { ok: false, error: 'No pickaxe equipped' };
      }

      const dropType = getDropTypeForNode(node);
      const efficiency = worker.equippedPickaxe.efficiency;
      const amount = calcDropAmount(efficiency);
      const drop: Drop = { id: generateUuid(), type: dropType, amount };

      const currentDrops = Array.isArray(node.data.drops) ? [...node.data.drops] : [];
      const currentMineCount = (node.data.mineCount || 0) + 1;
      let depleted = false;
      let depletedUntil: number | undefined;
      let finalMineCount = currentMineCount;

      if (currentMineCount >= 5) {
        depleted = true;
        depletedUntil = Date.now() + 60000;
        finalMineCount = 0;
      }

      const newNodes = nodes.map((n: any, i: number) => {
        if (i === nodeIdx) {
          return {
            ...n,
            data: {
              ...n.data,
              drops: [...currentDrops, drop],
              mineCount: finalMineCount,
              depleted,
              depletedUntil,
            },
          };
        }
        return n;
      });

      saveGameState({ ...state, nodes: newNodes });
      broadcastFullState();
      return { ok: true, drop: { type: dropType, amount } };
    }

    case 'collect': {
      if (worker.holding !== null) {
        return { ok: false, error: 'slot_full' };
      }
      const currentNode = worker.current_node || worker.node_id;
      const nodeIdx = nodes.findIndex((n: any) => n.id === currentNode);
      if (nodeIdx === -1) return { ok: false, error: 'Node not found' };
      const node = nodes[nodeIdx];

      const drops = Array.isArray(node.data.drops) ? [...node.data.drops] : [];
      if (drops.length === 0) {
        return { ok: false, error: 'nothing_here' };
      }

      const [pickedUp, ...remainingDrops] = drops;
      const newNodes = nodes.map((n: any, i: number) => {
        if (i === nodeIdx) {
          return { ...n, data: { ...n.data, drops: remainingDrops } };
        }
        return n;
      });

      upsertWorker({ ...worker, holding: pickedUp });
      saveGameState({ ...state, nodes: newNodes });
      broadcastFullState();
      return { ok: true, item: pickedUp };
    }

    case 'deposit': {
      const currentNode = worker.current_node || worker.node_id;
      if (currentNode !== 'hub') {
        return { ok: false, error: 'Must be at hub to deposit' };
      }

      // New-style: deposit held item into player inventory
      if (worker.holding !== null) {
        const held = worker.holding;
        addToPlayerInventory(held.type, held.amount);
        upsertWorker({ ...worker, holding: null, carrying: {}, status: 'idle' });
        saveGameState({ ...state });
        broadcastFullState();
        return { ok: true, deposited: held };
      }

      // Backward compat: deposit old-style carrying resources
      const carrying = worker.carrying as Record<string, number>;
      const newResources = { ...resources } as Record<string, number>;
      Object.keys(carrying).forEach(k => {
        newResources[k] = (newResources[k] || 0) + (carrying[k] || 0);
      });
      upsertWorker({ ...worker, carrying: {}, status: 'idle' });
      saveGameState({ ...state, resources: newResources as any });
      broadcastFullState();
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
      if (!node || !node.data.infected) {
        return { ok: false, error: 'Node is not infected' };
      }
      const res = resources as unknown as Record<string, number>;
      if ((res.energy || 0) < 30) {
        return { ok: false, error: 'Not enough energy (need 30)' };
      }
      const newNodes = nodes.map((n: any) => {
        if (n.id === nodeId) {
          return { ...n, type: n.type === 'infected' ? 'resource' : n.type, data: { ...n.data, infected: false } };
        }
        return n;
      });
      const newResources = { ...res, energy: res.energy - 30 };
      saveGameState({ ...state, nodes: newNodes, resources: newResources as any });
      broadcastFullState();
      return { ok: true };
    }

    case 'findPath': {
      const { from, to } = payload;
      const pathResult = bfsPath(edges, from, to);
      return { ok: true, path: pathResult || [] };
    }

    case 'log': {
      const { message } = payload;
      addWorkerLog(workerId, message);
      return { ok: true };
    }

    case 'getResources': {
      return { ok: true, resources: worker.carrying };
    }

    default:
      return { ok: false, error: `Unknown action: ${action}` };
  }
}
