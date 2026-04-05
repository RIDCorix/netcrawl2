/**
 * In-memory registry for worker classes and deploy queue.
 * Extracted from routes.ts for single responsibility.
 *
 * In multi-user mode, registries and queues are keyed per userId
 * to prevent cross-user data leakage.
 */

const isMultiUser = () => process.env.NETCRAWL_MULTI_USER === 'true';
const DEFAULT_USER = '__default__';

function resolveUser(userId?: string): string {
  return (isMultiUser() && userId) ? userId : DEFAULT_USER;
}

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

// userId → (classId → entry)
const workerClassRegistries = new Map<string, Map<string, WorkerClassEntry>>();

function getRegistry(userId?: string): Map<string, WorkerClassEntry> {
  const key = resolveUser(userId);
  if (!workerClassRegistries.has(key)) workerClassRegistries.set(key, new Map());
  return workerClassRegistries.get(key)!;
}

export function registerWorkerClass(entry: WorkerClassEntry, userId?: string): void {
  getRegistry(userId).set(entry.class_id, entry);
}

export function getWorkerClass(classId: string, userId?: string): WorkerClassEntry | undefined {
  return getRegistry(userId).get(classId);
}

export function getAllWorkerClasses(userId?: string): WorkerClassEntry[] {
  return Array.from(getRegistry(userId).values());
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

// userId → deploy requests
const deployQueues = new Map<string, DeployRequest[]>();

function getDeployQueue(userId?: string): DeployRequest[] {
  const key = resolveUser(userId);
  if (!deployQueues.has(key)) deployQueues.set(key, []);
  return deployQueues.get(key)!;
}

export function enqueueDeploy(request: DeployRequest, userId?: string): void {
  getDeployQueue(userId).push(request);
}

export function drainDeployQueue(userId?: string): DeployRequest[] {
  const queue = getDeployQueue(userId);
  return queue.splice(0, queue.length);
}

export function removeFromDeployQueue(workerId: string, userId?: string): boolean {
  const queue = getDeployQueue(userId);
  const idx = queue.findIndex(r => r.workerId === workerId);
  if (idx !== -1) {
    queue.splice(idx, 1);
    return true;
  }
  return false;
}
