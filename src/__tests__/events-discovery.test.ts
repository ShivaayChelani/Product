/**
 * Community Events: formatting, deep links, share links, API query building and
 * the screen/route wiring that the feed depends on.
 *
 * These are unit + source-assertion tests (the project's existing convention for
 * navigation wiring — see reel-deep-links.test.ts and vendor-review-flow-nav).
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
import { eventsApi, EVENT_TYPES } from '../services/api/events';
import {
  eventHasCoordinates,
  eventImage,
  eventLifecycle,
  eventLinkId,
  eventTypeIcon,
  eventTypeLabel,
  formatEventAddress,
  formatEventDateRange,
  formatEventFullSchedule,
  formatEventLocation,
  formatEventTimeRange,
} from '../features/events/eventFormat';
import { eventKeys, eventFilterKey, DEFAULT_EVENT_FILTERS } from '../features/events/queryKeys';
import {
  buildEventDeepLinkPath,
  EVENT_DEEP_LINK_HOST,
  isEventDeepLinkPath,
  parseEventDeepLinkUrl,
  parseEventIdOrSlug,
} from '../navigation/eventDeepLink';
import {
  buildEventShareMessage,
  buildEventShareUrl,
  isPublicShareableEvent,
} from '../services/sharing/shareLinks';
import { toEventMarkers } from '../features/events/eventMapMarkers';

const root = path.join(__dirname, '..');

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const CUID = 'clh7a1b2c3d4e5f6g7h8i9';
const REAL_EVENT_ID = '819949f5-1ad5-4375-9155-46b649276fc7';

describe('event formatting', () => {
  it('labels every EventType and falls back to Other', () => {
    for (const type of EVENT_TYPES) {
      expect(eventTypeLabel(type)).toBeTruthy();
      expect(eventTypeIcon(type)).toBeTruthy();
    }
    expect(eventTypeLabel(null)).toBe('Other');
    expect(eventTypeLabel('NOT_A_TYPE')).toBe('Other');
    expect(eventTypeIcon('NOT_A_TYPE')).toBe('calendar-outline');
  });

  it('formats Today/Tomorrow from UTC day keys, not the device timezone', () => {
    const now = new Date('2026-10-12T09:00:00.000Z');
    expect(formatEventDateRange('2026-10-12T00:00:00.000Z', null, now)).toBe('Today');
    expect(formatEventDateRange('2026-10-13T00:00:00.000Z', null, now)).toBe('Tomorrow');
    expect(formatEventDateRange('2026-10-11T00:00:00.000Z', null, now)).toBe('Ended');
  });

  it('does not shift an evening UTC start onto the next day', () => {
    // 20:00Z would already be the next calendar day in IST (+05:30). The badge
    // and the day key both use UTC, so the label must stay on the UTC day.
    const now = new Date('2026-10-11T00:00:00.000Z');
    expect(formatEventDateRange('2026-10-12T20:00:00.000Z', null, now)).toBe('Tomorrow');
  });

  it('renders a week window and a cross-month range', () => {
    const now = new Date('2026-10-01T00:00:00.000Z');
    expect(formatEventDateRange('2026-10-05T00:00:00.000Z', null, now)).toMatch(/^Mon/);
    expect(formatEventDateRange('2026-10-12T00:00:00.000Z', '2026-10-15T00:00:00.000Z', now)).toBe(
      '12–15 Oct',
    );
    expect(formatEventDateRange('2026-10-28T00:00:00.000Z', '2026-11-02T00:00:00.000Z', now)).toBe(
      '28 Oct – 2 Nov',
    );
    // Same calendar year: no year noise, matching the server's date label.
    expect(formatEventDateRange('2026-12-01T00:00:00.000Z', null, now)).toBe('1 Dec');
    // A different year must carry it, or the date reads as the wrong year.
    expect(formatEventDateRange('2027-01-05T00:00:00.000Z', null, now)).toBe('5 Jan 2027');
    expect(formatEventDateRange('2026-12-28T00:00:00.000Z', '2027-01-02T00:00:00.000Z', now)).toBe(
      '28 Dec – 2 Jan 2027',
    );
  });

  it('handles a missing startDate', () => {
    expect(formatEventDateRange(null, null)).toBe('Date to be announced');
    expect(formatEventDateRange('not-a-date', null)).toBe('Date to be announced');
  });

  it('formats the time range from UTC wall-clock text', () => {
    expect(formatEventTimeRange('18:30', '21:00')).toBe('18:30 – 21:00');
    expect(formatEventTimeRange('18:30', '18:30')).toBe('18:30');
    expect(formatEventTimeRange('18:30', null)).toBe('From 18:30');
    expect(formatEventTimeRange(null, '21:00')).toBe('Until 21:00');
    expect(formatEventTimeRange(null, null)).toBe('');
  });

  it('formats the long schedule with date and time', () => {
    expect(
      formatEventFullSchedule({
        startDate: '2026-10-12T00:00:00.000Z',
        endDate: null,
        startTime: '18:30',
        endTime: '21:00',
      }),
    ).toBe('12 Oct 2026 · 18:30 – 21:00');
    expect(
      formatEventFullSchedule({
        startDate: '2026-10-12T00:00:00.000Z',
        endDate: null,
        startTime: null,
        endTime: null,
      }),
    ).toBe('12 Oct 2026');
  });

  it('formats location and address with empty parts dropped and de-duplicated', () => {
    expect(formatEventLocation({ city: 'Ujjain', state: 'Madhya Pradesh', address: null })).toBe(
      'Ujjain, Madhya Pradesh',
    );
    expect(formatEventLocation({ city: null, state: null, address: 'Ram Ghat' })).toBe('Ram Ghat');
    expect(formatEventLocation({ city: null, state: null, address: null })).toBe('');
    expect(
      formatEventAddress({ address: 'Ujjain, MP', city: 'Ujjain', state: 'MP', placeName: null }),
    ).toBe('Ujjain, MP');
    expect(formatEventAddress({ address: null, city: null, state: null, placeName: 'Mahakaleshwar' })).toBe(
      'Mahakaleshwar',
    );
  });

  it('derives LIVE/UPCOMING/ENDED from startDate plus startTime', () => {
    const now = new Date('2026-10-12T12:00:00.000Z');
    expect(
      eventLifecycle(
        { isPast: false, startDate: '2026-10-12T00:00:00.000Z', startTime: '10:00' },
        now,
      ),
    ).toBe('LIVE');
    expect(
      eventLifecycle(
        { isPast: false, startDate: '2026-10-12T00:00:00.000Z', startTime: '18:00' },
        now,
      ),
    ).toBe('UPCOMING');
    expect(
      eventLifecycle(
        { isPast: false, startDate: '2026-10-10T00:00:00.000Z', startTime: null },
        now,
      ),
    ).toBe('LIVE');
    expect(eventLifecycle({ isPast: true, startDate: '2026-10-10T00:00:00.000Z', startTime: null }, now)).toBe(
      'ENDED',
    );
  });

  it('only treats real coordinates as mappable, never 0,0', () => {
    expect(eventHasCoordinates({ hasCoordinates: true, latitude: null, longitude: null })).toBe(true);
    expect(eventHasCoordinates({ hasCoordinates: false, latitude: 23.17, longitude: 75.78 })).toBe(true);
    expect(eventHasCoordinates({ hasCoordinates: false, latitude: 0, longitude: 0 })).toBe(false);
    expect(eventHasCoordinates({ hasCoordinates: false, latitude: null, longitude: null })).toBe(false);
    expect(
      eventHasCoordinates({ hasCoordinates: false, latitude: Number.NaN, longitude: 75.78 }),
    ).toBe(false);
  });

  it('prefers the cover image and falls back to the gallery', () => {
    expect(eventImage({ coverImage: 'a.jpg', images: ['b.jpg'] })).toBe('a.jpg');
    expect(eventImage({ coverImage: null, images: ['b.jpg'] })).toBe('b.jpg');
    expect(eventImage({ coverImage: null, images: [] })).toBeNull();
  });

  it('prefers the slug as the share/deep-link id', () => {
    expect(eventLinkId({ slug: 'kumbh-mela-2026', id: CUID })).toBe('kumbh-mela-2026');
    expect(eventLinkId({ slug: null, id: CUID })).toBe(CUID);
    expect(eventLinkId({ slug: '  ', id: CUID })).toBe(CUID);
  });
});

describe('event deep links', () => {
  it('parses a cuid and a slug', () => {
    expect(parseEventIdOrSlug(CUID)).toBe(CUID);
    expect(parseEventIdOrSlug('kumbh-mela-2026')).toBe('kumbh-mela-2026');
    expect(parseEventIdOrSlug(`/${CUID}/`)).toBe(CUID);
    expect(parseEventIdOrSlug(`${CUID}?utm=1`)).toBe(CUID);
  });

  it('rejects multi-segment, empty and unsafe values without throwing', () => {
    expect(parseEventIdOrSlug(null)).toBeNull();
    expect(parseEventIdOrSlug('')).toBeNull();
    expect(parseEventIdOrSlug('   ')).toBeNull();
    expect(parseEventIdOrSlug('../../admin')).toBeNull();
    expect(parseEventIdOrSlug(`${CUID}/extra`)).toBeNull();
    expect(parseEventIdOrSlug(`${CUID}\\x`)).toBeNull();
    expect(parseEventIdOrSlug('short')).toBeNull();
    expect(parseEventIdOrSlug(12345678)).toBeNull();
    expect(parseEventIdOrSlug('%E0%A4%A')).toBeNull();
  });

  it('builds the canonical one-segment path', () => {
    expect(buildEventDeepLinkPath(CUID)).toBe(`/event/${CUID}`);
    expect(buildEventDeepLinkPath('../../etc')).toBeNull();
    expect(buildEventDeepLinkPath(undefined)).toBeNull();
  });

  it('recognises only exactly /event/<segment> paths', () => {
    expect(isEventDeepLinkPath('/event/abc12345')).toBe(true);
    expect(isEventDeepLinkPath('/event/abc12345?x=1')).toBe(true);
    expect(isEventDeepLinkPath('/events/abc12345')).toBe(false);
    expect(isEventDeepLinkPath('/event/abc12345/extra')).toBe(false);
    expect(isEventDeepLinkPath(null)).toBe(false);
  });

  it('parses the verified https host only', () => {
    expect(parseEventDeepLinkUrl(`https://${EVENT_DEEP_LINK_HOST}/event/${CUID}`)).toEqual({
      eventIdOrSlug: CUID,
    });
    expect(parseEventDeepLinkUrl('https://evil.example/event/abcdefgh')).toBeNull();
    expect(parseEventDeepLinkUrl('http://palsafar.in/event/abcdefgh')).toBeNull();
    expect(parseEventDeepLinkUrl(`https://sub.${EVENT_DEEP_LINK_HOST}/event/abcdefgh`)).toBeNull();
    expect(parseEventDeepLinkUrl('not a url')).toBeNull();
    expect(parseEventDeepLinkUrl(null)).toBeNull();
  });

  it('parses the custom scheme, where the parser reads "event" as the host', () => {
    expect(parseEventDeepLinkUrl(`palsafar://event/${CUID}`)).toEqual({ eventIdOrSlug: CUID });
    expect(parseEventDeepLinkUrl(`palsafar://reel/${CUID}`)).toBeNull();
  });

  it('rejects a URL whose only segment is not a valid id', () => {
    expect(parseEventDeepLinkUrl(`https://${EVENT_DEEP_LINK_HOST}/event/..`)).toBeNull();
    expect(parseEventDeepLinkUrl(`https://${EVENT_DEEP_LINK_HOST}/event/`)).toBeNull();
  });

  it('is wired into linking.ts as a dedicated EventDetail route', () => {
    const src = read('navigation/linking.ts');
    expect(src).toMatch(/parseEventIdOrSlug/);
    expect(src).toMatch(/EventDetail/);
    expect(src).toMatch(/path: 'event\/:eventIdOrSlug'/);
  });

  it('is declared in the AASA example', () => {
    const src = read('../public/.well-known/apple-app-site-association.example');
    expect(src).toMatch(/"\/event\/\*"/);
  });
});

describe('event share links', () => {
  it('builds the public event URL', () => {
    expect(buildEventShareUrl('kumbh-mela-2026')).toBe('https://palsafar.in/event/kumbh-mela-2026');
    expect(buildEventShareUrl('../../etc/passwd')).toBeNull();
  });

  it('refuses to share a non-approved event', () => {
    expect(isPublicShareableEvent({ id: CUID, status: 'APPROVED' })).toBe(true);
    expect(isPublicShareableEvent({ id: CUID, status: 'PENDING' })).toBe(false);
    expect(isPublicShareableEvent({ id: CUID, status: 'CANCELLED' })).toBe(false);
    expect(isPublicShareableEvent({ id: '', status: 'APPROVED' })).toBe(false);
  });

  it('builds a share message with the canonical event ID URL', () => {
    const message = buildEventShareMessage({
      id: CUID,
      status: 'APPROVED',
      title: 'Kumbh Mela 2026',
    });
    expect(message).toContain('Kumbh Mela 2026');
    expect(message).toContain(`https://palsafar.in/event/${CUID}`);
    expect(message).not.toContain('kumbh-mela-2026');
    expect(
      buildEventShareMessage({ id: CUID, status: 'PENDING', title: 'Hidden' }),
    ).toBeNull();
  });

  it('uses the production Event ID URL even when a slug is available elsewhere', () => {
    const message = buildEventShareMessage({
      id: REAL_EVENT_ID,
      status: 'APPROVED',
      title: 'PALSAFAR HOME LIVE EVENT TEST 20261008-0138',
    });
    expect(message).toBe(
      `Check out this event on PalSafar: PALSAFAR HOME LIVE EVENT TEST 20261008-0138\nhttps://palsafar.in/event/${REAL_EVENT_ID}`,
    );
  });
});

describe('events api client', () => {
  it('omits blank filters instead of sending empty equality params', () => {
    const src = read('services/api/events.ts');
    expect(src).toMatch(
      /if \(value === undefined \|\| value === null \|\| value === ''\) continue;/,
    );
    expect(src).toMatch(/return qs \? `\?\$\{qs\}` : '';/);
    expect(src).not.toMatch(/q=undefined|city=&state=/);
  });

  it('keeps reserved routes ahead of the :idOrSlug route', () => {
    const src = read('services/api/events.ts');
    expect(src).toMatch(/endpoints\.events\.featured/);
    expect(src).toMatch(/endpoints\.events\.map/);
    expect(src).toMatch(/endpoints\.events\.nearby/);
    expect(eventsApi.getByIdOrSlug).toBeInstanceOf(Function);
  });

  it('exposes all five public endpoints', () => {
    for (const fn of ['list', 'featured', 'getByIdOrSlug', 'mapFeed', 'nearby'] as const) {
      expect(eventsApi[fn]).toBeInstanceOf(Function);
    }
  });
});

describe('event query keys', () => {
  it('scopes lists by a filter signature, detail by id, and detail/featured off one prefix', () => {
    expect(eventKeys.all).toEqual(['events']);
    expect(eventKeys.lists()).toEqual(['events', 'list']);
    expect(eventKeys.list(DEFAULT_EVENT_FILTERS)).toEqual([
      'events',
      'list',
      eventFilterKey(DEFAULT_EVENT_FILTERS),
    ]);
    expect(eventKeys.detail(CUID)).toEqual(['events', 'detail', CUID]);
    expect(eventKeys.featured(3)).toEqual(['events', 'featured', 3]);
  });

  it('produces a stable, case-insensitive filter signature', () => {
    expect(eventFilterKey({ ...DEFAULT_EVENT_FILTERS, q: '  Diwali ' })).toBe(
      eventFilterKey({ ...DEFAULT_EVENT_FILTERS, q: 'diwali' }),
    );
    expect(eventFilterKey(DEFAULT_EVENT_FILTERS)).not.toBe(
      eventFilterKey({ ...DEFAULT_EVENT_FILTERS, featuredOnly: true }),
    );
    expect(eventFilterKey(DEFAULT_EVENT_FILTERS)).not.toBe(
      eventFilterKey({ ...DEFAULT_EVENT_FILTERS, type: 'FAIR_MELA' }),
    );
  });

  it('keeps the map feed key independent of the bbox so panning reuses one entry', () => {
    expect(eventKeys.mapFeed('FESTIVAL', null, null, false)).toEqual(
      eventKeys.mapFeed('FESTIVAL', null, null, false),
    );
    expect(eventKeys.mapFeed('FESTIVAL', null, null, false)).not.toBe(
      eventKeys.mapFeed('CONCERT', null, null, false),
    );
  });
});

describe('event map markers', () => {
  const item = {
    id: 'evt-1',
    slug: 'kumbh-mela-2026',
    title: 'Kumbh Mela 2026',
    eventType: 'FAIR_MELA' as const,
    startDate: '2026-10-12T00:00:00.000Z',
    endDate: '2026-10-15T00:00:00.000Z',
    startTime: null,
    endTime: null,
    isPast: false,
    isOngoing: false,
    isFeatured: true,
    venueName: null,
    address: 'Simhastha Kshetra',
    city: 'Ujjain',
    state: 'Madhya Pradesh',
    placeName: null,
    placeId: null,
    latitude: 23.17,
    longitude: 75.78,
    hasCoordinates: true,
    coverImage: null,
    distanceMeters: null,
    marker: { icon: 'storefront-outline', label: 'Fair / Mela', color: '#1F4D3A' },
  };

  it('maps a positioned event into a plotable marker', () => {
    const [marker] = toEventMarkers([item]);
    expect(marker).toBeDefined();
    expect(marker.id).toBe('evt-1');
    expect(marker.type).toBe('event');
    expect(marker.name).toBe('Kumbh Mela 2026');
    expect(marker.category).toBe('FAIR_MELA');
    expect(marker.lat).toBe(23.17);
    expect(marker.lng).toBe(75.78);
  });

  it('drops events without usable coordinates', () => {
    expect(
      toEventMarkers([{ ...item, hasCoordinates: false, latitude: null, longitude: null }]),
    ).toEqual([]);
    expect(
      toEventMarkers([{ ...item, hasCoordinates: false, latitude: 0, longitude: 0 }]),
    ).toEqual([]);
  });

  it('keeps the server marker icon/label and the featured flag', () => {
    const [marker] = toEventMarkers([item]);
    expect(marker.isFeatured).toBe(true);
    expect(marker.emoji).toBe('storefront-outline');
    expect(marker.sublabel).toBe('Fair / Mela');
    expect(marker.eventIdOrSlug).toBe('kumbh-mela-2026');
  });

  it('falls back to the EventType label when the server sends no marker group', () => {
    const [marker] = toEventMarkers([{ ...item, marker: null } as never]);
    expect(marker.sublabel).toBe('Fair / Mela');
    expect(marker.emoji).toBe('event');
  });
});

describe('events navigation wiring', () => {
  it('registers Events and EventDetail on the root stack', () => {
    const src = read('navigation/RootNavigator.tsx');
    expect(src).toMatch(/name="Events"/);
    expect(src).toMatch(/name="EventDetail"/);
  });

  it('types both Event routes with the params they consume', () => {
    const src = read('navigation/types.ts');
    expect(src).toMatch(/Events:\s*\{ initialType\?: EventType \} \| undefined;/);
    expect(src).toMatch(/EventDetail:\s*\{ eventIdOrSlug: string \};/);
  });

  it('opens EventDetail from the Home strip and the feed', () => {
    expect(read('screens/HomeScreen.tsx')).toMatch(
      /navigation\.navigate\('EventDetail', \{ eventIdOrSlug \}\)/,
    );
    expect(read('screens/EventsScreen.tsx')).toMatch(/navigation\.navigate\('EventDetail', \{ eventIdOrSlug \}\)/);
  });

  it('renders a labeled Add Event action in the Events header', () => {
    const src = read('screens/EventsScreen.tsx');
    expect(src).toContain('testID="events-add-event"');
    expect(src).toContain('accessibilityLabel="Add an event"');
    expect(src).toMatch(/<Text style=\{styles\.headerBtnPrimaryText\}>Add Event<\/Text>/);
    expect(src).toMatch(/navigation\.navigate\('AddEvent'\)/);
  });

  it('renders the featured strip on Home', () => {
    const src = read('screens/HomeScreen.tsx');
    expect(src).toMatch(/<HomeEventsStrip/);
    expect(src).toMatch(/navigation\.navigate\('Events'\)/);
  });

  it('keeps consistent vertical separation before every Live Events state', () => {
    const src = read('features/events/HomeEventsStrip.tsx');
    expect(src).toMatch(/section:\s*\{\s*marginTop:\s*20,\s*marginBottom:\s*24\s*\}/);
    expect(src.match(/style=\{\[styles\.section, \{ paddingHorizontal: edgePadding \}\]\}/g)).toHaveLength(4);
  });

  it('keeps the three-layer map control wired to the shared tab type', () => {
    const src = read('features/mapExplore/components/MapSegmentControl.tsx');
    expect(src).toMatch(/MAP_LAYER_TABS/);
    expect(src).toMatch(/Events/);
    const session = read('utils/mapViewportManager.ts');
    expect(session).toMatch(/isMapLayerTab\(parsed\.tab\)/);
  });
});