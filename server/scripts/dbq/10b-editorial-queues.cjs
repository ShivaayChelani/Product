/**
 * Generate all editorial review queues for the production audit.
 *
 * Outputs:
 *   - server/reports/ops/editorial-queues/queue-<type>.csv  (full lists)
 *   - server/reports/ops/editorial-queues/editorial-queues.json (manifest)
 *
 * Queue types:
 *   generic_names, missing_city, missing_state, missing_district,
 *   missing_description, missing_image, duplicate_coordinate_groups,
 *   duplicate_candidates, nepal_out_of_india, osm_rejected_cities,
 *   wikidata_stragglers, conflicting_metadata
 *
 * Also (idempotently) flags the two previously-identified Nepal-state records
 * (Kapilavastu, Shivapuri) in place_quality_checks — these were written by an
 * earlier backfill, not this pipeline, and must not be auto-reverted.
 *
 * No bulk data modifications are performed.
 */
process.env.DOTENV_CONFIG_PATH = __dirname + '/../../.env';
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

const OUT = path.resolve(__dirname, '../../reports/ops/editorial-queues');
fs.mkdirSync(OUT, { recursive: true });

const INDIA_BOUNDS = { minLat: 6.5, maxLat: 37.6, minLng: 68.0, maxLng: 97.5 };

const GENERIC_RE = /^(ancient mound|temple|ruins?|tank|fort|hill fort|stupa|park|garden|view ?point|waterfall|falls|statue|museum|market|colony park|public park|old fort|gate|monument|cave|temple complex|village|town|area|road|school|college|hospital|church|csi|mandir|masjid|mosque|cross|check post|bus stop|railway station|water tank|overhead tank|well|pond|lake|river|beach|island|point|peak|pass|valley|meadow|glacier|hot spring|camp site|campsite|scout camp|trek|track|trail|hiking|bird watching|nature trail)$/i;

const OFFICIAL_STATES = new Set([
  'andhra pradesh', 'arunachal pradesh', 'assam', 'bihar', 'chhattisgarh',
  'goa', 'gujarat', 'haryana', 'himachal pradesh', 'jharkhand', 'karnataka',
  'kerala', 'madhya pradesh', 'maharashtra', 'manipur', 'meghalaya', 'mizoram',
  'nagaland', 'odisha', 'punjab', 'rajasthan', 'sikkim', 'tamil nadu',
  'telangana', 'tripura', 'uttar pradesh', 'uttarakhand', 'west bengal',
  'andaman and nicobar islands', 'chandigarh', 'delhi', 'jammu and kashmir',
  'ladakh', 'lakshadweep', 'puducherry', 'dadra and nagar haveli and daman and diu',
]);

const KNOWN_STATE_VALUES = new Set([
  ...OFFICIAL_STATES,
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland',
  'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands',
  'Chandigarh', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
  'Dadra and Nagar Haveli and Daman and Diu',
]);

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

async function writeCsv(name, header, rows) {
  const lines = [header.map(csvEscape).join(',')];
  for (const r of rows) lines.push(r.map(csvEscape).join(','));
  const file = path.join(OUT, `queue-${name}.csv`);
  fs.writeFileSync(file, '\uFEFF' + lines.join('\n'), 'utf8');
  return { type: name, count: rows.length, file: path.relative(process.cwd(), file) };
}

async function q(sql) { return prisma.$queryRawUnsafe(sql); }

