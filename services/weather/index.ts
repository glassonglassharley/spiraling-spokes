import type { WeatherData } from '../../shared/types';
import { config, warnMockFallback } from '../../shared/config';

// 10-minute cache keyed by 2-decimal-rounded lat/lng grid cell (~0.7mi / 1.1km)
const cache = new Map<string, { data: WeatherData; expiresAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

const WIND_DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

function windDirection(degrees?: number): string {
  if (typeof degrees !== 'number' || !Number.isFinite(degrees)) return 'N/A';
  return WIND_DIRS[Math.round(degrees / 45) % 8];
}

function withAliases(data: Omit<WeatherData, 'temp_f' | 'wind_speed_mph' | 'wind_direction' | 'feels_like_f'>): WeatherData {
  const feelsLike = data.feelsLike ?? data.temp;
  return {
    ...data,
    feelsLike,
    temp_f: data.temp,
    wind_speed_mph: data.windSpeed,
    wind_direction: data.windDir,
    feels_like_f: feelsLike,
  };
}

const MOCK_WEATHER: WeatherData = withAliases({
  description: 'partly cloudy',
  temp: 72,
  windSpeed: 8,
  windDir: 'SW',
  humidity: 45,
  icon: '02d',
  feelsLike: 72,
});

function mockReason(): string | null {
  if (!config.liveMode) return 'LIVE_MODE is not true';
  if (!config.openWeatherApiKey) return 'OPENWEATHERMAP_API_KEY is missing';
  return null;
}

export function isWeatherLive(): boolean {
  return mockReason() === null;
}

interface OpenWeatherResponse {
  weather?: Array<{ description?: string; icon?: string }>;
  main?: { temp?: number; humidity?: number; feels_like?: number };
  wind?: { speed?: number; deg?: number };
}

export async function getWeather(lat: number, lng: number): Promise<WeatherData | null> {
  const reason = mockReason();

  if (reason) {
    warnMockFallback('Weather', reason);
    return MOCK_WEATHER;
  }

  const key = cacheKey(lat, lng);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    console.log(`[Weather] Cache hit ${key}`);
    return cached.data;
  }

  const url = new URL('https://api.openweathermap.org/data/2.5/weather');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('units', 'imperial');
  url.searchParams.set('appid', config.openWeatherApiKey!);

  try {
    console.log(`[Weather] LIVE fetch lat=${lat.toFixed(5)} lng=${lng.toFixed(5)}`);
    const res = await fetch(url);

    if (!res.ok) {
      console.warn(`[Weather] API error ${res.status}; using mock weather`);
      return MOCK_WEATHER;
    }

    const raw = (await res.json()) as OpenWeatherResponse;
    const current = raw.weather?.[0];
    const temp = Math.round(raw.main?.temp ?? MOCK_WEATHER.temp);
    const windSpeed = Math.round(raw.wind?.speed ?? MOCK_WEATHER.windSpeed);
    const windDir = windDirection(raw.wind?.deg);
    const feelsLike = Math.round(raw.main?.feels_like ?? temp);

    const data = withAliases({
      description: current?.description ?? MOCK_WEATHER.description,
      temp,
      windSpeed,
      windDir,
      humidity: Math.round(raw.main?.humidity ?? MOCK_WEATHER.humidity),
      icon: current?.icon ?? MOCK_WEATHER.icon,
      feelsLike,
    });

    cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return data;
  } catch (err) {
    console.error('[Weather] Fetch failed; using mock weather:', err);
    return MOCK_WEATHER;
  }
}
