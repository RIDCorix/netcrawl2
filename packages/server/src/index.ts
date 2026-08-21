import express, { Express } from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import { initDb, setDataDir, setCurrentUser } from './store.js';
import { getGameState, getVisibleState } from './domain/gameState.js';
import { getWorkers, resetAllWorkers } from './domain/workers.js';
import { setLevelBroadcast, getPlayerLevelSummary } from './domain/level.js';
import { initWebSocket, broadcast } from './websocket.js';
import { router } from './routes/index.js';
import { startGameTick } from './gameTick.js';
import { initUserStore, setAuthDataDir, verifyToken } from './auth.js';
import { CiWatchdog } from './ciWatchdog.js';

export interface ServerOptions {
  port?: number;
  dataDir?: string;
  staticDir?: string;
  ciWatchdog?: CiWatchdog;
}

/** Browser-hosted VS Code/Codespaces extensions use fetch and therefore need CORS. */
export function isAllowedWebOrigin(origin: string, configured: readonly string[] = []) {
  if (configured.includes(origin)) return true;
  try {
    const url = new URL(origin);
    if (url.protocol === 'vscode-webview:') return true;
    if (url.protocol !== 'https:') return false;
    return (
      url.hostname === 'vscode.dev' ||
      url.hostname.endsWith('.vscode.dev') ||
      url.hostname.endsWith('.github.dev') ||
      url.hostname.endsWith('.app.github.dev') ||
      url.hostname.endsWith('.vscode-cdn.net')
    );
  } catch {
    return false;
  }
}

export async function startServer(options: ServerOptions = {}): Promise<{
  server: http.Server;
  app: Express;
  port: number;
}> {
  const port = options.port ?? (Number(process.env.PORT) || 4800);

  if (options.dataDir) {
    setDataDir(options.dataDir);
    setAuthDataDir(options.dataDir);
  }

  // Initialize user store for multi-user mode
  if (process.env.NETCRAWL_MULTI_USER === 'true') {
    initUserStore();
    console.log('[NetCrawl Server] Multi-user mode enabled');
  }

  const app: Express = express();
  const ciWatchdog = options.ciWatchdog ?? new CiWatchdog({ enabled: process.env.NETCRAWL_CI_WATCHDOG === 'true' });

  // Middleware
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',')
    .map(s => s.trim())
    .filter(Boolean);
  app.use(
    cors({
      origin: allowedOrigins?.length
        ? (origin, callback) => callback(null, !origin || isAllowedWebOrigin(origin, allowedOrigins))
        : true,
      credentials: true,
    }),
  );
  app.use(express.json());

  // Routes
  app.use('/api', router);

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/health/ci-watchdog', (_req, res) => {
    const health = ciWatchdog.getHealth();
    res.setHeader('Cache-Control', 'no-store');
    res.status(health.statusCode).json(health.body);
  });

  // Serve static UI files (for Electron / production)
  if (options.staticDir) {
    app.use(express.static(options.staticDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(options.staticDir!, 'index.html'));
    });
  }

  // Initialize DB
  initDb();
  resetAllWorkers();
  setLevelBroadcast(broadcast);
  console.log('[NetCrawl Server] Database initialized');

  // Create HTTP server for WebSocket
  const server = http.createServer(app);
  server.on('close', () => ciWatchdog.stop());
  const wss = initWebSocket(server);

  // Send visible state on WS connect
  wss.on('connection', (ws: any, req: any) => {
    const isMultiUser = process.env.NETCRAWL_MULTI_USER === 'true';
    let userId: string | undefined;

    if (isMultiUser) {
      // Extract token from query parameter: ws://host/ws?token=xxx
      const url = new URL(req.url, `http://${req.headers.host}`);
      const token = url.searchParams.get('token');
      if (!token) {
        ws.close(4001, 'Authentication required');
        return;
      }
      const payload = verifyToken(token);
      if (!payload) {
        ws.close(4001, 'Invalid or expired token');
        return;
      }
      // Scope this connection to the authenticated user
      userId = payload.userId;
      (ws as any)._userId = userId;
      setCurrentUser(userId);
    }

    // Pass explicit userId to avoid race conditions with global state
    const state = getGameState(userId);
    const { nodes, edges } = getVisibleState(2, userId);
    const workers = getWorkers(userId);
    ws.send(
      JSON.stringify({
        type: 'STATE_UPDATE',
        payload: { ...state, nodes, edges, workers, levelSummary: getPlayerLevelSummary(userId) },
      }),
    );
  });

  // Start game tick
  startGameTick();

  // Start server
  return new Promise(resolve => {
    server.listen(port, () => {
      const actualPort = (server.address() as any).port;
      console.log(`[NetCrawl Server] Running on http://localhost:${actualPort}`);
      console.log(`[NetCrawl Server] WebSocket on ws://localhost:${actualPort}/ws`);
      ciWatchdog.start();
      resolve({ server, app, port: actualPort });
    });
  });
}

// Run directly when executed as a standalone script (not bundled or imported)
// Skip auto-start when bundled by esbuild (NETCRAWL_BUNDLED is set by the build script)
if (!process.env.NETCRAWL_BUNDLED && (require.main === module || !module.parent)) {
  startServer().catch(err => {
    console.error('[NetCrawl Server] Fatal error:', err);
    process.exit(1);
  });
}

export default startServer;
