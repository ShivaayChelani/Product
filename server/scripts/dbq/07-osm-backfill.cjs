/**
 * Phase 2: OSM Metadata Backfill
 *
 * Joins DB places with osm-places.json via external_id.
 * Fills ONLY empty fields: city, state, district, country.
 * Never overwrites existing values.
 * Produces provenance log.
 *
 * Usage:
 *   node scripts/dbq/07-osm-backfill.cjs [--dry-run]
 */
process.env.DOTENV_CONFIG_PATH = __dirname + '/../../.env';
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 2000;
const OUT_DIR = path.resolve(__dirname, '../../reports/dbq');
fs.mkdirSync(OUT_DIR, { recursive: true });

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL } },
});

function esc(val) {
  if (val == null || val === '') return 'NULL';
  return "'" + String(val).replace(/'/g, "''") + "'";
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const t0 = Date.now();
  console.log(`[osm-backfill] mode=${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);

  // 1) Load osm-places.json
  const jsonPath = path.resolve(__dirname, '../../prisma/seed-data/osm-places.json');
  console.log('[osm-backfill] Loading osm-places.json...');
  const osmRecords = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`[osm-backfill] ${osmRecords.length} JSON records loaded`);

  // Build lookup: external_id → { city, state, district, country }
  const lookup = new Map();
  let jsonHasCity = 0, jsonHasState = 0, jsonHasCountry = 0;
  for (const rec of osmRecords) {
    const extId = rec.id; // format: "osm:node/123456"
    const entry = {
      city: (rec.city || '').trim(),
      state: (rec.state || '').trim(),
      country: (rec.country || '').trim(),
    };
    if (entry.city) jsonHasCity++;
    if (entry.state) jsonHasState++;
    if (entry.country) jsonHasCountry++;
    lookup.set(extId, entry);
  }
  console.log(`[osm-backfill] JSON: ${jsonHasCity} with city, ${jsonHasState} with state, ${jsonHasCountry} with country`);

  // 2) Find DB places with OSM external_ids
  const dbPlaces = await prisma.$queryRawUnsafe(`
    SELECT id, name, external_id, city, state, district, country
    FROM places
    WHERE merged_into_id IS NULL AND source = 'OSM'
      AND external_id IS NOT NULL AND external_id <> ''`);
  console.log(`[osm-backfill] DB OSM places with external_id: ${dbPlaces.length}`);

  // 3) Match and compute changes
  const changes = [];
  let matched = 0, unmatched = 0;
  for (const place of dbPlaces) {
    const json = lookup.get(place.external_id);
    if (!json) { unmatched++; continue; }
    matched++;

    const updates = {};
    // City: fill if DB empty and JSON has value
    if ((!place.city || place.city === '') && json.city) {
      updates.city = json.city;
    }
    // State: fill if DB empty and JSON has value (unlikely after Phase 1)
    if ((!place.state || place.state === '') && json.state) {
      updates.state = json.state;
    }
    // District: fill if DB empty and JSON has value
    if ((!place.district || place.district === '') && json.district) {
      updates.district = json.district;
    }
    // Country: fill if DB empty or differs, and JSON has value
    if ((!place.country || place.country === '' || place.country !== json.country) && json.country) {
      // Only overwrite if DB country is empty — don't change "India" to "India"
      if (!place.country || place.country === '') {
        updates.country = json.country;
      }
    }

    if (Object.keys(updates).length > 0) {
      changes.push({
        placeId: place.id,
        name: place.name,
        external_id: place.external_id,
        before: {
          city: place.city || '',
          state: place.state || '',
          district: place.district || '',
          country: place.country || '',
        },
        after: { ...{ city: place.city || '', state: place.state || '', district: place.district || '', country: place.country || '' }, ...updates },
        updates,
      });
    }
  }

  console.log(`[osm-backfill] Matched: ${matched} | Unmatched: ${unmatched}`);
  console.log(`[osm-backfill] Changes needed: ${changes.length}`);

  // Breakdown by field
  const fieldCounts = {};
  for (const c of changes) {
    for (const f of Object.keys(c.updates)) {
      fieldCounts[f] = (fieldCounts[f] || 0) + 1;
    }
  }
  console.log('[osm-backfill] By field:', fieldCounts);

  // Sample
  console.log('\n[osm-backfill] Sample changes (first 10):');
  for (const c of changes.slice(0, 10)) {
    console.log(`  ${c.name} (${c.external_id}): ${JSON.stringify(c.updates)}`);
  }

  if (DRY_RUN || changes.length === 0) {
    console.log('[osm-backfill] Dry run — no changes applied.');
    const summary = { mode: 'dry-run', matched, unmatched, changes: changes.length, fieldCounts, elapsed_seconds: ((Date.now() - t0) / 1000).toFixed(1) };
    fs.writeFileSync(path.join(OUT_DIR, 'osm-backfill-dryrun.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  // 4) Apply changes in batched UPDATEs
  console.log('[osm-backfill] Applying changes...');
  const applied = { city: 0, state: 0, district: 0, country: 0 };

  // Build a single UPDATE per field type using temp table approach
  const byField = {};
  for (const c of changes) {
    for (const [field, value] of Object.entries(c.updates)) {
      if (!byField[field]) byField[field] = [];
      byField[field].push({ id: c.placeId, value });
    }
  }

  await prisma.$executeRawUnsafe('BEGIN');
  try {
    for (const [field, items] of Object.entries(byField)) {
      const batches = chunk(items, BATCH_SIZE);
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const tuples = batch.map((r) => `(${esc(r.id)}, ${esc(r.value)})`).join(',');
        const sql = `UPDATE places SET ${field} = v.val, updated_at = NOW()
          FROM (VALUES ${tuples}) AS v(id, val) WHERE places.id = v.id`;
        const result = await prisma.$executeRawUnsafe(sql);
        applied[field] += Number(result);
        console.log(`  ${field} batch ${i + 1}/${batches.length}: ${result} rows`);
      }
    }
    await prisma.$executeRawUnsafe('COMMIT');
    console.log('[osm-backfill] COMMIT successful.');
  } catch (err) {
    console.error('[osm-backfill] ERROR, ROLLING BACK:', err.message);
    await prisma.$executeRawUnsafe('ROLLBACK').catch(() => {});
    throw err;
  }

  // 5) Write provenance log
  const logPath = path.join(OUT_DIR, 'osm-backfill-log.jsonl');
  const logStream = fs.createWriteStream(logPath);
  for (const c of changes) {
    logStream.write(JSON.stringify({
      placeId: c.placeId,
      name: c.name,
      external_id: c.external_id,
      source: 'osm-places.json',
      field: Object.keys(c.updates),
      before: c.before,
      after: c.after,
      timestamp: new Date().toISOString(),
    }) + '\n');
  }
  logStream.end();

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const summary = {
    mode: 'applied',
    elapsed_seconds: Number(elapsed),
    matched, unmatched, total_changes: changes.length,
    applied,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'osm-backfill-applied.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`[osm-backfill] Done in ${elapsed}s`);
}

main().catch((e) => {
  console.error('[osm-backfill] FATAL:', e.message);
  process.exit(1);
}).finally(() => prisma.$disconnect());
