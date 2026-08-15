export const MY_TRIPS_QUERY_KEY = ['my-trips', 'saved'] as const;

let invalidate: (() => void) | null = null;

export function registerMyTripsInvalidator(fn: (() => void) | null) {
  invalidate = fn;
}

/** Mark the My Trips list stale so the next focus/refetch hits the server. */
export function invalidateMyTripsList() {
  invalidate?.();
}
