import { fork, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { upsertWorker, deleteWorker, getWorker, getWorkers, addToPlayerInventory } from './db.js';
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
  equippedPickaxe?: { itemType: string; efficiency: number } | null;
  injectedFields?: Record<string, any>;
}): Promise<{ ok: boolean; error?: string; pid?: number }> {
  const { workerId, nodeId, className, commitHash, workspacePath, equippedPickaxe, injectedFields } = options;

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

  // Also check Python files
  const pyFiles = fs.readdirSync(workersDir).filter(f => f.endsWith('.py'));
  if (!scriptPath) {
    for (const file of pyFiles) {
      const content = fs.readFileSync(path.join(workersDir, file), 'utf-8');
      if (content.includes(`class ${className}`)) {
        scriptPath = path.join(workersDir, file);
        break;
      }
    }
  }

  if (!scriptPath) {
    return { ok: false, error: `Class "${className}" not found in workspace/workers/` };
  }

  const isPython = scriptPath.endsWith('.py');

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
    holding: null,
    equippedPickaxe: equippedPickaxe || null,
  });

  let child: ChildProcess;

  if (isPython) {
    const { spawn } = await import('child_process');
    const injected = injectedFields || {};
    if (equippedPickaxe) {
      injected['pickaxe'] = { itemType: equippedPickaxe.itemType, efficiency: equippedPickaxe.efficiency };
    }

    child = spawn('python', ['-m', 'netcrawl.runner'], {
      env: {
        ...process.env,
        NETCRAWL_WORKER_ID: workerId,
        NETCRAWL_API_URL: 'http://localhost:3001',
        NETCRAWL_CLASS_NAME: className,
        NETCRAWL_SCRIPT_PATH: scriptPath,
        NETCRAWL_INJECTED: JSON.stringify(injected),
      },
      cwd: workspacePath,
      stdio: 'inherit',
    });
  } else {
    // Path to the worker runner
    const runnerPath = path.join(__dirname, 'workerRunner.js');
    if (!fs.existsSync(runnerPath)) {
      return { ok: false, error: `Worker runner not found at ${runnerPath}` };
    }

    const injected = injectedFields || {};
    if (equippedPickaxe) {
      injected['pickaxe'] = { itemType: equippedPickaxe.itemType, efficiency: equippedPickaxe.efficiency };
    }

    child = fork(runnerPath, [], {
      env: {
        ...process.env,
        NETCRAWL_WORKER_ID: workerId,
        NETCRAWL_API_URL: 'http://localhost:3001',
        NETCRAWL_CLASS: className,
        NETCRAWL_SCRIPT: scriptPath,
        NETCRAWL_INJECTED: JSON.stringify(injected),
      },
      cwd: workspacePath,
      silent: false,
    });
  }

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
      holding: null,
      equippedPickaxe: equippedPickaxe || null,
    });
  }

  child.on('exit', (code) => {
    console.log(`[Spawner] Worker ${workerId} exited with code ${code}`);
    activeProcesses.delete(workerId);
    const w = getWorker(workerId);
    if (w) {
      // Return equipped items to player inventory on exit
      if (w.equippedPickaxe) {
        addToPlayerInventory(w.equippedPickaxe.itemType, 1);
      }
      if (w.holding) {
        addToPlayerInventory(w.holding.type, w.holding.amount);
      }
      const status = code === 0 ? 'suspended' : 'crashed';
      upsertWorker({ ...w, status, pid: null, equippedPickaxe: null, holding: null });
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
