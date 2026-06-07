import { query, execute } from '../../shared/db/client';
import {
  decodePolyline,
  interpolatePoints,
  calculateBearing,
  haversineDistanceMeters,
  metersToMiles,
} from '../../shared/utils/geo';
import type { LatLng, RouteComputerConfig } from '../../shared/types';

const LIVE_MODE = process.env.LIVE_MODE === 'true';

interface EnrichedPoint extends LatLng {
  heading: number;
  distance_from_start_miles: number;
  elevation_ft: number | null;
  road_name: string | null;
  city: string | null;
  state: string | null;
  is_milestone: boolean;
  milestone_name: string | null;
}

// ─── Mock fallback ───────────────────────────────────────────────────────────

function generateMockRoute(): LatLng[] {
  console.warn('[RouteComputer] Mock mode — generating sine-curve route (set LIVE_MODE=true + GOOGLE_MAPS_API_KEY for real routing)');
  const points: LatLng[] = [];
  const STEPS = 200;
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    points.push({
      lat: 40.71 - t * 5.5 + Math.sin(t * Math.PI * 4) * 1.2,
      lng: -74.01 + t * 44.0,
    });
  }
  return points;
}

async function mockGeocode(
  p: LatLng
): Promise<{ city: string; state: string; road_name: string }> {
  const lng = p.lng;
  let state = 'Unknown';
  if (lng < -115) state = 'California';
  else if (lng < -109) state = 'Arizona';
  else if (lng < -103) state = 'New Mexico';
  else if (lng < -97) state = 'Texas';
  else if (lng < -92) state = 'Oklahoma';
  else if (lng < -87) state = 'Missouri';
  else if (lng < -82) state = 'Indiana';
  else if (lng < -76) state = 'Pennsylvania';
  else state = 'New York';
  return { city: `Mile ${Math.round(Math.abs(lng + 74))}`, state, road_name: 'US-30' };
}

// ─── Real Google APIs ─────────────────────────────────────────────────────────

async function fetchDirectionsPoints(config: RouteComputerConfig): Promise<LatLng[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY!;
  const params = new URLSearchParams({
    origin: config.origin,
    destination: config.destination,
    mode: 'bicycling',
    key: apiKey,
  });
  if (config.waypoints?.length) params.set('waypoints', config.waypoints.join('|'));
  if (config.avoidHighways) params.set('avoid', 'highways');

  const res = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params}`);
  const data = await res.json() as {
    status: string;
    error_message?: string;
    routes: Array<{ legs: Array<{ steps: Array<{ polyline: { points: string } }> }> }>;
  };

  if (data.status !== 'OK') {
    throw new Error(`Directions API: ${data.status} — ${data.error_message ?? ''}`);
  }

  const allPoints: LatLng[] = [];
  for (const leg of data.routes[0].legs) {
    for (const step of leg.steps) {
      allPoints.push(...decodePolyline(step.polyline.points));
    }
  }
  return allPoints;
}

interface GeocodeResult {
  city: string | null;
  state: string | null;
  road_name: string | null;
}

async function reverseGeocode(p: LatLng, apiKey: string): Promise<GeocodeResult> {
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?latlng=${p.lat},${p.lng}&key=${apiKey}`
  );
  const data = await res.json() as {
    status: string;
    results: Array<{ address_components: Array<{ types: string[]; long_name: string }> }>;
  };

  if (data.status !== 'OK' || !data.results.length) {
    return { city: null, state: null, road_name: null };
  }

  let city: string | null = null;
  let state: string | null = null;
  let road_name: string | null = null;

  for (const c of data.results[0].address_components) {
    if (c.types.includes('locality')) city = c.long_name;
    else if (c.types.includes('administrative_area_level_1')) state = c.long_name;
    else if (c.types.includes('route')) road_name = c.long_name;
  }
  return { city, state, road_name };
}

