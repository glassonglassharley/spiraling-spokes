import Redis from 'ioredis';
import * as dotenv from 'dotenv';
import type { RiderState } from '../types';

dotenv.config();

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });

    redis.on('error', (err) => {
      console.error('[Redis] Connection error:', err);
    });

    redis.on('connect', () => {
      console.log('[Redis] Connected');
    });
  }
  return redis;
}

const RIDER_STATE_KEY = 'rider:state';
const VIEWER_COUNT_KEY = 'viewer:count';

export async function getRiderState(): Promise<RiderState | null> {
  const r = getRedis();
  const raw = await r.get(RIDER_STATE_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as RiderState;
}

export async function setRiderState(state: RiderState): Promise<void> {
  const r = getRedis();
  await r.set(RIDER_STATE_KEY, JSON.stringify(state));
}

export async function getViewerCount(): Promise<number> {
  const r = getRedis();
  const val = await r.get(VIEWER_COUNT_KEY);
  return parseInt(val ?? '0', 10);
}

export async function incrementViewerCount(): Promise<number> {
  return getRedis().incr(VIEWER_COUNT_KEY);
}

export async function decrementViewerCount(): Promise<number> {
  return getRedis().decr(VIEWER_COUNT_KEY);
}
