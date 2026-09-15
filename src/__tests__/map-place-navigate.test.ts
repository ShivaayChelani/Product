import {
  isValidMapNavigateDestination,
  logMapNavigate,
  planMapPlaceNavigate,
} from '../features/mapExplore/utils/mapPlaceNavigate';
import { isReliableUserPosition } from '../services/location/distance';

const PLACE = { lat: 23.2599, lng: 77.4126 };
const now = Date.now();
const navigableFix = {
  latitude: 23.1815,
  longitude: 79.9864,
  accuracy: 300,
  timestamp: now,
};
const coarseLabelFix = {
  latitude: 23.1815,
  longitude: 79.9864,
  accuracy: 300,
  timestamp: now,
};

describe('map place-card Navigate planner', () => {
  it('routes when destination and navigable GPS are valid', () => {
    const plan = planMapPlaceNavigate({
      hasPlace: true,
      destLat: PLACE.lat,
      destLng: PLACE.lng,
      hasPermission: true,
      currentPosition: navigableFix,
      now,
    });
    expect(plan).toEqual({
      action: 'route',
      destinationValid: true,
      currentLocationValid: true,
    });
  });

  it('does not invent coordinates or navigate without a place', () => {
    expect(planMapPlaceNavigate({
      hasPlace: false,
      destLat: PLACE.lat,
      destLng: PLACE.lng,
      hasPermission: true,
      currentPosition: navigableFix,
      now,
    }).action).toBe('no_place');
  });

  it('rejects missing destination coordinates', () => {
    const plan = planMapPlaceNavigate({
      hasPlace: true,
      destLat: null,
      destLng: PLACE.lng,
      hasPermission: true,
      currentPosition: navigableFix,
      now,
    });
    expect(plan.destinationValid).toBe(false);
    expect(plan.action).toBe('invalid_destination');
    expect(isValidMapNavigateDestination(null, PLACE.lng)).toBe(false);
  });

  it('rejects invalid and swapped destination coordinates', () => {
    expect(isValidMapNavigateDestination(0, 0)).toBe(false);
    expect(isValidMapNavigateDestination(77.4126, 23.2599)).toBe(false);
    expect(isValidMapNavigateDestination(Number.NaN, PLACE.lng)).toBe(false);
    expect(planMapPlaceNavigate({
      hasPlace: true,
      destLat: 0,
      destLng: 0,
      hasPermission: true,
      currentPosition: navigableFix,
      now,
    }).action).toBe('invalid_destination');
  });

  it('uses navigation GPS (500m), not the stricter from-you label gate', () => {
    expect(isReliableUserPosition(coarseLabelFix, now)).toBe(false);
    const plan = planMapPlaceNavigate({
      hasPlace: true,
      destLat: PLACE.lat,
      destLng: PLACE.lng,
      hasPermission: true,
      currentPosition: coarseLabelFix,
      now,
    });
    expect(plan.action).toBe('route');
    expect(plan.currentLocationValid).toBe(true);
  });

  it('reports gps_unavailable instead of routing when the origin is unusable', () => {
    const plan = planMapPlaceNavigate({
      hasPlace: true,
      destLat: PLACE.lat,
      destLng: PLACE.lng,
      hasPermission: true,
      currentPosition: null,
      now,
    });
    expect(plan.action).toBe('gps_unavailable');
    expect(plan.currentLocationValid).toBe(false);
    expect(plan.destinationValid).toBe(true);
  });

  it('reports permission_denied before attempting a route', () => {
    const plan = planMapPlaceNavigate({
      hasPlace: true,
      destLat: PLACE.lat,
      destLng: PLACE.lng,
      hasPermission: false,
      currentPosition: navigableFix,
      now,
    });
    expect(plan.action).toBe('permission_denied');
    expect(plan.destinationValid).toBe(true);
  });

  it('does not throw when GPS or destination input is incomplete', () => {
    expect(() => planMapPlaceNavigate({
      hasPlace: true,
      destLat: undefined,
      destLng: undefined,
      hasPermission: true,
      currentPosition: undefined,
    })).not.toThrow();
  });

  it('logs safe MapNavigate diagnostics without coordinates', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    logMapNavigate({
      action: 'gps_unavailable',
      destinationValid: true,
      currentLocationValid: false,
    }, { pressed: true });
    const joined = spy.mock.calls.map(c => String(c[0])).join('\n');
    spy.mockRestore();
    expect(joined).toMatch(/\[MapNavigate\] pressed/);
    expect(joined).toMatch(/destinationValid=true/);
    expect(joined).toMatch(/currentLocationValid=false/);
    expect(joined).toMatch(/action=gps_unavailable/);
    expect(joined).not.toMatch(/23\./);
    expect(joined).not.toMatch(/77\./);
  });
});
