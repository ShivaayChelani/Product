import { tripsApi, TripPlan, TripProgressResponse } from '../services/api/trips';
import { DEV_FLAGS } from '../config/devFlags';

export type TripResumeTarget =
  | {
      kind: 'tripDetail';
      tripId: string;
      title: string;
      status: string;
      stopCount: number;
      progressPct: number;
    }
  | {
      kind: 'tripBuilder';
      tripId: string;
      title: string;
      status: 'DRAFT';
      stopCount: number;
      progressPct: number;
    }
  | {
      kind: 'hub';
      title?: string;
      stopCount: number;
      progressPct: number;
    };

export function flattenTripStopCount(trip: TripPlan | null | undefined): number {
  if (!trip?.tripDays?.length) return 0;
  return trip.tripDays.reduce((n, d) => n + (d.stops?.length || 0), 0);
}

export function flattenTripPlaceIds(trip: TripPlan | null | undefined): string[] {
  if (!trip?.tripDays?.length) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const day of trip.tripDays) {
    for (const stop of day.stops || []) {
      const placeId = stop.place?.slug || stop.placeId;
      if (!placeId || seen.has(placeId)) continue;
      seen.add(placeId);
      ids.push(placeId);
    }
  }
  return ids;
}

export function previewTripStopNames(trip: TripPlan | null | undefined, limit = 3): string[] {
  if (!trip?.tripDays?.length) return [];
  const names: string[] = [];
  for (const day of [...trip.tripDays].sort((a, b) => a.dayNumber - b.dayNumber)) {
    for (const stop of [...(day.stops || [])].sort((a, b) => a.order - b.order)) {
      if (stop.place?.name) names.push(stop.place.name);
      if (names.length >= limit) return names;
    }
  }
  return names;
}

async function fetchFirstTrip(status: string): Promise<TripPlan | null> {
  const res = await tripsApi.list({ status, limit: 1 });
  const id = res.data?.[0]?.id;
  if (!id) return null;
  return tripsApi.getById(id);
}

/**
 * Prefer ACTIVE → UPCOMING → DRAFT (with stops). Falls back to Trips hub.
 */
export async function resolveTripResume(options?: {
  isGuest?: boolean;
}): Promise<TripResumeTarget> {
  if (options?.isGuest || !DEV_FLAGS.USE_SERVER_API) {
    return { kind: 'hub', stopCount: 0, progressPct: 0 };
  }

  try {
    const active = await fetchFirstTrip('ACTIVE');
    if (active && flattenTripStopCount(active) > 0) {
      let progressPct = 0;
      try {
        const progress: TripProgressResponse = await tripsApi.getProgress(active.id);
        progressPct = Math.round(progress.completionPercent || 0);
      } catch {
        const total = flattenTripStopCount(active);
        const visited = active.tripDays.reduce(
          (n, d) => n + (d.stops || []).filter(s => !!s.visitedAt).length,
          0,
        );
        progressPct = total > 0 ? Math.round((visited / total) * 100) : 0;
      }
      return {
        kind: 'tripDetail',
        tripId: active.id,
        title: active.title || active.destination || 'Active trip',
        status: 'ACTIVE',
        stopCount: flattenTripStopCount(active),
        progressPct,
      };
    }

    const upcoming = await fetchFirstTrip('UPCOMING');
    if (upcoming && flattenTripStopCount(upcoming) > 0) {
      return {
        kind: 'tripDetail',
        tripId: upcoming.id,
        title: upcoming.title || upcoming.destination || 'Upcoming trip',
        status: 'UPCOMING',
        stopCount: flattenTripStopCount(upcoming),
        progressPct: 0,
      };
    }

    const draft = await fetchFirstTrip('DRAFT');
    if (draft && flattenTripStopCount(draft) > 0) {
      return {
        kind: 'tripBuilder',
        tripId: draft.id,
        title: draft.title || draft.destination || 'Draft itinerary',
        status: 'DRAFT',
        stopCount: flattenTripStopCount(draft),
        progressPct: 0,
      };
    }
  } catch (err) {
  }

  return { kind: 'hub', stopCount: 0, progressPct: 0 };
}

/** Sync helper: place ids from the trip the user is most likely editing. */
export async function getActiveItineraryPlaceIds(): Promise<string[]> {
  if (!DEV_FLAGS.USE_SERVER_API) return [];
  try {
    for (const status of ['ACTIVE', 'UPCOMING', 'DRAFT'] as const) {
      const trip = await fetchFirstTrip(status);
      const ids = flattenTripPlaceIds(trip);
      if (ids.length) return ids;
    }
  } catch (err) {
  }
  return [];
}
