import type { GameEdge, GameNode, Resources } from '../store/gameStore';

/** Whether this locked node can be unlocked with the player's current network and resources. */
export function isNodeUnlockable(node: GameNode, nodes: GameNode[], edges: GameEdge[], resources: Resources): boolean {
  if (node.id === 'hub' || node.data.unlocked || !node.data.unlockCost) return false;

  if (!canAffordUnlock(node.data.unlockCost, resources)) return false;

  return hasUnlockedNeighbor(node, nodes, edges);
}

export function canAffordUnlock(cost: Partial<Resources>, resources: Resources): boolean {
  return Object.entries(cost).every(([resource, amount]) => resources[resource as keyof Resources] >= amount);
}

export function hasUnlockedNeighbor(node: GameNode, nodes: GameNode[], edges: GameEdge[]): boolean {
  return edges.some(edge => {
    const neighborId = edge.source === node.id ? edge.target : edge.target === node.id ? edge.source : null;
    if (!neighborId) return false;

    const neighbor = nodes.find(candidate => candidate.id === neighborId);
    return !!neighbor?.data.unlocked;
  });
}
