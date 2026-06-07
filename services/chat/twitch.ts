import * as tmi from 'tmi.js';
import { broadcastToClients } from '../../server/broadcast';

const LIVE_MODE = process.env.LIVE_MODE === 'true';

// Per-user command cooldown: 60 seconds
const commandCooldowns = new Map<string, number>();
let totalCommandsThisMinute = 0;
let commandWindowStart = Date.now();

function isUserCooledDown(username: string): boolean {
  const last = commandCooldowns.get(username) ?? 0;
  return Date.now() - last < 60_000;
}

function isGlobalRateLimited(): boolean {
  const now = Date.now();
  if (now - commandWindowStart > 60_000) { totalCommandsThisMinute = 0; commandWindowStart = now; }
  if (totalCommandsThisMinute >= 10) return true;
  totalCommandsThisMinute++;
  return false;
}

function markCommandUsed(username: string) {
  commandCooldowns.set(username, Date.now());
}

// Global rate-limiter for message inserts
let insertCount = 0;
let insertWindowStart = Date.now();
function isInsertRateLimited(): boolean {
  const now = Date.now();
  if (now - insertWindowStart > 60_000) { insertCount = 0; insertWindowStart = now; }
  if (insertCount >= 50) return true;
  insertCount++;
  return false;
}

async function getRiderStateSafe() {
  try {
    const { getRiderState } = await import('../../shared/redis/client');
    return await getRiderState();
  } catch { return null; }
}

// Generate a mock AXLE command response
function mockCommandResponse(cmd: string, username: string, state: Record<string, unknown> | null): string {
  const city = String((state as { current_city?: string } | null)?.current_city ?? 'a great stretch of nowhere');
  const state_ = String((state as { current_state?: string } | null)?.current_state ?? 'the road');
  const miles = Math.round(Number((state as { miles_traveled?: number } | null)?.miles_traveled ?? 0));
  const remaining = Math.round(Number((state as { miles_remaining?: number } | null)?.miles_remaining ?? 2790));

  switch (cmd) {
    case '!route': return `Currently rolling through ${city}, ${state_}. ${miles.toLocaleString()} miles in, ${remaining.toLocaleString()} to go. This road is exactly as long as it sounds.`;
    case '!miles': return `Mile ${miles.toLocaleString()} of approximately ${(miles + remaining).toLocaleString()}. Progress: exactly as slow as scenic.`;
    case '!weather': return `${city} is currently ${['warm', 'breezy', 'aggressively sunny', 'characterfully overcast'][miles % 4]}. My weather opinion: this counts as biking weather.`;
    case '!day': return `Day ${14 + Math.floor(miles / 200)} of the trip. I'm maintaining my policy of not counting sleeps because I don't sleep.`;
    default: return `${username}: I heard that. Processing with appropriate gravity.`;
  }
}

async function handleCommand(
  cmd: string,
  username: string,
  arg: string,
  isSubscriber: boolean,
  tripId: string | null
): Promise<void> {
  if (isUserCooledDown(username) || isGlobalRateLimited()) return;
  markCommandUsed(username);

  const state = await getRiderStateSafe();
  let responseText: string | null = null;

  switch (cmd) {
    case '!route':
    case '!miles':
    case '!weather':
    case '!day':
      responseText = LIVE_MODE
        ? await generateLiveResponse(cmd, state)
        : mockCommandResponse(cmd, username, state as Record<string, unknown> | null);
      break;

    case '!votea':
    case '!voteb': {
      const choice = cmd === '!votea' ? 'a' : 'b';
      try {
        const { query } = await import('../../shared/db/client');
        const votes = await query<{ id: string }>(
          `SELECT id FROM votes WHERE status = 'open' ORDER BY created_at DESC LIMIT 1`
        );
        if (votes[0]) {
          const col = choice === 'a' ? 'votes_a' : 'votes_b';
          await query(`UPDATE votes SET ${col} = ${col} + 1 WHERE id = $1`, [votes[0].id]);
          const updated = await query(`SELECT * FROM votes WHERE id = $1`, [votes[0].id]);
          await broadcastToClients({ type: 'VOTE_UPDATE', payload: updated[0] as Record<string, unknown> });
        }
      } catch { /* DB unavailable in mock mode — just acknowledge */ }
      responseText = `${username} voted ${choice.toUpperCase()}. Every vote moves AXLE's itinerary closer to chaos.`;
      break;
    }

    case '!shoutout': {
      if (!isSubscriber) {
        await broadcastToClients({
          type: 'CHAT_MESSAGE',
          payload: { username: 'AXLE', message: `${username}: shoutouts are sub-only. Subscribe to unlock this power. Worth it.`, source: 'axle' },
        });
        return;
      }
      const city = arg.trim().slice(0, 40) || username;
      responseText = `Shoutout to ${username} representing ${city}. I'll mention ${city} when the road agrees.`;
      break;
    }
  }

  if (responseText) {
    await broadcastToClients({
      type: 'CHAT_RESPONSE',
      payload: { username: 'AXLE', message: responseText, source: 'axle', replyTo: username },
    });

    // In live mode, also queue TTS for the response
    if (LIVE_MODE) {
      try {
        const { ttsQueue } = await import('../../workers/queues');
        await ttsQueue.add('synthesize', { text: responseText, waypointIndex: 0, priority: 5 });
      } catch { /* queue unavailable */ }
    }
  }
}

