import type { TripPlan, TripStatus } from '../services/api/trips';

export type TripNavMode = 'resume' | 'view' | 'manual';

export type TripNavTarget =
  | { screen: 'TripBuilder'; params?: { tripId?: string } }
  | { screen: 'TripDetail'; params: { tripId: string; resume?: boolean; mode: TripNavMode } };

function normalizeStatus(status?: TripPlan['status'] | string | null): TripStatus | null {
  if (!status) return null;
  return String(status).toUpperCase() as TripStatus;
}

function tripHasStops(trip: Pick<TripPlan, 'tripDays'>): boolean {
  return trip.tripDays?.some(d => (d.stops?.length ?? 0) > 0) ?? false;
}

/**
 * Itinerary button: view the saved plan for this trip.
 * Never opens Build Manually / TripBuilder — always TripDetail with tripId.
 */
export function resolveItineraryNavigation(
  trip: Pick<TripPlan, 'id' | 'status' | 'tripDays'>,
): TripNavTarget {
  return {
    screen: 'TripDetail',
    params: { tripId: trip.id, mode: 'view' },
  };
}

/**
 * Continue button: resume building (draft) or resume/view an in-progress trip.
 * Only DRAFT trips open TripBuilder; saved/upcoming trips open TripDetail.
 */
export function resolveContinueNavigation(
  trip: Pick<TripPlan, 'id' | 'status' | 'tripDays'>,
): TripNavTarget {
  const status = normalizeStatus(trip.status);

  if (status === 'DRAFT') {
    return { screen: 'TripBuilder', params: { tripId: trip.id } };
  }
  if (status === 'UPCOMING' || status === 'ACTIVE') {
    return {
      screen: 'TripDetail',
      params: { tripId: trip.id, resume: true, mode: 'resume' },
    };
  }
  return {
    screen: 'TripDetail',
    params: { tripId: trip.id, mode: 'view' },
  };
}

/** Build Manually — new manual builder without an existing trip context. */
export function resolveManualBuildNavigation(): TripNavTarget {
  return { screen: 'TripBuilder', params: undefined };
}

export function isCityMismatchError(err: unknown): boolean {
  const e = err as { code?: string; status?: number } | null;
  return e?.code === 'CITY_MISMATCH';
}

export { tripHasStops, normalizeStatus };
