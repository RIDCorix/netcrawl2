import { fork, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { upsertWorker, deleteWorker, getWorker, getWorkers } from './db.js';
import { broadcast } from './websocket.js';
import { getGameState } from './db.js';

const activeProcesses = new Map<string, ChildProcess>();

function broadcastFullState() {
  const state = getGameState();
  broadcast({ type: 'STATE_UPDATE', payload: { ...state, workers: getWorkers() } });
}

export function getActiveProcesses() {
  return activeProcesses;
}

export async function spawnWorker(options: {
  workerId: string;
  nodeId: string;
  className: string;
  commitHash: string;
  workspacePath: string;
}): Promise<{ ok: boolean; error?: string; pid?: number }> {
  const { workerId, nodeId, className, commitHash, workspacePath } = options;

  // Resolve the worker script path
  const workersDir = path.join(workspacePath, 'workers');
  if (!fs.existsSync(workersDir)) {
    return { ok: false, error: `Workers directory not found: ${workersDir}` };
  }

  // Find the file containing the class
  const files = fs.readdirSync(workersDir).filter(f => f.endsWith('.js') || f.endsWith('.mjs'));
  let scriptPath: string | null = null;

  for (const file of files) {
    const content = fs.readFileSync(path.join(workersDir, file), 'utf-8');
    if (content.includes(`class ${className}`)) {
      scriptPath = path.join(workersDir, file);
      break;
    }
  }

  if (!scriptPath) {
    return { ok: false, error: `Class "${className}" not found in workspace/workers/` };
  }

  // Path to the worker runner
  const runnerPath = path.join(__dirname, 'workerRunner.js');
  if (!fs.existsSync(runnerPath)) {
    return { ok: false, error: `Worker runner not found at ${runnerPath}` };
  }

  // Store initial worker record with 'deploying' status
  upsertWorker({
    id: workerId,
    node_id: nodeId,
    class_name: className,
    commit_hash: commitHash,
    status: 'deploying',
    current_node: nodeId,
    carrying: {},
    pid: null,
    deployed_at: new Date().toISOString(),
  });

  // Fork child process
  const child = fork(runnerPath, [], {
    env: {
      ...process.env,
      NETCRAWL_WORKER_ID: workerId,
      NETCRAWL_API_URL: 'http://localhost:3001',
      NETCRAWL_CLASS: className,
      NETCRAWL_SCRIPT: scriptPath,
    },
    cwd: workspacePath,
    silent: false,
  });

  activeProcesses.set(workerId, child);

  // Update PID in DB and set to 'running'
  if (child.pid) {
    upsertWorker({
      id: workerId,
      node_id: nodeId,
      class_name: className,
      commit_hash: commitHash,
      status: 'running',
      current_node: nodeId,
      carrying: {},
      pid: child.pid,
      deployed_at: new Date().toISOString(),
    });
  }

  child.on('exit', (code) => {
    console.log(`[Spawner] Worker ${workerId} exited with code ${code}`);
    activeProcesses.delete(workerId);
    const w = getWorker(workerId);
    if (w) {
      const status = code === 0 ? 'suspended' : 'crashed';
      upsertWorker({ ...w, status, pid: null });
      broadcastFullState();
    }
  });

  child.on('error', (err) => {
    console.error(`[Spawner] Worker ${workerId} error:`, err.message);
  });

  return { ok: true, pid: child.pid };
}

export function killWorker(workerId: string): { ok: boolean; error?: string } {
  const child = activeProcesses.get(workerId);
  if (!child) {
    return { ok: false, error: 'Worker process not found' };
  }
  child.kill('SIGTERM');
  activeProcesses.delete(workerId);
  deleteWorker(workerId);
  return { ok: true };
}

export function suspendWorker(workerId: string): { ok: boolean; error?: string } {
  const child = activeProcesses.get(workerId);
  if (!child) {
    return { ok: false, error: 'Worker process not found' };
  }
  // On Windows child.kill() terminates the process; on Unix it sends SIGTERM
  // The Python runner handles SIGTERM/SIGINT and exits cleanly with code 0
  child.kill();
  return { ok: true };
}
