/**
 * Internal PalSafar directions — the single entry point for "take me there".
 *
 * ## Why this exists
 *
 * PalSafar already knows how to draw a route: `MapScreen` fetches an OSRM
 * polyline, fits the camera to it and paints it on the Leaflet map. Several
 * workspaces were nevertheless launching an external maps app instead, which
 * threw away the user's location, the camera fit, and the distance/ETA the app
 * had already computed.
 *
 * Those launches are classified in `DIRECTIONS_CONTEXT`:
 *
 * - `ride` opens a third-party provider (Uber/Ola/Rapido/BluSmart). That is the
 *   product, not a directions bug, and is never routed here.
 * - Every other context routes through {@link openInternalDirections}, which
 *   reuses the existing Map screen route pipeline.
 *
 * ## Why navigate instead of a new screen
 *
 * There is no standalone directions screen in this app. The routing pipeline is
 * inline state in `MapScreen` (permission check -> `calculateRoute` -> OSRM ->
 * `drawRoute`). Rather than build a second routing architecture, this helper
 * navigates to that same screen with a destination param, so there is exactly
 * one implementation of routing to keep correct.
 */
import { parseLatLng } from '../../../services/location/distance';

/** Where a "go there" tap came from. Only `ride` is exempt from internal routing. */
export type DirectionsContext =
  | 'ride'
  | 'map_card'
  | 'vendor_offer'
  | 'reel_vendor_card'
  | 'event_detail'
  | 'trip_stop'
  | 'itinerary';

/**
 * Contexts that must never launch an external navigation app.
 *
 * `ride` is deliberately absent: booking a cab is a hand-off, not directions.
 */
export const INTERNAL_DIRECTIONS_CONTEXTS: readonly DirectionsContext[] = [
  'map_card',
  'vendor_offer',
  'reel_vendor_card',
  'event_detail',
  'trip_stop',
  'itinerary',
];

export function isInternalDirectionsContext(context: DirectionsContext): boolean {
  return context !== 'ride';
}

export type InternalDirectionsDestination = {
  latitude: number;
  longitude: number;
  /** Shown in the directions summary. Falls back to a coordinate pair. */
  label?: string | null;
};

export type InternalDirectionsRequest = {
  navigation: { navigate: (...args: any[]) => void };
  destination?: {
    latitude?: unknown;
    longitude?: unknown;
    label?: string | null;
  } | null;
  context: DirectionsContext;
  /** Which Map layer to open underneath. Events must land on the Events tab. */
  initialMapTab?: 'places' | 'events' | 'vendors';
  /** Alerting is the caller's job; this is overridable for tests. */
  onUnavailable?: (message: string) => void;
  /** Monotonic token so the same destination can be re-opened on purpose. */
  requestKey?: number;
};

export const INTERNAL_DIRECTIONS_UNAVAILABLE = 'Directions are not available for this place.';

/**
 * Resolve a destination without ever inventing coordinates.
 *
 * `parseLatLng` is the same guard the map-card Navigate flow uses, so it rejects
 * Null Island (0,0), out-of-range values and swapped lat/lng. That matters
 * because itinerary stops coerce a missing coordinate to `0` before reaching
 * any direction handler — without this guard the user would be routed to the
 * Atlantic.
 */
export function resolveInternalDirectionsDestination(
  destination: InternalDirectionsRequest['destination'],
): InternalDirectionsDestination | null {
  if (!destination) return null;
  const parsed = parseLatLng(destination.latitude, destination.longitude);
  if (!parsed) return null;
  return {
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    label: destination.label ?? null,
  };
}

/**
 * Route to PalSafar's internal directions.
 *
 * Returns the destination that was handed to the Map screen, or `null` when the
 * destination had no usable coordinates — in which case nothing was navigated
 * and the caller is expected to surface {@link INTERNAL_DIRECTIONS_UNAVAILABLE}.
 */
export function openInternalDirections(
  request: InternalDirectionsRequest,
): InternalDirectionsDestination | null {
  const resolved = resolveInternalDirectionsDestination(request.destination);
  if (!resolved) {
    (request.onUnavailable ?? defaultUnavailable)(INTERNAL_DIRECTIONS_UNAVAILABLE);
    return null;
  }

  const params = {
    directions: {
      latitude: resolved.latitude,
      longitude: resolved.longitude,
      label: resolved.label ?? undefined,
      context: request.context,
    },
    // `Date.now()` would repeat if two taps land in the same millisecond, so the
    // caller may pass an explicit key when re-routing to the same place.
    directionsKey: request.requestKey ?? Date.now(),
    ...(request.initialMapTab ? { initialMapTab: request.initialMapTab } : {}),
  };

  request.navigation.navigate('MainTabs', {
    screen: 'Map',
    params,
  });

  return resolved;
}

function defaultUnavailable(message: string) {
  // Imported lazily so this helper stays usable from non-React callers.
  const { Alert } = require('react-native') as typeof import('react-native');
  Alert.alert('Location unavailable', message);
}