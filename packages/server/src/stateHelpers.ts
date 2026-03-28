/**
 * Shared state mutation helpers for game state operations.
 * Eliminates repeated patterns across routes and worker actions.
 */

/**
 * Check if the player can afford a cost. Returns null if affordable,
 * or an error string describing what's missing.
 */
export function checkCost(
  resources: Record<string, number>,
  cost: Record<string, number>,
): string | null {
  for (const [resource, amount] of Object.entries(cost)) {
    if ((resources[resource] || 0) < amount) {
      return `Not enough ${resource} (need ${amount}, have ${resources[resource] || 0})`;
    }
  }
  return null;
}

/**
 * Deduct a cost from resources. Returns a new resources object.
 * Call checkCost() first to verify affordability.
 */
export function deductCost(
  resources: Record<string, number>,
  cost: Record<string, number>,
): Record<string, number> {
  const result = { ...resources };
  for (const [resource, amount] of Object.entries(cost)) {
    result[resource] -= amount;
  }
  return result;
}

/**
 * Immutably update a single node's data in a nodes array.
 */
export function updateNodeData(
  nodes: any[],
  nodeId: string,
  updater: (data: any) => any,
): any[] {
  return nodes.map(n =>
    n.id === nodeId
      ? { ...n, data: updater({ ...n.data }) }
      : n
  );
}
