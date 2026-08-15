const OSRM_ROUTE_URL = 'https://router.project-osrm.org/route/v1/driving';
const OSRM_TIMEOUT_MS = 8_000;

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface DirectionsResult {
  distanceMeters: number;
  durationSeconds: number;
  /** Leaflet [lat, lng] pairs when geometry is requested. */
  geometry?: Array<[number, number]>;
}

interface OsrmRouteResponse {
  code?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: { coordinates?: Array<[number, number]> };
  }>;
}

function osrmUrl(origin: GeoPoint, destination: GeoPoint, includeGeometry: boolean): string {
  const path = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  return includeGeometry
    ? `${OSRM_ROUTE_URL}/${path}?overview=full&geometries=geojson`
    : `${OSRM_ROUTE_URL}/${path}?overview=false`;
}

/**
 * Calls the public OSRM demo router (driving). Returns null on any failure so
 * callers can degrade gracefully to geodesic estimates.
 */
export async function fetchOsrmDirections(
  origin: GeoPoint,
  destination: GeoPoint,
  options?: { timeoutMs?: number; geometry?: boolean },
): Promise<DirectionsResult | null> {
  const includeGeometry = options?.geometry !== false;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options?.timeoutMs ?? OSRM_TIMEOUT_MS,
  );
  try {
    const res = await fetch(osrmUrl(origin, destination, includeGeometry), {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as OsrmRouteResponse;
    if (data?.code !== 'Ok' || !data.routes?.[0]) return null;
    const route = data.routes[0];
    const distanceMeters = Number(route.distance);
    const durationSeconds = Number(route.duration);
    if (!Number.isFinite(distanceMeters) || distanceMeters < 0) return null;
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
    const geometry =
      includeGeometry && Array.isArray(route.geometry?.coordinates)
        ? route.geometry.coordinates.map((c) => [c[1], c[0]] as [number, number])
        : undefined;
    return { distanceMeters, durationSeconds, geometry };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
