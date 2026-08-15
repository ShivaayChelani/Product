import {
  resolveContinueNavigation,
  resolveItineraryNavigation,
  resolveManualBuildNavigation,
  isCityMismatchError,
  tripHasStops,
  normalizeStatus,
} from '../utils/tripNavigation';
import { isGenericDestination, cityKeyFromPlace, destinationMatchesCity, tripCanAcceptPlaceCity } from '../utils/destination';

const draftWithStops = {
  id: 'draft-1',
  status: 'DRAFT' as const,
  tripDays: [{ id: 'd1', tripPlanId: 'draft-1', dayNumber: 1, stops: [{ id: 's1', placeId: 'p1' }] }],
};

const draftEmpty = {
  id: 'draft-empty',
  status: 'DRAFT' as const,
  tripDays: [{ id: 'd1', tripPlanId: 'draft-empty', dayNumber: 1, stops: [] }],
};

const jabalpurUpcoming = {
  id: 'jbp-up',
  status: 'UPCOMING' as const,
  destination: 'Jabalpur',
  tripDays: draftWithStops.tripDays,
};

const ujjainUpcoming = {
  id: 'ujj-up',
  status: 'UPCOMING' as const,
  destination: 'Ujjain',
  tripDays: [{ id: 'd2', tripPlanId: 'ujj-up', dayNumber: 1, stops: [{ id: 's2', placeId: 'p2' }] }],
};

const active = { id: 'act-1', status: 'ACTIVE' as const, tripDays: draftWithStops.tripDays };
const completed = { id: 'done-1', status: 'COMPLETED' as const, tripDays: draftWithStops.tripDays };

describe('itinerary vs continue navigation', () => {
  it('TEST 1 — Continue resolves to TripDetail resume with tripId for upcoming trips', () => {
    expect(resolveContinueNavigation(jabalpurUpcoming)).toEqual({
      screen: 'TripDetail',
      params: { tripId: 'jbp-up', resume: true, mode: 'resume' },
    });
  });

  it('TEST 2 — Itinerary resolves to TripDetail view with tripId', () => {
    expect(resolveItineraryNavigation(jabalpurUpcoming)).toEqual({
      screen: 'TripDetail',
      params: { tripId: 'jbp-up', mode: 'view' },
    });
  });

  it('TEST 3 — Continue does NOT navigate to Build Manually for upcoming trips', () => {
    const target = resolveContinueNavigation(jabalpurUpcoming);
    expect(target.screen).not.toBe('TripBuilder');
  });

  it('TEST 4 — Itinerary does NOT navigate to Build Manually (including drafts with stops)', () => {
    expect(resolveItineraryNavigation(draftWithStops).screen).not.toBe('TripBuilder');
    expect(resolveItineraryNavigation(jabalpurUpcoming).screen).not.toBe('TripBuilder');
    expect(resolveItineraryNavigation(draftEmpty).screen).not.toBe('TripBuilder');
  });

  it('TEST 5 — Build Manually opens TripBuilder without conflating card buttons', () => {
    expect(resolveManualBuildNavigation()).toEqual({
      screen: 'TripBuilder',
      params: undefined,
    });
    expect(resolveManualBuildNavigation().screen).toBe('TripBuilder');
    expect(resolveItineraryNavigation(jabalpurUpcoming).screen).toBe('TripDetail');
  });

  it('TEST 6 — Jabalpur trip opens with Jabalpur tripId', () => {
    expect(resolveContinueNavigation(jabalpurUpcoming).params.tripId).toBe('jbp-up');
    expect(resolveItineraryNavigation(jabalpurUpcoming).params.tripId).toBe('jbp-up');
  });

  it('TEST 7 — Ujjain trip opens with Ujjain tripId', () => {
    expect(resolveContinueNavigation(ujjainUpcoming).params.tripId).toBe('ujj-up');
    expect(resolveItineraryNavigation(ujjainUpcoming).params.tripId).toBe('ujj-up');
  });

  it('TEST 8 — two trips remain independent (distinct tripIds)', () => {
    const jabalpur = resolveItineraryNavigation(jabalpurUpcoming);
    const ujjain = resolveItineraryNavigation(ujjainUpcoming);
    expect(jabalpur.params.tripId).not.toBe(ujjain.params.tripId);
    expect(jabalpur.params.tripId).toBe('jbp-up');
    expect(ujjain.params.tripId).toBe('ujj-up');
  });

  it('TEST 9 — itinerary target always carries tripId for server fetch', () => {
    for (const trip of [jabalpurUpcoming, ujjainUpcoming, draftWithStops, draftEmpty, active, completed]) {
      const target = resolveItineraryNavigation(trip);
      expect(target.screen).toBe('TripDetail');
      expect(target.params.tripId).toBe(trip.id);
      expect(typeof target.params.tripId).toBe('string');
      expect(target.params.tripId.length).toBeGreaterThan(0);
    }
  });

  it('Continue: DRAFT → TripBuilder with tripId; UPCOMING/ACTIVE → TripDetail resume', () => {
    expect(resolveContinueNavigation(draftWithStops)).toEqual({
      screen: 'TripBuilder',
      params: { tripId: 'draft-1' },
    });
    expect(resolveContinueNavigation(jabalpurUpcoming)).toEqual({
      screen: 'TripDetail',
      params: { tripId: 'jbp-up', resume: true, mode: 'resume' },
    });
    expect(resolveContinueNavigation(active)).toEqual({
      screen: 'TripDetail',
      params: { tripId: 'act-1', resume: true, mode: 'resume' },
    });
    expect(resolveContinueNavigation(completed)).toEqual({
      screen: 'TripDetail',
      params: { tripId: 'done-1', mode: 'view' },
    });
  });

  it('Itinerary: always TripDetail regardless of draft/upcoming/completed', () => {
    expect(resolveItineraryNavigation(draftWithStops)).toEqual({
      screen: 'TripDetail',
      params: { tripId: 'draft-1', mode: 'view' },
    });
    expect(resolveItineraryNavigation(draftEmpty)).toEqual({
      screen: 'TripDetail',
      params: { tripId: 'draft-empty', mode: 'view' },
    });
    expect(resolveItineraryNavigation(completed)).toEqual({
      screen: 'TripDetail',
      params: { tripId: 'done-1', mode: 'view' },
    });
  });

  it('does not treat Itinerary and Continue as the same route for in-progress trips', () => {
    expect(resolveItineraryNavigation(jabalpurUpcoming)).not.toEqual(resolveContinueNavigation(jabalpurUpcoming));
    expect(resolveItineraryNavigation(active)).not.toEqual(resolveContinueNavigation(active));
  });

  it('tripHasStops detects stops on tripDays', () => {
    expect(tripHasStops(draftWithStops)).toBe(true);
    expect(tripHasStops(draftEmpty)).toBe(false);
  });

  it('normalizeStatus uppercases API values', () => {
    expect(normalizeStatus('upcoming')).toBe('UPCOMING');
    expect(normalizeStatus('draft')).toBe('DRAFT');
  });
});

