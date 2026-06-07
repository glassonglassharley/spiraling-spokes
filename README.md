# AXLE — AI Bike Livestream Platform

> The first AI that bikes so you don't have to.

## Quick Start — Mock Mode (no API keys, no paid calls)

Mock mode is the safe default. Leave `LIVE_MODE=false` or unset it. In this mode AXLE uses local scenic mock frames, mock AI commentary, silent/local TTS stubs, mock weather, simulated chat/tips/votes/leaderboard data, and admin demo controls. No Google Street View, ElevenLabs, OpenWeatherMap, Stripe, Twitch, Claude Vision, or R2 calls are required.

```bash
npm install
LIVE_MODE=false npm run dev:server   # terminal 1 — API/WebSocket/audio server on :8080
LIVE_MODE=false npm run dev:web      # terminal 2 — viewer app on :3000
```

Open:
- Viewer dashboard: http://localhost:3000
- Stream canvas / OBS scene: http://localhost:3000/stream
- Admin mock controls: http://localhost:3000/admin

The admin page includes local demo route presets, pause/resume controls, speed controls, waypoint nudges, and mock chat/tip/shoutout injection controls. These controls are safe in mock mode and never flip live APIs on.

Optional local infrastructure for deeper backend testing:

```bash
docker-compose up -d          # Postgres + Redis
npm run db:migrate
npm run compute-route         # small/dev route generation only; do not generate NYC-to-LA by default
npm run start-trip -- --trip-id <uuid from above>
```

## Safe verification scripts

Each script clearly prints whether it is using live or mock mode. With `LIVE_MODE=false`, they make no external paid API calls.

```bash
LIVE_MODE=false npm run test-street-view
LIVE_MODE=false npm run test-tts
LIVE_MODE=false npm run test-weather
```

To run exactly one live check for each first integration, set `LIVE_MODE=true` and only the needed key(s):

```bash
# One Google Street View Static API frame only
LIVE_MODE=true GOOGLE_MAPS_API_KEY=... npm run test-street-view

# One ElevenLabs line only
LIVE_MODE=true ELEVENLABS_API_KEY=... ELEVENLABS_VOICE_ID=... npm run test-tts

# One OpenWeatherMap current-weather lookup only
LIVE_MODE=true OPENWEATHERMAP_API_KEY=... npm run test-weather
```

Do not bulk-run route/frame jobs with live keys without explicit confirmation. Do not compute full NYC-to-LA waypoint sets by default.

---

## Phase 2 — Live Mode

Set `LIVE_MODE=true` in `.env` to allow real API calls. `LIVE_MODE=true` is the required gate for paid/live integrations, and each service still falls back to mock behavior if its own key/config is missing or an external request fails.

### Environment variables

```bash
# Core
DATABASE_URL=postgresql://axle:axle@localhost:5432/axle
REDIS_URL=redis://localhost:6379
PORT=8080
LIVE_MODE=false              # safe default; set exactly true to allow live APIs

# Google
GOOGLE_MAPS_API_KEY=         # Street View Static API now gated by LIVE_MODE

# Anthropic — Claude Vision commentary (not enabled in Phase 2A)
ANTHROPIC_API_KEY=

# ElevenLabs — AXLE's voice
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=

# Weather
OPENWEATHERMAP_API_KEY=

# Cloudflare R2 — optional cache for Street View frames + audio
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=axle-media
R2_CDN_URL=https://cdn.axle.live

# Stripe — future tips + subscriptions; keep disabled unless LIVE_MODE=true and explicitly testing payments
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_CREW_MONTHLY=
STRIPE_PRICE_LEGEND_MONTHLY=

# NextAuth — future viewer accounts
NEXTAUTH_SECRET=
NEXTAUTH_URL=https://axle.live
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Twitch — future chat ingestion
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
TWITCH_CHANNEL=axlelive

# Next.js public
NEXT_PUBLIC_WS_URL=ws://localhost:8080
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_TWITCH_CHANNEL=axlelive
NEXT_PUBLIC_GOOGLE_MAPS_KEY=
```

### Live integrations currently implemented behind `LIVE_MODE`

