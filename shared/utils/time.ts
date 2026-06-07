// Solar time utilities for determining day/night at a given location

export function getSolarTimeOfDay(lat: number, lng: number): {
  timeOfDay: 'dawn' | 'morning' | 'midday' | 'afternoon' | 'dusk' | 'night';
  localHour: number;
  isNight: boolean;
} {
  // Approximate local solar time using longitude offset
  const utcHour = new Date().getUTCHours() + new Date().getUTCMinutes() / 60;
  const solarHour = (utcHour + lng / 15 + 24) % 24;

  let timeOfDay: 'dawn' | 'morning' | 'midday' | 'afternoon' | 'dusk' | 'night';

  if (solarHour >= 5 && solarHour < 7) timeOfDay = 'dawn';
  else if (solarHour >= 7 && solarHour < 12) timeOfDay = 'morning';
  else if (solarHour >= 12 && solarHour < 14) timeOfDay = 'midday';
  else if (solarHour >= 14 && solarHour < 18) timeOfDay = 'afternoon';
  else if (solarHour >= 18 && solarHour < 20) timeOfDay = 'dusk';
  else timeOfDay = 'night';

  const isNight = solarHour < 6 || solarHour >= 20;

  return { timeOfDay, localHour: solarHour, isNight };
}

export function formatElapsedTime(startedAt: string): string {
  const elapsed = Date.now() - new Date(startedAt).getTime();
  const hours = Math.floor(elapsed / 3600000);
  const minutes = Math.floor((elapsed % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

export function estimateArrival(
  milesRemaining: number,
  avgMilesPerHour: number
): Date {
  const hoursRemaining = milesRemaining / avgMilesPerHour;
  return new Date(Date.now() + hoursRemaining * 3600000);
}
