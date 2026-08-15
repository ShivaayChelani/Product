/**
 * One source of truth for the premium map marker system. Icon ids are rendered
 * as inline SVGs inside the Leaflet WebView, keeping the marker UI asset-free.
 */
import { haversineDistanceKm } from '../services/location/distance';

export type MapMarkerConfig = {
  color: string;
  icon: string;
  label: string;
};

export const MAP_CATEGORY_MARKERS: Record<string, MapMarkerConfig> = {
  temple: { color: '#F57C00', icon: 'temple', label: 'Temple' },
  heritage: { color: '#795548', icon: 'heritage', label: 'Heritage' },
  monument: { color: '#795548', icon: 'heritage', label: 'Monument' },
  fort: { color: '#45207A', icon: 'castle', label: 'Fort' },
  palace: { color: '#2457C5', icon: 'palace', label: 'Palace' },
  waterfall: { color: '#28A9E0', icon: 'waterfall', label: 'Waterfall' },
  lake: { color: '#009688', icon: 'lake', label: 'Lake' },
  river: { color: '#1976D2', icon: 'river', label: 'River' },
  ghat: { color: '#1976D2', icon: 'ghat', label: 'River Ghat' },
  mountain: { color: '#546E7A', icon: 'mountain', label: 'Mountain' },
  hill_station: { color: '#3F51B5', icon: 'mountain', label: 'Hill Station' },
  forest: { color: '#1B5E20', icon: 'forest', label: 'Forest' },
  wildlife: { color: '#7CB342', icon: 'wildlife', label: 'Wildlife' },
  national_park: { color: '#2E7D32', icon: 'national-park', label: 'National Park' },
  park: { color: '#2E7D32', icon: 'national-park', label: 'Park' },
  adventure: { color: '#F4511E', icon: 'adventure', label: 'Adventure' },
  trek: { color: '#F4511E', icon: 'adventure', label: 'Trek' },
  camping: { color: '#6B7B27', icon: 'camping', label: 'Camping' },
  viewpoint: { color: '#EC4899', icon: 'viewpoint', label: 'View Point' },
  sunrise_sunset: { color: '#FF9800', icon: 'sun', label: 'Sunrise & Sunset' },
  food: { color: '#6D3B20', icon: 'food', label: 'Food' },
  cafe: { color: '#6F4E37', icon: 'cafe', label: 'Cafe' },
  shopping: { color: '#F5B700', icon: 'shopping', label: 'Shopping' },
  museum: { color: '#5B21B6', icon: 'museum', label: 'Museum' },
  art_gallery: { color: '#C2185B', icon: 'art-gallery', label: 'Art Gallery' },
  religious_site: { color: '#F57C00', icon: 'religious', label: 'Religious Site' },
  church: { color: '#F57C00', icon: 'religious', label: 'Church' },
  mosque: { color: '#F57C00', icon: 'religious', label: 'Mosque' },
  gurudwara: { color: '#F57C00', icon: 'religious', label: 'Gurudwara' },
  beach: { color: '#00A6A6', icon: 'beach', label: 'Beach' },
  desert: { color: '#D9822B', icon: 'desert', label: 'Desert' },
  cave: { color: '#4E342E', icon: 'cave', label: 'Cave' },
  garden: { color: '#22A447', icon: 'garden', label: 'Garden' },
  theme_park: { color: '#F72585', icon: 'theme-park', label: 'Theme Park' },
  hotel: { color: '#D32F2F', icon: 'hotel', label: 'Hotel' },
  information_centre: { color: '#757575', icon: 'information', label: 'Information Centre' },
  airport: { color: '#607D8B', icon: 'airport', label: 'Airport' },
  railway_station: { color: '#1E3A8A', icon: 'train', label: 'Railway Station' },
  bus_station: { color: '#A95A30', icon: 'bus', label: 'Bus Station' },
  vendor: { color: '#F59E0B', icon: 'vendor', label: 'Vendor' },
  default: { color: '#008F8F', icon: 'default', label: 'Place' },
};

/** Backwards-compatible color export for callers outside the map. */
export const MARKER_COLORS = Object.fromEntries(
  Object.entries(MAP_CATEGORY_MARKERS).map(([category, config]) => [category, config.color]),
) as Record<string, string>;

/** Canonical place categories used across Map + seed data. */
export const PLACE_CATEGORIES = [
  'ghat',
  'temple',
  'waterfall',
  'mosque',
  'church',
  'gurudwara',
  'monument',
  'museum',
  'park',
  'lake',
  'fort',
  'beach',
  'trek',
  'palace',
  'adventure',
] as const;

export type PlaceCategoryKey = (typeof PLACE_CATEGORIES)[number];

/** Commercial POIs that belong on the Vendors tab, not Places. */
const COMMERCIAL_PLACE_CATEGORIES = new Set([
  'shopping',
  'market',
  'shop',
  'shops',
  'bazaar',
  'restaurant',
  'cafe',
  'café',
  'coffee',
  'cafeteria',
  'street_food',
  'hotel',
  'resort',
  'homestay',
  'vendor',
]);

