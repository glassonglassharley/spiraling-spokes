import * as dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from 'express';
import cors from 'cors';
import * as http from 'http';
import * as os from 'os';
import * as cron from 'node-cron';
import { createWebSocketServer } from './websocket';
import { getClientCount, broadcastToClients } from './broadcast';
import {
  mockChatMessages,
  mockLeaderboard,
  mockSceneLibrary,
  sceneToFramePayload,
  sceneToRiderState,
  commentaryForScene,
} from '../shared/mock/demo';

const PORT = parseInt(process.env.PORT ?? '8080', 10);
const FRAME_INTERVAL_MS = parseInt(process.env.FRAME_INTERVAL_MS ?? '3000', 10);
const FRAME_INTERVAL_SECONDS = Math.max(1, Math.round(FRAME_INTERVAL_MS / 1000));
const LIVE_MODE = process.env.LIVE_MODE === 'true';

const app = express();
let mockWaypointIndex = 0;
let mockPaused = false;
let mockSpeedMultiplier = 1;
let mockChatIdx = 0;

function currentMockScene() {
  return mockSceneLibrary[Math.abs(mockWaypointIndex) % mockSceneLibrary.length];
}

function currentMockState() {
  return {
    ...sceneToRiderState(currentMockScene(), 'mock-trip', mockWaypointIndex),
    is_paused: mockPaused,
    pause_reason: mockPaused ? 'manual' : null,
    speed_multiplier: mockSpeedMultiplier,
  };
}

async function broadcastMockFrame() {
  const scene = currentMockScene();
  await broadcastToClients({ type: 'NEW_FRAME', payload: sceneToFramePayload(scene) });
  await broadcastToClients({
    type: 'COMMENTARY',
    payload: { text: commentaryForScene(scene, mockChatMessages, mockWaypointIndex), mode: 'mock' },
  });
  if (scene.isMilestone) {
    await broadcastToClients({
      type: 'MILESTONE',
      payload: { name: scene.milestoneName ?? `Mile ${Math.round(scene.miles)}`, mode: 'mock' },
    });
  }
}

// ─── Middleware ───────────────────────────────────────────────────────────────

// Stripe webhooks need raw body — must be mounted before json middleware
// Only mount in LIVE_MODE to avoid importing Stripe/queues at startup
app.use(cors({ origin: process.env.WEB_ORIGIN ?? '*' }));
app.use(express.json());

// Serve local TTS audio; in mock mode nothing will be generated so tmpdir is fine
let audioStaticDir = os.tmpdir();
app.use('/audio', (req: Request, res: Response, next: express.NextFunction) => {
  express.static(audioStaticDir)(req, res, next);
});

// ─── REST API ─────────────────────────────────────────────────────────────────

app.get('/api/state', async (_req: Request, res: Response) => {
  if (!LIVE_MODE) {
    res.json(currentMockState());
    return;
  }
  const { getRiderState } = await import('../shared/redis/client');
  const state = await getRiderState();
  res.json(state);
});

app.get('/api/frames', async (req: Request, res: Response) => {
  if (!LIVE_MODE) {
    const limit = parseInt(String(req.query.limit ?? '20'), 10);
    res.json(
      mockSceneLibrary
        .slice(0, limit)
        .map((scene, i) => ({
          id: `mock-frame-${i}`,
          trip_id: 'mock-trip',
          image_url: scene.image,
          captured_at: new Date(Date.now() - i * 8000).toISOString(),
          ...sceneToFramePayload(scene),
        }))
    );
    return;
  }
  const { tripId, limit = '20' } = req.query as Record<string, string>;
  const { query } = await import('../shared/db/client');
  const rows = await query(`SELECT * FROM frames WHERE trip_id = $1 ORDER BY captured_at DESC LIMIT $2`, [
    tripId,
    parseInt(limit, 10),
  ]);
  res.json(rows);
});

