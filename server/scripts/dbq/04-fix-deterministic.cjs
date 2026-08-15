process.env.DOTENV_CONFIG_PATH = __dirname + '/../../.env';
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

const OUT_DIR = path.resolve(__dirname, '../../reports/dbq');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ── Geohash (precision 12, matches existing DB values) ─────────
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
function encodeGeohash(lat, lng, precision = 12) {
  let idx = 0, bit = 0, evenBit = true, latMin = -90, latMax = 90, lngMin = -180, lngMax = 180, hash = '';
  while (hash.length < precision) {
    if (evenBit) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) { idx = idx * 2 + 1; lngMin = mid; } else { idx = idx * 2; lngMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) { idx = idx * 2 + 1; latMin = mid; } else { idx = idx * 2; latMax = mid; }
    }
    evenBit = !evenBit;
    if (++bit === 5) { hash += BASE32.charAt(idx); bit = 0; idx = 0; }
  }
  return hash;
}

// ── State normalization (official GoI names) ───────────────────
const STATE_ALIASES = {
  'andaman and nicobar': 'Andaman and Nicobar Islands',
  'daman and diu': 'Dadra and Nagar Haveli and Daman and Diu',
};

// ── Category normalization (app taxonomy: trekking -> trek) ────
const CATEGORY_ALIASES = { 'trekking': 'trek' };

// ── Dirty city detection ───────────────────────────────────────
// Union territories that are ALSO city names — never blank these when used as city.
const CITY_OK_UT = new Set(['delhi', 'chandigarh', 'puducherry', 'pondicherry']);

const STATE_NAMES = new Set([
  'andhra pradesh','arunachal pradesh','assam','bihar','chhattisgarh','goa','gujarat','haryana',
  'himachal pradesh','jammu and kashmir','jharkhand','karnataka','kerala','ladakh','madhya pradesh',
  'maharashtra','manipur','meghalaya','mizoram','nagaland','odisha','punjab','rajasthan','sikkim',
  'tamil nadu','telangana','tripura','uttar pradesh','uttarakhand','west bengal',
  'andaman and nicobar islands','andaman and nicobar','daman and diu',
  'dadra and nagar haveli and daman and diu','lakshadweep','odissa','orissa','uttranchal',
]);
const STATE_FRAGMENTS = new Set(['pradesh','nadu','bengal','khand','garh','desh']);

const ADMIN_UNIT_RE = /(tehsil|subdistrict|sub-district|block|taluk|taluka|mandal|zilla|jila|district|panchayat)$/i;

const TITLE_CASE_CITIES = new Set(['mumbai','delhi','kolkata','chennai','bengaluru','hyderabad','pune','jaipur','chandigarh','puducherry','pondicherry']);

function cleanCity(city) {
  if (!city) return null;
  let c = String(city).trim();
  if (!c) return null;
  const lower = c.toLowerCase().replace(/\s+/g, ' ');
  // Split "City, State" compound
  if (c.includes(',')) {
    const parts = c.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length === 2) {
      const first = parts[0].toLowerCase();
      const second = parts[1].toLowerCase();
      if (STATE_NAMES.has(second)) {
        c = parts[0].trim();
      } else if (STATE_NAMES.has(first)) {
        return { action: 'blank', reason: 'city_is_state_in_compound', value: '' };
      }
    }
  }
  const lower2 = c.toLowerCase().replace(/\s+/g, ' ');

  // State name used as city (skip UTs that are also valid city names)
  if (STATE_NAMES.has(lower2) && !CITY_OK_UT.has(lower2)) return { action: 'blank', reason: 'city_is_state', value: '' };
  // Fragment like "Pradesh" / "Nadu"
  if (STATE_FRAGMENTS.has(lower2)) return { action: 'blank', reason: 'city_is_state_fragment', value: '' };
  // Admin unit suffix -> move to tehsil
  if (ADMIN_UNIT_RE.test(c.trim())) {
    const base = c.trim().replace(ADMIN_UNIT_RE, '').trim();
    if (base.length >= 2) return { action: 'to_tehsil', reason: 'admin_unit_as_city', value: base };
    return { action: 'blank', reason: 'admin_unit_as_city', value: '' };
  }
  // Overly long admin path (contains multiple commas or long)
  if (c.length > 45) return { action: 'blank', reason: 'admin_path_as_city', value: '' };
  // Title-case known city names (official forms)
  if (TITLE_CASE_CITIES.has(lower2)) {
    const proper = lower2 === 'pondicherry' ? 'Puducherry' : lower2.charAt(0).toUpperCase() + lower2.slice(1);
    if (c !== proper) return { action: 'retitle', reason: 'city_case_normalize', value: proper };
  }
  return null;
}

function isBadCityForBackfill(city) {
  const t = (city || '').trim().toLowerCase();
  if (t.length < 2) return true;
  if (STATE_NAMES.has(t) && !CITY_OK_UT.has(t)) return true;
  if (STATE_FRAGMENTS.has(t)) return true;
  if (ADMIN_UNIT_RE.test(city.trim())) return true;
  return false;
}

