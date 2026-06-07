import { query, queryOne, execute } from '../../shared/db/client';
import { getRiderState, setRiderState } from '../../shared/redis/client';
import { fetchStreetViewImage, NoImageryError } from './streetView';
import { getSolarTimeOfDay } from '../../shared/utils/time';
import { broadcastToClients } from '../../server/broadcast';
import { commentaryQueue, milestoneQueue } from '../../workers/queues';
import type { Waypoint, RiderState } from '../../shared/types';

// How many waypoints to skip forward when there's no Street View coverage
const COVERAGE_SKIP_COUNT = 5;

export async function advanceAndCapture(): Promise<void> {
  const state = await getRiderState();
  if (!state) {
    console.warn('[FrameAdvancer] No rider state in Redis');
    return;
  }

  if (state.is_paused) return;

  // Check for night-time (pause automatically)
  if (state.current_lat && state.current_lng) {
    const { isNight } = getSolarTimeOfDay(state.current_lat, state.current_lng);
    if (isNight) {
      await pauseRider(state, 'night');
      return;
    }
  }

  // Get next waypoint
  const nextIndex = state.current_waypoint_index + state.speed_multiplier;
  const waypoint = await queryOne<Waypoint>(
    `SELECT * FROM waypoints WHERE trip_id = $1 AND sequence_index = $2`,
    [state.trip_id, Math.floor(nextIndex)]
  );

  if (!waypoint) {
    console.log('[FrameAdvancer] No more waypoints — trip complete!');
    await completeTripFlow(state);
    return;
  }

  // Fetch Street View image (checks R2 cache first, then Google)
  let imageBuffer: Buffer;
  let frameDisplayUrl: string;

  try {
    const result = await fetchStreetViewImage(
      { lat: waypoint.lat, lng: waypoint.lng, heading: waypoint.heading, pitch: -5, fov: 90 },
      waypoint.trip_id,
      waypoint.sequence_index
    );
    imageBuffer = result.buffer;
    // Use CDN URL for display if available, otherwise the Google SV URL
    frameDisplayUrl = result.cdnImageUrl ?? result.svUrl;
  } catch (err) {
    if (err instanceof NoImageryError) {
      await skipOnMissingCoverage(state, COVERAGE_SKIP_COUNT);
      await broadcastToClients({
        type: 'NEW_FRAME',
        payload: { frameUrl: null, missing: true, lat: waypoint.lat, lng: waypoint.lng },
      });
      return;
    }
    // Non-imagery errors: log and skip this frame without stopping the rider
    console.error('[FrameAdvancer] Unexpected Street View error:', err);
    return;
  }

  // Get total trip distance for miles remaining
  const [trip] = await query<{ total_distance_miles: number }>(
    `SELECT total_distance_miles FROM trips WHERE id = $1`,
    [state.trip_id]
  );
  const milesRemaining = (trip?.total_distance_miles ?? 0) - waypoint.distance_from_start_miles;

  // Update rider state in Redis
  const newState: RiderState = {
    ...state,
    current_waypoint_index: waypoint.sequence_index,
    current_lat: waypoint.lat,
    current_lng: waypoint.lng,
    current_heading: waypoint.heading,
    current_city: waypoint.city,
    current_state: waypoint.state,
    miles_traveled: waypoint.distance_from_start_miles,
    miles_remaining: milesRemaining,
    last_frame_url: frameDisplayUrl,
    last_frame_at: new Date().toISOString(),
  };
  await setRiderState(newState);

  // Persist to DB (async, don't await)
  execute(
    `UPDATE rider_state SET
      current_waypoint_index = $1, current_lat = $2, current_lng = $3,
      current_heading = $4, current_city = $5, current_state = $6,
      miles_traveled = $7, miles_remaining = $8, last_frame_at = NOW()
     WHERE id = 1`,
    [
      waypoint.sequence_index, waypoint.lat, waypoint.lng,
      waypoint.heading, waypoint.city, waypoint.state,
      waypoint.distance_from_start_miles, milesRemaining,
    ]
  ).catch(console.error);

  // Broadcast new frame to all WebSocket clients
  await broadcastToClients({
    type: 'NEW_FRAME',
    payload: {
      frameUrl: frameDisplayUrl,
      lat: waypoint.lat,
      lng: waypoint.lng,
      heading: waypoint.heading,
      city: waypoint.city,
      state: waypoint.state,
      roadName: waypoint.road_name,
      miles: waypoint.distance_from_start_miles,
      milesRemaining,
      isMilestone: waypoint.is_milestone,
      milestoneName: waypoint.milestone_name,
    },
  });

  // Enqueue AI commentary (fire and forget)
  await commentaryQueue.add(
    'generate',
    {
      tripId: state.trip_id,
      waypointIndex: waypoint.sequence_index,
      imageUrl: frameDisplayUrl,
      imageBuffer: imageBuffer.toString('base64'),
      location: {
        city: waypoint.city,
        state: waypoint.state,
        road: waypoint.road_name,
        lat: waypoint.lat,
        lng: waypoint.lng,
        elevation: waypoint.elevation_ft,
      },
      isMilestone: waypoint.is_milestone,
      milestoneName: waypoint.milestone_name,
      milesTraveled: waypoint.distance_from_start_miles,
      milesRemaining,
    },
    { priority: waypoint.is_milestone ? 10 : 1 }
  );

  // Enqueue milestone event if applicable
  if (waypoint.is_milestone) {
    await milestoneQueue.add('trigger', { waypoint });
  }
}