app.get('/api/chat', async (req: Request, res: Response) => {
  if (!LIVE_MODE) {
    const limit = parseInt(String(req.query.limit ?? '50'), 10);
    res.json(
      mockChatMessages.slice(0, limit).map((msg, i) => ({
        id: `mock-chat-${i}`,
        created_at: new Date(Date.now() - (mockChatMessages.length - i) * 5000).toISOString(),
        ...msg,
      }))
    );
    return;
  }
  const { tripId, limit = '50' } = req.query as Record<string, string>;
  const { query } = await import('../shared/db/client');
  const rows = await query(
    `SELECT * FROM chat_messages WHERE trip_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [tripId, parseInt(limit, 10)]
  );
  res.json((rows as unknown[]).reverse());
});

app.get('/api/milestones', async (req: Request, res: Response) => {
  if (!LIVE_MODE) {
    res.json(
      mockSceneLibrary
        .filter((s) => s.isMilestone)
        .map((s, i) => ({
          id: `mock-milestone-${i}`,
          trip_id: 'mock-trip',
          type: 'landmark',
          name: s.milestoneName,
          lat: s.lat,
          lng: s.lng,
          waypoint_index: i,
          triggered_at: new Date(Date.now() - i * 60000).toISOString(),
        }))
    );
    return;
  }
  const { tripId } = req.query as Record<string, string>;
  const { query } = await import('../shared/db/client');
  const rows = await query(`SELECT * FROM milestones WHERE trip_id = $1 ORDER BY triggered_at ASC`, [tripId]);
  res.json(rows);
});

app.get('/api/leaderboard', async (_req: Request, res: Response) => {
  if (!LIVE_MODE) {
    res.json(mockLeaderboard);
    return;
  }
  const { query } = await import('../shared/db/client');
  const rows = await query(
    `SELECT username, SUM(amount_cents) as total_cents FROM tips t JOIN users u ON u.id = t.user_id
     WHERE t.status = 'completed' GROUP BY username ORDER BY total_cents DESC LIMIT 5`,
    []
  );
  res.json(rows);
});

app.get('/api/votes/active', async (req: Request, res: Response) => {
  if (!LIVE_MODE) {
    res.json({
      id: 'mock-vote',
      question: 'What should AXLE pretend to investigate next?',
      option_a: 'Questionable diner',
      option_b: 'Suspiciously photogenic bridge',
      votes_a: 38,
      votes_b: 42,
      status: 'open',
    });
    return;
  }
  const { tripId } = req.query as Record<string, string>;
  const { queryOne } = await import('../shared/db/client');
  const vote = await queryOne(
    `SELECT * FROM votes WHERE trip_id = $1 AND status = 'open' ORDER BY created_at DESC LIMIT 1`,
    [tripId]
  );
  res.json(vote);
});

app.post('/api/votes/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { choice } = req.body as { choice: 'a' | 'b' };
  if (!['a', 'b'].includes(choice)) {
    res.status(400).json({ error: 'Invalid choice' });
    return;
  }
  if (!LIVE_MODE) {
    const vote = {
      id,
      question: 'Mock vote recorded locally',
      option_a: 'Questionable diner',
      option_b: 'Suspiciously photogenic bridge',
      votes_a: 38 + (choice === 'a' ? 1 : 0),
      votes_b: 42 + (choice === 'b' ? 1 : 0),
      status: 'open',
    };
    await broadcastToClients({ type: 'VOTE_UPDATE', payload: vote });
    res.json(vote);
    return;
  }
  const col = choice === 'a' ? 'votes_a' : 'votes_b';
  const { query, queryOne } = await import('../shared/db/client');
  await query(`UPDATE votes SET ${col} = ${col} + 1 WHERE id = $1`, [id]);
  const vote = await queryOne(`SELECT * FROM votes WHERE id = $1`, [id]);
  res.json(vote);
});

// ── Email capture ────────────────────────────────────────────────────────────

app.post('/api/emails', async (req: Request, res: Response) => {
  const { email, source = 'companion_site' } = req.body as { email: string; source?: string };
  if (!email?.trim() || !email.includes('@')) { res.status(400).json({ error: 'Invalid email' }); return; }
  if (!LIVE_MODE) {
    console.log(`[Email] Mock capture: ${email} (source: ${source})`);
    res.json({ ok: true, mock: true });
    return;
  }
  try {
    const { execute } = await import('../shared/db/client');
    await execute(
      `INSERT INTO axle_emails (email, source) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING`,
      [email.trim().toLowerCase(), source]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[Email] Insert failed:', err);
    res.status(500).json({ error: 'Failed to save email' });
  }
});

app.get('/api/admin/emails', async (_req: Request, res: Response) => {
  if (!LIVE_MODE) {
    res.json([
      { email: 'preview@example.com', source: 'companion_site', created_at: new Date().toISOString() },
      { email: 'tester@axle.live', source: 'sponsor_page', created_at: new Date(Date.now() - 3600000).toISOString() },
    ]);
    return;
  }
  try {
    const { query } = await import('../shared/db/client');
    const rows = await query(`SELECT email, source, created_at FROM axle_emails ORDER BY created_at DESC LIMIT 500`);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'DB unavailable' });
  }
});

// ── Sponsor endpoints ────────────────────────────────────────────────────────

app.get('/api/sponsors', async (_req: Request, res: Response) => {
  if (!LIVE_MODE) {
    res.json([{ id: 'mock-1', name: 'Trail Mix Co.', tagline: 'Fuel for every mile', trigger_type: 'STATE_ENTRY', trigger_value: 'NM', active: true }]);
    return;
  }
  try {
    const { query } = await import('../shared/db/client');
    res.json(await query(`SELECT * FROM sponsors WHERE active = TRUE ORDER BY created_at DESC`));
  } catch { res.status(500).json({ error: 'DB unavailable' }); }
});

app.post('/api/sponsors', async (req: Request, res: Response) => {
  const { name, tagline, trigger_type, trigger_value, logo_url } = req.body as Record<string, string>;
  if (!LIVE_MODE) {
    const sponsor = { id: `mock-${Date.now()}`, name, tagline, trigger_type, trigger_value, logo_url, active: true };
    await broadcastToClients({ type: 'SPONSOR_ACTIVE', payload: sponsor });
    res.json({ ok: true, sponsor });
    return;
  }
  try {
    const { query } = await import('../shared/db/client');
    const [row] = await query(
      `INSERT INTO sponsors (name, tagline, trigger_type, trigger_value, logo_url) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, tagline, trigger_type, trigger_value, logo_url ?? null]
    );
    res.json({ ok: true, sponsor: row });
  } catch { res.status(500).json({ error: 'DB unavailable' }); }
});