describe('city key helpers', () => {
  it('treats My Trip / empty as generic destinations', () => {
    expect(isGenericDestination('My Trip')).toBe(true);
    expect(isGenericDestination('')).toBe(true);
    expect(isGenericDestination('Jaipur')).toBe(false);
  });

  it('normalizes place.city and matches trip destination', () => {
    expect(cityKeyFromPlace({ city: 'Bangalore', state: 'Karnataka' })).toBe('bengaluru');
    expect(destinationMatchesCity('Bengaluru', 'bengaluru')).toBe(true);
    expect(destinationMatchesCity('Jaipur', 'bengaluru')).toBe(false);
    expect(destinationMatchesCity('My Trip', 'jaipur')).toBe(false);
  });

  it('detects CITY_MISMATCH by structured code', () => {
    expect(isCityMismatchError({ code: 'CITY_MISMATCH', status: 409 })).toBe(true);
    expect(isCityMismatchError({ status: 409 })).toBe(false);
    expect(isCityMismatchError({ status: 404 })).toBe(false);
  });
});

describe('trip city isolation', () => {
  it('reuses a city draft for the same city and rejects a different city', () => {
    expect(tripCanAcceptPlaceCity('Jabalpur', ['jabalpur'], 'jabalpur')).toBe(true);
    expect(tripCanAcceptPlaceCity('Jabalpur', ['jabalpur'], 'ujjain')).toBe(false);
    expect(tripCanAcceptPlaceCity('Ujjain', [], 'jabalpur')).toBe(false);
  });

  it('does not reuse a Jabalpur draft for Ujjain, including case/whitespace variants', () => {
    expect(tripCanAcceptPlaceCity('  JABALPUR ', ['jabalpur'], 'ujjain')).toBe(false);
    expect(tripCanAcceptPlaceCity('Jabalpur', ['jabalpur'], 'Ujjain')).toBe(false);
  });

  it('lets an empty generic draft adopt the first real city', () => {
    expect(tripCanAcceptPlaceCity('My Trip', [], 'jabalpur')).toBe(true);
    expect(tripCanAcceptPlaceCity('', [], 'ujjain')).toBe(true);
  });

  it('does not let an unknown-city place join a city-specific itinerary', () => {
    expect(tripCanAcceptPlaceCity('Jabalpur', ['jabalpur'], '')).toBe(false);
    expect(tripCanAcceptPlaceCity('My Trip', [], '')).toBe(true);
  });

  it('refuses further adds once a trip already has mixed stop cities', () => {
    expect(tripCanAcceptPlaceCity('Jabalpur', ['jabalpur', 'sawai madhopur'], 'jabalpur')).toBe(false);
  });
});

describe('TripBuilder missing trip contract', () => {
  it('TEST 10 — explicit tripId fetch failure must not imply Build Manually fallback in screen logic', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../screens/TripBuilderScreen.tsx'),
      'utf8',
    );
    expect(src).toMatch(/if \(routeTripId\) \{[\s\S]*setLoadError/);
    expect(src).toMatch(/This trip is no longer available/);
    expect(src).toMatch(/if \(loadError\)/);
  });

  it('TripDetail shows explicit unavailable state instead of TripBuilder redirect', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../screens/TripDetailScreen.tsx'),
      'utf8',
    );
    expect(src).toMatch(/Trip No Longer Available/);
    expect(src).not.toMatch(/onNavigate\?\.\('TripBuilder'\)/);
  });
});
