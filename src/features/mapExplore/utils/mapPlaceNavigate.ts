import {
  isNavigableUserPosition,
  parseLatLng,
} from '../../../services/location/distance';

export type MapNavigateAction =
  | 'route'
  | 'no_place'
  | 'invalid_destination'
  | 'permission_denied'
  | 'gps_unavailable';

export type MapNavigatePlan = {
  action: MapNavigateAction;
  destinationValid: boolean;
  currentLocationValid: boolean;
};

type UserPositionLike = {
  latitude?: unknown;
  longitude?: unknown;
  accuracy?: unknown;
  timestamp?: number;
} | null | undefined;

export const MAP_NAVIGATE_MESSAGES = {
  no_place: 'Select a place to navigate.',
  invalid_destination: 'This place does not have valid coordinates.',
  permission_denied: 'Need location access to navigate from your current location.',
  gps_unavailable: 'Waiting for a more accurate GPS fix. Please keep location on and try again.',
  routing_error: 'Could not start navigation. Please try again.',
} as const;

/** Destination-only check — never invents coordinates. */
export function isValidMapNavigateDestination(lat: unknown, lng: unknown): boolean {
  return parseLatLng(lat, lng) != null;
}

/**
 * Decide whether the map place-card Navigate action may start in-app routing.
 * Uses navigation-specific GPS (isNavigableUserPosition), not the stricter label threshold.
 */
export function planMapPlaceNavigate(input: {
  hasPlace: boolean;
  destLat: unknown;
  destLng: unknown;
  hasPermission: boolean;
  currentPosition?: UserPositionLike;
  now?: number;
}): MapNavigatePlan {
  const dest = parseLatLng(input.destLat, input.destLng);
  const currentLocationValid = isNavigableUserPosition(input.currentPosition, input.now);

  if (!input.hasPlace) {
    return { action: 'no_place', destinationValid: false, currentLocationValid };
  }
  if (!dest) {
    return { action: 'invalid_destination', destinationValid: false, currentLocationValid };
  }
  if (!input.hasPermission) {
    return { action: 'permission_denied', destinationValid: true, currentLocationValid };
  }
  if (!currentLocationValid) {
    return { action: 'gps_unavailable', destinationValid: true, currentLocationValid: false };
  }
  return { action: 'route', destinationValid: true, currentLocationValid: true };
}

export function logMapNavigate(plan: MapNavigatePlan, extra?: { pressed?: boolean }): void {
  if (extra?.pressed) {
    console.log('[MapNavigate] pressed');
  }
  console.log(`[MapNavigate] destinationValid=${plan.destinationValid}`);
  console.log(`[MapNavigate] currentLocationValid=${plan.currentLocationValid}`);
  console.log(`[MapNavigate] action=${plan.action}`);
}
