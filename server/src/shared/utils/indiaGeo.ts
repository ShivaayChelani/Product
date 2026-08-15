/** Approximate India bounding box (mainland + major territories). */
export const INDIA_BOUNDS = {
  minLat: 6.5,
  maxLat: 37.6,
  minLng: 68.0,
  maxLng: 97.5,
} as const;

export function isCoordinateInIndia(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return (
    lat >= INDIA_BOUNDS.minLat &&
    lat <= INDIA_BOUNDS.maxLat &&
    lng >= INDIA_BOUNDS.minLng &&
    lng <= INDIA_BOUNDS.maxLng
  );
}
