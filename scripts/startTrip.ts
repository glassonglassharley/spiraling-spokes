import * as dotenv from 'dotenv';
dotenv.config();

import { initializeRiderState } from '../services/rider/frameAdvancer';

const args = process.argv.slice(2);
const tripId = args[args.indexOf('--trip-id') + 1];

if (!tripId) {
  console.error('Usage: npm run start-trip -- --trip-id <uuid>');
  process.exit(1);
}

initializeRiderState(tripId)
  .then(() => {
    console.log(`✅ Rider state initialized for trip ${tripId}`);
    console.log('Now start the server: npm run dev:server');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Failed to initialize rider state:', err);
    process.exit(1);
  });
