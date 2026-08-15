/**
 * Phase 3 (final): Targeted straggler retry — 17 WIKIMEDIA records only.
 *
 * Retries ONLY places still missing state after the main remediation run.
 * Strategy: existing coords, Nominatim reverse at zoom=12, fallback zoom=14.
 *
 * Strict verification rules:
 *   - state must normalize to a known official Indian state/UT (after aliases)
 *   - country must be cleanly India (rejects non-India, garbled, ambiguous)
 *   - never overwrites existing values; fills only empty fields
 *   - city/district rejected if Devanagari, state-fragment, or admin unit
 * Every applied field gets a provenance row.
 * Every unresolved record gets an editorial-review row (place_quality_checks)
 * with an exact reason, then is categorized in the report.
 *
 * Usage:
 *   node scripts/dbq/09d-wikidata-straggler-retry.cjs [--dry-run]
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

const USER_AGENT = 'PalSafar-Phase3Straggler/1.0 (https://palsafar.com; ops@palsafar.local)';
const REQUEST_TIMEOUT_MS = 25_000;
const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 1500;
const ZOOMS = [12, 14];

async function withDb(fn) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const msg = String(e?.message || '').toLowerCase();
      const isConn = msg.includes('closed the connection') || msg.includes('connection') ||
                     msg.includes('pool') || msg.includes('timed out') || msg.includes('socket') ||
                     msg.includes('ended') || msg.includes('deadlock');
      if (!isConn || attempt === 2) throw e;
      console.error(`[straggler] db connection issue (${e.message}); reconnecting...`);
      try { await prisma.$disconnect(); } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  throw new Error('unreachable');
}

const DEVANAGARI_RE = /[\u0900-\u097F]/;

const KNOWN_STATES = new Set([
  'andhra pradesh', 'arunachal pradesh', 'assam', 'bihar', 'chhattisgarh',
  'goa', 'gujarat', 'haryana', 'himachal pradesh', 'jharkhand', 'karnataka',
  'kerala', 'madhya pradesh', 'maharashtra', 'manipur', 'meghalaya', 'mizoram',
  'nagaland', 'odisha', 'punjab', 'rajasthan', 'sikkim', 'tamil nadu',
  'telangana', 'tripura', 'uttar pradesh', 'uttarakhand', 'west bengal',
  'andaman and nicobar islands', 'chandigarh', 'delhi',
  'jammu and kashmir', 'ladakh', 'lakshadweep', 'puducherry',
]);

const STATE_ALIASES = {
  'orissa': 'odisha', 'odissa': 'odisha',
  'pondicherry': 'puducherry', 'nct of delhi': 'delhi',
  'national capital territory of delhi': 'delhi', 'new delhi': 'delhi',
  'andaman & nicobar islands': 'andaman and nicobar islands',
  'andaman & nicobar': 'andaman and nicobar islands',
  'daman and diu': 'dadra and nagar haveli and daman and diu',
  'jammu & kashmir': 'jammu and kashmir',
  'uttaranchal': 'uttarakhand', 'uttranchal': 'uttarakhand',
  'tamilnadu': 'tamil nadu', 'tamil nadu ': 'tamil nadu',
};

// Proper-case official names (matches DB convention)
const PROPER_STATES = {
  'andhra pradesh': 'Andhra Pradesh', 'arunachal pradesh': 'Arunachal Pradesh',
  'assam': 'Assam', 'bihar': 'Bihar', 'chhattisgarh': 'Chhattisgarh',
  'goa': 'Goa', 'gujarat': 'Gujarat', 'haryana': 'Haryana',
  'himachal pradesh': 'Himachal Pradesh', 'jharkhand': 'Jharkhand',
  'karnataka': 'Karnataka', 'kerala': 'Kerala', 'madhya pradesh': 'Madhya Pradesh',
  'maharashtra': 'Maharashtra', 'manipur': 'Manipur', 'meghalaya': 'Meghalaya',
  'mizoram': 'Mizoram', 'nagaland': 'Nagaland', 'odisha': 'Odisha',
  'punjab': 'Punjab', 'rajasthan': 'Rajasthan', 'sikkim': 'Sikkim',
  'tamil nadu': 'Tamil Nadu', 'telangana': 'Telangana', 'tripura': 'Tripura',
  'uttar pradesh': 'Uttar Pradesh', 'uttarakhand': 'Uttarakhand',
  'west bengal': 'West Bengal', 'andaman and nicobar islands': 'Andaman and Nicobar Islands',
  'chandigarh': 'Chandigarh', 'delhi': 'Delhi', 'jammu and kashmir': 'Jammu and Kashmir',
  'ladakh': 'Ladakh', 'lakshadweep': 'Lakshadweep', 'puducherry': 'Puducherry',
  'dadra and nagar haveli and daman and diu': 'Dadra and Nagar Haveli and Daman and Diu',
};

function normalizeState(state) {
  const s = String(state || '').trim();
  if (!s || isGarbled(s) || DEVANAGARI_RE.test(s)) return '';
  const lower = s.toLowerCase();
  const canon = STATE_ALIASES[lower] || lower;
  if (!KNOWN_STATES.has(canon)) return '';
  return PROPER_STATES[canon] || s;
}

const NON_INDIA_COUNTRIES = new Set([
  'nepal', 'sri lanka', 'bangladesh', 'china', 'pakistan', 'bhutan', 'myanmar',
  'afghanistan', 'iran', 'tibet', 'nepal', 'sri lank',
]);

const GARBLED_RE = /[\uFFFD\u00C0-\u00FF\u0100-\u024F]/;

const NATIVE_INDIA = ['\u092D\u093E\u0930\u0924']; // भारत
const NATIVE_NON_INDIA = [
  '\u0928\u0947\u092A\u093E\u0932', // नेपाल
  '\u092A\u093E\u0915\u093F\u0938\u094D\u0924\u093E\u0928', // पाकिस्तान
  '\u0936\u094D\u0930\u0940 \u0932\u0902\u0915\u093E', // श्री लंका
  '\u092C\u093E\u0902\u0917\u094D\u0932\u093E\u0926\u0947\u0936', // बांग्लादेश
  '\u092D\u0942\u091F\u093E\u0928', // भूटान
  '\u067E\u0627\u06A9\u0633\u062A\u0627\u0646', // پاکستان
  '\u0646\u06CC\u067E\u0627\u0644', // نیپال
  '\u0628\u0646\u06AF\u0644\u06C1 \u062F\u06CC\u0634', // بنگلہ دیش
  '\u0628\u06BE\u0648\u0679\u0627\u0646', // بھوٹان
  '\u0F60\u0F51\u0F72\u0F0B\u0F51\u0F5A\u0F62\u0F0B\u0F66\u0F0D', // འབྲུག་ཡུལ། Bhutan
];

function isGarbled(s) {
  const str = String(s || '');
  if (!str) return false;
  return GARBLED_RE.test(str) || /[\u0900-\u097F]/.test(str) || /[\u0600-\u06FF\u0E00-\u0E7F\u0F00-\u0FFF]/.test(str);
}

function countryConfidence(country) {
  const c = String(country || '').trim();
  if (!c) return 'unknown';
  if (NATIVE_INDIA.some((x) => c.includes(x))) return 'india';
  if (NATIVE_NON_INDIA.some((x) => c.includes(x))) return 'non-india';
  if (/[\u0F00-\u0FFF]/.test(c)) return 'non-india'; // Tibetan script → Tibet/Bhutan, not India
  if (isGarbled(c)) return 'ambiguous';
  const lower = c.toLowerCase();
  if (lower === 'india' || lower === 'in' || lower.includes('india')) return 'india';
  if (NON_INDIA_COUNTRIES.has(lower)) return 'non-india';
  return 'unknown';
}


function isBadCity(city) {
  const t = String(city || '').trim().toLowerCase();
  if (t.length < 2) return true;
  if (isGarbled(t) || DEVANAGARI_RE.test(t)) return true;
  if (KNOWN_STATES.has(t) || STATE_ALIASES[t]) return true;
  return false;
}

function isBadDistrict(district) {
  const t = String(district || '').trim();
  if (!t) return true;
  if (isGarbled(t) || DEVANAGARI_RE.test(t)) return true;
  if (t.length > 60) return true;
  return false;
}

let lastRequestAt = 0;
async function reverseGeocode(lat, lng, zoom) {
  const wait = Math.max(0, 1100 - (Date.now() - lastRequestAt));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&addressdetails=1&zoom=${zoom}`;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) {
        if (attempt < MAX_RETRIES) { await new Promise((r) => setTimeout(r, BASE_BACKOFF_MS * 2 ** attempt)); continue; }
        return null;
      }
      const json = await res.json();
      if (!json?.address) return null;
      const a = json.address;
      return {
        url,
        state: a.state || '',
        district: a.district || a.county || '',
        city: a.city || a.town || a.village || a.hamlet || '',
        country: a.country || '',
      };
    } catch (e) {
      if (attempt < MAX_RETRIES) { await new Promise((r) => setTimeout(r, BASE_BACKOFF_MS * 2 ** attempt)); continue; }
      return null;
    }
  }
  return null;
}

function esc(val) {
  if (val == null || val === '') return 'NULL';
  return "'" + String(val).replace(/'/g, "''") + "'";
}

async function main() {
  const t0 = Date.now();
  console.log(`[straggler] mode=${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);

  const places = await withDb(() => prisma.$queryRawUnsafe(`
    SELECT id, name, latitude::double precision AS lat, longitude::double precision AS lng,
           city, state, district, external_id
    FROM places
    WHERE merged_into_id IS NULL AND source = 'WIKIMEDIA'
      AND (state IS NULL OR state = '')
      AND latitude IS NOT NULL AND longitude IS NOT NULL
    ORDER BY id`));
  console.log(`[straggler] ${places.length} records to retry (final cleanup only)`);

  const results = [];

  for (let i = 0; i < places.length; i++) {
    const place = places[i];
    const rec = {
      placeId: place.id,
      name: place.name,
      lat: place.lat,
      lng: place.lng,
      externalId: place.external_id,
      category: null,
      reason: '',
      applied: {},
      attemptedZooms: [],
    };

    let geo = null;
    for (const zoom of ZOOMS) {
      rec.attemptedZooms.push(zoom);
      geo = await reverseGeocode(place.lat, place.lng, zoom);
      if (geo && geo.state && !isGarbled(geo.state) && countryConfidence(geo.country) === 'india') break;
    }

    if (!geo) {
      rec.category = 'no_geocoder_result';
      rec.reason = 'Nominatim returned no usable address at zoom 12/14';
      results.push(rec);
      continue;
    }

    const cc = countryConfidence(geo.country);
    if (cc === 'non-india' || cc === 'ambiguous') {
      rec.category = cc === 'non-india' ? 'non_india' : 'ambiguous';
      rec.reason = cc === 'non-india'
        ? `Nominatim country is outside India: ${geo.country}`
        : `Nominatim returned ambiguous/unrecognizable country: ${JSON.stringify(geo.country)}`;
      results.push(rec);
      continue;
    }

    if (cc === 'unknown') {
      rec.category = 'no_geocoder_result';
      rec.reason = `Nominatim returned no usable country: ${JSON.stringify(geo.country)}`;
      results.push(rec);
      continue;
    }

    const state = normalizeState(geo.state);
    if (!state) {
      rec.category = geo.state ? 'ambiguous' : 'requires_editorial_review';
      rec.reason = geo.state
        ? `Nominatim state not an official Indian state/UT: ${JSON.stringify(geo.state)}`
        : 'Country is India but Nominatim returned no state at zoom 12/14';
      results.push(rec);
      continue;
    }

    rec.url = geo.url;

    const city = (!isBadCity(geo.city) && geo.city) ? geo.city.trim() : '';
    const district = (!isBadDistrict(geo.district)) ? geo.district.trim() : '';

    const updates = {};
    if (!place.state) updates.state = state;
    if (city && !place.city) updates.city = city;
    if (district && !place.district) updates.district = district;

    if (Object.keys(updates).length > 0) {
      if (!DRY_RUN) {
        const sets = Object.entries(updates).map(([k, v]) => `${k} = ${esc(v)}`).join(', ');
        await withDb(() => prisma.$executeRawUnsafe(`UPDATE places SET ${sets}, updated_at = NOW() WHERE id = $1`, place.id));
      }
      rec.applied = updates;
    }

    rec.category = Object.keys(updates).length > 0 ? 'successfully_fixed' : 'requires_editorial_review';
    rec.reason = Object.keys(updates).length > 0
      ? `state=${state}${city ? `, city=${city}` : ''}${district ? `, district=${district}` : ''} (zoom ${rec.attemptedZooms.join('/')})`
      : 'Country is India, state verified, but no fields were empty to fill';
    results.push(rec);
  }

  // Report + queue (apply mode)
  if (!DRY_RUN) {
    const provId = 'dbq-straggler-' + Date.now().toString(36) + '-';
    const qcId = 'dbq-straggler-review-' + Date.now().toString(36) + '-';
    const provSql = [];
    const qcSql = [];
    let pIdx = 0, qIdx = 0;

    for (const r of results) {
      for (const [field, value] of Object.entries(r.applied)) {
        provSql.push(`(${esc(provId + (pIdx++) + '-' + crypto.randomBytes(4).toString('hex'))}, ${esc(r.placeId)}, ${esc(field)}, ${esc(JSON.stringify({ value }))}, ${esc('nominatim')}, ${esc(r.url || '')}, 0.8, NULL, NOW(), NOW())`);
      }
      if (r.category !== 'successfully_fixed') {
        qcSql.push(`(${esc(qcId + (qIdx++) + '-' + crypto.randomBytes(4).toString('hex'))}, ${esc(r.placeId)}, ${esc('WIKIMEDIA_STATE_UNRESOLVED')}, false, ${esc(JSON.stringify({ category: r.category, reason: r.reason, externalId: r.externalId, coords: [r.lat, r.lng], attemptedZooms: r.attemptedZooms }))}, NOW())`);
      }
    }

    await withDb(() => prisma.$executeRawUnsafe('BEGIN'));
    try {
      if (provSql.length) {
        await withDb(() => prisma.$executeRawUnsafe(`
          INSERT INTO place_field_provenance
            (id, place_id, field_name, value_json, source_type, source_uri, confidence, verified_by_id, verified_at, created_at)
          VALUES ${provSql.join(',')}`));
      }
      if (qcSql.length) {
        await withDb(() => prisma.$executeRawUnsafe(`
          INSERT INTO place_quality_checks
            (id, place_id, check_code, passed, details, checked_at)
          VALUES ${qcSql.join(',')}`));
      }
      await withDb(() => prisma.$executeRawUnsafe('COMMIT'));
      console.log(`[straggler] COMMIT ok: ${provSql.length} provenance rows, ${qcSql.length} review-queue rows`);
    } catch (err) {
      await withDb(() => prisma.$executeRawUnsafe('ROLLBACK')).catch(() => {});
      throw err;
    }
  }

  // Report
  const byCat = {};
  for (const r of results) byCat[r.category] = (byCat[r.category] || 0) + 1;

  const report = {
    mode: DRY_RUN ? 'dry-run' : 'applied',
    generated_at: new Date().toISOString(),
    target: '17 remaining WIKIMEDIA records missing state',
    counts: byCat,
    records: results,
  };
  const reportPath = path.join(OUT_DIR, 'wikidata-straggler-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  let md = `# Wikidata Straggler Retry Report\n\nGenerated: ${new Date().toISOString()} (mode: ${report.mode})\n\n## Counts\n\n`;
  for (const [k, v] of Object.entries(byCat)) md += `- **${k}**: ${v}\n`;
  md += '\n## Per-record\n\n| # | Name | Category | Reason |\n|---|------|----------|--------|\n';
  results.forEach((r, i) => {
    md += `| ${i + 1} | ${String(r.name).replace(/\|/g, '/').slice(0, 60)} | ${r.category} | ${String(r.reason).replace(/\|/g, '/')} |\n`;
  });
  const mdPath = path.join(OUT_DIR, 'wikidata-straggler-report.md');
  fs.writeFileSync(mdPath, md);

  console.log(JSON.stringify({ counts: byCat }, null, 2));
  console.log(`[straggler] report written to ${reportPath}`);
  console.log(`[straggler] Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => { console.error('[straggler] FATAL:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
