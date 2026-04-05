/**
 * app.ts
 *
 * NetCrawl code server -- registers worker classes with the game server,
 * polls for deploy requests, and spawns worker subprocesses.
 */

import { httpPost, httpGet } from './client.js';
import { WorkerClass } from './base.js';
import { spawnWorker, killWorker, listActive } from './daemon/spawner.js';

type WorkerClassConstructor = typeof WorkerClass & {
  new (workerId: string, apiUrl: string, injectedFields: Record<string, unknown>): WorkerClass;
};

export class NetCrawl {
  private server: string;
  private apiKey: string;
  private _classes: Map<string, WorkerClassConstructor> = new Map();
  private _classFiles: Map<string, string> = new Map();

  constructor(server: string = 'http://localhost:4800', apiKey: string = '') {
    this.server = server.replace(/\/+$/, '');
    this.apiKey = apiKey;
  }

  /**
   * Register a worker class for deployment. Raises on duplicate classId.
   */
  register(cls: WorkerClassConstructor, filePath?: string): void {
    const classId = cls.classId || cls.name.toLowerCase();
    const className = cls.className || cls.name;

    if (this._classes.has(classId)) {
      const existing = this._classes.get(classId)!;
      throw new Error(
        `Duplicate classId '${classId}': ${cls.name} conflicts with ${existing.name}`
      );
    }

    this._classes.set(classId, cls);

    // Try to determine source file
    const sourceFile = filePath ?? '';
    this._classFiles.set(classId, sourceFile);
    console.log(`[NetCrawl] Registered: ${className} (id=${classId})`);
  }

  private async _post(path: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return httpPost(`${this.server}${path}`, data);
  }

  private async _get(path: string): Promise<Record<string, unknown>> {
    return httpGet(`${this.server}${path}`);
  }

  private async _registerAll(): Promise<void> {
    const classes: Record<string, unknown>[] = [];
    for (const [classId, cls] of this._classes.entries()) {
      const schema = cls.getSchema() as Record<string, unknown>;
      schema['file'] = this._classFiles.get(classId) ?? '';
      schema['language'] = 'javascript';
      classes.push(schema);
    }

    const result = await this._post('/api/worker-classes/register', { classes });
    if (result['ok']) {
      console.log(`[NetCrawl] Registered ${result['registered'] ?? 0} worker classes`);
    } else {
      console.log(`[NetCrawl] Registration failed: ${result['error']}`);
    }
  }

  private async _pollDeployQueue(): Promise<void> {
    try {
      const result = await this._get('/api/deploy-queue');
      const requests = (result['requests'] as Record<string, unknown>[]) ?? [];
      for (const req of requests) {
        await this._handleDeploy(req);
      }
    } catch {
      // Server might be temporarily unreachable
    }
  }

  private async _handleDeploy(deployReq: Record<string, unknown>): Promise<void> {
    const workerId = deployReq['workerId'] as string;
    const classId = deployReq['classId'] as string;
    const nodeId = deployReq['nodeId'] as string;
    const injectedFields = (deployReq['injectedFields'] as Record<string, unknown>) ?? {};

    const cls = this._classes.get(classId);
    if (!cls) {
      console.log(`[NetCrawl] Unknown classId: ${classId}`);
      await this._post('/api/deploy-ack', {
        workerId,
        error: `Unknown worker classId: ${classId}`,
      });
      return;
    }

    const scriptPath = this._classFiles.get(classId) ?? '';
    const className = cls.className || cls.name;
    console.log(`[NetCrawl] Spawning ${className} (id=${classId}, worker=${workerId}) on node ${nodeId}`);

    try {
      const pid = spawnWorker(
        workerId,
        scriptPath,
        cls.name,
        this.server,
        injectedFields,
      );
      console.log(`[NetCrawl] Spawned ${className} -- PID ${pid}`);
      await this._post('/api/deploy-ack', { workerId, pid });
    } catch (e: unknown) {
      console.log(`[NetCrawl] Spawn failed: ${e}`);
      await this._post('/api/deploy-ack', {
        workerId,
        error: String(e),
      });
    }
  }

  private async _waitForServer(timeout: number = 30000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const result = await this._get('/health');
        if (result['status'] === 'ok') {
          return true;
        }
      } catch {
        // Not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return false;
  }

  /**
   * Start the code server:
   * 1. Wait for the game server
   * 2. Register all worker classes
   * 3. Poll for deploy requests every second
   * 4. Re-register every 30s to handle server restarts
   */
  async run(): Promise<void> {
    console.log('[NetCrawl] Code Server starting...');
    console.log(`[NetCrawl] Server: ${this.server}`);
    const workerList = Array.from(this._classes.entries())
      .map(([cid, cls]) => `${cls.className || cls.name}(${cid})`)
      .join(', ');
    console.log(`[NetCrawl] Workers: ${workerList}`);
    console.log();

    // Wait for server
    console.log('[NetCrawl] Waiting for game server...');
    if (!(await this._waitForServer())) {
      console.log('[NetCrawl] ERROR: Game server not reachable. Is it running?');
      return;
    }

    console.log('[NetCrawl] Game server connected!');
    await this._registerAll();

    console.log();
    console.log('[NetCrawl] Code server running. Polling for deploy requests...');
    console.log('[NetCrawl] Press Ctrl+C to stop.');

    let registerCounter = 0;

    const shutdown = () => {
      console.log('\n[NetCrawl] Shutting down...');
      for (const u of listActive()) {
        killWorker(u.workerId);
      }
      console.log('[NetCrawl] All workers stopped. Goodbye!');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    while (true) {
      await this._pollDeployQueue();
      await new Promise(resolve => setTimeout(resolve, 1000));

      registerCounter += 1;
      if (registerCounter >= 30) {
        registerCounter = 0;
        await this._registerAll();
      }
    }
  }
}
