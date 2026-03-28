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

export function broadcast(data: any) {
  if (!wss) return;
  const message = JSON.stringify(data);
  wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

export function sendToClient(ws: WebSocket, data: any) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}
