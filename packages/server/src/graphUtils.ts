/**
 * Shared graph traversal utilities used by gameTick, workerActions, etc.
 */

export function getNeighborIds(edges: any[], nodeId: string): string[] {
  const neighbors: string[] = [];
  for (const e of edges) {
    if (e.source === nodeId) neighbors.push(e.target);
    else if (e.target === nodeId) neighbors.push(e.source);
  }
  return neighbors;
}

export function edgeExists(edges: any[], from: string, to: string): boolean {
  return edges.some(e =>
    (e.source === from && e.target === to) ||
    (e.source === to && e.target === from)
  );
}

export function bfsPath(edges: any[], start: string, end: string): string[] | null {
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
