import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { r2Put, cdnUrl, isR2Configured } from '../../shared/storage/r2';
import { config, warnMockFallback, warnOnce } from '../../shared/config';

// Dev fallback: write audio to /tmp so the local HTTP server can serve it
export const LOCAL_AUDIO_DIR = path.join(os.tmpdir(), 'axle-audio');
fs.mkdirSync(LOCAL_AUDIO_DIR, { recursive: true });

const VOICE_SETTINGS = {
  stability: 0.65,
  similarity_boost: 0.85,
  style: 0.2,
  use_speaker_boost: true,
};

// Minimal silent MP3 stub for mock/fallback mode
function silentMp3(): Buffer {
  return Buffer.from(
    'fffb9000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
    'hex'
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mockReason(): string | null {
  if (!config.liveMode) return 'LIVE_MODE is not true';
  if (!config.elevenLabsApiKey) return 'ELEVENLABS_API_KEY is missing';
  if (!config.elevenLabsVoiceId) return 'ELEVENLABS_VOICE_ID is missing';
  return null;
}

export function isTTSLive(): boolean {
  return mockReason() === null;
}

async function callElevenLabs(text: string): Promise<Buffer> {
  const apiKey = config.elevenLabsApiKey!;
  const voiceId = config.elevenLabsVoiceId!;
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2',
          voice_settings: VOICE_SETTINGS,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`ElevenLabs ${res.status}: ${body}`);
      }

      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastError = err;
      if (attempt < 3) {
        const wait = 1000 * 2 ** (attempt - 1);
        console.warn(`[TTS] ElevenLabs attempt ${attempt}/3 failed, retrying in ${wait}ms`);
        await sleep(wait);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export interface TTSSynthResult {
  audioUrl: string;
  audioKey: string;
  mode?: 'live' | 'mock';
  fromR2?: boolean;
}

function writeLocalAudio(filename: string, buffer: Buffer): TTSSynthResult {
  const localPath = path.join(LOCAL_AUDIO_DIR, filename);
  fs.writeFileSync(localPath, buffer);
  return {
    audioUrl: `http://localhost:${config.port}/audio/${filename}`,
    audioKey: filename,
    fromR2: false,
  };
}

export async function synthesize(
  text: string,
  waypointIndex: number
): Promise<TTSSynthResult> {
  const filename = `${waypointIndex}-${Date.now()}.mp3`;
  const reason = mockReason();

  if (reason) {
    warnMockFallback('TTS', reason);
    await sleep(200);
    return { ...writeLocalAudio(filename, silentMp3()), mode: 'mock' };
  }

  let buffer: Buffer;
  let mode: 'live' | 'mock' = 'live';
  try {
    console.log(`[TTS] LIVE ElevenLabs synthesis voice=${config.elevenLabsVoiceId} chars=${text.length}`);
    buffer = await callElevenLabs(text);
  } catch (err) {
    console.error('[TTS] ElevenLabs failed; using silent fallback so frame advancement continues:', err);
    buffer = silentMp3();
    mode = 'mock';
  }

  const r2Key = `audio/${filename}`;

  if (isR2Configured()) {
    try {
      await r2Put(r2Key, buffer, 'audio/mpeg');
      return { audioUrl: cdnUrl(r2Key), audioKey: r2Key, mode, fromR2: true };
    } catch (err) {
      console.error('[TTS] R2 write error; falling back to local audio URL:', err);
    }
  } else {
    warnOnce('R2', 'R2 env vars missing — skipping TTS audio upload');
  }

  return { ...writeLocalAudio(filename, buffer), mode };
}