async function batchReverseGeocode(
  points: LatLng[],
  apiKey: string,
  stepEvery = 50
): Promise<Array<LatLng & GeocodeResult>> {
  // Only geocode every Nth point, fill in gaps from nearest geocoded neighbor
  const result: Array<LatLng & GeocodeResult> = points.map((p) => ({
    ...p,
    city: null,
    state: null,
    road_name: null,
  }));

  const indices = points.reduce<number[]>((acc, _, i) => {
    if (i % stepEvery === 0) acc.push(i);
    return acc;
  }, []);

  process.stdout.write('[RouteComputer] Geocoding');
  let lastGeo: GeocodeResult = { city: null, state: null, road_name: null };

  for (let k = 0; k < indices.length; k++) {
    const i = indices[k];
    try {
      const geo = await reverseGeocode(points[i], apiKey);
      lastGeo = geo;
      result[i] = { ...points[i], ...geo };
      // Fill forward to next geocoded point
      const nextI = indices[k + 1] ?? points.length;
      for (let j = i + 1; j < nextI; j++) {
        result[j] = { ...points[j], ...geo };
      }
    } catch {
      result[i] = { ...points[i], ...lastGeo };
    }
    if (k % 10 === 0) process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 50)); // ~20 rps
  }
  process.stdout.write('\n');
  return result;
}

interface ElevationResult extends LatLng { elevation_ft: number | null }

