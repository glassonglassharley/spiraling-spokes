import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { Server } from 'http';
import { registerClient, broadcastToClients } from './broadcast';

const LIVE_MODE = process.env.LIVE_MODE === 'true';

export function createWebSocketServer(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', async (ws: WebSocket, _req: IncomingMessage) => {
    registerClient(ws);

    if (LIVE_MODE) {
      try {
        const { incrementViewerCount } = await import('../shared/redis/client');
        const count = await incrementViewerCount();
        await broadcastToClients({ type: 'VIEWER_COUNT', payload: { count } });
      } catch {
        // Redis unavailable — skip viewer count in live mode
      }

      try {
        const { getRiderState } = await import('../shared/redis/client');
        const state = await getRiderState();
        ws.send(JSON.stringify({ type: 'INIT', payload: state }));
      } catch {
        ws.send(JSON.stringify({ type: 'INIT', payload: null }));
      }
    } else {
      // Mock mode: send a static INIT so the client gets an immediate response
      ws.send(JSON.stringify({ type: 'INIT', payload: null }));
    }

    ws.on('close', async () => {
      if (LIVE_MODE) {
        try {
          const { decrementViewerCount } = await import('../shared/redis/client');
          const newCount = await decrementViewerCount();
          await broadcastToClients({ type: 'VIEWER_COUNT', payload: { count: newCount } });
        } catch {
          // Redis unavailable
        }
      }
    });

    ws.on('message', async (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        await handleClientMessage(msg, ws);
      } catch (err) {
        console.error('[WS] Failed to parse message:', err);
      }
    });

    ws.on('error', (err) => {
      console.error('[WS] Client error:', err.message);
    });
  });

  console.log('[WebSocket] Server attached to HTTP server at /ws');
  return wss;
}

async function handleClientMessage(
  msg: { type: string; payload?: Record<string, unknown> },
  ws: WebSocket
): Promise<void> {
  switch (msg.type) {
    case 'CHAT': {
      if (!LIVE_MODE) {
        // In mock mode, reflect the message back as a broadcast
        const { username, message } = msg.payload as { username: string; message: string };
        if (!message?.trim()) return;
        await broadcastToClients({
          type: 'CHAT_MESSAGE',
          payload: { username: username ?? 'viewer', message: message.slice(0, 500), source: 'platform' },
        });
        return;
      }

      const { username, message, tripId } = msg.payload as {
        username: string;
        message: string;
        tripId: string;
      };

      if (!message?.trim()) return;

      try {
        const { execute, query } = await import('../shared/db/client');
        await execute(
          `INSERT INTO chat_messages (trip_id, username, source, message) VALUES ($1, $2, 'platform', $3)`,
          [tripId, username ?? 'anonymous', message.slice(0, 500)]
        );
        const rows = await query<{ id: string; created_at: string }>(
          `SELECT id, created_at FROM chat_messages WHERE trip_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [tripId]
        );
        const row = rows[0];
        await broadcastToClients({
          type: 'CHAT_MESSAGE',
          payload: { username, message, source: 'platform', createdAt: row?.created_at },
        });
      } catch (err) {
        console.error('[WS] Chat insert failed:', err);
      }
      break;
    }

    case 'PING':
      ws.send(JSON.stringify({ type: 'PONG' }));
      break;

    default:
      break;
  }
}
