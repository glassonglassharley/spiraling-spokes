import * as dotenv from 'dotenv';

dotenv.config();

type ServiceName = 'StreetView' | 'TTS' | 'Weather' | 'RouteComputer' | 'Commentary' | 'R2' | 'Server';

const warned = new Set<string>();

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export function isLiveMode(): boolean {
  return process.env.LIVE_MODE === 'true';
}

export function modeLabel(): 'LIVE' | 'MOCK' {
  return isLiveMode() ? 'LIVE' : 'MOCK';
}

export function hasGoogleMapsKey(): boolean {
  return !!readEnv('GOOGLE_MAPS_API_KEY');
}

export function hasElevenLabsConfig(): boolean {
  return !!(readEnv('ELEVENLABS_API_KEY') && readEnv('ELEVENLABS_VOICE_ID'));
}

export function getOpenWeatherApiKey(): string | undefined {
  return readEnv('OPENWEATHERMAP_API_KEY') ?? readEnv('OPENWEATHER_API_KEY');
}

export function hasOpenWeatherConfig(): boolean {
  return !!getOpenWeatherApiKey();
}

export function hasR2Config(): boolean {
  return !!(
    readEnv('R2_ACCOUNT_ID') &&
    readEnv('R2_ACCESS_KEY_ID') &&
    readEnv('R2_SECRET_ACCESS_KEY') &&
    readEnv('R2_BUCKET_NAME')
  );
}

export function liveServiceEnabled(service: 'streetView' | 'tts' | 'weather' | 'route' | 'commentary'): boolean {
  if (!isLiveMode()) return false;
  if (service === 'streetView' || service === 'route') return hasGoogleMapsKey();
  if (service === 'tts') return hasElevenLabsConfig();
  if (service === 'weather') return hasOpenWeatherConfig();
  if (service === 'commentary') return !!readEnv('ANTHROPIC_API_KEY');
  return false;
}

export function warnMockFallback(service: ServiceName, reason: string): void {
  const key = `${service}:${reason}`;
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[${service}] Using mock fallback: ${reason}`);
}

export function warnOnce(service: ServiceName, message: string): void {
  const key = `${service}:${message}`;
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[${service}] ${message}`);
}

export const config = {
  get liveMode() { return isLiveMode(); },
  get modeLabel() { return modeLabel(); },
  get googleMapsApiKey() { return readEnv('GOOGLE_MAPS_API_KEY'); },
  get elevenLabsApiKey() { return readEnv('ELEVENLABS_API_KEY'); },
  get elevenLabsVoiceId() { return readEnv('ELEVENLABS_VOICE_ID'); },
  get openWeatherApiKey() { return getOpenWeatherApiKey(); },
  get port() { return Number(readEnv('PORT') ?? '8080'); },
  get r2Configured() { return hasR2Config(); },
};
