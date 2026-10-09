/**
 * Home Live Events visibility regression.
 *
 * Root cause this guards against: Home only ever called `/events/featured`,
 * which is empty unless an admin manually features an event — so a perfectly
 * eligible APPROVED event never reached the HomeEventsStrip and Home showed
 * "No upcoming events near you" forever.
 *
 * The strip now degrades through the public feeds in a fixed order:
 * featured → nearby (when GPS available) → approved list. Every source keeps
 * the server-owned visibility predicate (APPROVED, not ended, plottable), so
 * the chain widens the *sources* Home may read, never what the public may see.
 */
import fs from 'fs';
import path from 'path';

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

import {
  HOME_EVENT_RADIUS_KM,
  loadHomeStripEvents,
  type HomeEventsSource,
} from '../features/events/hooks';
import type { CommunityEvent } from '../services/api/events';

const root = path.join(__dirname, '..');

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

/** The real production test event, shaped like the public API response. */
const APPROVED_EVENT: CommunityEvent = {
  id: '819949f5-1ad5-4375-9155-46b649276fc7',
  slug: 'palsafar-home-live-event-test-20261008-0138-49276fc7',
  title: 'PALSAFAR HOME LIVE EVENT TEST 20261008-0138',
  description: 'Production test listing.',
  status: 'APPROVED',
  isFeatured: false,
  startDate: '2026-10-10T00:00:00.000Z',
  endDate: '2026-10-10T00:00:00.000Z',
  startTime: '10:00',
  endTime: '13:00',
  latitude: 23.159222,
  longitude: 79.937167,
  hasCoordinates: true,
  address: 'Adhartal Tahsil, Jabalpur, Madhya Pradesh',
  city: 'Jabalpur',
  state: 'Madhya Pradesh',
  eventType: 'COMMUNITY',
  coverImage: 'https://example.in/cover.jpg',
  images: [],
  isPast: false,
  placeId: null,
  placeName: null,
  vendorId: null,
  vendorName: null,
  reelCount: 0,
  reportCount: 0,
  createdBy: null,
  createdAt: '2026-10-08T00:00:00.000Z',
  updatedAt: '2026-10-08T00:00:00.000Z',
  legacyPlaceEventId: null,
  parentPlaceVisible: false,
};

const HOME_LOCATION = { latitude: 23.159222, longitude: 79.937167 };
const NEARBY_EVENT = { ...APPROVED_EVENT, distanceMeters: 0 };

type HomeEventsCalls = {
  featured: number[];
  nearby: Parameters<HomeEventsSource['nearby']>[0][];
  list: Parameters<HomeEventsSource['list']>[0][];
  order: Array<keyof HomeEventsSource>;
};

function source(overrides: Partial<HomeEventsSource> = {}): HomeEventsSource & {
  calls: HomeEventsCalls;
} {
  const calls: HomeEventsCalls = { featured: [], nearby: [], list: [], order: [] };
  const raw: HomeEventsSource = {
    featured: async () => ({ data: [] }),
    nearby: async () => ({ data: [] }),
    list: async () => ({ data: [] }),
    ...overrides,
  };
  return {
    calls,
    featured: async (limit) => {
      calls.order.push('featured');
      calls.featured.push(limit);
      return raw.featured(limit);
    },
    nearby: async (query) => {
      calls.order.push('nearby');
      calls.nearby.push(query);
      return raw.nearby(query);
    },
    list: async (query) => {
      calls.order.push('list');
      calls.list.push(query);
      return raw.list(query);
    },
  };
}

