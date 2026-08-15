import { getHomeCategoryById } from '../components/home/constants';
import {
  NEARBY_SEARCH_RADIUS_M,
  filterPlacesForCategoryNearby,
  isWithinCategoryRadius,
} from '../services/location/categoryNearbyFilter';
import fs from 'fs';
import path from 'path';

const BHOPAL = { lat: 23.2599, lng: 77.4126 };
const INDORE = { lat: 22.7196, lng: 75.8577 }; // ~190 km from Bhopal

describe('category nearby filtering', () => {
  const temples = getHomeCategoryById('temples')!;
  const heritage = getHomeCategoryById('heritage')!;

  const nearbyTemple = {
    id: 'near-temple',
    name: 'Birla Mandir',
    category: 'temple',
    tags: ['temple'],
    latitude: BHOPAL.lat + 0.01,
    longitude: BHOPAL.lng + 0.01,
  };
  const distantTemple = {
    id: 'far-temple',
    name: 'Distant Mandir',
    category: 'temple',
    tags: ['temple'],
    latitude: INDORE.lat,
    longitude: INDORE.lng,
  };
  const nearbyFort = {
    id: 'near-fort',
    name: 'Local Fort',
    category: 'fort',
    tags: ['heritage'],
    latitude: BHOPAL.lat + 0.02,
    longitude: BHOPAL.lng,
  };

  it('maps Hotels/hotels aliases to stay so Home category buttons are not a generic search', () => {
    expect(getHomeCategoryById('hotels')?.id).toBe('stay');
    expect(getHomeCategoryById('Hotels')?.id).toBe('stay');
    expect(getHomeCategoryById('temples')?.id).toBe('temples');
  });

  it('returns nearby places and excludes places outside the configured radius', () => {
    expect(isWithinCategoryRadius(BHOPAL.lat, BHOPAL.lng, nearbyTemple.latitude, nearbyTemple.longitude)).toBe(true);
    expect(isWithinCategoryRadius(BHOPAL.lat, BHOPAL.lng, distantTemple.latitude, distantTemple.longitude)).toBe(false);

    const result = filterPlacesForCategoryNearby(
      [nearbyTemple, distantTemple, nearbyFort],
      temples,
      BHOPAL.lat,
      BHOPAL.lng,
      NEARBY_SEARCH_RADIUS_M,
    );
    expect(result.map(p => p.id)).toEqual(['near-temple']);
  });

  it('applies category filtering using the current coordinates', () => {
    const result = filterPlacesForCategoryNearby(
      [nearbyTemple, nearbyFort],
      temples,
      BHOPAL.lat,
      BHOPAL.lng,
    );
    expect(result.map(p => p.id)).toEqual(['near-temple']);

    const heritageResult = filterPlacesForCategoryNearby(
      [nearbyTemple, nearbyFort],
      heritage,
      BHOPAL.lat,
      BHOPAL.lng,
    );
    expect(heritageResult.map(p => p.id).sort()).toEqual(['near-fort', 'near-temple'].sort());
  });

  it('returns nothing when coordinates are invalid instead of a statewide fallback', () => {
    expect(filterPlacesForCategoryNearby([nearbyTemple], temples, Number.NaN, BHOPAL.lng)).toEqual([]);
    expect(filterPlacesForCategoryNearby([nearbyTemple], temples, 0, 0)).toEqual([]);
  });

  it('does not use Math.random or a hardcoded city as a nearby fallback', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../services/homeCategorySearch.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/Math\.random/);
    expect(src).not.toMatch(/Bhopal|Indore|hardcoded/);
    expect(src).toMatch(/getNearbyPlaces/);
    expect(src).toMatch(/NEARBY_SEARCH_RADIUS_M/);
    expect(src).not.toMatch(/placesApi\.list\(\{\s*status: 'APPROVED',\s*city:/);
  });
});
