import { Worker, Job } from 'bullmq';
import { generateCommentary } from '../services/ai/commentary';
import { maybeStoreMemory } from '../services/ai/memory';
import { broadcastToClients } from '../server/broadcast';
import { ttsQueue } from './queues';
import type { CommentaryJob } from '../shared/types';

const MAX_TTS_QUEUE_DEPTH = 3;

function getConnection() {
  const url = process.env.REDIS_URL;
  if (url) {
    const parsed = new URL(url);
    return { host: parsed.hostname, port: parseInt(parsed.port ?? '6379', 10) };
  }
  return { host: 'localhost', port: 6379 };
}

export function startCommentaryWorker() {
  const worker = new Worker<CommentaryJob>(
    'commentary',
    async (job: Job<CommentaryJob>) => {
      const data = job.data;

      // generateCommentary broadcasts the "thinking" state internally
      let commentary: string;
      try {
        commentary = await generateCommentary(data);
      } catch (err) {
        console.error('[CommentaryWorker] generateCommentary failed:', err);
        commentary = "Rolling through...";
      }

      // Broadcast text immediately — audio comes later
      await broadcastToClients({
        type: 'COMMENTARY',
        payload: { text: commentary, thinking: false, waypointIndex: data.waypointIndex },
      });

      // Queue TTS — manage depth, always allow milestones through
      const waiting = await ttsQueue.getWaiting();
      const tooDeep = waiting.length >= MAX_TTS_QUEUE_DEPTH;

      if (!tooDeep || data.isMilestone) {
        if (tooDeep && data.isMilestone) {
          // Drain oldest non-milestone from queue to make room
          const toRemove = waiting.find((j) => !j.data?.priority || j.data.priority < 10);
          if (toRemove) await toRemove.remove();
        }

        await ttsQueue.add(
          'synthesize',
          {
            text: commentary,
            waypointIndex: data.waypointIndex,
            priority: data.isMilestone ? 10 : 1,
          },
          { priority: data.isMilestone ? 10 : 1 }
        );
      } else {
        console.warn(`[CommentaryWorker] TTS queue full (depth ${waiting.length}) — dropping non-milestone audio`);
      }

      // Store memory async (never blocks the worker)
      maybeStoreMemory(commentary, data).catch((err) =>
        console.error('[CommentaryWorker] Memory store failed:', err)
      );
    },
    {
      connection: getConnection(),
      concurrency: 2,
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`[CommentaryWorker] Job ${job?.id} failed:`, err.message);
  });

  console.log('[CommentaryWorker] Started');
  return worker;
}
