import express, { Express } from 'express';
import cors from 'cors';
import http from 'http';
import { initDb, getGameState, getWorkers } from './db.js';
import { initWebSocket, broadcast } from './websocket.js';
import { router } from './routes.js';
import { startGameTick } from './gameTick.js';

const app: Express = express();
const PORT = process.env.PORT || 4800;

// Middleware
app.use(cors({ origin: true }));
app.use(express.json());

// Routes
app.use('/api', router);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

async function main() {
  // Initialize DB first (sync)
  initDb();
  console.log('[NetCrawl Server] Database initialized');

  // Create HTTP server for WebSocket
  const server = http.createServer(app);
  const wss = initWebSocket(server);

  // Send full state on WS connect
  wss.on('connection', (ws: any) => {
    const state = getGameState();
    const workers = getWorkers();
    ws.send(JSON.stringify({ type: 'STATE_UPDATE', payload: { ...state, workers } }));
  });

  // Start game tick
  startGameTick();

  // Start server
  server.listen(PORT, () => {
    console.log(`[NetCrawl Server] Running on http://localhost:${PORT}`);
    console.log(`[NetCrawl Server] WebSocket on ws://localhost:${PORT}/ws`);
  });
}

main().catch(err => {
  console.error('[NetCrawl Server] Fatal error:', err);
  process.exit(1);
});

export default app;
