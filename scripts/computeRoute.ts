import * as dotenv from 'dotenv';
dotenv.config();

import { computeAndStoreRoute } from '../services/rider/routeComputer';

const args = process.argv.slice(2);
const get = (flag: string) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
};

const origin = get('--origin') ?? 'Battery Park, New York, NY';
const destination = get('--destination') ?? 'Santa Monica Pier, Los Angeles, CA';
const interval = parseInt(get('--interval') ?? '100', 10);
const avoidHighways = args.includes('--avoid-highways');

const waypointsRaw = get('--waypoints');
const waypoints = waypointsRaw ? waypointsRaw.split(',').map((s) => s.trim()) : undefined;

const tripName = get('--name') ?? `${origin} → ${destination}`;

console.log('AXLE Route Computer');
console.log('===================');
console.log(`Origin:      ${origin}`);
console.log(`Destination: ${destination}`);
console.log(`Interval:    ${interval}m`);
console.log(`Waypoints:   ${waypoints?.join(', ') ?? 'none'}`);
console.log(`Highways:    ${avoidHighways ? 'avoided' : 'allowed'}`);
console.log('');

computeAndStoreRoute({
  origin,
  destination,
  waypoints,
  stepIntervalMeters: interval,
  avoidHighways,
  tripName,
})
  .then((tripId) => {
    console.log(`\n✅ Trip ID: ${tripId}`);
    console.log(`\nNext step: npm run start-trip -- --trip-id ${tripId}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Route computation failed:', err);
    process.exit(1);
  });
