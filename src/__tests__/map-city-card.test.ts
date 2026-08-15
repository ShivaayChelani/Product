import fs from 'fs';
import path from 'path';
import {
  mergeMarkersPreservingSelection,
  reduceMapSelection,
  shouldApplyMapFetch,
  shouldClearSelectionAfterFeed,
  type MapSelectionState,
} from '../features/mapExplore/utils/mapSelectionLifecycle';

const cityCard = { id: 'city:Bhopal', type: 'place', isCityGroup: true };
const gpsPlace = { id: 'place-gps', type: 'place' };
const cityPlace = { id: 'place-city', type: 'place' };

describe('city search card lifecycle', () => {
  it('keeps the selected city card when a later map feed omits it', () => {
    const merged = mergeMarkersPreservingSelection([gpsPlace, cityPlace], cityCard);
    expect(merged[0]).toEqual(cityCard);
    expect(merged.map(m => m.id)).toContain('city:Bhopal');
  });

  it('does not clear selection just because feed ids changed (clusters vs city group)', () => {
    expect(
      shouldClearSelectionAfterFeed({
        selected: cityCard,
        feedIds: ['cluster-1', 'cluster-2'],
        feedMode: 'clusters',
      }),
    ).toBe(false);
  });

  it('drops a stale GPS fetch that finishes after city selection', () => {
    expect(shouldApplyMapFetch(1, 2)).toBe(false);
    expect(shouldApplyMapFetch(3, 3)).toBe(true);
  });

  it('does not clear the city card inside flyToCity', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../screens/MapScreen.tsx'),
      'utf8',
    );
    const flyToCity = src.slice(src.indexOf('const flyToCity'), src.indexOf('const flyToSearchResults'));
    expect(flyToCity).not.toMatch(/setSelectedMarker\(null\)/);
    expect(src).toMatch(/mergeMarkersPreservingSelection/);
    expect(src).toMatch(/handleMarkerPress\(item\)/);
  });

  it('search → select city → card opens → map/API updates → card remains (including cold load)', () => {
    const cold: MapSelectionState = {
      selected: null,
      markers: [],
      latestFetchId: 0,
    };

    // First-time / cold screen: GPS viewport request in flight
    const afterGpsStart: MapSelectionState = { ...cold, latestFetchId: 1 };

    const afterSearchSelect = reduceMapSelection(afterGpsStart, {
      type: 'select',
      marker: cityCard,
      invalidateInFlight: true,
    });
    expect(afterSearchSelect.selected?.id).toBe('city:Bhopal');
    expect(afterSearchSelect.latestFetchId).toBe(2);

    // Stale GPS feed (fetchId 1) must not wipe the card
    const afterStaleGps = reduceMapSelection(afterSearchSelect, {
      type: 'feed',
      fetchId: 1,
      markers: [gpsPlace],
      mode: 'places',
    });
    expect(afterStaleGps.selected?.id).toBe('city:Bhopal');
    expect(afterStaleGps.markers.map(m => m.id)).not.toContain('place-gps');

    // City viewport feed arrives; card stays even if the synthetic city id is omitted
    const afterCityFeed = reduceMapSelection(afterStaleGps, {
      type: 'feed',
      fetchId: 2,
      markers: [cityPlace],
      mode: 'places',
    });
    expect(afterCityFeed.selected?.id).toBe('city:Bhopal');
    expect(afterCityFeed.markers.map(m => m.id)).toEqual(['city:Bhopal', 'place-city']);
  });
});
