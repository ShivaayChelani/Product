/**
 * Expand all-India genuine tourist places from OpenStreetMap.
 * Tourist / heritage / nature only — no hotels, restaurants, shops.
 *
 * Strategy: per-state tag batches + no 1500 cap → better coverage of large states.
 * Merges into osm-places.json by OSM element id (no duplicates).
 *
 * Run: node scripts/fetch-india-places-expand.cjs
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim',
  'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
  'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

const ENDPOINTS = ['overpass-api.de', 'lz4.overpass-api.de', 'z.overpass-api.de'];

/** Tourist-only tag batches (no lodging / food / retail). */
const TAG_BATCHES = [
  [
    'tourism=attraction', 'tourism=museum', 'tourism=viewpoint',
    'tourism=zoo', 'tourism=theme_park', 'tourism=gallery',
    'tourism=monument', 'tourism=aquarium', 'tourism=artwork',
  ],
  [
    'historic=monument', 'historic=castle', 'historic=fort',
    'historic=ruins', 'historic=archaeological_site', 'historic=memorial',
    'historic=temple', 'historic=church', 'historic=mosque',
    'historic=monastery', 'historic=shrine', 'historic=tomb',
    'historic=city_gate', 'historic=citywalls', 'historic=palace',
  ],
  [
    'amenity=place_of_worship',
    'building=temple', 'building=cathedral', 'building=mosque',
    'building=church', 'building=shrine',
  ],
  [
    'leisure=park', 'leisure=garden', 'leisure=nature_reserve',
    'natural=waterfall', 'natural=beach', 'natural=cave',
    'natural=peak', 'natural=hot_spring',
    'waterway=waterfall',
    'man_made=lighthouse', 'man_made=observation_tower', 'man_made=obelisk',
  ],
];

const SKIP_CATEGORIES = new Set([
  'restaurant', 'hotel', 'shopping', 'nightlife', 'cafe', 'shop',
]);

const CATEGORY_MAP = {
  museum: 'museum',
  viewpoint: 'adventure',
  zoo: 'wildlife',
  theme_park: 'adventure',
  gallery: 'monument',
  monument: 'monument',
  aquarium: 'wildlife',
  artwork: 'monument',
  fort: 'fort',
  castle: 'fort',
  archaeological_site: 'monument',
  ruins: 'monument',
  memorial: 'monument',
  park: 'park',
  garden: 'park',
  nature_reserve: 'wildlife',
  waterfall: 'waterfall',
  beach: 'beach',
  cave: 'monument',
  peak: 'trek',
  hot_spring: 'park',
  place_of_worship: 'temple',
  lighthouse: 'monument',
  observation_tower: 'adventure',
  temple: 'temple',
  church: 'church',
  mosque: 'mosque',
  monastery: 'temple',
  shrine: 'temple',
  tomb: 'monument',
  city_gate: 'monument',
  citywalls: 'fort',
  palace: 'palace',
  attraction: 'monument',
  cathedral: 'church',
  obelisk: 'monument',
};

function buildQuery(state, tags, timeout = 200) {
  const tagFilters = tags.map((t) => `nwr[${t}](area.IN);`).join('\n');
  return `[out:json][timeout:${timeout}];
area["name"="${state}"]["admin_level"=4]->.IN;
(
${tagFilters}
);
out center;`;
}

function tagCategory(tags) {
  const tagSources = [
    tags.tourism, tags.historic, tags.leisure,
    tags.natural, tags.waterway, tags.amenity, tags.man_made, tags.building,
  ];
  for (const val of tagSources) {
    if (val && CATEGORY_MAP[val]) return CATEGORY_MAP[val];
  }
  if (tags.religion === 'hindu' || tags.religion === 'jain' || tags.religion === 'buddhist') return 'temple';
  if (tags.religion === 'muslim') return 'mosque';
  if (tags.religion === 'christian') return 'church';
  if (tags.religion === 'sikh') return 'gurudwara';
  return 'monument';
}

