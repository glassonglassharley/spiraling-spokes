import * as dotenv from 'dotenv';
dotenv.config();

import { fetchStreetViewImage, NoImageryError, isStreetViewLive } from '../services/rider/streetView';

const loc = { name: 'Safe one-frame test: Times Square', lat: 40.7580, lng: -73.9855, heading: 270 };

async function main() {
  console.log(`[testStreetView] LIVE_MODE=${process.env.LIVE_MODE ?? 'unset'}`);
  console.log(`[testStreetView] GOOGLE_MAPS_API_KEY=${process.env.GOOGLE_MAPS_API_KEY ? 'set' : 'not set'}`);
  console.log(`[testStreetView] R2 configured=${!!(process.env.R2_ACCOUNT_ID && process.env.R2_BUCKET_NAME)}`);
  console.log(`[testStreetView] mode=${isStreetViewLive() ? 'live (exactly one Google Street View request)' : 'mock (no external request)'}\n`);

  process.stdout.write(`Testing one frame: ${loc.name} ... `);
  try {
    const result = await fetchStreetViewImage(
      { lat: loc.lat, lng: loc.lng, heading: loc.heading },
      'sv-one-frame-test',
      0
    );
    console.log(`OK — mode=${result.mode}, bytes=${result.buffer.length}, fromCache=${result.fromCache}, image=${result.cdnImageUrl ?? result.svUrl}`);
  } catch (err) {
    if (err instanceof NoImageryError) {
      console.log(`NO COVERAGE — ${err.message}`);
    } else {
      throw err;
    }
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
