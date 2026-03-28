// This runs as a child process forked by workerSpawner
// It dynamically imports and runs a user's worker class

const workerId = process.env.NETCRAWL_WORKER_ID!;
const apiUrl = process.env.NETCRAWL_API_URL!;
const className = process.env.NETCRAWL_CLASS!;
const scriptPath = process.env.NETCRAWL_SCRIPT!;

if (!workerId || !apiUrl || !className || !scriptPath) {
  console.error('[Runner] Missing required environment variables');
  process.exit(1);
}

async function postAction(action: string, payload: any = {}) {
  const res = await fetch(`${apiUrl}/api/worker/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workerId, action, payload }),
  });
  if (!res.ok) {
    throw new Error(`Action ${action} failed: ${res.statusText}`);
  }
  return res.json();
}

const api = {
  async move(nodeId: string) {
    const result = await postAction('move', { targetNodeId: nodeId }) as any;
    if (!result.ok) throw new Error(result.error || 'Move failed');
    const travelTime = result.travelTime || 1000;
    await new Promise(r => setTimeout(r, travelTime));
  },

  async harvest() {
    const result = await postAction('harvest') as any;
    if (!result.ok) throw new Error(result.error || 'Harvest failed');
    return result.harvested;
  },

  async deposit() {
    const result = await postAction('deposit') as any;
    if (!result.ok) throw new Error(result.error || 'Deposit failed');
    return result.deposited;
  },

  async scan() {
    const result = await postAction('scan') as any;
    if (!result.ok) throw new Error(result.error || 'Scan failed');
    return result.nodes || [];
  },

  async repair(nodeId: string) {
    const result = await postAction('repair', { nodeId }) as any;
    if (!result.ok) throw new Error(result.error || 'Repair failed');
    return result;
  },

  async findPath(from: string, to: string) {
    const result = await postAction('findPath', { from, to }) as any;
    if (!result.ok) throw new Error(result.error || 'FindPath failed');
    return result.path || [];
  },

  log(msg: string) {
    console.log(`[Worker ${workerId}] ${msg}`);
    postAction('log', { message: msg }).catch(() => {});
  },

  async getResources() {
    const result = await postAction('getResources') as any;
    if (!result.ok) throw new Error(result.error || 'GetResources failed');
    return result.resources;
  },
};

async function main() {
  console.log(`[Runner] Starting worker ${workerId} (class: ${className})`);
  console.log(`[Runner] Loading script: ${scriptPath}`);

  try {
    // Use require for CommonJS
    const mod = require(scriptPath);
    const WorkerClass = mod[className] || mod.default?.[className];

    if (!WorkerClass) {
      throw new Error(`Class "${className}" not exported from ${scriptPath}`);
    }

    const instance = new WorkerClass();
    console.log(`[Runner] Instantiated ${className}, calling run(api)`);
    await instance.run(api);
    console.log(`[Runner] Worker ${workerId} run() completed`);
  } catch (err) {
    console.error(`[Runner] Fatal error:`, err);
    process.exit(1);
  }
}

main();
