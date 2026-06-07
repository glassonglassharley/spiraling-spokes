import * as dotenv from 'dotenv';
dotenv.config();

import { buildStreetViewUrl, fetchStreetViewImage } from '../services/rider/streetView';
import { generateCommentary } from '../services/ai/commentary';

const testLocation = {
  lat: 40.7128,
  lng: -74.006,
  heading: 90,
  city: 'New York',
  state: 'New York',
  road: 'Broadway',
  elevation: 33,
};

async function main() {
  console.log('AXLE Frame Test');
  console.log(`Location: ${testLocation.city}, ${testLocation.state}`);

  const svUrl = buildStreetViewUrl(testLocation);
  console.log(`Street View URL: ${svUrl}`);

  let imageBuffer: Buffer;
  let imageOk = true;

  try {
    const result = await fetchStreetViewImage(
      { lat: testLocation.lat, lng: testLocation.lng, heading: testLocation.heading },
      'test-trip',
      0
    );
    imageBuffer = result.buffer;
    console.log(`Image: ${imageBuffer.length} bytes`);
  } catch {
    console.log('Image: MISSING (no coverage)');
    imageOk = false;
    imageBuffer = Buffer.alloc(0);
  }

  if (imageOk) {
    console.log('Generating commentary...');
    const commentary = await generateCommentary({
      tripId: 'test-trip',
      waypointIndex: 0,
      imageUrl: svUrl,
      imageBuffer: imageBuffer.toString('base64'),
      location: testLocation,
      isMilestone: false,
      milestoneName: null,
      milesTraveled: 0,
      milesRemaining: 3100,
    });
    console.log(`\nAXLE says: "${commentary}"`);
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
