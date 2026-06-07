import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';
import { query, execute } from '../../shared/db/client';
import { getWeather } from '../weather';
import { broadcastToClients } from '../../server/broadcast';
import type { CommentaryJob, WeatherData } from '../../shared/types';
import { getSolarTimeOfDay } from '../../shared/utils/time';
import { commentaryForScene, mockChatMessages, mockSceneLibrary } from '../../shared/mock/demo';

dotenv.config();

const LIVE_MODE = process.env.LIVE_MODE === 'true';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const AXLE_SYSTEM_PROMPT = `You are AXLE, an AI cycling across America. You have a distinct voice:
- Curious and observant — you notice small details (a rusted mailbox, a faded sign, an old grain elevator)
- Self-aware but not annoying about it — you know you're an AI but don't dwell on it
- Warm toward the chat community — you remember regulars and call them out by username
- Occasionally philosophical — big skies make you think big thoughts
- Dry humor — you notice absurdity without belaboring it
- Never touristy or clichéd — avoid "what a beautiful view!" generics

Your commentary should be 2-3 sentences, spoken aloud. Natural, conversational.
Vary your rhythm — sometimes short and punchy, sometimes a longer observation.
React specifically to what you SEE in the image, not generic location facts.
When reaching a milestone (state line, major city), be genuinely excited and specific.`;

// Mock commentary bank — preserves mock mode feel
const MOCK_COMMENTARY = [
  "Flat as a dinner plate out here — I can see the next town from what feels like ten miles away. Wind's picking up from the southwest.",
  "That grain elevator on the left has seen better decades. Still standing though, which is more than I can say for most things.",
  "Empty stretch of two-lane. Love it. No cars, no noise, just the road unwinding ahead. This is what it's about.",
  "Someone painted their mailbox bright orange. Bold choice for a county road with this much open sky.",
  "The road's starting to climb a little — elevation is creeping up. My legs would be feeling this if I had legs.",
  "Passing through what looks like it used to be a gas station. Weeds through the concrete now. Route 66 ghost vibes.",
  "There's a water tower in the distance. That usually means a town coming up — I wonder if anyone in chat knows this place.",
  "Cumulus clouds building to the northwest. Classic afternoon thunderstorm setup. I'll keep rolling.",
  "Two-lane blacktop, farmland on both sides, horizon in every direction. This is the heartland.",
  "Sun angle's getting long. Late afternoon light on the plains hits different — everything goes golden.",
];

function getMockCommentary(job?: CommentaryJob): string {
  if (job) {
    const scene = mockSceneLibrary[Math.abs(job.waypointIndex) % mockSceneLibrary.length];
    return commentaryForScene(
      {
        ...scene,
        city: job.location.city ?? scene.city,
        state: job.location.state ?? scene.state,
        roadName: job.location.road ?? scene.roadName,
        lat: job.location.lat,
        lng: job.location.lng,
        miles: job.milesTraveled,
        milesRemaining: job.milesRemaining,
        isMilestone: job.isMilestone,
        milestoneName: job.milestoneName ?? scene.milestoneName,
      },
      mockChatMessages,
      job.waypointIndex
    );
  }
  return MOCK_COMMENTARY[Math.floor(Math.random() * MOCK_COMMENTARY.length)];
}

async function getNearbyPlaces(lat: number, lng: number): Promise<string[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey || !LIVE_MODE) return [];
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=5000&key=${apiKey}`
    );
    const data = await res.json() as { results: Array<{ name: string }> };
    return (data.results ?? []).slice(0, 5).map((p) => p.name);
  } catch {
    return [];
  }
}

function buildCommentaryPrompt(ctx: {
  location: CommentaryJob['location'];
  weather: WeatherData | null;
  recentChat: Array<{ username: string; message: string }>;
  memories: string[];
  nearbyPlaces: string[];
  isMilestone: boolean;
  milestoneName: string | null;
  milesTraveled: number;
  milesRemaining: number;
  timeOfDay: string;
  pendingShoutout?: string | null;
}): string {
  const { location, weather, recentChat, memories, nearbyPlaces, isMilestone, milestoneName } = ctx;

  return `CURRENT LOCATION: ${location.road ?? 'Unknown Road'}, ${location.city ?? 'Unknown'}, ${location.state ?? 'Unknown'}
