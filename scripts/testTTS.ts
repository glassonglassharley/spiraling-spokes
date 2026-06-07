import * as dotenv from 'dotenv';
dotenv.config();

import { synthesize, isTTSLive } from '../services/tts/elevenlabs';

async function main() {
  const text = "Hey, this is AXLE. Testing voice synthesis on the open road.";

  console.log(`[testTTS] LIVE_MODE=${process.env.LIVE_MODE}`);
  console.log(`[testTTS] ELEVENLABS_API_KEY=${process.env.ELEVENLABS_API_KEY ? 'set' : 'not set'}`);
  console.log(`[testTTS] ELEVENLABS_VOICE_ID=${process.env.ELEVENLABS_VOICE_ID ? 'set' : 'not set'}`);
  console.log(`[testTTS] mode=${isTTSLive() ? 'live (exactly one ElevenLabs line)' : 'mock (silent/local stub, no external request)'}\n`);
  console.log(`[testTTS] Synthesizing one safe line: "${text}"\n`);

  const result = await synthesize(text, 0);
  console.log(`Result:`);
  console.log(`  audioUrl: ${result.audioUrl}`);
  console.log(`  audioKey: ${result.audioKey}`);
  console.log(`  mode:     ${result.mode ?? (isTTSLive() ? 'live' : 'mock')}`);
  console.log(`  fromR2:   ${result.fromR2 ? 'yes' : 'no'}`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