async function batchElevation<T extends LatLng>(
  points: T[],
  apiKey: string
): Promise<Array<T & { elevation_ft: number | null }>> {
  const BATCH = 512;
  const result: Array<T & { elevation_ft: number | null }> = points.map((p) => ({ ...p, elevation_ft: null }));

  process.stdout.write('[RouteComputer] Elevation');
  for (let i = 0; i < points.length; i += BATCH) {
    const batch = points.slice(i, i + BATCH);
    const locStr = batch.map((p) => `${p.lat},${p.lng}`).join('|');
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/elevation/json?locations=${encodeURIComponent(locStr)}&key=${apiKey}`
      );
      const data = await res.json() as {
        status: string;
        results: Array<{ elevation: number }>;
      };
      if (data.status === 'OK') {
        for (let j = 0; j < data.results.length; j++) {
          result[i + j].elevation_ft = Math.round(data.results[j].elevation * 3.28084);
        }
      }
    } catch {
      // elevation is optional — continue
    }
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 100));
  }
  process.stdout.write('\n');
  return result;
}

// ─── Milestone marking ────────────────────────────────────────────────────────

function markMilestones(
  points: Array<LatLng & GeocodeResult & { elevation_ft: number | null }>,
  distancesMiles: number[]
): Array<typeof points[0] & { is_milestone: boolean; milestone_name: string | null }> {
  const seenStates = new Set<string>();
  const milestoneMiles = new Set([100, 250, 500, 750, 1000, 1250, 1500, 1750, 2000, 2250, 2500, 2750, 3000]);

  return points.map((p, i) => {
    const miles = distancesMiles[i];
    let is_milestone = false;
    let milestone_name: string | null = null;

    // State crossing
    if (p.state && !seenStates.has(p.state)) {
      if (seenStates.size > 0) {
        is_milestone = true;
        milestone_name = `Entering ${p.state}`;
      }
      seenStates.add(p.state);
    }

    // Distance milestone (within 0.5 miles of target)
    if (!is_milestone) {
      for (const m of milestoneMiles) {
        if (miles >= m && miles < m + 0.2) {
          is_milestone = true;
          milestone_name = `Mile ${m.toLocaleString()}`;
          milestoneMiles.delete(m);
          break;
        }
      }
    }

    return { ...p, is_milestone, milestone_name };
  });
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function computeAndStoreRoute(config: RouteComputerConfig): Promise<string> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const isLive = LIVE_MODE && !!apiKey;

  console.log(`\n[RouteComputer] ${isLive ? 'LIVE' : 'MOCK'} mode`);
  console.log(`[RouteComputer] ${config.origin} → ${config.destination}`);

  // 1. Create trip record
  const [trip] = await query<{ id: string }>(
    `INSERT INTO trips (name, status, start_location, end_location)
     VALUES ($1, 'active', $2, $3) RETURNING id`,
    [
      config.tripName,
      JSON.stringify({ name: config.origin }),
      JSON.stringify({ name: config.destination }),
    ]
  );
  const tripId = trip.id;
  console.log(`[RouteComputer] Trip ID: ${tripId}`);

  // 2. Fetch route points
  console.log('[RouteComputer] Fetching directions...');
  const rawPoints = isLive ? await fetchDirectionsPoints(config) : generateMockRoute();
  console.log(`[RouteComputer] ${rawPoints.length} raw points`);

  // 3. Interpolate to even spacing
  const evenPoints = interpolatePoints(rawPoints, config.stepIntervalMeters);
  console.log(`[RouteComputer] ${evenPoints.length} points at ${config.stepIntervalMeters}m intervals`);

  // 4. Cumulative distances
  const distancesMiles: number[] = [0];
  for (let i = 1; i < evenPoints.length; i++) {
    distancesMiles.push(
      distancesMiles[i - 1] + metersToMiles(haversineDistanceMeters(evenPoints[i - 1], evenPoints[i]))
    );
  }
  const totalMiles = distancesMiles[distancesMiles.length - 1];
  console.log(`[RouteComputer] Total: ${totalMiles.toFixed(1)} miles`);

  // 5. Geocode (real or mock)
  const geocoded = isLive
    ? await batchReverseGeocode(evenPoints, apiKey!, 50)
    : await Promise.all(evenPoints.map(async (p) => ({ ...p, ...(await mockGeocode(p)) })));

  // 6. Elevation (real or skip in mock)
  const withElevation = isLive
    ? await batchElevation(geocoded, apiKey!)
    : geocoded.map((p) => ({ ...p, elevation_ft: null }));

  // 7. Mark milestones
  const withMilestones = markMilestones(withElevation, distancesMiles);

  // 8. Add headings
  const waypoints: EnrichedPoint[] = withMilestones.map((p, i) => ({
    ...p,
    heading:
      i < withMilestones.length - 1
        ? calculateBearing(p, withMilestones[i + 1])
        : calculateBearing(withMilestones[i - 1], p),
    distance_from_start_miles: distancesMiles[i],
  }));

  // 9. Bulk insert to DB in batches of 500
  console.log(`[RouteComputer] Storing ${waypoints.length} waypoints...`);
  const BATCH_SIZE = 500;

  for (let i = 0; i < waypoints.length; i += BATCH_SIZE) {
    const batch = waypoints.slice(i, i + BATCH_SIZE);
    const rows = batch.map((_, j) => {
      const b = 2 + j * 10;
      return `($1, $${b}, $${b+1}, $${b+2}, $${b+3}, $${b+4}, $${b+5}, $${b+6}, $${b+7}, $${b+8}, $${b+9})`;
    });

    const params: unknown[] = [tripId];
    for (const w of batch) {
      params.push(
        i + batch.indexOf(w),
        w.lat,
        w.lng,
        w.heading,
        w.distance_from_start_miles,
        w.city ?? null,
        w.state ?? null,
        w.road_name ?? null,
        w.is_milestone,
        w.milestone_name ?? null
      );
    }

    await execute(
      `INSERT INTO waypoints
         (trip_id, sequence_index, lat, lng, heading, distance_from_start_miles, city, state, road_name, is_milestone, milestone_name)
       VALUES ${rows.join(',')}
       ON CONFLICT (trip_id, sequence_index) DO NOTHING`,
      params
    );

    const pct = Math.round(((i + batch.length) / waypoints.length) * 100);
    process.stdout.write(`\r[RouteComputer] ${i + batch.length}/${waypoints.length} (${pct}%)`);
  }
  process.stdout.write('\n');

  await execute(`UPDATE trips SET total_distance_miles = $1 WHERE id = $2`, [totalMiles, tripId]);

  console.log(`[RouteComputer] Done — ${totalMiles.toFixed(1)} miles, ${waypoints.length} waypoints`);
  return tripId;
}