- Google Street View Static API in `services/rider/streetView.ts`
  - size `1280x720`, `pitch=-5`, `fov=90`, `source=outdoor`
  - logs live lat/lng/heading
  - detects missing imagery via `X-VPM-Status: ZERO_RESULTS`, HTTP errors, or tiny response bodies
  - optionally reads/writes R2 cache when R2 env vars exist
  - falls back to local mock frames when not live or missing a key
- ElevenLabs TTS in `services/tts/elevenlabs.ts`
  - `model_id=eleven_turbo_v2`
  - stability `0.65`, similarity boost `0.85`, style `0.2`, speaker boost enabled
  - retries with exponential backoff up to 3 attempts
  - optionally saves audio to R2 when configured; otherwise writes local dev audio
  - failures return silent/mock audio so frame advancement can continue
- OpenWeatherMap in `services/weather/index.ts`
  - current weather by lat/lng
  - 10-minute cache by rounded coordinate grid cell
  - returns Fahrenheit temp, description, wind speed/direction, humidity, and feels-like fields
  - failures return mock weather

### Services still intentionally mocked or deferred

- Claude Vision commentary remains mocked/fallback-first.
- Stripe monetization is not part of this Phase 2A pass.
- Twitch ingestion is not part of this Phase 2A pass.
- NextAuth/viewer accounts are not part of this Phase 2A pass.
- Full route computation, OBS polish beyond local stream UI, and NYC-to-LA 50,000 waypoint generation are intentionally not enabled.

---

## Tip side effects (planned)

| Amount | Action |
|--------|--------|
| $1  | Highlight chat message for 60s |
| $5  | AXLE reads your username in next commentary |
| $10 | Trigger a route vote |
| $25 | AXLE does a 360° pan (pause 60s) |
| $50 | Name an upcoming waypoint |
| $100 | Unlock a custom detour |

## Subscription tiers (planned)

| Tier | Price | Perks |
|------|-------|-------|
| Free | $0 | Watch + rate-limited chat + 1 vote/day |
| Crew | $4.99/mo | Unlimited chat, 2× vote weight, AXLE learns you |
| Legend | $19.99/mo | 5× vote, monthly shoutout, name a waypoint |

## OBS Setup

1. Browser Source → URL: `http://localhost:3000/stream`
2. Width: `1920`, Height: `1080`
3. Custom CSS: `body { margin: 0; background: transparent; }`
4. In mock mode, the stream canvas is visual-first and does not require external audio services.

---

## Architecture

```text
LIVE_MODE=true permits, service-by-service:
  - Google Street View Static API (optional R2 cache)
  - ElevenLabs eleven_turbo_v2 TTS (optional R2 cache)
  - OpenWeatherMap current weather

Mock/default fallbacks when LIVE_MODE is false, a key is missing, or an API fails:
  - Street View → local scenic mock route SVGs
  - Commentary → location-aware mock commentary bank
  - ElevenLabs → silent local MP3 stub
  - Weather → static partly-cloudy 72°F stub
  - Viewer/admin → simulated chat, tips, votes, leaderboard, route presets

Key pipeline:
  advanceAndCapture() → fetchStreetViewImage()
             → broadcastToClients(NEW_FRAME)
             → commentaryQueue.add() → generateCommentary()
             → broadcastToClients(COMMENTARY)
             → ttsQueue.add() → synthesize()
             → broadcastToClients(AUDIO_READY)
```

## Phase Roadmap

| Phase | Status | Features |
|-------|--------|---------|
| 1 — MVP | Done | Route engine, Street View abstraction, mock commentary, WebSocket, stream canvas |
| 2A — Live foundation | Current | LIVE_MODE safety, one-frame Street View, one-line ElevenLabs, one-location OpenWeatherMap, rich mock UX |
| 2B — Community/payments | Planned | Stripe, Twitch ingestion, auth, viewer account polish |
| 3 — Community | Planned | AXLE memory tuning, sponsors, highlights gallery, Discord bot |
| 4 — Platform | Future | Multi-rider, international routes, AXLE vs AXLE race |
