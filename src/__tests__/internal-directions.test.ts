/**
 * Regression coverage for the single internal-directions entry point.
 *
 * These tests assert two things that are easy to regress and invisible in review:
 *
 * 1. A destination with unusable coordinates never navigates. `parseLatLng`
 *    rejects Null Island, swapped pairs and out-of-range values, and itinerary
 *    stops coerce a missing coordinate to `0` — without that guard the user would
 *    be routed into the Atlantic.
 * 2. Only `ride` is exempt from internal routing. Every other context, including
 *    the ones that previously launched Google Maps / `geo:` / `maps://`, must go
 *    through the Map screen.
 */
import {
  INTERNAL_DIRECTIONS_CONTEXTS,
  INTERNAL_DIRECTIONS_UNAVAILABLE,
  isInternalDirectionsContext,
  openInternalDirections,
  resolveInternalDirectionsDestination,
  type DirectionsContext,
} from '../features/mapExplore/utils/internalDirections';

const makeNav = () => ({ navigate: jest.fn() });

describe('resolveInternalDirectionsDestination', () => {
  it('accepts a normal coordinate pair', () => {
    expect(resolveInternalDirectionsDestination({ latitude: 12.9716, longitude: 77.5946 }))
      .toEqual({ latitude: 12.9716, longitude: 77.5946, label: null });
  });

  it('carries the label through', () => {
    const resolved = resolveInternalDirectionsDestination({
      latitude: 15.3, longitude: 74.9, label: 'Coffee Shop',
    });
    expect(resolved?.label).toBe('Coffee Shop');
  });

  it('coerces numeric strings, which is what the API returns', () => {
    expect(resolveInternalDirectionsDestination({ latitude: '12.9716', longitude: '77.5946' }))
      .toEqual({ latitude: 12.9716, longitude: 77.5946, label: null });
  });

  it.each([
    ['null', { latitude: null, longitude: null }],
    ['undefined', { latitude: undefined, longitude: undefined }],
    ['zero / Null Island', { latitude: 0, longitude: 0 }],
    ['missing longitude', { latitude: 12.9716, longitude: null }],
    ['swapped lat/lng', { latitude: 77.5946, longitude: 12.9716 }],
    ['latitude out of range', { latitude: 120, longitude: 77.5946 }],
    ['longitude out of range', { latitude: 12.9716, longitude: 200 }],
    ['NaN', { latitude: NaN, longitude: 77.5946 }],
    ['non-numeric', { latitude: 'north', longitude: 'west' }],
    ['empty string', { latitude: '', longitude: '' }],
  ])('rejects %s instead of navigating to it', (_label, destination) => {
    expect(resolveInternalDirectionsDestination(destination)).toBeNull();
  });

  it('rejects a missing destination object', () => {
    expect(resolveInternalDirectionsDestination(null)).toBeNull();
  });
});

describe('openInternalDirections', () => {
  it('navigates to the Map tab with the destination', () => {
    const navigation = makeNav();
    const resolved = openInternalDirections({
      navigation,
      destination: { latitude: 12.9716, longitude: 77.5946, label: 'Somewhere' },
      context: 'event_detail',
      initialMapTab: 'events',
    });

    expect(resolved).not.toBeNull();
    expect(navigation.navigate).toHaveBeenCalledTimes(1);
    const [screen, args] = navigation.navigate.mock.calls[0];
    expect(screen).toBe('MainTabs');
    expect(args.screen).toBe('Map');
    expect(args.params.directions).toMatchObject({
      latitude: 12.9716,
      longitude: 77.5946,
      label: 'Somewhere',
      context: 'event_detail',
    });
    expect(args.params.initialMapTab).toBe('events');
  });

  it('does not navigate when coordinates are unusable', () => {
    const navigation = makeNav();
    const onUnavailable = jest.fn();
    const resolved = openInternalDirections({
      navigation,
      destination: { latitude: 0, longitude: 0 },
      context: 'itinerary',
      onUnavailable,
    });

    expect(resolved).toBeNull();
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(onUnavailable).toHaveBeenCalledWith(INTERNAL_DIRECTIONS_UNAVAILABLE);
  });

  it('uses a caller-supplied key so the same place can be re-routed', () => {
    const navigation = makeNav();
    openInternalDirections({
      navigation,
      destination: { latitude: 12.9716, longitude: 77.5946 },
      context: 'trip_stop',
      requestKey: 99,
    });
    expect(navigation.navigate.mock.calls[0][1].params.directionsKey).toBe(99);
  });

  it('falls back to a generated key when none is supplied', () => {
    const navigation = makeNav();
    openInternalDirections({
      navigation,
      destination: { latitude: 12.9716, longitude: 77.5946 },
      context: 'trip_stop',
    });
    expect(typeof navigation.navigate.mock.calls[0][1].params.directionsKey).toBe('number');
  });

  it('omits initialMapTab when the caller did not ask for one', () => {
    const navigation = makeNav();
    openInternalDirections({
      navigation,
      destination: { latitude: 12.9716, longitude: 77.5946 },
      context: 'trip_stop',
    });
    expect(navigation.navigate.mock.calls[0][1].params).not.toHaveProperty('initialMapTab');
  });
});

describe('directions context classification', () => {
  it('exempts only ride booking from internal routing', () => {
    expect(isInternalDirectionsContext('ride')).toBe(false);
  });

  it.each<DirectionsContext>(INTERNAL_DIRECTIONS_CONTEXTS as DirectionsContext[])(
    'routes %s internally',
    (context) => {
      expect(isInternalDirectionsContext(context)).toBe(true);
    },
  );

  it('never lists ride as an internal context', () => {
    expect(INTERNAL_DIRECTIONS_CONTEXTS).not.toContain('ride');
  });

  it('covers every context that previously launched an external maps app', () => {
    // vendor_offer, event_detail, trip_stop and itinerary were the four
    // external non-ride Direction entries.
    for (const context of ['vendor_offer', 'event_detail', 'trip_stop', 'itinerary']) {
      expect(INTERNAL_DIRECTIONS_CONTEXTS).toContain(context);
    }
  });
});