describe('loadHomeStripEvents — approved event eligibility chain', () => {
  it('returns the curated featured events without falling through', async () => {
    const api = source({
      featured: async () => ({ data: [APPROVED_EVENT] }),
    });
    const events = await loadHomeStripEvents(api, { limit: 6, location: HOME_LOCATION });
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe(APPROVED_EVENT.id);
    expect(events[0].isFeatured).toBe(false);
    expect(api.calls.featured).toEqual([6]);
    expect(api.calls.order).toEqual(['featured']);
    expect(api.calls.nearby).toHaveLength(0);
    expect(api.calls.list).toHaveLength(0);
  });

  it('falls back to the radius feed and returns an approved event near the user', async () => {
    const api = source({
      nearby: async (query) => {
        expect(query.radiusKm).toBe(HOME_EVENT_RADIUS_KM);
        expect(query.limit).toBe(6);
        return { data: [NEARBY_EVENT] };
      },
    });
    const events = await loadHomeStripEvents(api, { limit: 6, location: HOME_LOCATION });
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe(APPROVED_EVENT.id);
    expect(events[0].distanceMeters).toBe(0);
    expect(api.calls.featured).toEqual([6]);
    expect(api.calls.nearby).toHaveLength(1);
    expect(api.calls.order).toEqual(['featured', 'nearby']);
    expect(api.calls.list).toHaveLength(0);
  });

  it('prioritizes upcoming nearby events over closer ongoing events', async () => {
    const ongoingEvent: CommunityEvent = {
      ...APPROVED_EVENT,
      id: 'ongoing-event',
      title: 'Ongoing event',
      startDate: '2000-01-01T00:00:00.000Z',
      endDate: '2999-01-01T00:00:00.000Z',
      startTime: null,
      isPast: false,
    };
    const upcomingEvent: CommunityEvent = {
      ...APPROVED_EVENT,
      id: 'upcoming-event',
      title: 'Upcoming event',
      startDate: '2999-01-01T00:00:00.000Z',
      endDate: '2999-01-01T00:00:00.000Z',
    };
    const api = source({
      nearby: async () => ({ data: [ongoingEvent, upcomingEvent] }),
    });

    const events = await loadHomeStripEvents(api, { limit: 6, location: HOME_LOCATION });

    expect(events.map((event) => event.id)).toEqual(['upcoming-event', 'ongoing-event']);
    expect(api.calls.nearby).toHaveLength(1);
    expect(api.calls.order).toEqual(['featured', 'nearby']);
  });

  it('skips the radius feed without coordinates and uses the approved list', async () => {
    const api = source({
      list: async () => ({ data: [APPROVED_EVENT] }),
    });
    const events = await loadHomeStripEvents(api, { limit: 6, location: null });
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe(APPROVED_EVENT.id);
    expect(api.calls.featured).toEqual([6]);
    expect(api.calls.nearby).toHaveLength(0);
    expect(api.calls.list).toEqual([{ limit: 6 }]);
    expect(api.calls.order).toEqual(['featured', 'list']);
  });

  it('treats a bad GPS fix (0,0 / swapped / out of range) as no location', async () => {
    const api = source({
      list: async () => ({ data: [APPROVED_EVENT] }),
    });
    for (const bad of [
      { latitude: 0, longitude: 0 },
      { latitude: 79.9, longitude: 23.1 },
      { latitude: 200, longitude: 79.9 },
      { latitude: null, longitude: 79.9 },
    ]) {
      const events = await loadHomeStripEvents(api, { limit: 6, location: bad });
      expect(events).toHaveLength(1);
      expect(api.calls.nearby).toHaveLength(0);
    }
    expect(api.calls.featured).toHaveLength(4);
    expect(api.calls.list).toHaveLength(4);
    expect(api.calls.order).toEqual(['featured', 'list', 'featured', 'list', 'featured', 'list', 'featured', 'list']);
  });

  it('returns [] only when every source genuinely has no rows', async () => {
    const api = source();
    const events = await loadHomeStripEvents(api, {
      limit: 6,
      location: HOME_LOCATION,
    });
    expect(events).toEqual([]);
    expect(api.calls.order).toEqual(['featured', 'nearby', 'list']);
  });

  it('does not hide approved events behind one failing source', async () => {
    const api = source({
      featured: async () => {
        throw new Error('featured down');
      },
      list: async () => ({ data: [APPROVED_EVENT] }),
    });
    const events = await loadHomeStripEvents(api, { limit: 6, location: null });
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe(APPROVED_EVENT.id);
    expect(api.calls.order).toEqual(['featured', 'list']);
  });

  it('surfaces an error only when every source failed', async () => {
    const api = source({
      featured: async () => {
        throw new Error('down');
      },
      nearby: async () => {
        throw new Error('down');
      },
      list: async () => {
        throw new Error('down');
      },
    });
    await expect(
      loadHomeStripEvents(api, { limit: 6, location: HOME_LOCATION }),
    ).rejects.toThrow('down');
    expect(api.calls.order).toEqual(['featured', 'nearby', 'list']);
  });

  it('caps the strip at the requested limit and de-duplicates', async () => {
    const api = source({
      featured: async () => ({
        data: [APPROVED_EVENT, APPROVED_EVENT, { ...APPROVED_EVENT, id: 'dup-2' }],
      }),
    });
    const events = await loadHomeStripEvents(api, { limit: 2, location: null });
    expect(events).toHaveLength(2);
    expect(api.calls.featured).toEqual([2]);
    expect(api.calls.order).toEqual(['featured']);
  });
});

