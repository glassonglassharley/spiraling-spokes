import { Worker, Job } from 'bullmq';
import { synthesize, LOCAL_AUDIO_DIR } from '../services/tts/elevenlabs';
import { broadcastToClients } from '../server/broadcast';
import type { TTSJob } from '../shared/types';
import * as express from 'express';

function getConnection() {
  const url = process.env.REDIS_URL;
  if (url) {
    const parsed = new URL(url);
    return { host: parsed.hostname, port: parseInt(parsed.port ?? '6379', 10) };
  }
  return { host: 'localhost', port: 6379 };
}

export { LOCAL_AUDIO_DIR as audioDir };

export function startTTSWorker() {
  const worker = new Worker<TTSJob>(
    'tts',
    async (job: Job<TTSJob>) => {
      const { text, waypointIndex } = job.data;

      const result = await synthesize(text, waypointIndex);

      await broadcastToClients({
        type: 'AUDIO_READY',
        payload: {
          audioUrl: result.audioUrl,
          audioKey: result.audioKey,
          waypointIndex,
          text,
        },
      });
    },
    {
      connection: getConnection(),
      concurrency: 1,
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`[TTSWorker] Job ${job?.id} failed:`, err.message);
  });

  console.log('[TTSWorker] Started');
  return worker;
}
