-- AXLE Platform Database Schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  start_location JSONB NOT NULL,
  end_location JSONB NOT NULL,
  total_distance_miles FLOAT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS waypoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  sequence_index INTEGER NOT NULL,
  lat FLOAT NOT NULL,
  lng FLOAT NOT NULL,
  heading FLOAT NOT NULL,
  elevation_ft FLOAT,
  road_name TEXT,
  city TEXT,
  state TEXT,
  distance_from_start_miles FLOAT NOT NULL DEFAULT 0,
  is_milestone BOOLEAN DEFAULT FALSE,
  milestone_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trip_id, sequence_index)
);

CREATE INDEX IF NOT EXISTS waypoints_trip_seq ON waypoints(trip_id, sequence_index);

CREATE TABLE IF NOT EXISTS rider_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  trip_id UUID REFERENCES trips(id),
  current_waypoint_index INTEGER DEFAULT 0,
  current_lat FLOAT,
  current_lng FLOAT,
  current_heading FLOAT,
  current_city TEXT,
  current_state TEXT,
  miles_traveled FLOAT DEFAULT 0,
  miles_remaining FLOAT,
  started_at TIMESTAMPTZ,
  estimated_arrival TIMESTAMPTZ,
  is_paused BOOLEAN DEFAULT FALSE,
  pause_reason TEXT,
  last_frame_at TIMESTAMPTZ,
  last_frame_url TEXT,
  speed_multiplier FLOAT DEFAULT 1.0
);

-- Ensure only one rider state row exists
INSERT INTO rider_state (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS frames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  waypoint_index INTEGER,
  lat FLOAT,
  lng FLOAT,
  heading FLOAT,
  street_view_url TEXT,
  cached_image_r2_key TEXT,
  commentary TEXT,
  audio_r2_key TEXT,
  weather_data JSONB,
  location_data JSONB,
  captured_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS frames_trip_waypoint ON frames(trip_id, waypoint_index);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  stripe_customer_id TEXT,
  subscription_tier TEXT DEFAULT 'free',
  subscription_active BOOLEAN DEFAULT FALSE,
  total_tipped_cents INTEGER DEFAULT 0,
  hometown TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  username TEXT NOT NULL DEFAULT 'anonymous',
  source TEXT DEFAULT 'platform',
  message TEXT NOT NULL,
  waypoint_index INTEGER,
  is_highlighted BOOLEAN DEFAULT FALSE,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_messages_trip_created ON chat_messages(trip_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_messages_unprocessed ON chat_messages(processed) WHERE processed = FALSE;

CREATE TABLE IF NOT EXISTS tips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  amount_cents INTEGER NOT NULL,
  message TEXT,
  stripe_payment_intent_id TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  votes_a INTEGER DEFAULT 0,
  votes_b INTEGER DEFAULT 0,
  status TEXT DEFAULT 'open',
  winning_option TEXT,
  triggered_at_waypoint INTEGER,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vote_id UUID REFERENCES votes(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  chosen TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(vote_id, user_id)
);

CREATE TABLE IF NOT EXISTS milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  type TEXT,
  name TEXT,
  description TEXT,
  lat FLOAT,
  lng FLOAT,
  waypoint_index INTEGER,
  triggered_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sponsors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  logo_url TEXT,
  tagline TEXT,
  trigger_type TEXT,
  trigger_value TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS axle_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  memory_type TEXT,
  key TEXT,
  value TEXT,
  importance INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS axle_memory_trip ON axle_memory(trip_id, importance DESC);

CREATE TABLE IF NOT EXISTS axle_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  source TEXT DEFAULT 'companion_site',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