async function generateLiveResponse(cmd: string, state: unknown): Promise<string> {
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const s = state as { current_city?: string; current_state?: string; miles_traveled?: number } | null;
    const prompt = `You are AXLE, an AI biking across America. Respond to the chat command "${cmd}" in 1-2 sentences in AXLE's voice: dry, curious, understated wit. Current location: ${s?.current_city ?? 'somewhere'}, ${s?.current_state ?? 'USA'}. Mile ${Math.round(s?.miles_traveled ?? 0)}.`;
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 120,
      messages: [{ role: 'user', content: prompt }],
    });
    return (res.content[0] as { type: string; text: string }).text;
  } catch {
    return mockCommandResponse(cmd, 'AXLE', state as Record<string, unknown> | null);
  }
}

async function ingestMessage(username: string, message: string, isSubscriber: boolean, tripId: string | null) {
  if (isInsertRateLimited()) return;

  const cleanMsg = message.trim().slice(0, 500);

  // Broadcast to companion site
  await broadcastToClients({
    type: 'CHAT_MESSAGE',
    payload: { username, message: cleanMsg, source: 'twitch' },
  });

  // Store in DB if available
  if (tripId) {
    try {
      const { execute } = await import('../../shared/db/client');
      const { getRiderState } = await import('../../shared/redis/client');
      const state = await getRiderState();
      if (state?.trip_id) {
        await execute(
          `INSERT INTO chat_messages (trip_id, username, source, message, waypoint_index) VALUES ($1, $2, 'twitch', $3, $4)`,
          [state.trip_id, username, cleanMsg, state.current_waypoint_index]
        );
      }
    } catch { /* DB unavailable */ }
  }

  // Check for commands
  const parts = cleanMsg.split(' ');
  const cmd = parts[0].toLowerCase();
  const arg = parts.slice(1).join(' ');
  const COMMANDS = ['!route', '!miles', '!weather', '!day', '!votea', '!voteb', '!shoutout'];
  if (COMMANDS.includes(cmd)) {
    await handleCommand(cmd, username, arg, isSubscriber, tripId);
  }
}

// ── MOCK MODE ──────────────────────────────────────────────────────────────

const MOCK_USERNAMES = ['chainlube99', 'mapGoblin', 'softshoulder', 'no_brakes', 'mileMarker', 'prairieSignal', 'rustbeltromantic', 'tinyDetour', 'highwayHero', 'cadencequeen'];
const MOCK_MESSAGES = [
  'That road looks suspiciously climb-shaped.',
  'hydrate, robot bicycle man',
  "I grew up near there. The diner pie is real.",
  'AXLE has stronger knees than me and no knees.',
  'next 100 mile marker prediction: emotionally complicated',
  'wind is absolutely bullying the grass',
  'grain elevator content remains elite',
  'vote for scenic stop, coward',
  '!route',
  '!miles',
  '!weather',
  '!votea',
  '!voteb',
  'This is peak road content and I will not be taking questions.',
  'Are the squirrels judging you? (yes)',
  "The sky's doing that dramatic thing again",
];

let mockInterval: ReturnType<typeof setInterval> | null = null;
let mockMsgIdx = 0;

export function startTwitchIngestion(): void {
  if (!LIVE_MODE) {
    console.log('[Twitch] Mock mode — generating fake Twitch chat every 7 seconds');
    mockInterval = setInterval(async () => {
      const username = MOCK_USERNAMES[mockMsgIdx % MOCK_USERNAMES.length];
      const message = MOCK_MESSAGES[mockMsgIdx % MOCK_MESSAGES.length];
      mockMsgIdx++;
      const isSub = mockMsgIdx % 4 === 0;
      await ingestMessage(username, message, isSub, null);
    }, 7000);
    return;
  }

  const channel = process.env.TWITCH_CHANNEL;
  if (!channel) {
    console.warn('[Twitch] TWITCH_CHANNEL not set — skipping Twitch ingestion');
    return;
  }

  const opts: tmi.Options = {
    channels: [channel],
    identity: process.env.TWITCH_BOT_OAUTH
      ? { username: process.env.TWITCH_BOT_USERNAME ?? 'axlebot', password: process.env.TWITCH_BOT_OAUTH }
      : undefined,
    connection: { reconnect: true, secure: true },
  };

  const client = new tmi.Client(opts);

  client.on('message', async (_ch, tags, message, self) => {
    if (self) return;
    const username = tags['display-name'] ?? tags.username ?? 'viewer';
    const isSub = !!(tags.subscriber || tags['badge-info']?.subscriber);
    await ingestMessage(username, message, isSub, null);
  });

  client.on('connected', (addr, port) => console.log(`[Twitch] Connected ${addr}:${port} #${channel}`));
  client.on('disconnected', (r) => console.warn('[Twitch] Disconnected:', r));

  client.connect().catch((err) => console.warn('[Twitch] Connect failed:', err));
}

export function stopTwitchIngestion(): void {
  if (mockInterval) { clearInterval(mockInterval); mockInterval = null; }
}
