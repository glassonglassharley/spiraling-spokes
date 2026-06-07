import { WebSocket } from 'ws';
import type { WSMessage } from '../shared/types';

// Global client set — populated by websocket.ts
const clients = new Set<WebSocket>();

export function registerClient(ws: WebSocket): void {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
}

export function getClientCount(): number {
  return clients.size;
}

export async function broadcastToClients(message: WSMessage): Promise<void> {
  const payload = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}