async function pauseRider(state: RiderState, reason: RiderState['pause_reason']): Promise<void> {
  const paused: RiderState = { ...state, is_paused: true, pause_reason: reason };
  await setRiderState(paused);
  await broadcastToClients({
    type: 'RIDER_PAUSED',
    payload: { reason, city: state.current_city, state: state.current_state },
  });
  console.log(`[FrameAdvancer] Rider paused: ${reason}`);
}

async function skipOnMissingCoverage(state: RiderState, count: number): Promise<void> {
  const newState: RiderState = {
    ...state,
    current_waypoint_index: state.current_waypoint_index + count,
  };
  await setRiderState(newState);
}

async function completeTripFlow(state: RiderState): Promise<void> {
  await execute(`UPDATE trips SET status = 'completed', completed_at = NOW() WHERE id = $1`, [
    state.trip_id,
  ]);
  await broadcastToClients({
    type: 'MILESTONE',
    payload: {
      type: 'trip_complete',
      name: 'Trip Complete!',
      description: `AXLE has reached the destination after ${state.miles_traveled.toFixed(1)} miles.`,
    },
  });
  console.log('[FrameAdvancer] Trip completed!');
}

export async function initializeRiderState(tripId: string): Promise<void> {
  const firstWaypoint = await queryOne<Waypoint>(
    `SELECT * FROM waypoints WHERE trip_id = $1 ORDER BY sequence_index ASC LIMIT 1`,
    [tripId]
  );

  if (!firstWaypoint) throw new Error('No waypoints found for trip');

  const state: RiderState = {
    id: 1,
    trip_id: tripId,
    current_waypoint_index: 0,
    current_lat: firstWaypoint.lat,
    current_lng: firstWaypoint.lng,
    current_heading: firstWaypoint.heading,
    current_city: firstWaypoint.city,
    current_state: firstWaypoint.state,
    miles_traveled: 0,
    miles_remaining: null,
    started_at: new Date().toISOString(),
    estimated_arrival: null,
    is_paused: false,
    pause_reason: null,
    last_frame_at: null,
    last_frame_url: null,
    speed_multiplier: 1,
  };

  await setRiderState(state);
  await execute(
    `UPDATE rider_state SET trip_id = $1, current_waypoint_index = 0,
      current_lat = $2, current_lng = $3, current_heading = $4,
      current_city = $5, current_state = $6, miles_traveled = 0,
      is_paused = FALSE, started_at = NOW()
     WHERE id = 1`,
    [tripId, firstWaypoint.lat, firstWaypoint.lng, firstWaypoint.heading,
     firstWaypoint.city, firstWaypoint.state]
  );

  console.log(`[FrameAdvancer] Rider state initialized for trip ${tripId}`);
}
