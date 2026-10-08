/**
 * Event detail: itinerary integration + organiser/nearby sections.
 *
 * Source-assertion style like events-discovery.test.ts — the screen is heavy
 * (WebView-free but nav-dependent), so we pin the wiring and the pure helpers.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
    multiSet: jest.fn(() => Promise.resolve()),
    multiRemove: jest.fn(() => Promise.resolve()),
  },
}));

import fs from 'fs';
import path from 'path';
import type { TripPlan, TripPlanStop } from '../services/api/trips';
import { stopDisplayName } from '../services/api/trips';
import { flattenTripEventIds } from '../utils/resumeTrip';

const root = path.join(__dirname, '..');

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function tripWithStops(...stops: Partial<TripPlanStop>[]): TripPlan {
  return {
    id: 'trip-1',
    title: 'Test trip',
    destination: 'Jabalpur',
    startDate: '2026-10-01',
    endDate: '2026-10-03',
    status: 'DRAFT',
    tripDays: [
      {
        id: 'day-1',
        tripId: 'trip-1',
        dayNumber: 1,
        order: 0,
        title: 'Day 1',
        stops: stops.map((s, index) => ({
          id: `stop-${index}`,
          tripPlanDayId: 'day-1',
          order: index,
          placeId: null,
          placeName: null,
          eventId: null,
          latitude: null,
          longitude: null,
          isPinned: false,
          notes: null,
          bestTimeOfDay: null,
          address: null,
          city: null,
          ...s,
        })) as TripPlanStop[],
      },
    ],
  };
}

describe('itinerary: event id extraction', () => {
  it('collects event-anchored stops with dedupe, ignoring place stops', () => {
    const trip = tripWithStops(
      { eventId: 'evt-1' },
      { eventId: 'evt-1' },
      { eventId: 'evt-2' },
      { placeId: 'plc-1', placeName: 'Dhuandhar' },
    );
    expect(flattenTripEventIds(trip)).toEqual(['evt-1', 'evt-2']);
  });

  it('reads the embedded stop.event id as a fallback', () => {
    const trip = tripWithStops({ event: { id: 'evt-from-join' } });
    expect(flattenTripEventIds(trip)).toEqual(['evt-from-join']);
  });

  it('uses the embedded Event title as the persisted itinerary stop name', () => {
    const stop = tripWithStops({
      eventId: 'evt-1',
      placeId: null,
      event: {
        id: 'evt-1',
        slug: 'community-event',
        title: 'Community Event',
        eventType: 'CULTURAL',
        status: 'APPROVED',
        startDate: '2026-10-10',
        endDate: '2026-10-10',
      },
    }).tripDays[0].stops[0];
    expect(stopDisplayName(stop)).toBe('Community Event');
    expect(read('components/trip/TripItineraryView.tsx')).toMatch(/stopName = stopDisplayName\(stop\)/);
  });

  it('handles empty and null travels', () => {
    expect(flattenTripEventIds(null)).toEqual([]);
    expect(flattenTripEventIds(tripWithStops())).toEqual([]);
  });
});

describe('event detail: itinerary wiring', () => {
  it('mounts an Add/In-itinerary button backed by quickAddEventToTrip', () => {
    const src = read('screens/EventDetailScreen.tsx');
    expect(src).toMatch(/quickAddEventToTrip/);
    expect(src).toMatch(/loadItineraryEventIdSet/);
    expect(src).toMatch(/event-add-to-itinerary/);
    expect(src).toMatch(/In your itinerary/);
    expect(src).toMatch(/MyTrips', \{\s*initialTab: 'DRAFT'/);
  });

  it('renders the organiser & entry section with call and website actions', () => {
    const src = read('screens/EventDetailScreen.tsx');
    expect(src).toMatch(/Organiser & entry/);
    expect(src).toMatch(/callOrganizer/);
    expect(src).toMatch(/openWebsite/);
    expect(src).toMatch(/tel:/);
  });

  it('lists nearby places with distance and per-place itinerary add', () => {
    const src = read('screens/EventDetailScreen.tsx');
    expect(src).toMatch(/placesApi\.nearby/);
    expect(src).toMatch(/haversineDistance/);
    expect(src).toMatch(/formatDistance\(/);
    expect(src).toMatch(/addPlaceToItinerary/);
    expect(src).toMatch(/Nearby places/);
  });
});

describe('my events: owner moderation wiring', () => {
  it('lists mine=true submissions with status badges and rejection reasons', () => {
    const src = read('screens/MyEventsScreen.tsx');
    expect(src).toMatch(/eventsApi\.listMine/);
    expect(src).toMatch(/eventKeys\.mine\(\)/);
    expect(src).toMatch(/rejectionReason/);
    expect(src).toMatch(/PENDING REVIEW/);
    expect(src).toMatch(/REJECTED/);
  });

  it('registers MyEvents in the root stack and links empty/back actions', () => {
    const nav = read('navigation/RootNavigator.tsx');
    expect(nav).toMatch(/name="MyEvents"/);
    const src = read('screens/MyEventsScreen.tsx');
    expect(src).toMatch(/testID="my-events-back"/);
    expect(src).toMatch(/testID="my-events-create"/);
    expect(src).toMatch(/status\?\.toLowerCase/);
  });
});

describe('event detail: share/actions preserved', () => {
  it('keeps the internal directions + share affordances', () => {
    const src = read('screens/EventDetailScreen.tsx');
    expect(src).toMatch(/openInternalDirections/);
    expect(src).toMatch(/shareEvent/);
    expect(src).toMatch(/View on map/);
  });
});