describe('Home strip wiring', () => {
  it('passes the GPS fix into the strip hook so radius search can run', () => {
    const strip = read('features/events/HomeEventsStrip.tsx');
    expect(strip).toMatch(/useFeaturedEvents\(STRIP_LIMIT, \{\s*latitude,\s*longitude,\s*\}\)/);
    expect(strip).toMatch(/latitude\?: number \| null;/);
    expect(strip).toMatch(/longitude\?: number \| null;/);
  });

  it('uses a compact horizontal carousel instead of a oversized featured card', () => {
    const strip = read('features/events/HomeEventsStrip.tsx');
    expect(strip).toMatch(/horizontal/);
    expect(strip).toMatch(/layout=\"strip\"/);
    expect(strip).not.toMatch(/featuredCard/);
    expect(strip).not.toMatch(/Explore live event/);
  });

  it('renders a compact horizontal carousel for all eligible events', () => {
    const strip = read('features/events/HomeEventsStrip.tsx');
    expect(strip).toMatch(/if \(!events\.length\) \{/);
    expect(strip).toMatch(/ScrollView\s*\n\s*horizontal/);
    expect(strip).toMatch(/events\.map\(\(event\) => \(/);
    expect(strip).toMatch(/layout=\"strip\"/);
  });

  it('hands Home a real approved eligible event through the fallback chain', () => {
    const src = read('features/events/hooks.ts');
    expect(src).toMatch(/const attempts: Array<\(\) => Promise<CommunityEvent\[\]>> = \[/);
    expect(src).toMatch(/source\.featured\(limit\)/);
    expect(src).toMatch(/source\.nearby/);
    expect(src).toMatch(/source\.list\(\{ limit \}\)/);
    expect(src).toMatch(/if \(rows\.length > 0\) return rows\.slice\(0, limit\);/);
  });

  it('invalidates the Home strip on focus and on pull-to-refresh', () => {
    const screen = read('screens/HomeScreen.tsx');
    expect(screen).toMatch(/eventKeys\.homeStrip\(\)/);
    expect(screen).toMatch(/latitude=\{position\?\.latitude\}/);
    expect(screen).toMatch(/longitude=\{position\?\.longitude\}/);
    expect(screen).toMatch(/queryClient\.invalidateQueries\(\{ queryKey: eventKeys\.homeStrip\(\) \}\)/);
  });

  it('keeps a shared home-strip invalidation prefix in the query keys', () => {
    const keys = read('features/events/queryKeys.ts');
    expect(keys).toMatch(/homeStrip: \(\) => \[\.\.\.eventKeys\.all, 'featured'\] as const,/);
  });
});