export function isCommercialPlaceCategory(category?: string | null): boolean {
  const raw = (category || '').toLowerCase().trim();
  if (!raw) return false;
  if (COMMERCIAL_PLACE_CATEGORIES.has(raw)) return true;
  return COMMERCIAL_PLACE_CATEGORIES.has(normalizeCategory(raw));
}

export function normalizeCategory(raw: string): string {
  const key = (raw || 'default').toLowerCase().trim().replace(/[\s/-]+/g, '_');
  const prismaMap: Record<string, string> = {
    temple: 'temple',
    monument: 'monument',
    fort: 'fort',
    lake: 'lake',
    waterfall: 'waterfall',
    park: 'park',
    palace: 'palace',
    museum: 'museum',
    beach: 'beach',
    trek: 'trek',
    trekking: 'trek',
    wildlife: 'wildlife',
    shopping: 'shopping',
    market: 'shopping',
    shop: 'shopping',
    restaurant: 'food',
    street_food: 'food',
    food: 'food',
    cafe: 'cafe',
    coffee: 'cafe',
    hotel: 'hotel',
    ghat: 'ghat',
    river: 'river',
    mosque: 'mosque',
    church: 'church',
    gurudwara: 'gurudwara',
    gurdwara: 'gurudwara',
    adventure: 'adventure',
    heritage: 'heritage',
    history: 'heritage',
    religious: 'religious_site',
    spiritual: 'religious_site',
    nature: 'forest',
    garden: 'garden',
    forest: 'forest',
    national_park: 'national_park',
    hill_station: 'hill_station',
    mountain: 'mountain',
    viewpoint: 'viewpoint',
    view_point: 'viewpoint',
    sunrise: 'sunrise_sunset',
    sunset: 'sunrise_sunset',
    art_gallery: 'art_gallery',
    gallery: 'art_gallery',
    camping: 'camping',
    desert: 'desert',
    cave: 'cave',
    theme_park: 'theme_park',
    information_centre: 'information_centre',
    information_center: 'information_centre',
    airport: 'airport',
    railway_station: 'railway_station',
    train_station: 'railway_station',
    bus_station: 'bus_station',
    other: 'monument',
  };
  return prismaMap[key] || key;
}

export function getMapMarkerConfig(category: string, type: 'place' | 'vendor' = 'place'): MapMarkerConfig {
  if (type === 'vendor') return MAP_CATEGORY_MARKERS.vendor;
  return MAP_CATEGORY_MARKERS[normalizeCategory(category)] || MAP_CATEGORY_MARKERS.default;
}

export function getMarkerColor(category: string, type: 'place' | 'vendor' = 'place'): string {
  return getMapMarkerConfig(category, type).color;
}

export function getMarkerEmoji(category: string, type: 'place' | 'vendor' = 'place'): string {
  return getMapMarkerConfig(category, type).icon;
}

