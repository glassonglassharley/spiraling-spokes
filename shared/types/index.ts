export interface LatLng {
  lat: number;
  lng: number;
}

export interface Waypoint {
  id: string;
  trip_id: string;
  sequence_index: number;
  lat: number;
  lng: number;
  heading: number;
  elevation_ft: number | null;
  road_name: string | null;
  city: string | null;
  state: string | null;
  distance_from_start_miles: number;
  is_milestone: boolean;
  milestone_name: string | null;
  created_at: string;
}

export interface Trip {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'completed';
  start_location: { name: string; lat: number; lng: number };
  end_location: { name: string; lat: number; lng: number };
  total_distance_miles: number | null;
  created_at: string;
  completed_at: string | null;
}

export interface RiderState {
  id: number;
  trip_id: string;
  current_waypoint_index: number;
  current_lat: number;
  current_lng: number;
  current_heading: number;
  current_city: string | null;
  current_state: string | null;
  miles_traveled: number;
  miles_remaining: number | null;
  started_at: string | null;
  estimated_arrival: string | null;
  is_paused: boolean;
  pause_reason: 'night' | 'vote' | 'milestone' | 'manual' | null;
  last_frame_at: string | null;
  last_frame_url: string | null;
  speed_multiplier: number;
}

export interface ChatMessage {
  id: string;
  trip_id: string;
  user_id: string | null;
  username: string;
  source: 'platform' | 'twitch' | 'youtube' | 'tiktok';
  message: string;
  waypoint_index: number | null;
  is_highlighted: boolean;
  created_at: string;
}

export interface Frame {
  id: string;
  trip_id: string;
  waypoint_index: number;
  lat: number;
  lng: number;
  heading: number;
  street_view_url: string | null;
  cached_image_r2_key: string | null;
  commentary: string | null;
  audio_r2_key: string | null;
  weather_data: WeatherData | null;
  location_data: LocationData | null;
  captured_at: string;
}

export interface WeatherData {
  description: string;
  temp: number;
  windSpeed: number;
  windDir: string;
  humidity: number;
  icon: string;
  feelsLike?: number;
  temp_f?: number;
  wind_speed_mph?: number;
  wind_direction?: string;
  feels_like_f?: number;
}

export interface LocationData {
  city: string | null;
  state: string | null;
  road: string | null;
  lat: number;
  lng: number;
  elevation: number | null;
}

export interface Vote {
  id: string;
  trip_id: string;
  question: string;
  option_a: string;
  option_b: string;
  votes_a: number;
  votes_b: number;
  status: 'open' | 'resolved';
  winning_option: string | null;
  triggered_at_waypoint: number | null;
  resolved_at: string | null;
  created_at: string;
}

export interface Milestone {
  id: string;
  trip_id: string;
  type: 'state_line' | 'city' | 'landmark' | 'distance';
  name: string;
  description: string | null;
  lat: number;
  lng: number;
  waypoint_index: number;
  triggered_at: string;
}

export interface AxleMemory {
  id: string;
  trip_id: string;
  memory_type: 'viewer' | 'location' | 'event' | 'preference';
  key: string;
  value: string;
  importance: number;
  created_at: string;
}

// WebSocket message types
export type WSMessageType =
  | 'INIT'
  | 'NEW_FRAME'
  | 'COMMENTARY'
  | 'AUDIO_READY'
  | 'CHAT_MESSAGE'
  | 'CHAT_RESPONSE'
  | 'MILESTONE'
  | 'VOTE_OPEN'
  | 'VOTE_UPDATE'
  | 'VOTE_RESOLVED'
  | 'VIEWER_COUNT'
  | 'RIDER_PAUSED'
  | 'RIDER_RESUMED'
  | 'LOOP_RESET'
  | 'SPONSOR_ACTIVE';

export interface WSMessage {
  type: WSMessageType;
  payload: Record<string, unknown>;
}

// BullMQ job types
export interface CommentaryJob {
  tripId: string;
  waypointIndex: number;
  imageUrl: string;
  imageBuffer: string; // base64
  location: LocationData;
  isMilestone: boolean;
  milestoneName: string | null;
  milesTraveled: number;
  milesRemaining: number;
}

export interface TTSJob {
  text: string;
  waypointIndex: number;
  priority: number;
  audioKey?: string;
}

export interface RouteComputerConfig {
  origin: string;
  destination: string;
  waypoints?: string[];
  stepIntervalMeters: number;
  avoidHighways: boolean;
  tripName: string;
}
