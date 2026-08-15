/**
 * Phase 2 (filtered): OSM metadata backfill — city field only.
 *
 * Joins DB places with osm-places.json via external_id. Fills ONLY empty city.
 * Validates every candidate against a strict allow-list rule set:
 *   - must be a genuine administrative city/town name
 *   - rejects state names, admin units, villages used as cities,
 *     administrative paths, and full addresses
 * Never overwrites existing values.
 *
 * Applied updates get provenance rows (place_field_provenance).
 * Rejected candidates get editorial-review rows (place_quality_checks, passed=false).
 *
 * Usage:
 *   node scripts/dbq/07c-osm-backfill-filtered.cjs [--dry-run]
 */
process.env.DOTENV_CONFIG_PATH = __dirname + '/../../.env';
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const DRY_RUN = process.argv.includes('--dry-run');
const OUT_DIR = path.resolve(__dirname, '../../reports/dbq');
fs.mkdirSync(OUT_DIR, { recursive: true });

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

const STATE_NAMES = new Set([
  'andaman and nicobar islands', 'andaman and nicobar', 'daman and diu',
  'dadra and nagar haveli and daman and diu', 'andhra pradesh', 'arunachal pradesh',
  'assam', 'bihar', 'chhattisgarh', 'goa', 'gujarat', 'haryana', 'himachal pradesh',
  'jammu and kashmir', 'jharkhand', 'karnataka', 'kerala', 'ladakh', 'lakshadweep',
  'madhya pradesh', 'maharashtra', 'manipur', 'meghalaya', 'mizoram', 'nagaland',
  'odisha', 'odissa', 'orissa', 'punjab', 'rajasthan', 'sikkim', 'tamil nadu',
  'telangana', 'tripura', 'uttar pradesh', 'uttarakhand', 'uttranchal',
  'west bengal', 'delhi', 'chandigarh', 'puducherry', 'pondicherry',
]);

const ADMIN_RE =
  /(mandal|taluk|taluka|tehsil|subdistrict|sub-district|zilla|jila|district|panchayat|block|pradesh|nadu|bengal|khand|garh|desh|village|circle|municipal|municipality|corporation|nagar|gaon|basti|tola|mohalla|ward|sector|colony|layout|extension|enclave|garden|ground|park|road|gate|near|highway|expressway|nh\d|sh\d)/i;

const PIN_RE = /\b\d{6}\b/;
const DEVANAGARI_RE = /[\u0900-\u097F]/;

function validateCity(raw) {
  const city = String(raw || '').trim();
  const lower = city.toLowerCase();
  const reasons = [];
  if (!city) reasons.push('empty');
  if (city.includes(',')) reasons.push('comma_address');
  if (city.length > 40) reasons.push('too_long');
  if (PIN_RE.test(city)) reasons.push('pincode');
  if (DEVANAGARI_RE.test(city)) reasons.push('devanagari');
  if (STATE_NAMES.has(lower)) reasons.push('state_name');
  if (ADMIN_RE.test(city)) reasons.push('admin_unit');
  if (lower === city && city.length > 3) reasons.push('lowercase_non_proper');
  return { city, ok: reasons.length === 0, reasons };
}

