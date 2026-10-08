/**
 * The Map screen's third layer: Places | Events | Vendors.
 *
 * These assertions exist because a two-tab regression is silent — the Map keeps
 * working, the APK builds, and only the segmented control is missing a button.
 * Each test pins one link in the chain: tab declared → tab rendered → layer
 * fetched from the event service → marker projected → detail card → EventDetail.
 */
import fs from 'fs';
import path from 'path';
import {
  MAP_LAYER_TABS,
  isMapLayerTab,
  mapSegmentThumbX,
} from '../features/mapExplore/utils/mapSegmentThumb';

const root = path.join(__dirname, '..');

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const map = read('screens/MapScreen.tsx');
const control = read('features/mapExplore/components/MapSegmentControl.tsx');
const markers = read('features/events/eventMapMarkers.ts');
const card = read('components/MapEventDetailCard.tsx');
const flow = read('navigation/vendorReviewFlow.ts');

describe('Map layer tabs', () => {
  it('declares exactly three layers with Events in the middle', () => {
    expect(MAP_LAYER_TABS).toEqual(['places', 'events', 'vendors']);
    expect(isMapLayerTab('events')).toBe(true);
  });

  it('renders one Pressable per layer so a third tab is actually reachable', () => {
    expect(control).toMatch(/TAB_LABELS: Record<MapLayerTab, string>/);
    expect(control).toMatch(/events: 'Events'/);
    expect(control).toMatch(/MAP_LAYER_TABS\.map\(\(tab\) =>/);
    expect(control).toMatch(/onPress=\{\(\) => onChange\(tab\)\}/);
    // Segment width must divide by the layer count, otherwise the thumb lands
    // off-track on the new third slot.
    expect(control).toMatch(/\/ MAP_LAYER_TABS\.length/);
  });

  it('sizes the thumb from the tab index', () => {
    expect(mapSegmentThumbX('places', 120)).toBe(0);
    expect(mapSegmentThumbX('events', 120)).toBe(120);
    expect(mapSegmentThumbX('vendors', 120)).toBe(240);
  });

  it('keeps the same premium track styling for all three segments', () => {
    // One shared track/thumb/segment style set: Events must not introduce a
    // second visual system.
    expect(control).toMatch(/const styles = StyleSheet\.create\(\{/);
    expect(control).toMatch(/track: \{/);
    expect(control).toMatch(/thumb: \{/);
    expect(control).toMatch(/segment: \{[\s\S]*flex: 1/);
    expect(control).toMatch(/label: \{[\s\S]*fontSize: 13/);
    expect(control).toMatch(/labelActive: \{[\s\S]*color: '#FFFFFF'/);
  });

  it('mounts the control on the Map screen bound to activeTab', () => {
    expect(map).toMatch(/<MapSegmentControl active=\{activeTab\} onChange=\{handleMapTabChange\} \/>/);
  });
});

describe('Events layer data', () => {
  it('loads events from the event map service, never a place API', () => {
    expect(map).toMatch(/eventsApi\.mapFeed\(\{/);
    expect(map).toMatch(/setAllEvents\(toEventMarkers\(res\.data \?\? \[\]\)/);
    // No place endpoint may be used to source events.
    expect(map).not.toMatch(/placesApi\.[a-zA-Z]+\([^)]*event/i);
  });

  it('sends the viewport bbox and zoom the map already tracks', () => {
    expect(map).toMatch(/north: bounds\.north/);
    expect(map).toMatch(/south: bounds\.south/);
    expect(map).toMatch(/east: bounds\.east/);
    expect(map).toMatch(/west: bounds\.west/);
    expect(map).toMatch(/zoom,/);
  });

  it('projects server events into map markers and drops unpositioned ones', () => {
    expect(markers).toMatch(/export function toEventMarkers/);
    expect(markers).toMatch(/if \(!eventHasCoordinates\(event\)\) continue;/);
    expect(markers).toMatch(/type: 'event'/);
  });

  it('shows only events for the active layer, never coerced into places', () => {
    expect(map).toMatch(/if \(activeTab === 'events'\) \{[\s\S]*dedupeMapMarkers\(allEvents, 0\.01\)/);
    expect(map).toMatch(/const \[allEvents, setAllEvents\] = useState<MarkerData\[\]>\(\[\]\)/);
  });

  it('keeps the event fetch counter so a slow response cannot clobber a newer one', () => {
    expect(map).toMatch(/const fetchId = \+\+eventFetchCounterRef\.current;/);
    expect(map).toMatch(/if \(fetchId !== eventFetchCounterRef\.current\) return;/);
  });

  it('reuses the shared loading, offline and empty-state plumbing', () => {
    expect(map).toMatch(/if \(isOfflineRef\.current\) throw new Error\('offline'\);/);
    expect(map).toMatch(/setIsMapFetching\(true\);/);
    expect(map).toMatch(/Loading nearby events/);
  });

  it('keeps session restore, viewport refetch and tab switch on the event branch', () => {
    // Three distinct entry paths must all reach the event fetch.
    expect(map).toMatch(/if \(session\.tab\) setActiveTab\(session\.tab\);/);
    expect(map).toMatch(/activeTab === 'events'[\s\S]{0,120}fetchEventsForViewport/);
    expect(map).toMatch(/tabFetchedForRef\.current = activeTab;/);
    // A restored session tab must pass the same guard as an initial route param.
    expect(map).toMatch(/shouldRestoreSavedMapTab\(\{/);
    expect(flow).toMatch(/if \(isMapLayerTab\(initialMapTab\)\) return initialMapTab;/);
  });
});

describe('Event marker -> EventDetail', () => {
  it('renders the event detail card for a selected event marker', () => {
    expect(map).toMatch(/selectedMarker\.type === 'event' && \([\s\S]*<MapEventDetailCard/);
    expect(map).toMatch(/onBookRide=\{handleBookRide\}/);
    expect(map).toMatch(/onNavigate=\{handleNavigate\}/);
  });

  it('navigates to the existing EventDetail route with the slug or cuid', () => {
    expect(map).toMatch(
      /navigation\.navigate\('EventDetail', \{ eventIdOrSlug \}\)/,
    );
    expect(map).toMatch(/const eventIdOrSlug = selectedMarker\.eventIdOrSlug \|\| selectedMarker\.id;/);
  });

  it('reuses the existing event card, map marker config and route', () => {
    expect(card).toMatch(/onOpenEvent/);
    expect(card).toMatch(/formatEventDateRange|formatEventTimeRange/);
    expect(card).toMatch(/eventLifecycle/);
    expect(map).toMatch(/import MapEventDetailCard from '\.\.\/components\/MapEventDetailCard'/);
    expect(map).toMatch(/import \{ toEventMarkers \} from '\.\.\/features\/events\/eventMapMarkers'/);
  });

  it('keeps every EventType marker icon the server can send', () => {
    const leaflet = read('utils/leafletMapHtml.ts');
    // The server sends marker.icon per EventType (EVENT_TYPE_MARKER in the
    // backend's events.helpers.ts) so web and mobile share one vocabulary.
    expect(leaflet).toMatch(/EVENT_TYPE_MARKER/);
    for (const icon of [
      'event-festival',
      'event-religious',
      'event-cultural',
      'event-mela',
      'event-concert',
      'event-exhibition',
      'event-sports',
      'event-food',
      'event-community',
      'event-local',
      'event-other',
    ]) {
      expect(leaflet).toContain(`icons['${icon}']`);
    }
    expect(leaflet).toContain('icons.event =');
    expect(leaflet).toMatch(/isEvent \? ' event-pin'/);
    expect(leaflet).toMatch(/isEvent && marker\.isFeatured/);
  });
});

describe('Places and Vendors behaviour is untouched', () => {
  it('still routes places through the place fetch and place card', () => {
    expect(map).toMatch(/if \(activeTab === 'places'\) \{[\s\S]*fetchMapData\(/);
    expect(map).toMatch(/MapPlaceDetailCard/);
  });

  it('still routes vendors through the vendor fetch and vendor card', () => {
    expect(map).toMatch(/if \(activeTab === 'vendors'\)[\s\S]{0,80}fetchVendors\(true\)/);
    expect(map).toMatch(/MapVendorDetailCard/);
  });

  it('still hides the category chips for non-Places layers', () => {
    expect(map).toMatch(/\{activeTab === 'places' && \([\s\S]*<MapCategoryChips/);
  });

  it('still keeps the review banner on Vendors only', () => {
    expect(map).toMatch(/reviewMode && activeTab === 'vendors'/);
  });

  it('keeps the location button, camera lock and route drawing', () => {
    expect(map).toMatch(/lockMapView/);
    expect(map).toMatch(/type: 'flyTo'/);
    expect(map).toMatch(/handleSavePlace|placeSavingId/);
  });
});

describe('Events layer anchors on the live device position', () => {
  it('asks permission and takes a fresh fix when the layer comes up', () => {
    expect(map).toMatch(/const runEventsGpsInit = useCallback\(async \(\) => \{/);
    expect(map).toMatch(/hasPermission \|\| \(await requestPermission\(\)\)/);
    expect(map).toMatch(/await requestFreshPosition\(\)/);
    expect(map).toMatch(/if \(!mapReady \|\| activeTab !== 'events'\) return;/);
    expect(map).toMatch(/void runEventsGpsInit\(\);/);
    // Anchored on the fix, not on a country-level default.
    expect(map).toMatch(/type: 'flyTo'[\s\S]{0,80}zoom: MAP_TAB_ZOOM/);
  });

  it('never paints a previous session camera onto the Events layer', () => {
    expect(map).toMatch(
      /const eventsLayer =[\s\S]{0,240}resolveExplicitMapTab\(initialMapTabRef\.current, reviewModeRef\.current\) === 'events'/,
    );
    expect(map).toMatch(/if \(!eventsLayer\) \{[\s\S]{0,160}type: 'restoreView'/);
    // Directions keep the route fit as the camera owner; the anchor skips them.
    expect(map).toMatch(/if \(reviewModeRef\.current \|\| directionsRef\.current \|\| routeRef\.current\) return;/);
  });

  it('does not fall back to the country-level default view on Events', () => {
    expect(map).toMatch(/if \(!pos && activeTab !== 'events' && !initialFallbackRef\.current\) \{/);
  });

  it('surfaces a denied permission or missing fix as an actionable notice', () => {
    expect(map).toMatch(/setEventsLocationNotice\('permission'\)/);
    expect(map).toMatch(/setEventsLocationNotice\('gps'\)/);
    expect(map).toMatch(/openLocationSettings\(\)/);
    expect(map).toMatch(
      /testID=\{\s*eventsLocationNotice === 'permission'\s*\? 'events-open-location-settings'\s*: 'events-retry-location'\s*\}/,
    );
  });

  it('lets a user camera drag cancel the pending anchor', () => {
    expect(map).toMatch(/eventsGpsPendingRef\.current &&\s*Date\.now\(\) > programmaticMoveUntilRef\.current/);
    expect(map).toMatch(/eventsGpsSeqRef\.current \+= 1;/);
  });
});