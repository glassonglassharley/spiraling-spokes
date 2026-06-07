import type { LatLng } from '../types';

export function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function calculateBearing(from: LatLng, to: LatLng): number {
  const φ1 = toRadians(from.lat);
  const φ2 = toRadians(to.lat);
  const Δλ = toRadians(to.lng - from.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

export function haversineDistanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000; // Earth radius in meters
  const φ1 = toRadians(a.lat);
  const φ2 = toRadians(b.lat);
  const Δφ = toRadians(b.lat - a.lat);
  const Δλ = toRadians(b.lng - a.lng);
  const h =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function metersToMiles(meters: number): number {
  return meters / 1609.344;
}

export function milesToMeters(miles: number): number {
  return miles * 1609.344;
}

// Interpolate a list of LatLng points to be evenly spaced every `intervalMeters`
export function interpolatePoints(points: LatLng[], intervalMeters: number): LatLng[] {
  if (points.length < 2) return points;

  const result: LatLng[] = [points[0]];
  let accumulated = 0;

  for (let i = 1; i < points.length; i++) {
    const segmentDist = haversineDistanceMeters(points[i - 1], points[i]);
    accumulated += segmentDist;

    while (accumulated >= intervalMeters) {
      const overshoot = accumulated - intervalMeters;
      const fraction = 1 - overshoot / segmentDist;
      result.push({
        lat: points[i - 1].lat + fraction * (points[i].lat - points[i - 1].lat),
        lng: points[i - 1].lng + fraction * (points[i].lng - points[i - 1].lng),
      });
      accumulated -= intervalMeters;
    }
  }

  result.push(points[points.length - 1]);
  return result;
}

// Decode Google Maps encoded polyline
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

// Smooth heading interpolation to avoid snapping on curves
export function interpolateHeading(h1: number, h2: number, t: number): number {
  let diff = h2 - h1;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return (h1 + diff * t + 360) % 360;
}
