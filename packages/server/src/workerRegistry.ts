/**
 * Class registry is an in-memory Code Server observation. Deploy commands are
 * durable server state and are leased (never drained before an ACK).
 * Extracted from routes.ts for single responsibility.
 *
 * In multi-user mode, registries and queues are keyed per userId
 * to prevent cross-user data leakage.
 */

const isMultiUser = () => process.env.NETCRAWL_MULTI_USER === 'true';
const DEFAULT_USER = '__default__';

function resolveUser(userId?: string): string {
  return isMultiUser() && userId ? userId : DEFAULT_USER;
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

// ── Durable runtime command queue ───────────────────────────────────────────

import { randomUUID } from 'crypto';
import { resolveStore } from './store.js';
import type { RuntimeCommand } from './types.js';

export interface DeployRequest {
  id: string;
  workerId: string;
  nodeId: string;
  classId: string;
  equippedItems: Record<string, string>;
  injectedFields: Record<string, any>;
  createdAt: string;
  generation?: number;
  executionToken?: string;
  commandId?: string;
  initialHolding?: any[];
}

export function enqueueDeploy(request: DeployRequest, userId?: string): void {
  const s = resolveStore(userId);
  s.runtime_commands ||= [];
  const existing = s.runtime_commands.find(
    command =>
      command.workerId === request.workerId && command.generation === (request.generation || 0) && !command.ackedAt,
  );
  if (existing) return;
  s.runtime_commands.push({
    id: request.commandId || randomUUID(),
    type: 'start',
    workerId: request.workerId,
    generation: request.generation || 0,
    executionToken: request.executionToken || '',
    nodeId: request.nodeId,
    classId: request.classId,
    injectedFields: request.injectedFields,
    initialHolding: request.initialHolding || [],
    createdAt: request.createdAt,
  });
}

/**
 * Return unacknowledged commands and lease them to one Code Server session.
 * A lost poll response or ACK is therefore retried after the lease expires.
 */
export function leaseDeployQueue(sessionId: string, userId?: string, now = Date.now()): RuntimeCommand[] {
  const s = resolveStore(userId);
  const commands = s.runtime_commands || [];
  const expiresAt = now + 15_000;
  return commands
    .filter(command => {
      const worker = s.workers[command.workerId];
      return (
        !command.ackedAt &&
        worker?.desiredState === 'running' &&
        worker.generation === command.generation &&
        (!command.lease || command.lease.sessionId === sessionId || command.lease.expiresAt <= now)
      );
    })
    .map(command => {
      command.lease = { sessionId, expiresAt };
      return command;
    });
}

export function removeFromDeployQueue(workerId: string, userId?: string): boolean {
  const commands = resolveStore(userId).runtime_commands || [];
  const before = commands.length;
  resolveStore(userId).runtime_commands = commands.filter(command => command.workerId !== workerId || command.ackedAt);
  return resolveStore(userId).runtime_commands!.length !== before;
}

export function acknowledgeDeployCommand(
  commandId: string,
  sessionId: string,
  generation: number,
  userId?: string,
): 'ok' | 'duplicate' | 'stale' {
  const command = (resolveStore(userId).runtime_commands || []).find(c => c.id === commandId);
  if (!command || command.generation !== generation || command.lease?.sessionId !== sessionId) return 'stale';
  if (command.ackedAt) return 'duplicate';
  command.ackedAt = new Date().toISOString();
  return 'ok';
}

/** Compatibility adapter for SDK v1, whose ACK only identifies a worker. */
export function acknowledgeLegacyDeploy(workerId: string, generation: number, userId?: string): void {
  const command = (resolveStore(userId).runtime_commands || []).find(
    c => c.workerId === workerId && c.generation === generation && !c.ackedAt,
  );
  if (command) command.ackedAt = new Date().toISOString();
}

/** Requeue a worker's desired execution after a new Code Server claims it. */
export function enqueueWorkerExecution(
  worker: {
    id: string;
    current_node: string;
    deployConfig?: any;
    generation?: number;
    executionToken?: string;
    holding?: any[];
  },
  userId?: string,
): boolean {
  const config = worker.deployConfig;
  if (!config?.classId || !worker.executionToken) return false;
  enqueueDeploy(
    {
      id: worker.id,
      workerId: worker.id,
      nodeId: worker.current_node,
      classId: config.classId,
      equippedItems: config.equippedItems || {},
      injectedFields: config.injectedFields || {},
      createdAt: new Date().toISOString(),
      generation: worker.generation || 0,
      executionToken: worker.executionToken,
      initialHolding: worker.holding || [],
    },
    userId,
  );
  return true;
}
