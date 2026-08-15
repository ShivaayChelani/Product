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
import {
  normalizeUniversalSearchResults,
  type UniversalSearchResult,
} from '../services/searchService';
import {
  buildUniversalRenderableRows,
  shouldApplySearchResponse,
  placeHasCityMismatch,
  isCityFilterActive,
} from '../utils/searchItineraryRows';

const root = path.join(__dirname, '..');

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('normalizeUniversalSearchResults', () => {
  it('unwraps { success, data } envelope', () => {
    const normalized = normalizeUniversalSearchResults({
      success: true,
      data: {
        places: [{ id: 'p1', name: 'Dhuandhar Falls' }],
        meta: { query: 'dhuandhar', totalResults: 1 },
      },
    });
    expect(normalized.places).toHaveLength(1);
    expect(normalized.meta.query).toBe('dhuandhar');
    expect(normalized.meta.totalResults).toBe(1);
  });

  it('ensures all result arrays exist on bare payload', () => {
    const normalized = normalizeUniversalSearchResults({ places: [{ id: 'a' }] });
    expect(normalized.places).toHaveLength(1);
    expect(normalized.hiddenGems).toEqual([]);
    expect(normalized.vendors).toEqual([]);
    expect(normalized.reels).toEqual([]);
    expect(normalized.creators).toEqual([]);
    expect(normalized.events).toEqual([]);
    expect(normalized.offers).toEqual([]);
  });

  it('derives totalResults from array lengths when meta missing', () => {
    const normalized = normalizeUniversalSearchResults({
      places: [{ id: '1' }, { id: '2' }],
      hiddenGems: [{ id: 'g1' }],
    });
    expect(normalized.meta.totalResults).toBe(3);
  });

  it('handles nested axios-style { data: payload }', () => {
    const normalized = normalizeUniversalSearchResults({
      data: {
        places: [{ id: 'x' }],
        meta: { query: 'x', totalResults: 5 },
      },
    });
    expect(normalized.places).toHaveLength(1);
    expect(normalized.meta.totalResults).toBe(5);
  });
});

describe('buildUniversalRenderableRows', () => {
  const baseResults: UniversalSearchResult = {
    places: [
      { id: 'jbp-1', name: 'Marble Rocks', city: 'Jabalpur' },
      { id: 'ujj-1', name: 'Mahakaleshwar', city: 'Ujjain' },
    ],
    hiddenGems: [],
    vendors: [{ id: 'v1', businessName: 'Cafe' }],
    reels: [],
    creators: [],
    events: [],
    offers: [],
    meta: { query: 'temple', totalResults: 3 },
  };

  it('renderable count equals array length after filters', () => {
    const rows = buildUniversalRenderableRows(baseResults, {
      mode: 'itinerary',
      destination: 'Jabalpur',
      activeFilter: 'Places',
      excludePlaceIds: [],
      itineraryPlacesOnly: true,
    });
    expect(rows).toHaveLength(2);
    expect(rows.every(r => r.type === 'Place')).toBe(true);
  });

  it('shows added state instead of hiding excluded places', () => {
    const rows = buildUniversalRenderableRows(baseResults, {
      mode: 'itinerary',
      destination: 'Jabalpur',
      activeFilter: 'Places',
      excludePlaceIds: ['jbp-1'],
      itineraryPlacesOnly: true,
    });
    expect(rows).toHaveLength(2);
    const added = rows.find(r => r.item.id === 'jbp-1');
    expect(added?.added).toBe(true);
    expect(added?.actionLabel).toBe('✓ Added');
  });

  it('does not hide city-mismatch places in itinerary mode', () => {
    const rows = buildUniversalRenderableRows(baseResults, {
      mode: 'itinerary',
      destination: 'Jabalpur',
      activeFilter: 'Places',
      excludePlaceIds: [],
      itineraryPlacesOnly: true,
    });
    const ujjain = rows.find(r => r.item.id === 'ujj-1');
    expect(ujjain).toBeDefined();
    expect(ujjain?.cityMismatch).toBe(true);
  });

  it('hides city-mismatch places in replace mode', () => {
    const rows = buildUniversalRenderableRows(baseResults, {
      mode: 'replace',
      destination: 'Jabalpur',
      activeFilter: 'Places',
      excludePlaceIds: [],
      itineraryPlacesOnly: true,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].item.id).toBe('jbp-1');
  });

  it('matches plural filter chips to singular result types', () => {
    const rows = buildUniversalRenderableRows(baseResults, {
      mode: 'itinerary',
      destination: 'Jabalpur',
      activeFilter: 'Places',
      excludePlaceIds: [],
      itineraryPlacesOnly: true,
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(r => r.type === 'Place')).toBe(true);
  });
});

describe('stale universal search generation guard', () => {
  it('shouldApplySearchResponse rejects stale generations', () => {
    expect(shouldApplySearchResponse(2, 2)).toBe(true);
    expect(shouldApplySearchResponse(3, 2)).toBe(false);
  });

  it('SearchScreen universal debounce uses fetchGenRef guard', () => {
    const src = read('screens/SearchScreen.tsx');
    expect(src).toMatch(/fetchGenRef\.current !== gen/);
    expect(src).toMatch(/const gen = \+\+fetchGenRef\.current/);
  });
});

describe('tripId navigation wiring', () => {
  it('TripBuilderLoadedView Add More Places opens Map instead of Search', () => {
    const src = read('features/buildTrip/components/TripBuilderLoadedView.tsx');
    expect(src).toMatch(/navigation\.navigate\('MainTabs',\s*\{\s*screen:\s*'Map'\s*\}\)/);
    expect(src).not.toMatch(/mode:\s*'itinerary'/);
  });

  it('SearchWrapper refreshes excludePlaceIds from server after add', () => {
    const src = read('navigation/RootNavigator.tsx');
    expect(src).toMatch(/refreshItineraryPlaceIds/);
    expect(src).toMatch(/tripsApi\.getById\(resolvedTripId\)/);
    expect(src).toMatch(/tripId:\s*activeTripId \?\? tripId/);
  });
});

describe('city mismatch helpers', () => {
  it('placeHasCityMismatch detects out-of-destination places', () => {
    expect(
      placeHasCityMismatch({ city: 'Ujjain' }, 'Jabalpur', isCityFilterActive('itinerary', 'Jabalpur')),
    ).toBe(true);
    expect(
      placeHasCityMismatch({ city: 'Jabalpur' }, 'Jabalpur', isCityFilterActive('itinerary', 'Jabalpur')),
    ).toBe(false);
  });
});
