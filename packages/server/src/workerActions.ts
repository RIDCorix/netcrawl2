import {
  getGameState, saveGameState, getWorker, upsertWorker,
  addWorkerLog, getWorkers, Resources,
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

    case 'deposit': {
      const currentNode = worker.current_node || worker.node_id;
      if (currentNode !== 'hub') {
        return { ok: false, error: 'Must be at hub to deposit' };
      }
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
