import { r2Get, r2Put, cdnUrl, isR2Configured } from '../../shared/storage/r2';
import { config, warnMockFallback, warnOnce } from '../../shared/config';
import { mockSceneLibrary } from '../../shared/mock/demo';

const SV_WIDTH = 1280;
const SV_HEIGHT = 720;
const SV_FOV = 90;
const SV_PITCH = -5;

export class NoImageryError extends Error {
  constructor(lat: number, lng: number) {
    super(`No Street View imagery at ${lat.toFixed(5)},${lng.toFixed(5)}`);
    this.name = 'NoImageryError';
  }
}

interface SVParams {
  lat: number;
  lng: number;
  heading: number;
  pitch?: number;
  fov?: number;
  width?: number;
  height?: number;
}

function mockReason(): string | null {
  if (!config.liveMode) return 'LIVE_MODE is not true';
  if (!config.googleMapsApiKey) return 'GOOGLE_MAPS_API_KEY is missing';
  return null;
}

export function isStreetViewLive(): boolean {
  return mockReason() === null;
}

export function buildStreetViewUrl(params: SVParams): string {
  const base = 'https://maps.googleapis.com/maps/api/streetview';
  const query = new URLSearchParams({
    size: `${params.width ?? SV_WIDTH}x${params.height ?? SV_HEIGHT}`,
    location: `${params.lat},${params.lng}`,
    heading: String(Math.round(params.heading)),
    pitch: String(params.pitch ?? SV_PITCH),
    fov: String(params.fov ?? SV_FOV),
    key: config.googleMapsApiKey ?? '',
    return_error_code: 'true',
    source: 'outdoor',
  });
  return `${base}?${query}`;
}

// Minimal gray JPEG for fallback display (never used for AI — NoImageryError thrown instead)
function mockImageBuffer(): Buffer {
  return Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U' +
    'HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAAIAAgDASIA' +
    'AhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABgUE/8QAIRAAAgICAQUAAAAAAAAAAAAAAAA' +
    'BAgMEABIhMUFR/8QAFQEBAQAAAAAAAAAAAAAAAAAAAQD/xAAYEQEBAQEBAAAAAAAAAAAAA' +
    'AAAAREC/9oADAMBAAIRAxEAPwCpbLdbZex21dVDEFW+o+WOtlY9zHH5FeUywZI3DKQQe' +
    'hBoo/H/2Q==',
    'base64'
  );
}

export interface StreetViewResult {
  buffer: Buffer;
  fromCache: boolean;
  svUrl: string;
  cdnImageUrl: string | null;
  mode: 'live' | 'mock';
}

export async function fetchStreetViewImage(
  params: SVParams,
  tripId: string,
  waypointIndex: number
): Promise<StreetViewResult> {
  const cacheKey = `sv/${tripId}/${waypointIndex}.jpg`;
  const svUrl = buildStreetViewUrl(params);
  const reason = mockReason();

  if (reason) {
    warnMockFallback('StreetView', reason);
    const scene = mockSceneLibrary[Math.abs(waypointIndex) % mockSceneLibrary.length];
    return {
      buffer: mockImageBuffer(),
      fromCache: false,
      svUrl: scene.image,
      cdnImageUrl: scene.image,
      mode: 'mock',
    };
  }

  if (!isR2Configured()) {
    warnOnce('R2', 'R2 env vars missing — skipping Street View cache read/write');
  } else {
    const cached = await r2Get(cacheKey);
    if (cached) {
      console.log(`[StreetView] Cache hit: ${cacheKey}`);
      return { buffer: cached, fromCache: true, svUrl, cdnImageUrl: cdnUrl(cacheKey), mode: 'live' };
    }
  }

  console.log(`[StreetView] LIVE fetch lat=${params.lat.toFixed(5)} lng=${params.lng.toFixed(5)} heading=${Math.round(params.heading)}`);

  let response: Response;
  try {
    response = await fetch(svUrl);
  } catch (err) {
    console.error('[StreetView] Fetch error:', err);
    throw new NoImageryError(params.lat, params.lng);
  }

  if (!response.ok) {
    console.warn(`[StreetView] HTTP ${response.status}`);
    throw new NoImageryError(params.lat, params.lng);
  }

  const vpmStatus = response.headers.get('X-VPM-Status');
  if (vpmStatus === 'ZERO_RESULTS') {
    throw new NoImageryError(params.lat, params.lng);
  }

  const contentLengthHeader = response.headers.get('content-length');
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null;
  const buffer = Buffer.from(await response.arrayBuffer());

  if ((contentLength !== null && contentLength < 5000) || buffer.length < 5000) {
    console.warn(`[StreetView] Likely no-imagery placeholder (${buffer.length} bytes) at ${params.lat},${params.lng}`);
    throw new NoImageryError(params.lat, params.lng);
  }

  if (isR2Configured()) {
    r2Put(cacheKey, buffer, 'image/jpeg').catch((err) =>
      console.error('[StreetView] R2 write error:', err)
    );
  }

  return {
    buffer,
    fromCache: false,
    svUrl,
    cdnImageUrl: isR2Configured() ? cdnUrl(cacheKey) : null,
    mode: 'live',
  };
}
