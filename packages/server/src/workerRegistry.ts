/**
 * In-memory registry for worker classes and deploy queue.
 * Extracted from routes.ts for single responsibility.
 */

// ── Worker Class Registry ───────────────────────────────────────────────────

export interface WorkerClassEntry {
  class_id: string;
  class_name: string;
  class_icon: string;
  fields: Record<string, { type: string; field: string; description: string }>;
  docstring: string;
  file: string;
  language: 'python' | 'javascript';
}

const workerClassRegistry = new Map<string, WorkerClassEntry>();

export function registerWorkerClass(entry: WorkerClassEntry): void {
  workerClassRegistry.set(entry.class_id, entry);
}

export function getWorkerClass(classId: string): WorkerClassEntry | undefined {
  return workerClassRegistry.get(classId);
}

export function getAllWorkerClasses(): WorkerClassEntry[] {
  return Array.from(workerClassRegistry.values());
}

// ── Deploy Queue ────────────────────────────────────────────────────────────

export interface DeployRequest {
  id: string;
  workerId: string;
  nodeId: string;
  classId: string;
  equippedItems: Record<string, string>;
  injectedFields: Record<string, any>;
  createdAt: string;
}

const deployQueue: DeployRequest[] = [];

export function enqueueDeploy(request: DeployRequest): void {
  deployQueue.push(request);
}

export function drainDeployQueue(): DeployRequest[] {
  return deployQueue.splice(0, deployQueue.length);
}

export function removeFromDeployQueue(workerId: string): boolean {
  const idx = deployQueue.findIndex(r => r.workerId === workerId);
  if (idx !== -1) {
    deployQueue.splice(idx, 1);
    return true;
  }
  return false;
}
