/**
 * Authoritative consecutive-stop distance in kilometres.
 *
 * Displayed "distance from previous stop" is always the haversine between the
 * immediately preceding stop and the current stop in FINAL persisted order.
 * The first stop of a day has no previous-stop distance (null).
 */

export function roundKm(km: number): number {
  if (!Number.isFinite(km) || km <= 0) return 0;
  return Math.round(km * 100) / 100;
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface LatLngLike {
  latitude: number | null;
  longitude: number | null;
}

export function distanceFromPreviousStopKm(
  prev: LatLngLike | null | undefined,
  curr: LatLngLike | null | undefined,
): number | null {
  if (!prev || !curr) return null;
  if (
    prev.latitude == null || prev.longitude == null
    || curr.latitude == null || curr.longitude == null
  ) {
    return null;
  }
  return roundKm(haversineKm(prev.latitude, prev.longitude, curr.latitude, curr.longitude));
}

/** First stop → null; every later stop → haversine to the immediately previous coordinate. */
export function distancesForOrderedStops(stops: LatLngLike[]): Array<number | null> {
  return stops.map((stop, i) => (i === 0 ? null : distanceFromPreviousStopKm(stops[i - 1], stop)));
}