const log = [];
function record(placeId, name, field, before, after, reason, source) {
  log.push({ placeId, name, field, before, after, reason, source });
}

async function main() {
  const stats = {
    geohash_backfilled: 0,
    state_normalized: 0,
    category_normalized: 0,
    city_blanked: 0,
    city_to_tehsil: 0,
    city_retitled: 0,
  };

  // 1) Geohash backfill
  const noGeohash = await prisma.$queryRawUnsafe(`
    SELECT id, latitude, longitude FROM places
    WHERE merged_into_id IS NULL AND geohash IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL`);
  let ghRows = [];
  for (const r of noGeohash) {
    const hash = encodeGeohash(Number(r.latitude), Number(r.longitude), 12);
    ghRows.push({ id: r.id, hash });
  }
  stats.geohash_backfilled = ghRows.length;
  if (!DRY_RUN) {
    for (let i = 0; i < ghRows.length; i += 500) {
      const chunk = ghRows.slice(i, i + 500);
      for (const r of chunk) {
        await prisma.$executeRawUnsafe(`UPDATE places SET geohash = $2, updated_at = now() WHERE id = $1`, r.id, r.hash);
      }
      console.log(`  geohash ${i + chunk.length}/${ghRows.length}`);
    }
  }

  // 2) State normalization
  const stateRows = await prisma.$queryRawUnsafe(`
    SELECT id, name, state FROM places WHERE merged_into_id IS NULL AND state <> ''`);
  const stateTargets = stateRows.filter((r) => {
    const k = String(r.state).trim().toLowerCase();
    return STATE_ALIASES[k] && String(r.state) !== STATE_ALIASES[k];
  });
  for (const r of stateTargets) {
    const after = STATE_ALIASES[String(r.state).trim().toLowerCase()];
    record(r.id, r.name, 'state', r.state, after, 'state_name_normalize', 'GoI official names');
    stats.state_normalized++;
    if (!DRY_RUN) {
      await prisma.$executeRawUnsafe(`UPDATE places SET state = $2, updated_at = now() WHERE id = $1`, r.id, after);
    }
  }

  // 3) Category normalization
  const catTargets = await prisma.$queryRawUnsafe(`
    SELECT id, name, category FROM places WHERE merged_into_id IS NULL AND LOWER(category) IN ('trekking')`);
  for (const r of catTargets) {
    const after = CATEGORY_ALIASES[String(r.category).toLowerCase()];
    record(r.id, r.name, 'category', r.category, after, 'category_normalize_trekking_to_trek', 'app taxonomy');
    stats.category_normalized++;
    if (!DRY_RUN) {
      await prisma.$executeRawUnsafe(`UPDATE places SET category = $2, updated_at = now() WHERE id = $1`, r.id, after);
    }
  }

  // 4) Dirty city cleanup (only values provably not cities)
  const cityRows = await prisma.$queryRawUnsafe(`
    SELECT id, name, city, tehsil FROM places
    WHERE merged_into_id IS NULL AND city IS NOT NULL AND city <> ''`);
  for (const r of cityRows) {
    const res = cleanCity(r.city);
    if (!res) continue;
    if (res.action === 'blank') {
      record(r.id, r.name, 'city', r.city, '', res.reason, 'deterministic validation');
      stats.city_blanked++;
      if (!DRY_RUN) {
        await prisma.$executeRawUnsafe(`UPDATE places SET city = '', updated_at = now() WHERE id = $1`, r.id);
      }
    } else if (res.action === 'to_tehsil') {
      record(r.id, r.name, 'city', r.city, '', 'admin_unit_moved_to_tehsil', 'deterministic validation');
      stats.city_to_tehsil++;
      if (!DRY_RUN) {
        await prisma.$executeRawUnsafe(`UPDATE places SET city = '', tehsil = $2, updated_at = now() WHERE id = $1`, r.id, res.value);
      }
    } else if (res.action === 'retitle') {
      record(r.id, r.name, 'city', r.city, res.value, res.reason, 'deterministic validation');
      stats.city_retitled++;
      if (!DRY_RUN) {
        await prisma.$executeRawUnsafe(`UPDATE places SET city = $2, updated_at = now() WHERE id = $1`, r.id, res.value);
      }
    }
  }

  const summary = { ...stats, dryRun: DRY_RUN, changes: log.length };
  fs.writeFileSync(path.join(OUT_DIR, `fix-deterministic-${DRY_RUN ? 'dryrun' : 'applied'}.json`), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, `fix-deterministic-log-${DRY_RUN ? 'dryrun' : 'applied'}.jsonl`), log.map((l) => JSON.stringify(l)).join('\n'));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => { console.error('FIX_ERROR:', e); process.exit(1); }).finally(() => prisma.$disconnect());
