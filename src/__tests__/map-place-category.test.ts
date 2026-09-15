import fs from 'fs';
import path from 'path';
import { buildMapCategoryChips, MAP_CATEGORY_CHIPS } from '../features/mapExplore/constants/categoryChips';
import {
  expandMapCategoryKeys,
  MAP_VISIBLE_CATEGORY_KEYS,
  MAP_VISIBLE_CATEGORY_LABELS,
  placeMatchesMapFilter,
  toMapFeedQueryParams,
  toMapMainCategory,
} from '../features/mapExplore/utils/mapPlaceCategory';

const GRANULAR_API_CATEGORIES = [
  { key: 'monument', count: 4 },
  { key: 'memorial', count: 3 },
  { key: 'historical site', count: 2 },
  { key: 'temple', count: 5 },
  { key: 'shrine', count: 1 },
  { key: 'religious site', count: 2 },
  { key: 'ghat', count: 6 },
  { key: 'waterfall', count: 3 },
  { key: 'water_attraction', count: 2 },
  { key: 'lake', count: 4 },
  { key: 'dam', count: 1 },
  { key: 'scenic point', count: 2 },
  { key: 'garden', count: 3 },
  { key: 'museum', count: 2 },
  { key: 'market', count: 1 },
  { key: 'mystery_poi', count: 7 },
];

describe('Map place category normalization', () => {
  it('maps Monument and Memorial to Heritage', () => {
    expect(toMapMainCategory('Monument')).toBe('heritage');
    expect(toMapMainCategory('memorial')).toBe('heritage');
    expect(toMapMainCategory('Historical Site')).toBe('heritage');
    expect(toMapMainCategory('Fort')).toBe('heritage');
    expect(toMapMainCategory('Palace')).toBe('heritage');
    expect(toMapMainCategory('Tomb')).toBe('heritage');
  });

  it('maps Temple and Shrine to Temple', () => {
    expect(toMapMainCategory('Temple')).toBe('temple');
    expect(toMapMainCategory('Shrine')).toBe('temple');
    expect(toMapMainCategory('Religious Site')).toBe('temple');
  });

  it('maps Ghat to Ghat', () => {
    expect(toMapMainCategory('Ghat')).toBe('ghat');
    expect(toMapMainCategory('River Ghat')).toBe('ghat');
  });

  it('maps Waterfall to Waterfall', () => {
    expect(toMapMainCategory('Waterfall')).toBe('waterfall');
    expect(toMapMainCategory('cascade')).toBe('waterfall');
  });

  it('maps Lake, Dam, and Water Attraction to Nature', () => {
    expect(toMapMainCategory('Lake')).toBe('nature');
    expect(toMapMainCategory('Dam')).toBe('nature');
    expect(toMapMainCategory('Water Attraction')).toBe('nature');
    expect(toMapMainCategory('water_attraction')).toBe('nature');
  });

  it('maps Scenic Point to Viewpoint', () => {
    expect(toMapMainCategory('Scenic Point')).toBe('viewpoint');
    expect(toMapMainCategory('viewpoint')).toBe('viewpoint');
  });

  it('maps Garden to Park', () => {
    expect(toMapMainCategory('Garden')).toBe('park');
    expect(toMapMainCategory('Botanical Garden')).toBe('park');
  });

  it('maps Museum to Museum and Market to Market', () => {
    expect(toMapMainCategory('Museum')).toBe('museum');
    expect(toMapMainCategory('Market')).toBe('market');
  });

  it('does not invent a visible category for unknown keys', () => {
    expect(toMapMainCategory('mystery_poi')).toBeNull();
    expect(toMapMainCategory('information centre')).toBeNull();
    expect(toMapMainCategory('other')).toBeNull();
    expect(toMapMainCategory('')).toBeNull();
  });

  it('is deterministic across equivalent spellings', () => {
    expect(toMapMainCategory('Historical Site')).toBe(toMapMainCategory('historical_site'));
    expect(toMapMainCategory('Scenic Point')).toBe(toMapMainCategory('scenic-point'));
    expect(toMapMainCategory('Water Attraction')).toBe(toMapMainCategory('WATER_ATTRACTION'));
  });
});