function toSpot(el, state) {
  if (!el.tags?.name) return null;
  let lat;
  let lon;
  if (el.type === 'node') { lat = el.lat; lon = el.lon; }
  else if (el.center) { lat = el.center.lat; lon = el.center.lon; }
  else return null;

  if (lat < 6 || lat > 38 || lon < 68 || lon > 98) return null;

  const t = el.tags || {};
  const category = tagCategory(t);
  if (SKIP_CATEGORIES.has(category)) return null;

  // Skip generic local parks — keep only named tourist/national/wildlife parks
  if (category === 'park') {
    const n = (t.name || '').toLowerCase();
    const isMajor =
      /national\s+park|wildlife|sanctuary|zoo|botanical|heritage|safari|tiger|biosphere/.test(n)
      || t.leisure === 'nature_reserve'
      || t.boundary === 'national_park'
      || t.tourism || t.historic || t.natural;
    const isSmall =
      /neighbourhood|children|community|local|municipal|playground|jogging|ward\s+\d|sector\s+\d/.test(n);
    if (!isMajor || isSmall) return null;
  }

  const name = t.name.trim();
  if (!name || name.length < 2) return null;

  const generic = ['parking', 'entrance', 'exit', 'gate', 'road', 'street', 'area', 'toilet', 'toilets', 'unnamed'];
  if (generic.includes(name.toLowerCase())) return null;

  const spot = {
    id: `osm:${el.type}/${el.id}`,
    name,
    city: t['addr:city'] || t.addr_city || t.town || t.village || t.city || '',
    state,
    country: 'India',
    latitude: Math.round(lat * 10000) / 10000,
    longitude: Math.round(lon * 10000) / 10000,
    category,
    difficulty: 'easy',
    source: 'overpass',
    tags: [category, state.toLowerCase().replace(/\s+/g, '-')],
    osmTags: {
      tourism: t.tourism,
      historic: t.historic,
      natural: t.natural,
      leisure: t.leisure,
      religion: t.religion,
      wikidata: t.wikidata,
      unesco: t.unesco,
      heritage: t.heritage,
      alt_name: t.alt_name,
      old_name: t.old_name,
      official_name: t.official_name,
      'name:hi': t['name:hi'],
      'name:en': t['name:en'],
    },
    aliases: [],
  };

  const aliasKeys = ['alt_name', 'old_name', 'official_name', 'loc_name', 'short_name', 'name:hi', 'name:en'];
  for (const k of aliasKeys) {
    const v = t[k]?.trim();
    if (v && v.length >= 2 && v.toLowerCase() !== name.toLowerCase()) spot.aliases.push(v);
  }

  if (t.description) spot.shortDescription = String(t.description).substring(0, 200);
  if (t.image) spot.imageUrl = t.image;
  if (t.wikimedia_commons) {
    spot.imageUrl = spot.imageUrl
      || `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(t.wikimedia_commons)}`;
  }
  return spot;
}

function fetchBatch(state, tags, host, attempt = 0) {
  const data = encodeURIComponent(buildQuery(state, tags));
  return new Promise((resolve) => {
    const req = https.get({
      hostname: host,
      path: `/api/interpreter?data=${data}`,
      headers: {
        'User-Agent': 'PalSafar/2.1 (india-places-expand)',
        Accept: 'application/json',
      },
      timeout: 210000,
    }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve(parsed.elements || []);
        } catch {
          resolve(null); // signal retry
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  }).then(async (els) => {
    if (els != null) return els;
    if (attempt >= ENDPOINTS.length * 2 - 1) return [];
    const nextHost = ENDPOINTS[(attempt + 1) % ENDPOINTS.length];
    await new Promise((r) => setTimeout(r, 4000));
    return fetchBatch(state, tags, nextHost, attempt + 1);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const OUT = path.join(__dirname, '..', 'server', 'prisma', 'seed-data', 'osm-places.json');
  const OUT_TS = path.join(__dirname, '..', 'src', 'data', 'spots', 'osmSpots.ts');

  const byId = new Map();
  if (fs.existsSync(OUT)) {
    const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    for (const p of prev) {
      if (p?.id) byId.set(p.id, p);
    }
    console.log(`Loaded existing ${byId.size} places from osm-places.json`);
  }

  const before = byId.size;
  console.log(`=== Expand genuine India OSM places (${STATES.length} states × ${TAG_BATCHES.length} batches) ===\n`);

  for (let i = 0; i < STATES.length; i++) {
    const state = STATES[i];
    let stateAdded = 0;
    process.stdout.write(`[${i + 1}/${STATES.length}] ${state.padEnd(42)}`);

    for (let b = 0; b < TAG_BATCHES.length; b++) {
      const host = ENDPOINTS[b % ENDPOINTS.length];
      const els = await fetchBatch(state, TAG_BATCHES[b], host);
      for (const el of els) {
        const spot = toSpot(el, state);
        if (!spot) continue;
        if (!byId.has(spot.id)) {
          byId.set(spot.id, spot);
          stateAdded++;
        } else {
          // Keep richer city/description if newer fetch has it
          const cur = byId.get(spot.id);
          if ((!cur.city || !cur.city.trim()) && spot.city) cur.city = spot.city;
          if (!cur.shortDescription && spot.shortDescription) cur.shortDescription = spot.shortDescription;
          if (!cur.imageUrl && spot.imageUrl) cur.imageUrl = spot.imageUrl;
        }
      }
      await sleep(1800);
    }

    console.log(`+${stateAdded}  (total ${byId.size})`);

    if ((i + 1) % 3 === 0) {
      fs.writeFileSync(OUT, JSON.stringify([...byId.values()], null, 2));
      console.log(`  → checkpoint saved\n`);
    }
  }

  // Final dedupe by name+state+coords as safety net (keep first osm id)
  const seenKey = new Set();
  const unique = [];
  for (const p of byId.values()) {
    const key = `${p.name.toLowerCase()}|${p.state}|${p.latitude}|${p.longitude}`;
    if (seenKey.has(key)) continue;
    seenKey.add(key);
    unique.push(p);
  }

  fs.writeFileSync(OUT, JSON.stringify(unique, null, 2));
  const ts = `/** Auto-generated OSM tourist places — ${new Date().toISOString().slice(0, 10)} */\n`
    + `export const OSM_SPOTS = ${JSON.stringify(unique, null, 2)} as const;\n`;
  fs.mkdirSync(path.dirname(OUT_TS), { recursive: true });
  fs.writeFileSync(OUT_TS, ts);

  console.log(`\nDone. Before: ${before} → After: ${unique.length} (+${unique.length - before})`);
  console.log(`Wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
