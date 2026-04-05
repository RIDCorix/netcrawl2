/**
 * daemon/spawner.ts
 *
 * Spawns and manages worker subprocesses using child_process.fork.
 */

import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ActiveProcess {
  process: ChildProcess;
  workerId: string;
}

const _activeProcesses: Map<string, ActiveProcess> = new Map();

/**
 * Spawn a Node.js worker subprocess.
 * Returns the PID.
 */
export function spawnWorker(
  workerId: string,
  scriptPath: string,
  className: string,
  apiUrl: string,
  injectedFields: Record<string, unknown>,
): number {
  const runnerPath = path.resolve(__dirname, '..', 'runner.js');

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    NETCRAWL_WORKER_ID: workerId,
    NETCRAWL_API_URL: apiUrl,
    NETCRAWL_SCRIPT_PATH: scriptPath,
    NETCRAWL_CLASS_NAME: className,
    NETCRAWL_INJECTED: JSON.stringify(injectedFields),
  };

  const child = fork(runnerPath, [], {
    env,
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
  });

  const pid = child.pid ?? -1;

  _activeProcesses.set(workerId, { process: child, workerId });

  child.on('exit', () => {
    _activeProcesses.delete(workerId);
  });

  if (child.stdout) {
    child.stdout.on('data', (data: Buffer) => {
      process.stdout.write(data);
    });
  }
  if (child.stderr) {
    child.stderr.on('data', (data: Buffer) => {
      process.stderr.write(data);
    });
  }

  console.log(`[spawner] Spawned worker ${workerId} (PID ${pid})`);
  return pid;
}

/**
 * Terminate a running worker process.
 */
export function killWorker(workerId: string): boolean {
  const entry = _activeProcesses.get(workerId);
  if (!entry) {
    return false;
  }

  entry.process.kill('SIGTERM');

  // Force kill after 5 seconds
  const killTimer = setTimeout(() => {
    try {
      entry.process.kill('SIGKILL');
    } catch {
      // Already dead
    }
  }, 5000);

  entry.process.on('exit', () => {
    clearTimeout(killTimer);
  });

  _activeProcesses.delete(workerId);
  console.log(`[spawner] Killed worker ${workerId}`);
  return true;
}

/**
 * Returns 'running', 'stopped', 'crashed', or 'unknown'.
 */
export function getWorkerStatus(workerId: string): string {
  const entry = _activeProcesses.get(workerId);
  if (!entry) {
    return 'unknown';
  }

  if (entry.process.exitCode === null && !entry.process.killed) {
    return 'running';
  } else if (entry.process.exitCode === 0) {
    return 'stopped';
  } else {
    return 'crashed';
  }
}

export function listActive(): Array<{ workerId: string; pid: number; status: string }> {
  return Array.from(_activeProcesses.entries()).map(([wid, entry]) => ({
    workerId: wid,
    pid: entry.process.pid ?? -1,
    status: getWorkerStatus(wid),
  }));
}
