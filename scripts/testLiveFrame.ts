import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { fetchStreetViewImage, NoImageryError, isStreetViewLive } from '../services/rider/streetView';

// Lower Manhattan — should always have Street View coverage
const TEST_LOCATION = { lat: 40.7128, lng: -74.0060, heading: 90 };
const OUTPUT_DIR = path.join(__dirname, 'test-output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'frame-test.jpg');

async function main() {
  console.log('AXLE Live Frame Test');
  console.log('====================');
  console.log(`LIVE_MODE:             ${process.env.LIVE_MODE ?? 'unset'}`);
  console.log(`GOOGLE_MAPS_API_KEY:   ${process.env.GOOGLE_MAPS_API_KEY ? 'set ✓' : 'NOT SET ✗'}`);
  console.log(`Street View mode:      ${isStreetViewLive() ? 'LIVE (real API call)' : 'MOCK (no external request)'}`);
  console.log(`Location:              ${TEST_LOCATION.lat}, ${TEST_LOCATION.lng} heading ${TEST_LOCATION.heading}° (lower Manhattan)`);
  console.log('');

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  process.stdout.write('Fetching Street View frame ... ');

  try {
    const result = await fetchStreetViewImage(
      { lat: TEST_LOCATION.lat, lng: TEST_LOCATION.lng, heading: TEST_LOCATION.heading },
      'live-frame-test',
      0
    );

    fs.writeFileSync(OUTPUT_FILE, result.buffer);

    const sizeKb = (result.buffer.length / 1024).toFixed(1);
    const minSizeOk = result.buffer.length > 50_000;

    console.log(`OK`);
    console.log('');
    console.log(`  Mode:       ${result.mode}`);
    console.log(`  Size:       ${sizeKb} KB ${minSizeOk ? '✓ (real image)' : '✗ (too small — may be placeholder)'}`);
    console.log(`  From cache: ${result.fromCache}`);
    console.log(`  Saved to:   ${OUTPUT_FILE}`);
    console.log(`  URL:        ${result.cdnImageUrl ?? result.svUrl}`);
    console.log('');

    if (result.mode === 'live' && minSizeOk) {
      console.log('✅ Success — real Street View image fetched and saved.');
      console.log('   The API key is working. Ready to compute routes.');
    } else if (result.mode === 'mock') {
      console.log('⚠️  Mock mode — set LIVE_MODE=true + GOOGLE_MAPS_API_KEY to test real API.');
    } else {
      console.log('⚠️  Image fetched but size is suspiciously small. Check for "no imagery" placeholder.');
    }
  } catch (err) {
    if (err instanceof NoImageryError) {
      console.log(`NO COVERAGE`);
      console.log(`  Error: ${err.message}`);
      console.log('  This location should have coverage — check the API key or quota.');
    } else {
      console.log(`FAILED`);
      console.error(err);
      process.exit(1);
    }
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