export function getMarkerSublabel(category: string): string {
  const normalized = normalizeCategory(category);
  return MAP_CATEGORY_MARKERS[normalized]?.label
    || normalized.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function matchesCategoryFilter(category: string, filter: string): boolean {
  if (filter === 'all') return true;
  const cat = normalizeCategory(category);
  const f = filter.toLowerCase().trim();

  switch (f) {
    case 'heritage':
      return ['fort', 'monument', 'palace', 'museum', 'heritage'].includes(cat);
    case 'nature':
      return ['park', 'forest', 'garden', 'wildlife', 'national_park', 'waterfall', 'lake', 'beach', 'trek'].includes(cat);
    case 'temples':
      return cat === 'temple';
    case 'museums':
      return cat === 'museum';
    case 'waterfalls':
      return cat === 'waterfall';
    case 'lakes':
      return cat === 'lake';
    case 'parks':
      return ['park', 'garden', 'forest', 'national_park'].includes(cat);
    case 'ghats':
      return cat === 'ghat';
    case 'monuments':
      return cat === 'monument';
    case 'trekking':
    case 'treks':
      return cat === 'trek';
    case 'markets':
    case 'shopping':
      return cat === 'shopping';
    case 'restaurant':
      return cat === 'food' || cat === 'cafe';
    case 'events':
      return cat === 'theme_park' || cat === 'events';
    case 'resorts':
      return cat === 'hotel' || cat === 'resort';
    case 'cafe':
      return cat === 'cafe';
    case 'hotel':
      return cat === 'hotel';
    case 'hidden_gem':
    case 'hidden_gems':
      return cat === 'hidden_gem';
    default:
      return cat === f;
  }
}

/** Major landmarks shown at country/region zoom (4–7). */
const MAJOR_LABEL_CATEGORIES = new Set([
  'temple',
  'fort',
  'palace',
  'waterfall',
  'monument',
  'heritage',
  'ghat',
  'museum',
  'beach',
  'railway_station',
  'airport',
]);

/** Popular destinations shown at state/city zoom (8–10). */
const POPULAR_LABEL_CATEGORIES = new Set([
  ...MAJOR_LABEL_CATEGORIES,
  'lake',
  'park',
  'national_park',
  'wildlife',
  'viewpoint',
  'religious_site',
  'church',
  'mosque',
  'gurudwara',
  'trek',
  'adventure',
]);

export type MarkerLabelPriorityInput = {
  category?: string;
  rating?: number;
  type?: 'place' | 'vendor';
  isCityGroup?: boolean;
  tags?: string[];
  views?: number;
};

/**
 * Heuristic label priority (0–100) for zoom-aware map labels.
 * Uses category importance, rating, UNESCO-style tags, and engagement when available.
 */
export function getMarkerLabelPriority(input: MarkerLabelPriorityInput): number {
  if (input.isCityGroup) return 100;

  let score = 35;
  const cat = normalizeCategory(input.category || 'default');

  if (MAJOR_LABEL_CATEGORIES.has(cat)) score += 55;
  else if (POPULAR_LABEL_CATEGORIES.has(cat)) score += 35;
  else score += 15;

  const rating = Number(input.rating) || 0;
  if (rating >= 4.5) score += 12;
  else if (rating >= 4) score += 8;
  else if (rating >= 3) score += 4;

  const tags = input.tags || [];
  if (tags.some(t => /unesco|world.?heritage|iconic|must.?visit|famous/i.test(String(t)))) {
    score += 20;
  }

  const views = Number(input.views) || 0;
  if (views > 100) score += Math.min(15, Math.log10(views) * 4);

  if (input.type === 'vendor') score += 8;

  return Math.min(100, Math.round(score));
}

/** Normalize place names for map pin dedupe (case / punctuation insensitive). */
export function normalizeMapPlaceName(name: string): string {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const km = haversineDistanceKm(aLat, aLng, bLat, bLng);
  return Number.isFinite(km) ? km : Number.POSITIVE_INFINITY;
}

export function namesLikelySamePlace(aRaw: string, bRaw: string): boolean {
  const a = normalizeMapPlaceName(aRaw);
  const b = normalizeMapPlaceName(bRaw);
  if (!a || !b) return false;
  return a === b;
}

function preferMapMarkerScore<T extends {
  id: string;
  rating?: number;
  description?: string;
}>(m: T): number {
  let s = (Number(m.rating) || 0) * 10;
  s += Math.min(String(m.description || '').length / 20, 15);
  // Prefer API cuid ids over local slug seeds (e.g. "dumna-nature-reserve")
  if (/^c[a-z0-9]{20,}$/i.test(m.id)) s += 25;
  else if (m.id.includes('-')) s -= 5; // local/offline slug
  return s;
}

/**
 * Collapse duplicate map pins only when they have exact matching IDs or exact names at identical coordinates.
 */
export function dedupeMapMarkers<T extends {
  id: string;
  name: string;
  lat: number;
  lng: number;
  rating?: number;
  description?: string;
}>(markers: T[], radiusKm = 0.05): T[] {
  const unique = new Map<string, T>();
  for (const m of markers) {
    if (!m?.id || !Number.isFinite(m.lat) || !Number.isFinite(m.lng)) continue;
    if (!m.lat && !m.lng) continue;
    unique.set(m.id, m);
  }

  const list = Array.from(unique.values());
  const parent = list.map((_, i) => i);
  const find = (i: number): number => {
    if (parent[i] !== i) parent[i] = find(parent[i]);
    return parent[i];
  };
  const unite = (i: number, j: number) => {
    const a = find(i);
    const b = find(j);
    if (a !== b) parent[a] = b;
  };

  const NEAR_M_ANY_NAME_KM = 0.001; // 1 meter — only collapse exact coordinate collisions with exact names
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const d = haversineKm(list[i].lat, list[i].lng, list[j].lat, list[j].lng);
      if (d <= NEAR_M_ANY_NAME_KM && namesLikelySamePlace(list[i].name, list[j].name)) {
        unite(i, j);
        continue;
      }
      if (radiusKm > 0 && d <= radiusKm && namesLikelySamePlace(list[i].name, list[j].name)) {
        unite(i, j);
      }
    }
  }

  const clusters = new Map<number, T[]>();
  list.forEach((m, i) => {
    const root = find(i);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root)!.push(m);
  });

  return Array.from(clusters.values()).map((items) =>
    items.reduce((best, cur) =>
      (preferMapMarkerScore(cur) > preferMapMarkerScore(best) ? cur : best)),
  );
}

/** India overview when GPS is unavailable — no city-specific default. */
export const DEFAULT_MAP_CENTER = { lat: 20.5937, lng: 78.9629, zoom: 5 };
export const INDIA_OVERVIEW = DEFAULT_MAP_CENTER;
