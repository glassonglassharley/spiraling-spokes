import { Queue } from 'bullmq';
import { getRedis } from '../shared/redis/client';

const connection = { host: 'localhost', port: 6379 };

// Override with REDIS_URL if set
function getConnection() {
  const url = process.env.REDIS_URL;
  if (url) {
    const parsed = new URL(url);
    return { host: parsed.hostname, port: parseInt(parsed.port ?? '6379', 10) };
  }
  return connection;
}

export const commentaryQueue = new Queue('commentary', {
  connection: getConnection(),
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

export const ttsQueue = new Queue('tts', {
  connection: getConnection(),
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

export const milestoneQueue = new Queue('milestone', {
  connection: getConnection(),
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: 50,
  },
});

export const chatQueue = new Queue('chat', {
  connection: getConnection(),
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: 50,
  },
});
