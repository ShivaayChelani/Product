/** Normalize tourist place tags — category, geography, heritage signals. */

const VALID_TAG = /^[a-z0-9][a-z0-9-]{0,48}$/;

export function slugTag(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

const CATEGORY_ALIASES: Record<string, string> = {
  nature: 'heritage',
  heritage_site: 'heritage',
  archaeological: 'archaeological_site',
  nationalpark: 'national_park',
  hillstation: 'hill_station',
  place_of_worship: 'temple',
  wildlife_sanctuary: 'wildlife',
  bird_sanctuary: 'sanctuary',
};

export function normalizeCategory(raw?: string | null): string {
  const cat = slugTag(raw || 'monument').replace(/-/g, '_');
  const mapped = CATEGORY_ALIASES[cat] || cat.replace(/_/g, '_');
  if (mapped === 'park') return 'park';
  return mapped.replace(/_/g, '_');
}

export function buildPlaceTags(input: {
  category?: string | null;
  state?: string | null;
  city?: string | null;
  extraTags?: string[] | null;
  osmTags?: Record<string, string> | null;
  wikidataId?: string | null;
  mustVisit?: boolean;
  isHiddenGem?: boolean;
}): string[] {
  const tags = new Set<string>();

  const category = normalizeCategory(input.category);
  tags.add(category.replace(/_/g, '-'));

  if (input.state?.trim()) tags.add(slugTag(input.state));
  if (input.city?.trim()) tags.add(slugTag(input.city));

  for (const t of input.extraTags || []) {
    const s = slugTag(t);
    if (s && VALID_TAG.test(s)) tags.add(s);
  }

  const osm = input.osmTags || {};
  if (osm.tourism) tags.add(slugTag(osm.tourism));
  if (osm.historic) tags.add(slugTag(osm.historic));
  if (osm.natural) tags.add(slugTag(osm.natural));
  if (osm.leisure === 'nature_reserve') tags.add('wildlife');
  if (osm.leisure === 'park' && (osm.tourism || osm.historic)) tags.add('heritage-park');
  if (osm.religion) tags.add(slugTag(osm.religion));
  if (osm.unesco === 'yes' || osm.heritage === 'heritage') tags.add('unesco');
  if (osm.wikidata) tags.add(`wikidata-${osm.wikidata.toLowerCase()}`);

  if (input.wikidataId) tags.add(`wikidata-${input.wikidataId.toLowerCase()}`);
  if (input.mustVisit) tags.add('must-visit');
  if (input.isHiddenGem) tags.add('hidden-gem');

  tags.add('india');
  tags.add('tourist-place');

  return [...tags].filter((t) => t && VALID_TAG.test(t));
}

export function extractOsmAliases(tags: Record<string, string>, primaryName: string): string[] {
  const keys = [
    'alt_name', 'alt_name:en', 'old_name', 'official_name', 'loc_name', 'short_name',
    'name:hi', 'name:en', 'name:mr', 'name:ta', 'name:te', 'name:bn', 'name:gu', 'name:kn', 'name:ml',
  ];
  const out = new Set<string>();
  const primaryNorm = primaryName.trim().toLowerCase();
  for (const k of keys) {
    const v = tags[k]?.trim();
    if (!v || v.length < 2 || v.length > 120) continue;
    if (v.toLowerCase() === primaryNorm) continue;
    out.add(v);
  }
  return [...out];
}
