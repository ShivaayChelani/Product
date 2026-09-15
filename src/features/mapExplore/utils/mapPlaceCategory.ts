/**
 * Map-screen-only place category presentation.
 *
 * Raw place.category values stay untouched in the DB, API, Search, Treasure Hunt,
 * and itinerary. This module only decides which main chip a place belongs to and
 * which raw keys to send to GET /places/map when a chip is selected.
 */

export const MAP_MAIN_CATEGORY_KEYS = [
  'heritage',
  'temple',
  'ghat',
  'waterfall',
  'nature',
  'museum',
  'park',
  'viewpoint',
  'market',
] as const;

export type MapMainCategory = (typeof MAP_MAIN_CATEGORY_KEYS)[number];

export const MAP_VISIBLE_CATEGORY_KEYS = ['all', ...MAP_MAIN_CATEGORY_KEYS] as const;

export const MAP_VISIBLE_CATEGORY_LABELS = [
  'All',
  'Heritage',
  'Temple',
  'Ghat',
  'Waterfall',
  'Nature',
  'Museum',
  'Park',
  'Viewpoint',
  'Market',
] as const;

/** Canonical phrases (space-separated) that resolve to a main Map chip. */
export const MAP_MAIN_CATEGORY_ALIASES: Record<MapMainCategory, readonly string[]> = {
  heritage: [
    'heritage',
    'fort',
    'palace',
    'monument',
    'memorial',
    'historical site',
    'historic site',
    'historical',
    'historic',
    'tomb',
    'haveli',
    'archaeological site',
    'archaeological',
    'archeological site',
    'museum complex',
    'castle',
    'citadel',
    'ruins',
    'mahal',
    'qila',
    'kila',
    'stupa',
    'mausoleum',
    'samadhi',
    'statue',
    'stepwell',
    'step well',
    'baoli',
    'unesco',
  ],
  temple: [
    'temple',
    'shrine',
    'religious site',
    'religious',
    'mandir',
    'math',
    'mosque',
    'church',
    'gurudwara',
    'gurdwara',
    'dargah',
    'ashram',
    'masjid',
    'chapel',
    'monastery',
    'spiritual',
  ],
  ghat: ['ghat', 'river ghat', 'bathing ghat'],
  waterfall: ['waterfall', 'waterfalls', 'falls', 'cascade', 'cascades'],
  nature: [
    'nature',
    'lake',
    'dam',
    'reservoir',
    'wildlife',
    'forest',
    'nature reserve',
    'water attraction',
    'beach',
    'mountain',
    'cave',
    'desert',
    'trek',
    'trekking',
    'river',
    'jungle',
    'safari',
    'wetland',
    'sanctuary',
    'hill station',
    'adventure',
    'camping',
  ],
  museum: [
    'museum',
    'gallery',
    'art gallery',
    'art centre',
    'art center',
    'exhibition',
  ],
  park: [
    'park',
    'garden',
    'botanical garden',
    'eco park',
    'botanical',
    'national park',
    'theme park',
  ],
  viewpoint: [
    'viewpoint',
    'view point',
    'scenic point',
    'scenic',
    'sunset point',
    'sunrise point',
    'hill view',
    'lookout',
    'lookout point',
  ],
  market: [
    'market',
    'bazaar',
    'shopping street',
    'commercial market',
    'shopping',
    'haat',
    'mandi',
  ],
};

const EXACT_ALIAS_TO_MAIN: Record<string, MapMainCategory> = (() => {
  const map: Record<string, MapMainCategory> = {};
  for (const main of MAP_MAIN_CATEGORY_KEYS) {
    for (const alias of MAP_MAIN_CATEGORY_ALIASES[main]) {
      map[alias] = main;
    }
  }
  return map;
})();

const MAIN_KEY_SET = new Set<string>(MAP_MAIN_CATEGORY_KEYS);

export function isMapMainCategory(value: string | null | undefined): value is MapMainCategory {
  return MAIN_KEY_SET.has((value || '').trim().toLowerCase());
}