function esc(val) {
  if (val == null || val === '') return 'NULL';
  return "'" + String(val).replace(/'/g, "''") + "'";
}

async function main() {
  const t0 = Date.now();
  console.log(`[osm-filtered] mode=${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);

  // 1) Load osm-places.json
  const jsonPath = path.resolve(__dirname, '../../prisma/seed-data/osm-places.json');
  const osmRecords = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const lookup = new Map();
  for (const rec of osmRecords) lookup.set(rec.id, rec);
  console.log(`[osm-filtered] ${osmRecords.length} JSON records loaded`);

  // 2) DB OSM places with external_id
  const dbPlaces = await prisma.$queryRawUnsafe(`
    SELECT id, name, external_id, city, state, district, country
    FROM places
    WHERE merged_into_id IS NULL AND source = 'OSM'
      AND external_id IS NOT NULL AND external_id <> ''`);

  // 3) Build candidates: fill only empty city, never overwrite
  const candidates = [];
  for (const place of dbPlaces) {
    const json = lookup.get(place.external_id);
    if (!json) continue;
    const rawCity = String(json.city || '').trim();
    if (!rawCity) continue;
    const isEmptyCity = !place.city || place.city === '';
    if (!isEmptyCity) continue;
    candidates.push({ placeId: place.id, name: place.name, externalId: place.external_id, rawCity });
  }
  console.log(`[osm-filtered] ${candidates.length} empty-city candidates from OSM json`);

  // 4) Validate
  const valid = [];
  const rejected = [];
  for (const c of candidates) {
    const v = validateCity(c.rawCity);
    if (v.ok) valid.push({ ...c, city: v.city });
    else rejected.push({ ...c, city: v.city, reasons: v.reasons });
  }

  console.log(`[osm-filtered] VALID=${valid.length} REJECTED=${rejected.length}`);
  console.log('\nValid candidates:');
  for (const v of valid) console.log(`  ${v.city}  <= ${v.name} (${v.externalId})`);
  console.log('\nRejected candidates:');
  for (const r of rejected) console.log(`  [${r.reasons.join(',')}] ${r.city}  <= ${r.name}`);

  if (DRY_RUN || valid.length === 0) {
    const summary = {
      mode: DRY_RUN ? 'dry-run' : 'applied',
      candidates: candidates.length,
      valid: valid.length,
      rejected: rejected.length,
      elapsed_seconds: ((Date.now() - t0) / 1000).toFixed(1),
    };
    fs.writeFileSync(path.join(OUT_DIR, 'osm-backfill-filtered-summary.json'), JSON.stringify(summary, null, 2));
    console.log('[osm-filtered] Dry run — nothing applied.');
    return;
  }

  // 5) Apply in a single transaction + provenance + rejected→review queue
  console.log('[osm-filtered] BEGIN transaction...');
  await prisma.$executeRawUnsafe('BEGIN');
  try {
    const tuples = valid.map((v) => `(${esc(v.placeId)}, ${esc(v.city)})`).join(',');
    const result = await prisma.$executeRawUnsafe(`
      UPDATE places SET city = v.val, updated_at = NOW()
      FROM (VALUES ${tuples}) AS v(id, val)
      WHERE places.id = v.id`);
    console.log(`[osm-filtered] City updates applied: ${result}`);

    // Provenance for every applied field
    const provId = 'dbq-osm-backfill-' + Date.now() + '-';
    let provIdx = 0;
    const provSql = [];
    for (const v of valid) {
      provSql.push(`(${esc(provId + (provIdx++) + '-' + crypto.randomBytes(4).toString('hex'))}, ${esc(v.placeId)}, ${esc('city')}, ${esc(JSON.stringify({ city: v.city }))}, ${esc('osm-places.json')}, ${esc(v.externalId)}, 0.9, NULL, NOW(), NOW())`);
    }
    if (provSql.length) {
      await prisma.$executeRawUnsafe(`
        INSERT INTO place_field_provenance
          (id, place_id, field_name, value_json, source_type, source_uri, confidence, verified_by_id, verified_at, created_at)
        VALUES ${provSql.join(',')}`);
      console.log(`[osm-filtered] Provenance rows: ${provSql.length}`);
    }

    // Editorial review queue: rejected candidates
    const qcId = 'dbq-osm-reject-' + Date.now() + '-';
    let qcIdx = 0;
    const qcSql = [];
    for (const r of rejected) {
      qcSql.push(`(${esc(qcId + (qcIdx++) + '-' + crypto.randomBytes(4).toString('hex'))}, ${esc(r.placeId)}, ${esc('OSM_CITY_REJECTED')}, false, ${esc(JSON.stringify({ candidate: r.city, reasons: r.reasons, externalId: r.externalId }))}, NOW())`);
    }
    if (qcSql.length) {
      await prisma.$executeRawUnsafe(`
        INSERT INTO place_quality_checks
          (id, place_id, check_code, passed, details, checked_at)
        VALUES ${qcSql.join(',')}`);
      console.log(`[osm-filtered] Review-queue rows: ${qcSql.length}`);
    }

    await prisma.$executeRawUnsafe('COMMIT');
    console.log('[osm-filtered] COMMIT successful.');
  } catch (err) {
    console.error('[osm-filtered] ERROR, ROLLING BACK:', err.message);
    await prisma.$executeRawUnsafe('ROLLBACK').catch(() => {});
    throw err;
  }

  // 6) Report
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const summary = {
    mode: 'applied',
    elapsed_seconds: Number(elapsed),
    candidates: candidates.length,
    applied_city: valid.length,
    rejected: rejected.length,
    provenance_rows: valid.length,
    review_queue_rows: rejected.length,
    applied: valid.map((v) => ({ placeId: v.placeId, name: v.name, city: v.city })),
  };
  fs.writeFileSync(path.join(OUT_DIR, 'osm-backfill-filtered-summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`[osm-filtered] Done in ${elapsed}s`);
}

main().catch((e) => {
  console.error('[osm-filtered] FATAL:', e.message);
  process.exit(1);
}).finally(() => prisma.$disconnect());