// Admin endpoints
app.post('/api/admin/pause', async (_req: Request, res: Response) => {
  if (!LIVE_MODE) {
    mockPaused = true;
    await broadcastToClients({ type: 'RIDER_PAUSED', payload: { reason: 'manual', mode: 'mock' } });
    res.json({ ok: true, state: currentMockState() });
    return;
  }
  const { getRiderState, setRiderState } = await import('../shared/redis/client');
  const state = await getRiderState();
  if (!state) { res.status(404).json({ error: 'No active rider' }); return; }
  await setRiderState({ ...state, is_paused: true, pause_reason: 'manual' });
  await broadcastToClients({ type: 'RIDER_PAUSED', payload: { reason: 'manual' } });
  res.json({ ok: true });
});

app.post('/api/admin/resume', async (_req: Request, res: Response) => {
  if (!LIVE_MODE) {
    mockPaused = false;
    await broadcastToClients({ type: 'RIDER_RESUMED', payload: { mode: 'mock' } });
    res.json({ ok: true, state: currentMockState() });
    return;
  }
  const { getRiderState, setRiderState } = await import('../shared/redis/client');
  const state = await getRiderState();
  if (!state) { res.status(404).json({ error: 'No active rider' }); return; }
  await setRiderState({ ...state, is_paused: false, pause_reason: null });
  await broadcastToClients({ type: 'RIDER_RESUMED', payload: {} });
  res.json({ ok: true });
});

app.post('/api/admin/speed', async (req: Request, res: Response) => {
  const { multiplier } = req.body as { multiplier: number };
  if (!LIVE_MODE) {
    mockSpeedMultiplier = Number.isFinite(multiplier) ? multiplier : 1;
    res.json({ ok: true, speed_multiplier: mockSpeedMultiplier, state: currentMockState() });
    return;
  }
  const { getRiderState, setRiderState } = await import('../shared/redis/client');
  const state = await getRiderState();
  if (!state) { res.status(404).json({ error: 'No active rider' }); return; }
  await setRiderState({ ...state, speed_multiplier: multiplier });
  res.json({ ok: true, speed_multiplier: multiplier });
});

app.post('/api/admin/skip', async (_req: Request, res: Response) => {
  if (!LIVE_MODE) {
    mockWaypointIndex =
      (mockWaypointIndex + Math.max(1, Math.round(mockSpeedMultiplier))) % mockSceneLibrary.length;
    await broadcastMockFrame();
    res.json({ ok: true, state: currentMockState() });
    return;
  }
  const { advanceAndCapture } = await import('../services/rider/frameAdvancer');
  await advanceAndCapture();
  res.json({ ok: true });
});

app.post('/api/admin/mock-event', async (req: Request, res: Response) => {
  const { type = 'milestone' } = req.body as { type?: string };
  const scene = currentMockScene();
  if (type === 'vote') {
    const vote = {
      id: 'mock-vote',
      question: 'What should AXLE pretend to investigate next?',
      option_a: 'Questionable diner',
      option_b: 'Suspiciously photogenic bridge',
      votes_a: 38,
      votes_b: 42,
      status: 'open',
    };
    await broadcastToClients({ type: 'VOTE_OPEN', payload: vote });
    res.json({ ok: true, vote });
    return;
  }
  if (type === 'tip' || type === 'shoutout') {
    const msg = {
      username: 'mock_tip_bot',
      message: `Simulated $5 shoutout near ${scene.city}. Stripe stayed asleep.`,
      source: 'platform',
      highlighted: true,
    };
    await broadcastToClients({ type: 'CHAT_MESSAGE', payload: msg });
    res.json({ ok: true, message: msg });
    return;
  }
  const name = scene.milestoneName ?? `Mile ${Math.round(scene.miles)}`;
  await broadcastToClients({ type: 'MILESTONE', payload: { name, mode: 'mock' } });
  res.json({ ok: true, milestone: name });
});

