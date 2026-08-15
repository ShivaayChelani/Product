import type { TripPlan, TripPlanDay, TripPlanStop } from '../services/api/trips';

/** Stable list key — always includes index so duplicate ids never collide. */
export function dayListKey(day: TripPlanDay, index: number): string {
  const id = day.id != null ? String(day.id) : `num-${day.dayNumber}`;
  return `day-${id}-${index}`;
}

/** Stable list key — always includes index so duplicate ids never collide. */
export function stopListKey(stop: TripPlanStop, index: number): string {
  const id = stop.id != null ? String(stop.id) : `ord-${stop.order}`;
  return `stop-${id}-${index}`;
}

/** Remove duplicate day/stop rows that can appear after stale cache merges. */
export function normalizeTripDays(days: TripPlanDay[] | null | undefined): TripPlanDay[] {
  if (!days?.length) return [];

  const seenDayIds = new Set<string>();
  const normalized: TripPlanDay[] = [];

  for (const day of days) {
    if (!day) continue;
    const dayKey = day.id != null ? String(day.id) : `num-${day.dayNumber}`;
    if (seenDayIds.has(dayKey)) continue;
    seenDayIds.add(dayKey);

    const seenStopIds = new Set<string>();
    const stops: TripPlanStop[] = [];
    for (const stop of day.stops || []) {
      if (!stop) continue;
      const stopKey = stop.id != null ? String(stop.id) : `ord-${stop.order}-${stops.length}`;
      if (seenStopIds.has(stopKey)) continue;
      seenStopIds.add(stopKey);
      stops.push(stop);
    }

    normalized.push({ ...day, stops });
  }

  return normalized;
}

export function normalizeTripPlan(trip: TripPlan): TripPlan {
  return {
    ...trip,
    tripDays: normalizeTripDays(trip.tripDays),
  };
}
