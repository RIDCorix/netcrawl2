import { WebSocket, WebSocketServer } from 'ws';
import http from 'http';

let wss: WebSocketServer | null = null;

export function initWebSocket(server: http.Server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    console.log('[WS] Client connected');

    ws.on('close', () => {
      console.log('[WS] Client disconnected');
    });

    ws.on('error', (err) => {
      console.error('[WS] Error:', err.message);
    });
  });

  return wss;
}

/**
 * Broadcast to all connected clients.
 * In multi-user mode, only sends to the current user's connections.
 */
export function broadcast(data: any, userId?: string) {
  if (!wss) return;
  const message = JSON.stringify(data);
  const isMultiUser = process.env.NETCRAWL_MULTI_USER === 'true';

  wss.clients.forEach((client: any) => {
    if (client.readyState !== WebSocket.OPEN) return;

    if (isMultiUser && userId) {
      // Only send to this specific user's connections
      if (client._userId === userId) {
        client.send(message);
      }
    } else if (isMultiUser && !userId) {
      // No userId specified in multi-user mode — skip (caller should provide userId)
      // Fallback: don't send to avoid leaking state
    } else {
      // Single-user mode: send to everyone
      client.send(message);
    }
  });
}

export function sendToClient(ws: WebSocket, data: any) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}
