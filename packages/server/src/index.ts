import express, { Express } from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import { initDb, getGameState, getVisibleState, getWorkers, setLevelBroadcast, getPlayerLevelSummary, setDataDir } from './db.js';
import { initWebSocket, broadcast } from './websocket.js';
import { router } from './routes.js';
import { startGameTick } from './gameTick.js';

export interface ServerOptions {
  port?: number;
  dataDir?: string;
  staticDir?: string;
}

export async function startServer(options: ServerOptions = {}): Promise<{
  server: http.Server;
  app: Express;
  port: number;
}> {
  const port = options.port ?? (Number(process.env.PORT) || 4800);

  if (options.dataDir) {
    setDataDir(options.dataDir);
  }

  const app: Express = express();

  // Middleware
  app.use(cors({ origin: true }));
  app.use(express.json());

  // Routes
  app.use('/api', router);

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
  setLevelBroadcast(broadcast);
  console.log('[NetCrawl Server] Database initialized');

  // Create HTTP server for WebSocket
  const server = http.createServer(app);
  const wss = initWebSocket(server);

  // Send visible state on WS connect
  wss.on('connection', (ws: any) => {
    const state = getGameState();
    const { nodes, edges } = getVisibleState(2);
    const workers = getWorkers();
    ws.send(JSON.stringify({ type: 'STATE_UPDATE', payload: { ...state, nodes, edges, workers, levelSummary: getPlayerLevelSummary() } }));
  });

  // Start game tick
  startGameTick();

  // Start server
  return new Promise((resolve) => {
    server.listen(port, () => {
      const actualPort = (server.address() as any).port;
      console.log(`[NetCrawl Server] Running on http://localhost:${actualPort}`);
      console.log(`[NetCrawl Server] WebSocket on ws://localhost:${actualPort}/ws`);
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