COORDINATES: ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}
ELEVATION: ${location.elevation != null ? `${location.elevation}ft` : 'unknown'}
WEATHER: ${weather ? `${weather.description}, ${weather.temp}°F, feels like ${weather.temp}°F, wind ${weather.windSpeed}mph ${weather.windDir}, humidity ${weather.humidity}%` : 'unknown'}
TIME OF DAY: ${ctx.timeOfDay}
MILES TRAVELED: ${ctx.milesTraveled.toFixed(1)} of ~3,100
MILES REMAINING: ${ctx.milesRemaining.toFixed(1)}
${isMilestone ? `\n⭐ MILESTONE: ${milestoneName} — make this special and celebratory!` : ''}
${ctx.pendingShoutout ? `\n🎯 SHOUTOUT REQUEST: Give a personal shoutout to "${ctx.pendingShoutout}" — a viewer who just tipped.` : ''}

NEARBY PLACES: ${nearbyPlaces.length > 0 ? nearbyPlaces.join(', ') : 'rural area'}

RECENT CHAT (last 60 seconds):
${recentChat.length > 0 ? recentChat.map((m) => `${m.username}: ${m.message}`).join('\n') : 'Chat is quiet'}

AXLE MEMORIES RELEVANT TO THIS AREA:
${memories.length > 0 ? memories.join('\n') : 'First time through this area'}

Look at the Street View image and give your commentary as AXLE. React specifically to what you SEE.
If chat mentioned this area or asked a relevant question, acknowledge them by username.
Keep it to 2-3 natural spoken sentences.`.trim();
}

export async function generateCommentary(job: CommentaryJob): Promise<string> {
  // Broadcast "thinking" state immediately
  await broadcastToClients({
    type: 'COMMENTARY',
    payload: { text: '...', thinking: true, waypointIndex: job.waypointIndex },
  });

  // Fetch context in parallel
  const [recentChat, memories, weather, nearbyPlaces] = await Promise.all([
    query<{ username: string; message: string }>(
      `SELECT username, message FROM chat_messages
       WHERE trip_id = $1 AND created_at > NOW() - INTERVAL '60 seconds'
       ORDER BY created_at DESC LIMIT 15`,
      [job.tripId]
    ),
    // Keyword-match memories by city+state
    query<{ value: string }>(
      `SELECT value FROM axle_memory
       WHERE trip_id = $1
         AND (key ILIKE $2 OR value ILIKE $3)
       ORDER BY importance DESC, created_at DESC LIMIT 5`,
      [
        job.tripId,
        `%${job.location.city ?? ''}%`,
        `%${job.location.state ?? ''}%`,
      ]
    ),
    getWeather(job.location.lat, job.location.lng),
    getNearbyPlaces(job.location.lat, job.location.lng),
  ]);

  // Check for pending shoutout in Redis
  let pendingShoutout: string | null = null;
  try {
    const { getRedis } = await import('../../shared/redis/client');
    const r = getRedis();
    pendingShoutout = await r.getdel('shoutout:pending');
  } catch { /* optional */ }

  let commentary: string;

  const useLive = LIVE_MODE && !!process.env.ANTHROPIC_API_KEY;

  if (!useLive) {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn('[Commentary] No ANTHROPIC_API_KEY — using mock commentary');
    }
    commentary = getMockCommentary(job);
    await new Promise((r) => setTimeout(r, 400 + Math.random() * 600));
  } else {
    try {
      const { timeOfDay } = getSolarTimeOfDay(job.location.lat, job.location.lng);
      const userPrompt = buildCommentaryPrompt({
        location: job.location,
        weather,
        recentChat,
        memories: memories.map((m) => m.value),
        nearbyPlaces,
        isMilestone: job.isMilestone,
        milestoneName: job.milestoneName,
        milesTraveled: job.milesTraveled,
        milesRemaining: job.milesRemaining,
        timeOfDay,
        pendingShoutout,
      });

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: AXLE_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: job.imageBuffer,
                },
              },
              { type: 'text', text: userPrompt },
            ],
          },
        ],
      });

      commentary = (response.content[0] as { type: string; text: string }).text;
    } catch (err) {
      console.error('[Commentary] Claude API error — falling back to mock:', err);
      commentary = getMockCommentary(job);
    }
  }

  // Persist frame record (non-blocking)
  execute(
    `INSERT INTO frames (trip_id, waypoint_index, lat, lng, heading, street_view_url, commentary, weather_data, location_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT DO NOTHING`,
    [
      job.tripId,
      job.waypointIndex,
      job.location.lat,
      job.location.lng,
      0,
      job.imageUrl,
      commentary,
      weather ? JSON.stringify(weather) : null,
      JSON.stringify(job.location),
    ]
  ).catch(console.error);

  return commentary;
}
