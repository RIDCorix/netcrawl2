import { fork, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { upsertWorker, deleteWorker, getWorker, addToPlayerInventory } from './db.js';
import { broadcastFullState } from './broadcastHelper.js';

const activeProcesses = new Map<string, ChildProcess>();

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
  equippedCpu?: { itemType: string; computePoints: number; count: number } | null;
  equippedRam?: { itemType: string; capacityBonus: number; count: number } | null;
  injectedFields?: Record<string, any>;
}): Promise<{ ok: boolean; error?: string; pid?: number }> {
  const { workerId, nodeId, className, commitHash, workspacePath, equippedPickaxe, equippedCpu, equippedRam, injectedFields } = options;

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
    class_icon: 'Bot',
    commit_hash: commitHash,
    status: 'deploying',
    current_node: nodeId,
    carrying: {},
    pid: null,
    deployed_at: new Date().toISOString(),
    holding: [],
    equippedPickaxe: equippedPickaxe || null,
    equippedCpu: equippedCpu || null,
    equippedRam: equippedRam || null,
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
        NETCRAWL_API_URL: `http://localhost:${process.env.PORT || 4800}`,
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
        NETCRAWL_API_URL: `http://localhost:${process.env.PORT || 4800}`,
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
      class_icon: 'Bot',
      commit_hash: commitHash,
      status: 'running',
      current_node: nodeId,
      carrying: {},
      pid: child.pid,
      deployed_at: new Date().toISOString(),
      holding: [],
      equippedPickaxe: equippedPickaxe || null,
      equippedCpu: equippedCpu || null,
      equippedRam: equippedRam || null,
    });
  }

  child.on('exit', (code) => {
    console.log(`[Spawner] Worker ${workerId} exited with code ${code}`);
    activeProcesses.delete(workerId);
    const w = getWorker(workerId);
    if (w) {
      // If already in 'error' status (reported by worker before exit), don't overwrite
      if (w.status === 'error') {
        broadcastFullState();
        return;
      }
      // Return equipped items to player inventory on exit
      if (w.equippedPickaxe) addToPlayerInventory(w.equippedPickaxe.itemType, 1);
      if (w.equippedCpu) addToPlayerInventory(w.equippedCpu.itemType, w.equippedCpu.count);
      if (w.equippedRam) addToPlayerInventory(w.equippedRam.itemType, w.equippedRam.count);
      for (const item of (w.holding || [])) {
        addToPlayerInventory(item.type, item.count);
      }
      const status = code === 0 ? 'suspended' : 'crashed';
      upsertWorker({ ...w, status, pid: null, equippedPickaxe: null, equippedCpu: null, equippedRam: null, holding: [] });
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