// ─── HTTP Server + WebSocket ──────────────────────────────────────────────────

const httpServer = http.createServer(app);
createWebSocketServer(httpServer);

// ─── Startup ──────────────────────────────────────────────────────────────────

async function startup() {
  if (LIVE_MODE) {
    const [
      { advanceAndCapture },
      { processChatMessages },
      { startTwitchIngestion },
      { startCommentaryWorker },
      { startTTSWorker, audioDir: liveAudioDir },
      { startMilestoneWorker },
      { ensureStripeProducts },
      { getViewerCount },
    ] = await Promise.all([
      import('../services/rider/frameAdvancer'),
      import('../services/ai/chatProcessor'),
      import('../services/chat/twitch'),
      import('../workers/commentaryWorker'),
      import('../workers/ttsWorker'),
      import('../workers/milestoneWorker'),
      import('./routes/subscriptions'),
      import('../shared/redis/client'),
    ]);

    // Mount payment routes only in LIVE_MODE (they import Stripe + queues)
    const tipsRouter = (await import('./routes/tips')).default;
    const subscriptionsRouter = (await import('./routes/subscriptions')).default;
    const webhooksRouter = (await import('./routes/webhooks')).default;
    app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }), webhooksRouter);
    app.use('/api/tips', tipsRouter);
    app.use('/api/subscriptions', subscriptionsRouter);

    audioStaticDir = liveAudioDir;

    await ensureStripeProducts();
    startTwitchIngestion();
    startCommentaryWorker();
    startTTSWorker();
    startMilestoneWorker();

    // Auto-initialize trip on startup if TRIP_ID is set and no state exists yet
    const TRIP_ID = process.env.TRIP_ID;
    if (TRIP_ID) {
      const { getRiderState } = await import('../shared/redis/client');
      const { initializeRiderState } = await import('../services/rider/frameAdvancer');
      const existing = await getRiderState();
      if (!existing || existing.trip_id !== TRIP_ID) {
        console.log(`[Startup] Initializing rider state for trip ${TRIP_ID}`);
        await initializeRiderState(TRIP_ID);
      } else {
        console.log(`[Startup] Rider already on trip ${TRIP_ID} at waypoint ${existing.current_waypoint_index}`);
      }
    }

    cron.schedule(`*/${FRAME_INTERVAL_SECONDS} * * * * *`, async () => {
      try { await advanceAndCapture(); } catch (err) { console.error('[Cron:frame]', err); }
    });
    cron.schedule('*/30 * * * * *', async () => {
      try { await processChatMessages(); } catch (err) { console.error('[Cron:chat]', err); }
    });
    cron.schedule('*/60 * * * * *', async () => {
      const count = await getViewerCount();
      broadcastToClients({ type: 'VIEWER_COUNT', payload: { count } });
    });
  } else {
    console.warn('[Server] LIVE_MODE not set — Stripe, Street View, Claude, ElevenLabs all disabled');
    // Twitch mock runs in both modes — generates fake chat + handles !commands
    const { startTwitchIngestion } = await import('../services/chat/twitch');
    startTwitchIngestion();

    // Advance mock frames every 8 seconds
    cron.schedule(`*/${FRAME_INTERVAL_SECONDS} * * * * *`, async () => {
      if (mockPaused) return;
      mockWaypointIndex =
        (mockWaypointIndex + Math.max(1, Math.round(mockSpeedMultiplier))) % mockSceneLibrary.length;
      await broadcastMockFrame();
    });

    // Broadcast a mock chat message every 6 seconds
    cron.schedule('*/6 * * * * *', async () => {
      const msg = mockChatMessages[mockChatIdx % mockChatMessages.length];
      mockChatIdx++;
      await broadcastToClients({ type: 'CHAT_MESSAGE', payload: msg });
    });

    // Mock viewer count every 15 seconds
    cron.schedule('*/15 * * * * *', () => {
      const count = getClientCount() + 127 + Math.floor(Math.random() * 20) - 10;
      broadcastToClients({ type: 'VIEWER_COUNT', payload: { count: Math.max(80, count) } });
    });
  }

  httpServer.listen(PORT, () => {
    console.log(`\n🚴 AXLE server on http://localhost:${PORT}`);
    console.log(`   WebSocket: ws://localhost:${PORT}/ws`);
    console.log(`   Mode: ${LIVE_MODE ? 'LIVE' : 'MOCK'}`);
    console.log(`   Frame interval: ${FRAME_INTERVAL_MS}ms (${FRAME_INTERVAL_SECONDS}s)\n`);
  });
}

startup().catch((err) => {
  console.error('Startup failed:', err);
  process.exit(1);
});