async function main() {
  const queues = [];
  const ACTIVE = `FROM places WHERE merged_into_id IS NULL`;

  // 1) generic_names
  const generic = await q(`SELECT id, name, state, city, district FROM places
    WHERE merged_into_id IS NULL AND name = LOWER(name)
      AND name ~ '(^| )(temple|mandir|park|garden|fort|stupa|museum|view ?point|waterfall|falls|statue|market|tank|ruins?|monument|cave|church|mosque|masjid|beach|lake|water ?fall|point|peak|trek|track|trail|gate|gurudwara)( |$)'
      AND LENGTH(name) < 40 ORDER BY name`);
  queues.push(await writeCsv('generic_names', ['id', 'name', 'state', 'city', 'district'],
    generic.map((r) => [r.id, r.name, r.state, r.city, r.district])));

  // 2) missing_city
  const noCity = await q(`SELECT id, name, state, district, latitude, longitude
    FROM places WHERE merged_into_id IS NULL AND (city IS NULL OR city = '') ORDER BY id`);
  queues.push(await writeCsv('missing_city', ['id', 'name', 'state', 'district', 'lat', 'lng'],
    noCity.map((r) => [r.id, r.name, r.state, r.district, r.latitude, r.longitude])));

  // 3) missing_state
  const noState = await q(`SELECT id, name, city, district, latitude, longitude
    FROM places WHERE merged_into_id IS NULL AND (state IS NULL OR state = '') ORDER BY id`);
  queues.push(await writeCsv('missing_state', ['id', 'name', 'city', 'district', 'lat', 'lng'],
    noState.map((r) => [r.id, r.name, r.city, r.district, r.latitude, r.longitude])));

  // 4) missing_district
  const noDistrict = await q(`SELECT id, name, state, city, latitude, longitude
    FROM places WHERE merged_into_id IS NULL AND (district IS NULL OR district = '') ORDER BY id`);
  queues.push(await writeCsv('missing_district', ['id', 'name', 'state', 'city', 'lat', 'lng'],
    noDistrict.map((r) => [r.id, r.name, r.state, r.city, r.latitude, r.longitude])));

  // 5) missing_description
  const noDesc = await q(`SELECT id, name, state, city FROM places
    WHERE merged_into_id IS NULL AND (description IS NULL OR TRIM(description) = '') ORDER BY id`);
  queues.push(await writeCsv('missing_description', ['id', 'name', 'state', 'city'],
    noDesc.map((r) => [r.id, r.name, r.state, r.city])));

  // 6) missing_image
  const noImg = await q(`SELECT id, name, state, city FROM places
    WHERE merged_into_id IS NULL AND (images IS NULL OR cardinality(images) = 0) AND thumbnail IS NULL ORDER BY id`);
  queues.push(await writeCsv('missing_image', ['id', 'name', 'state', 'city'],
    noImg.map((r) => [r.id, r.name, r.state, r.city])));

  // 7) duplicate_coordinate_groups (5dp exact)
  const dupCoords = await q(`SELECT ROUND(latitude::numeric,5)::text AS lat, ROUND(longitude::numeric,5)::text AS lng,
      COUNT(*)::int AS n, string_agg(id, '|') AS ids, string_agg(name, ' | ') AS names
    FROM places WHERE merged_into_id IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL
      AND NOT (latitude = 0 AND longitude = 0)
    GROUP BY 1,2 HAVING COUNT(*) > 1 ORDER BY n DESC`);
  queues.push(await writeCsv('duplicate_coordinate_groups', ['lat', 'lng', 'count', 'place_ids', 'names'],
    dupCoords.map((r) => [r.lat, r.lng, r.n, r.ids, r.names])));

  // 8) duplicate_candidates (from table)
  const dupCands = await q(`SELECT d.id, d.status, d.confidence_score AS score, d.signals, a.name AS place_a, b.name AS place_b
    FROM place_duplicate_candidates d
    LEFT JOIN places a ON a.id = d.place_a_id
    LEFT JOIN places b ON b.id = d.place_b_id ORDER BY d.status, d.created_at`);
  queues.push(await writeCsv('duplicate_candidates', ['id', 'status', 'score', 'signals', 'place_a', 'place_b'],
    dupCands.map((r) => [r.id, r.status, r.score, JSON.stringify(r.signals || {}), r.place_a, r.place_b])));

  // 9) nepal_out_of_india — outside bbox OR known non-India state values OR flagged stragglers
  const nonIndiaStateVals = ['\u0932\u0941\u092E\u094D\u092C\u093F\u0928\u0940 \u092A\u094D\u0930\u0926\u0947\u0936', 'Bagmati', 'Lumbini Province'];
  const outs = await q(`SELECT id, name, state, city, latitude, longitude, source FROM places
    WHERE merged_into_id IS NULL AND (
      (latitude IS NOT NULL AND longitude IS NOT NULL AND NOT (
        latitude >= 6.5 AND latitude <= 37.6 AND longitude >= 68.0 AND longitude <= 97.5))
      OR state IN ('\u0932\u0941\u092E\u094D\u092C\u093F\u0928\u0940 \u092A\u094D\u0930\u0926\u0947\u0936','Bagmati','Lumbini Province')
    ) ORDER BY id`);
  queues.push(await writeCsv('nepal_out_of_india', ['id', 'name', 'state', 'city', 'lat', 'lng', 'source'],
    outs.map((r) => [r.id, r.name, r.state, r.city, r.latitude, r.longitude, r.source])));

  // 10) osm_rejected_cities (from quality checks)
  const osmRej = await q(`SELECT p.id, p.name, q.details FROM place_quality_checks q
    JOIN places p ON p.id = q.place_id WHERE q.check_code = 'OSM_CITY_REJECTED' ORDER BY p.name`);
  queues.push(await writeCsv('osm_rejected_cities', ['place_id', 'name', 'details'],
    osmRej.map((r) => [r.id, r.name, JSON.stringify(r.details)])));

  // 11) wikidata_stragglers (from quality checks)
  const wdStragglers = await q(`SELECT p.id, p.name, p.state, p.city, q.details FROM place_quality_checks q
    JOIN places p ON p.id = q.place_id WHERE q.check_code = 'WIKIMEDIA_STATE_UNRESOLVED' ORDER BY p.name`);
  queues.push(await writeCsv('wikidata_stragglers', ['place_id', 'name', 'state', 'city', 'details'],
    wdStragglers.map((r) => [r.id, r.name, r.state, r.city, JSON.stringify(r.details)])));

  // 12) conflicting_metadata
  const conflicts = [];
  const cityIsState = await q(`SELECT id, name, state, city FROM places
    WHERE merged_into_id IS NULL AND city <> '' AND state <> '' AND LOWER(city) = LOWER(state) ORDER BY id`);
  for (const r of cityIsState) conflicts.push({ id: r.id, name: r.name, state: r.state, city: r.city, reason: 'city_equals_state' });

  const cityIsStateName = await q(`SELECT id, name, state, city FROM places
    WHERE merged_into_id IS NULL AND city <> '' AND LOWER(city) IN ('pradesh','nadu','kerala','rajasthan','maharashtra','karnataka','telangana','gujarat','bihar','uttar pradesh','himachal pradesh','andhra pradesh','tamil nadu','west bengal','goa','delhi','mumbai','india') ORDER BY id`);
  for (const r of cityIsStateName) conflicts.push({ id: r.id, name: r.name, state: r.state, city: r.city, reason: 'city_is_state_name' });

  const unknownState = await q(`SELECT id, name, state, city, source FROM places
    WHERE merged_into_id IS NULL AND state <> ''
      AND LOWER(state) NOT IN ('andhra pradesh','arunachal pradesh','assam','bihar','chhattisgarh','goa','gujarat','haryana','himachal pradesh','jharkhand','karnataka','kerala','madhya pradesh','maharashtra','manipur','meghalaya','mizoram','nagaland','odisha','punjab','rajasthan','sikkim','tamil nadu','telangana','tripura','uttar pradesh','uttarakhand','west bengal','andaman and nicobar islands','chandigarh','delhi','jammu and kashmir','ladakh','lakshadweep','puducherry','dadra and nagar haveli and daman and diu')
    ORDER BY id`);
  for (const r of unknownState) conflicts.push({ id: r.id, name: r.name, state: r.state, city: r.city, reason: 'state_not_official_indian_state' });

  const tehsilDistrict = await q(`SELECT id, name, state, district FROM places
    WHERE merged_into_id IS NULL AND district <> ''
      AND district ~* '(taluk|tahsil|tehsil|block|mandal|subdistrict)' ORDER BY id`);
  for (const r of tehsilDistrict) conflicts.push({ id: r.id, name: r.name, state: r.state, district: r.district, reason: 'district_is_tehsil_level' });

  queues.push(await writeCsv('conflicting_metadata', ['id', 'name', 'state', 'city', 'district', 'reason'],
    conflicts.map((r) => [r.id, r.name, r.state, r.city || '', r.district || '', r.reason])));

  // ── Flag the two known Nepal-state records (idempotent) ───────
  const FLAG_ROWS = [
    { id: 'cmrnx8vro008tf9dk2rsgmmjm', reason: 'Nepal state (लुम्बिनी प्रदेश) on WIKIMEDIA record with country=India; written by earlier backfill, do not auto-revert; verify country' },
    { id: 'cms51xoea00cwf9lkbhj6o7dd', reason: 'Nepal state (Bagmati) on CURATED record; written by earlier backfill, do not auto-revert; verify country' },
  ];
  let flagged = 0;
  for (const f of FLAG_ROWS) {
    const existing = await prisma.$queryRawUnsafe(`SELECT 1 FROM place_quality_checks WHERE place_id = $1 AND check_code = 'NON_INDIA_STATE'`, f.id);
    if (existing.length === 0) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO place_quality_checks (id, place_id, check_code, passed, details, checked_at)
         VALUES ('dbq-nonindia-state-' || gen_random_uuid()::text, $1, 'NON_INDIA_STATE', false, $2::jsonb, NOW())`,
        f.id, JSON.stringify({ reason: f.reason }));
      flagged++;
    }
  }
  queues.push({ type: 'non_india_state_flags', count: FLAG_ROWS.length, newly_inserted: flagged, file: 'place_quality_checks' });

  // ── Manifest ──────────────────────────────────────────────────
  const manifest = {
    generated_at: new Date().toISOString(),
    queues,
  };
  const manifestPath = path.join(OUT, 'editorial-queues.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(JSON.stringify(queues.map((x) => ({ type: x.type, count: x.count })), null, 2));
  console.log(`[queues] manifest written to ${manifestPath}`);
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); }).finally(() => prisma.$disconnect());