describe('Map category chips', () => {
  const chips = buildMapCategoryChips(GRANULAR_API_CATEGORIES);

  it('renders only the main Map categories', () => {
    expect(chips.map(c => c.label)).toEqual([...MAP_VISIBLE_CATEGORY_LABELS]);
    expect(chips.map(c => c.key)).toEqual([...MAP_VISIBLE_CATEGORY_KEYS]);
    expect(MAP_CATEGORY_CHIPS.map(c => c.label)).toEqual([...MAP_VISIBLE_CATEGORY_LABELS]);
  });

  it('does not render granular category chips', () => {
    const labels = chips.map(c => c.label);
    for (const granular of [
      'Water Attraction',
      'Memorial',
      'Monument',
      'Historical Site',
      'Religious Site',
      'Scenic Point',
      'Dam',
      'Lake',
      'Garden',
      'Shrine',
    ]) {
      expect(labels).not.toContain(granular);
    }
    expect(chips.some(c => c.key === 'mystery_poi')).toBe(false);
    expect(chips.some(c => c.label === 'Mystery Poi')).toBe(false);
  });

  it('rolls All to every eligible place count, including unmapped keys', () => {
    const expectedAll = GRANULAR_API_CATEGORIES.reduce((sum, row) => sum + row.count, 0);
    expect(chips.find(c => c.key === 'all')?.count).toBe(expectedAll);
    expect(chips.find(c => c.key === 'heritage')?.count).toBe(9);
    expect(chips.find(c => c.key === 'nature')?.count).toBe(7);
  });
});

describe('Map filter matching', () => {
  const places = [
    { id: '1', category: 'Monument' },
    { id: '2', category: 'Memorial' },
    { id: '3', category: 'Temple' },
    { id: '4', category: 'Lake' },
    { id: '5', category: 'mystery_poi' },
    { id: '6', category: 'Garden' },
  ];

  it('All shows all places, including unknown and granular categories', () => {
    expect(places.filter(p => placeMatchesMapFilter(p.category, ''))).toHaveLength(places.length);
    expect(places.filter(p => placeMatchesMapFilter(p.category, 'all'))).toHaveLength(places.length);
  });

  it('a main chip keeps only matching places and never invents a fallback category', () => {
    const heritage = places.filter(p => placeMatchesMapFilter(p.category, 'heritage'));
    expect(heritage.map(p => p.id)).toEqual(['1', '2']);
    expect(places.filter(p => placeMatchesMapFilter(p.category, 'temple')).map(p => p.id)).toEqual(['3']);
    expect(places.filter(p => placeMatchesMapFilter(p.category, 'nature')).map(p => p.id)).toEqual(['4']);
    expect(places.filter(p => placeMatchesMapFilter(p.category, 'park')).map(p => p.id)).toEqual(['6']);
    expect(placeMatchesMapFilter('mystery_poi', 'heritage')).toBe(false);
    expect(placeMatchesMapFilter(undefined, 'temple')).toBe(false);
  });

  it('does not drop an existing marker solely because its category was normalized', () => {
    const before = places.map(p => p.id);
    const afterAll = places.filter(p => placeMatchesMapFilter(p.category, 'all')).map(p => p.id);
    expect(afterAll).toEqual(before);
    expect(placeMatchesMapFilter('mystery_poi', 'all')).toBe(true);
    expect(placeMatchesMapFilter('Monument', 'heritage')).toBe(true);
  });

  it('expands Heritage to raw keys the map feed already understands', () => {
    const keys = expandMapCategoryKeys('heritage', ['monument', 'memorial', 'historical site']);
    expect(keys).toEqual(expect.arrayContaining(['heritage', 'monument', 'memorial', 'historical site']));
    expect(toMapFeedQueryParams('', ['monument']).categories).toBeUndefined();
    expect(toMapFeedQueryParams('all').categories).toBeUndefined();
    expect(toMapFeedQueryParams('heritage', ['monument']).categories).toMatch(/monument/);
  });
});

describe('Map screen wiring stays presentation-only', () => {
  it('does not title-case raw API keys into extra chips', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../features/mapExplore/constants/categoryChips.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/replace\(/);
    expect(src).toMatch(/toMapMainCategory/);
  });

  it('sends expanded categories to the map feed instead of the raw chip key', () => {
    const src = fs.readFileSync(path.join(__dirname, '../screens/MapScreen.tsx'), 'utf8');
    expect(src).toMatch(/toMapFeedQueryParams/);
    expect(src).toMatch(/mapApiCategoryKeys/);
    expect(src).not.toMatch(/title-case/);
  });

  it('filters visible place pins by the selected chip on the client', () => {
    const src = fs.readFileSync(path.join(__dirname, '../screens/MapScreen.tsx'), 'utf8');
    expect(src).toMatch(/placeMatchesMapFilter\(m\.category, selectedMapCategory\)/);
    expect(src).toMatch(/filteredMarkers[\s\S]*selectedMapCategory/);
  });

  it('does not fly the camera or cancel the in-flight feed when a category chip is tapped', () => {
    const src = fs.readFileSync(path.join(__dirname, '../screens/MapScreen.tsx'), 'utf8');
    const handler = src.match(
      /const handleSelectMapCategory = useCallback\(([\s\S]*?)\}, \[\]\);/,
    )?.[0] || '';
    expect(handler).toMatch(/setSelectedMapCategory/);
    expect(handler).not.toMatch(/flyTo/);
    expect(handler).not.toMatch(/fetchCounterRef/);
  });
});