export function canonicalizeMapCategory(raw: string | null | undefined): string {
  return (raw || '')
    .toLowerCase()
    .trim()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Phrase rules run after exact aliases. More specific groups first so
 * "river ghat" is Ghat, not Nature, and "museum complex" is Heritage, not Museum.
 */
const FALLBACK_RULES: { pattern: RegExp; main: MapMainCategory }[] = [
  { pattern: /\bghat\b/, main: 'ghat' },
  { pattern: /\bwaterfalls?\b|\bfalls\b|\bcascades?\b/, main: 'waterfall' },
  { pattern: /\bmuseum complex\b/, main: 'heritage' },
  { pattern: /\bmuseums?\b|\bgaller(?:y|ies)\b|\bart centr(?:e|es|er|ers)\b|\bexhibitions?\b/, main: 'museum' },
  {
    pattern:
      /\btemples?\b|\bshrines?\b|\bmandirs?\b|\bmaths?\b|\breligious\b|\bmosques?\b|\bchurch(?:es)?\b|\bgurudwaras?\b|\bgurdwaras?\b|\bdargahs?\b|\bashrams?\b|\bmasjids?\b|\bchapels?\b|\bmonaster(?:y|ies)\b/,
    main: 'temple',
  },
  { pattern: /\bmarkets?\b|\bbazaars?\b|\bshopping\b|\bhaats?\b|\bmandis?\b/, main: 'market' },
  {
    pattern:
      /\bview\s*points?\b|\bviewpoints?\b|\bscenic\b|\blookouts?\b|\bsunset point\b|\bsunrise point\b|\bhill view\b/,
    main: 'viewpoint',
  },
  { pattern: /\bparks?\b|\bgardens?\b|\bbotanical\b|\beco park\b/, main: 'park' },
  {
    pattern:
      /\blakes?\b|\bdams?\b|\breservoirs?\b|\bwildlife\b|\bforests?\b|\bnature\b|\bwater attraction\b|\bbeaches?\b|\bmountains?\b|\bcaves?\b|\bdeserts?\b|\btrekk?ing\b|\btreks?\b|\brivers?\b|\bwetlands?\b|\bsanctuar(?:y|ies)\b|\bjungle\b|\bsafari\b|\badventure\b/,
    main: 'nature',
  },
  {
    pattern:
      /\bheritage\b|\bforts?\b|\bpalaces?\b|\bmonuments?\b|\bmemorials?\b|\bhistor(?:ic|ical)\b|\btombs?\b|\bhavelis?\b|\barchaeolog|\barcheolog|\bcastles?\b|\bruins?\b|\bmahal\b|\bqila\b|\bstupa\b|\bmausoleum\b|\bsamadhi\b|\bcitadel\b|\bstatues?\b|\bstepwells?\b|\bbaoli\b/,
    main: 'heritage',
  },
];

/** Map a raw place category to a visible Map chip, or null if it should only appear under All. */
export function toMapMainCategory(
  raw: string | null | undefined,
): MapMainCategory | null {
  const canonical = canonicalizeMapCategory(raw);
  if (!canonical) return null;

  const exact = EXACT_ALIAS_TO_MAIN[canonical];
  if (exact) return exact;

  for (const rule of FALLBACK_RULES) {
    if (rule.pattern.test(canonical)) return rule.main;
  }

  return null;
}

function uniqueKeys(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function keyVariants(value: string): string[] {
  const canonical = canonicalizeMapCategory(value);
  if (!canonical) return [];
  return uniqueKeys([value, canonical, canonical.replace(/ /g, '_')]);
}

/**
 * Expand a main Map chip to the raw category strings the map feed can match
 * with LOWER(p.category) IN (...). Includes known aliases plus any live API keys
 * that already map to this chip.
 */
export function expandMapCategoryKeys(
  main: MapMainCategory | string,
  apiKeys: string[] = [],
): string[] {
  const key = main.trim().toLowerCase();
  if (!isMapMainCategory(key)) return [];

  const fromAliases = MAP_MAIN_CATEGORY_ALIASES[key].flatMap(alias => keyVariants(alias));
  const fromApi = apiKeys.filter(raw => toMapMainCategory(raw) === key).flatMap(raw => keyVariants(raw));

  return uniqueKeys([key, ...fromAliases, ...fromApi]);
}

/** Query params for GET /places/map. Empty object means All (no category filter). */
export function toMapFeedQueryParams(
  selected: string | null | undefined,
  apiKeys: string[] = [],
): { categories?: string } {
  const key = (selected || '').trim().toLowerCase();
  if (!key || key === 'all') return {};
  if (!isMapMainCategory(key)) return {};
  const expanded = expandMapCategoryKeys(key, apiKeys);
  if (expanded.length === 0) return {};
  return { categories: expanded.join(',') };
}

/** All keeps every place. A main chip keeps only places that map to that chip. */
export function placeMatchesMapFilter(
  rawCategory: string | null | undefined,
  selected: string | null | undefined,
): boolean {
  const key = (selected || '').trim().toLowerCase();
  if (!key || key === 'all') return true;
  return toMapMainCategory(rawCategory) === key;
}
