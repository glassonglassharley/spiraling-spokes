import * as dotenv from 'dotenv';
dotenv.config();

import { getWeather, isWeatherLive } from '../services/weather';

async function main() {
  const lat = 40.7128;
  const lng = -74.006;

  console.log(`[testWeather] lat=${lat} lng=${lng}`);
  console.log(`[testWeather] LIVE_MODE=${process.env.LIVE_MODE}`);
  console.log(`[testWeather] OPENWEATHERMAP_API_KEY=${process.env.OPENWEATHERMAP_API_KEY ? 'set' : 'not set'}`);
  console.log(`[testWeather] mode=${isWeatherLive() ? 'live (exactly one OpenWeatherMap lookup)' : 'mock (no external request)'}\n`);

  const weather = await getWeather(lat, lng);
  if (!weather) {
    console.log('Result: null (unexpected)');
  } else {
    console.log('Result:');
    console.log(`  Description: ${weather.description}`);
    console.log(`  Temp:        ${weather.temp}°F`);
    console.log(`  Wind:        ${weather.windSpeed} mph ${weather.windDir}`);
    console.log(`  Humidity:    ${weather.humidity}%`);
    console.log(`  Icon:        ${weather.icon}`);
    console.log(`  Mode:        ${isWeatherLive() ? 'live' : 'mock'}`);
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
