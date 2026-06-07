import Anthropic from '@anthropic-ai/sdk';
import { query, execute, queryOne } from '../../shared/db/client';
import type { CommentaryJob } from '../../shared/types';

const LIVE_MODE = process.env.LIVE_MODE === 'true';
const MAX_MEMORIES_PER_TRIP = 500;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function shouldExtractMemory(commentary: string, job: CommentaryJob): boolean {
  if (job.isMilestone) return true;

  // Named viewers, shoutouts, or vivid unique observations
  const triggers = [
    /\b[A-Z][a-z]+\d+\b/, // Twitch-style usernames (e.g. CoolKid42)
    /hometown/i,
    /remember/i,
    /incredible|stunning|unexpected|surprising|bizarre|strange|haunting/i,
    /never seen|first time|only place/i,
  ];
  return triggers.some((re) => re.test(commentary));
}

async function pruneOldestMemories(tripId: string): Promise<void> {
  const count = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM axle_memory WHERE trip_id = $1`,
    [tripId]
  );
  const total = parseInt(count?.count ?? '0', 10);

  if (total >= MAX_MEMORIES_PER_TRIP) {
    // Drop bottom 10% by importance score
    const toDrop = Math.ceil(total * 0.1);
    await execute(
      `DELETE FROM axle_memory WHERE id IN (
         SELECT id FROM axle_memory WHERE trip_id = $1
         ORDER BY importance ASC, created_at ASC LIMIT $2
       )`,
      [tripId, toDrop]
    );
    console.log(`[Memory] Pruned ${toDrop} low-importance memories`);
  }
}

async function decayOldMemories(tripId: string): Promise<void> {
  // Every 100th call, reduce importance of memories older than 24h
  if (Math.random() > 0.01) return;
  await execute(
    `UPDATE axle_memory
     SET importance = GREATEST(1, importance - 1)
     WHERE trip_id = $1 AND created_at < NOW() - INTERVAL '24 hours' AND importance > 1`,
    [tripId]
  );
}

export async function maybeStoreMemory(
  commentary: string,
  job: CommentaryJob
): Promise<void> {
  if (!shouldExtractMemory(commentary, job)) return;

  // Mock mode: store a simple fact
  if (!LIVE_MODE || !process.env.ANTHROPIC_API_KEY) {
    if (job.waypointIndex % 10 === 0) {
      await execute(
        `INSERT INTO axle_memory (trip_id, memory_type, key, value, importance)
         VALUES ($1, 'event', $2, $3, $4)`,
        [
          job.tripId,
          `${job.location.city ?? 'road'}_${job.location.state ?? 'US'}`,
          `Passed through ${job.location.city ?? 'open road'} at mile ${Math.round(job.milesTraveled)}`,
          job.isMilestone ? 5 : 2,
        ]
      );
    }
    return;
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      messages: [
        {
          role: 'user',
          content: `Extract a single memorable fact from this cycling stream moment (max 20 words).
Location: ${job.location.city ?? 'unknown'}, ${job.location.state ?? 'unknown'}
Mile: ${Math.round(job.milesTraveled)}
Commentary: "${commentary}"
Output ONE concise sentence. If nothing memorable, output: SKIP`,
        },
      ],
    });

    const text = (response.content[0] as { type: string; text: string }).text.trim();
    if (text === 'SKIP' || text.toUpperCase() === 'SKIP') return;

    // Prune if at cap, then decay
    await pruneOldestMemories(job.tripId);
    await decayOldMemories(job.tripId);

    await execute(
      `INSERT INTO axle_memory (trip_id, memory_type, key, value, importance)
       VALUES ($1, 'event', $2, $3, $4)`,
      [
        job.tripId,
        `${job.location.city ?? 'road'}_${job.location.state ?? 'US'}`,
        text,
        job.isMilestone ? 5 : 3,
      ]
    );
  } catch (err) {
    console.error('[Memory] Extraction failed:', err);
  }
}

// Store viewer-related memory (called from tip handler)
export async function storeViewerMemory(
  tripId: string,
  username: string,
  fact: string,
  importance = 4
): Promise<void> {
  await execute(
    `INSERT INTO axle_memory (trip_id, memory_type, key, value, importance)
     VALUES ($1, 'viewer', $2, $3, $4)`,
    [tripId, `viewer_${username}`, fact, importance]
  );
}
