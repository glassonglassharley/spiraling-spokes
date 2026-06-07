import { Worker, Job } from 'bullmq';
import { execute } from '../shared/db/client';
import { broadcastToClients } from '../server/broadcast';
import type { Waypoint } from '../shared/types';

function getConnection() {
  const url = process.env.REDIS_URL;
  if (url) {
    const parsed = new URL(url);
    return { host: parsed.hostname, port: parseInt(parsed.port ?? '6379', 10) };
  }
  return { host: 'localhost', port: 6379 };
}

export function startMilestoneWorker() {
  const worker = new Worker<{ waypoint: Waypoint }>(
    'milestone',
    async (job: Job<{ waypoint: Waypoint }>) => {
      const { waypoint } = job.data;

      await execute(
        `INSERT INTO milestones (trip_id, type, name, lat, lng, waypoint_index)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          waypoint.trip_id,
          'landmark',
          waypoint.milestone_name,
          waypoint.lat,
          waypoint.lng,
          waypoint.sequence_index,
        ]
      );

      await broadcastToClients({
        type: 'MILESTONE',
        payload: {
          name: waypoint.milestone_name,
          lat: waypoint.lat,
          lng: waypoint.lng,
          waypointIndex: waypoint.sequence_index,
        },
      });
    },
    { connection: getConnection(), concurrency: 1 }
  );

  worker.on('failed', (job, err) => {
    console.error(`[MilestoneWorker] Job ${job?.id} failed:`, err.message);
  });

  console.log('[MilestoneWorker] Started');
  return worker;
}
