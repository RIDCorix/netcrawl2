/**
 * Scan/query action handlers: scan, get_edges, get_node_info, scan_edges,
 * scan_edges_advanced, findPath, findNearest, getResources
 */

import type { ActionContext } from './helpers.js';
import { getNeighborIds, bfsPath } from '../graphUtils.js';

export function handleScan(ctx: ActionContext): any {
  const { worker, nodes, edges } = ctx;
  const currentNode = worker.current_node || worker.node_id;
  const neighborIds = getNeighborIds(edges, currentNode);
  const neighborNodes = nodes.filter((n: any) => neighborIds.includes(n.id)).map((n: any) => ({ ...n, adjacent: true }));
  return { ok: true, nodes: neighborNodes };
}

export function handleGetEdges(ctx: ActionContext): any {
  const { worker, edges } = ctx;
  const curNode = worker.current_node || worker.node_id;
  const connectedEdges = edges
    .filter((e: any) => e.source === curNode || e.target === curNode)
    .map((e: any) => ({ id: e.id, otherNode: e.source === curNode ? e.target : e.source }));
  return { ok: true, edges: connectedEdges, currentNode: curNode };
}

export function handleGetNodeInfo(ctx: ActionContext): any {
  const { worker, nodes, edges } = ctx;
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

export function handleScanEdges(ctx: ActionContext): any {
  const { worker, edges } = ctx;
  const curNode = worker.current_node || worker.node_id;
  const connected = edges
    .filter((e: any) => e.source === curNode || e.target === curNode)
    .map((e: any) => ({ edge_id: e.id, source_node_id: curNode, target_node_id: e.source === curNode ? e.target : e.source }));
  return { ok: true, edges: connected };
}

export function handleScanEdgesAdvanced(ctx: ActionContext): any {
  const { worker, nodes, edges } = ctx;
  const curNode = worker.current_node || worker.node_id;
  const connected = edges
    .filter((e: any) => e.source === curNode || e.target === curNode)
    .map((e: any) => {
      const targetId = e.source === curNode ? e.target : e.source;
      const targetNode = nodes.find((n: any) => n.id === targetId);
      const targetEdges = targetNode ? edges
        .filter((te: any) => te.source === targetId || te.target === targetId)
        .map((te: any) => ({ id: te.id, otherNode: te.source === targetId ? te.target : te.source }))
        : [];
      return {
        edge_id: e.id, source_node_id: curNode, target_node_id: targetId,
        target_node_data: targetNode ? {
          ok: true, id: targetNode.id, type: targetNode.type, label: targetNode.data.label,
          data: { resource: targetNode.data.resource, rate: targetNode.data.rate, difficulty: targetNode.data.difficulty, rewardResource: targetNode.data.rewardResource, unlocked: targetNode.data.unlocked, infected: targetNode.data.infected, mineable: targetNode.data.mineable, upgradeLevel: targetNode.data.upgradeLevel, solveCount: targetNode.data.solveCount },
          edges: targetEdges,
        } : null,
      };
    });
  return { ok: true, edges: connected };
}

export function handleFindPath(ctx: ActionContext, payload: any): any {
  const { edges } = ctx;
  const { from, to } = payload;
  return { ok: true, path: bfsPath(edges, from, to) || [] };
}

export function handleFindNearest(ctx: ActionContext, payload: any): any {
  const { nodes, edges } = ctx;
  const { from, nodeType } = payload;
  if (!from || !nodeType) return { ok: false, error: 'from and nodeType required' };
  const visited = new Set<string>();
  const queue: string[] = [from];
  visited.add(from);
  let foundId: string | null = null;
  while (queue.length > 0 && !foundId) {
    const current = queue.shift()!;
    const neighbors = getNeighborIds(edges, current);
    for (const nid of neighbors) {
      if (visited.has(nid)) continue;
      visited.add(nid);
      const n = nodes.find((nd: any) => nd.id === nid);
      if (n && n.type === nodeType && n.data.unlocked) { foundId = nid; break; }
      queue.push(nid);
    }
  }
  return { ok: true, nodeId: foundId };
}

export function handleGetResources(ctx: ActionContext): any {
  return { ok: true, resources: ctx.worker.carrying };
}
