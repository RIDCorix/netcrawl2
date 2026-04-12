/**
 * Per-worker action serialization lock.
 * Each worker can only execute one action at a time.
 */

const workerLocks = new Map<string, Promise<void>>();

export async function acquireLock(workerId: string): Promise<void> {
  while (workerLocks.has(workerId)) {
    await workerLocks.get(workerId);
  }
}

export function setLock(workerId: string, durationMs: number): void {
  const p = new Promise<void>(resolve => setTimeout(resolve, durationMs));
  workerLocks.set(workerId, p);
  p.then(() => workerLocks.delete(workerId));
}

export function getLock(workerId: string): Promise<void> | undefined {
  return workerLocks.get(workerId);
}
