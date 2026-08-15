/**
 * Phase 3: Wikidata Nominatim Remediation
 *
 * Targets ONLY WIKIMEDIA-sourced places missing state.
 * Uses Nominatim reverse geocoding to fill state, city, district.
 * Checkpointed — resumes from last checkpoint on rerun.
 *
 * Rate-limited: 1 request/second (Nominatim policy).
 * Checkpoints every 25 records.
 *
 * Usage:
 *   node scripts/dbq/09-wikidata-geocode.cjs [--dry-run] [--limit=N]
 */
process.env.DOTENV_CONFIG_PATH = __dirname + '/../../.env';
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const DRY_RUN = process.argv.includes('--dry-run');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;
const CHECKPOINT_PATH = path.resolve(__dirname, '../../reports/ops/wikidata-geocode-checkpoint.json');
const LOG_PATH = path.resolve(__dirname, '../../reports/ops/wikidata-geocode.log');
const OUT_DIR = path.resolve(__dirname, '../../reports/dbq');
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(path.dirname(CHECKPOINT_PATH), { recursive: true });

let prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL } },
});

// Reconnect resilience: on connection-drop, recreate client and retry once.
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
      console.error(`[db] connection issue (${e.message}); reconnecting (attempt ${attempt + 1})...`);
      try { await prisma.$disconnect(); } catch { /* ignore */ }
      prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
      await sleep(2000 * (attempt + 1));
    }
  }
  throw new Error('unreachable');
}

const USER_AGENT = 'PalSafar-Phase3Wikidata/1.0 (https://palsafar.com; ops@palsafar.local)';
const CHECKPOINT_EVERY = 25;
const REQUEST_TIMEOUT_MS = 25_000;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1500;

// State name normalization (official GoI names)
const STATE_ALIASES = {
  'andaman and nicobar': 'Andaman and Nicobar Islands',
  'daman and diu': 'Dadra and Nagar Haveli and Daman and Diu',
  'pondicherry': 'Puducherry',
};

const STATE_FRAGMENT_CITIES = new Set(['pradesh', 'nadu', 'bengal', 'khand', 'garh', 'desh']);

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function appendLog(line) {
  fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${line}\n`);
}

// ── Progress / provenance / error-rate helpers ───────────────────
const PROGRESS_EVERY = 250;
const PAUSE_CONSECUTIVE_ERRORS = 8;
const PAUSE_FAILURE_WINDOW = 50;
const PAUSE_FAILURE_RATE = 0.35; // 35%+ failures in last 50 → pause
const PROVENANCE_FLUSH = 25;

let provSeq = 0;
const PROV_PREFIX = 'dbq-wikidata-' + Date.now().toString(36) + '-';
const pendingProvenance = [];

function makeProvId() {
  return PROV_PREFIX + (provSeq++).toString(36) + '-' + crypto.randomBytes(4).toString('hex');
}

function queueProvenance(placeId, fieldName, value, sourceUri) {
  pendingProvenance.push({
    id: makeProvId(),
    placeId,
    fieldName,
    valueJson: { value },
    sourceUri,
  });
}

async function flushProvenance() {
  if (!pendingProvenance.length) return;
  const tuples = pendingProvenance.map((p) => `('${p.id.replace(/'/g, "''")}', '${p.placeId.replace(/'/g, "''")}', '${p.fieldName.replace(/'/g, "''")}', '${JSON.stringify(p.valueJson).replace(/'/g, "''")}', 'nominatim', '${p.sourceUri.replace(/'/g, "''")}', 0.8, NULL, NOW(), NOW())`);
  await withDb(() => prisma.$executeRawUnsafe(`
    INSERT INTO place_field_provenance
      (id, place_id, field_name, value_json, source_type, source_uri, confidence, verified_by_id, verified_at, created_at)
    VALUES ${tuples.join(',')}`));
  pendingProvenance.length = 0;
}

function shouldPause(consecutiveErrors, windowResults) {
  if (consecutiveErrors >= PAUSE_CONSECUTIVE_ERRORS) return `consecutive failures (${consecutiveErrors}) >= ${PAUSE_CONSECUTIVE_ERRORS}`;
  if (windowResults.length === PAUSE_FAILURE_WINDOW) {
    const fails = windowResults.filter(Boolean).length;
    if (fails >= Math.ceil(PAUSE_FAILURE_WINDOW * PAUSE_FAILURE_RATE)) {
      return `failure rate ${fails}/${PAUSE_FAILURE_WINDOW} (>=${Math.ceil(PAUSE_FAILURE_WINDOW * PAUSE_FAILURE_RATE)})`;
    }
  }
  return null;
}

function loadCheckpoint() {
  try {
    if (fs.existsSync(CHECKPOINT_PATH)) return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'));
  } catch { /* ignore */ }
  return { processedIds: [], totalUpdated: 0, totalErrors: 0, startedAt: new Date().toISOString() };
}

function saveCheckpoint(cp) {
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(cp, null, 2));
}

// ── Nominatim reverse geocode ───────────────────────────────────
let lastRequestAt = 0;
async function reverseGeocode(lat, lng) {
  const wait = Math.max(0, 1100 - (Date.now() - lastRequestAt));
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();

  const params = new URLSearchParams({
    lat: String(lat), lon: String(lng),
    format: 'jsonv2', addressdetails: '1', zoom: '10',
  });
  const url = `https://nominatim.openstreetmap.org/reverse?${params}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        if (attempt < MAX_RETRIES) { await sleep(BASE_BACKOFF_MS * 2 ** attempt); continue; }
        return null;
      }
      const json = await res.json();
      if (!json?.address) return null;
      const a = json.address;
      return {
        url,
        city: a.city || a.town || a.village || a.hamlet || '',
        state: a.state || '',
        district: a.district || a.county || '',
        country: a.country || '',
      };
    } catch (e) {
      if (attempt < MAX_RETRIES) { await sleep(BASE_BACKOFF_MS * 2 ** attempt); continue; }
      appendLog(`ERROR geocode ${lat},${lng}: ${e.message}`);
      return null;
    }
  }
  return null;
}

function isBadCity(city) {
  const t = (city || '').trim().toLowerCase();
  if (t.length < 2) return true;
  if (STATE_FRAGMENT_CITIES.has(t)) return true;
  return false;
}

// Devanagari Unicode range: \u0900–\u097F
const DEVANAGARI_RE = /[\u0900-\u097F]/;

// Non-India countries to reject
const NON_INDIA_COUNTRIES = new Set([
  'nepal', 'sri lanka', 'bangladesh', 'china', 'pakistan', 'bhutan', 'myanmar',
  'afghanistan', 'iran', 'tibet', 'nepāl', 'sri lankā',
]);

function isIndiaCountry(country) {
  if (!country) return false; // Unknown country → do not write unverified data
  const c = country.trim().toLowerCase();
  if (!c) return false;
  if (NON_INDIA_COUNTRIES.has(c)) return false;
  if (c === 'india' || c === 'in') return true;
  if (c.includes('india')) return true;
  if (/^\u092D/.test(country.trim())) return true; // Starts with भ (Devanagari for Bharat)
  return false;
}

function normalizeState(state) {
  const s = (state || '').trim();
  if (!s) return '';
  if (DEVANAGARI_RE.test(s)) return ''; // Reject Hindi/Devanagari state names
  const lower = s.toLowerCase();
  return STATE_ALIASES[lower] || s;
}

// ── Main ────────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now();
  console.log(`[wikidata-geocode] mode=${DRY_RUN ? 'DRY-RUN' : 'APPLY'} limit=${LIMIT === Infinity ? 'ALL' : LIMIT}`);

  // Query all WIKIMEDIA places missing state
  const places = await withDb(() => prisma.$queryRawUnsafe(`
    SELECT id, name, latitude::double precision AS lat, longitude::double precision AS lng,
           city, state, district
    FROM places
    WHERE merged_into_id IS NULL AND source = 'WIKIMEDIA'
      AND (state IS NULL OR state = '')
      AND latitude IS NOT NULL AND longitude IS NOT NULL
    ORDER BY id`));
  console.log(`[wikidata-geocode] ${places.length} WIKIMEDIA places missing state with valid coords`);

  // Load checkpoint
  const cp = loadCheckpoint();
  const processedSet = new Set(cp.processedIds);
  console.log(`[wikidata-geocode] Checkpoint: ${processedSet.size} already processed`);

  // Filter to unprocessed
  const remaining = places.filter((p) => !processedSet.has(p.id)).slice(0, LIMIT);
  console.log(`[wikidata-geocode] ${remaining.length} to process this run`);

  const stats = { updated: 0, errors: 0, skipped: 0, filledCity: 0, filledDistrict: 0, provenanceRows: 0 };
  const runStart = Date.now();
  let consecutiveErrors = 0;
  const windowResults = [];

  for (let i = 0; i < remaining.length; i++) {
    const place = remaining[i];
    const geo = await reverseGeocode(place.lat, place.lng);

    if (!geo) {
      stats.errors++;
      cp.totalErrors++;
      consecutiveErrors++;
      windowResults.push(true);
      appendLog(`FAIL ${place.id} ${place.name} (${place.lat},${place.lng})`);
    } else if (!isIndiaCountry(geo.country)) {
      stats.skipped++;
      consecutiveErrors = 0;
      windowResults.push(false);
      appendLog(`SKIP_COUNTRY ${place.id} ${place.name} country=${geo.country}`);
    } else {
      consecutiveErrors = 0;
      windowResults.push(false);
      const state = normalizeState(geo.state);
      const city = (!isBadCity(geo.city) && geo.city) ? geo.city.trim() : '';
      const district = (geo.district || '').trim();

      const updates = {};
      if (state && !place.state) updates.state = state;
      if (city && (!place.city || place.city === '')) updates.city = city;
      if (district && (!place.district || place.district === '')) updates.district = district;

      if (Object.keys(updates).length > 0) {
        if (!DRY_RUN) {
          const sets = Object.entries(updates).map(([k, v]) => `${k} = '${String(v).replace(/'/g, "''")}'`).join(', ');
          await withDb(() => prisma.$executeRawUnsafe(`UPDATE places SET ${sets}, updated_at = NOW() WHERE id = $1`, place.id));
          for (const [field, value] of Object.entries(updates)) {
            queueProvenance(place.id, field, value, geo.url);
          }
        }
        stats.updated++;
        if (updates.city) stats.filledCity++;
        if (updates.district) stats.filledDistrict++;
        stats.provenanceRows += Object.keys(updates).length;
        cp.totalUpdated++;
        appendLog(`OK ${place.id} ${place.name} updates=${JSON.stringify(updates)}`);
      } else {
        stats.skipped++;
      }
    }

    if (windowResults.length > PAUSE_FAILURE_WINDOW) windowResults.shift();

    // Error-rate pause: stop and report before continuing
    const pauseReason = shouldPause(consecutiveErrors, windowResults);
    if (pauseReason) {
      if (!DRY_RUN) saveCheckpoint(cp);
      console.error(`[wikidata-geocode] PAUSED (${pauseReason}). Checkpoint saved. ${cp.processedIds.length} processed.`);
      process.exit(2);
    }

    if (!DRY_RUN) {
      cp.processedIds.push(place.id);
      processedSet.add(place.id);
    }

    // Flush provenance periodically
    if (!DRY_RUN && pendingProvenance.length >= PROVENANCE_FLUSH) {
      await flushProvenance();
    }

    // Checkpoint
    if (!DRY_RUN && cp.processedIds.length % CHECKPOINT_EVERY === 0) {
      saveCheckpoint(cp);
      console.log(`  progress: ${cp.processedIds.length}/${places.length} processed, ${cp.totalUpdated} updated, ${cp.totalErrors} errors`);
    }

    // Progress report every PROGRESS_EVERY records with ETA
    if ((i + 1) % PROGRESS_EVERY === 0) {
      const processed = cp.processedIds.length;
      const runElapsedSec = (Date.now() - runStart) / 1000;
      const rate = runElapsedSec / (i + 1);
      const remainingCount = Math.max(0, places.length - processed);
      const etaMin = (remainingCount * rate) / 60;
      console.log(`  [PROGRESS ${processed}/${places.length}] updated=${stats.updated} skipped=${stats.skipped} failed=${stats.errors} remaining=${remainingCount} ETA=${etaMin.toFixed(0)}min rate=${rate.toFixed(2)}s/rec`);
    }
  }

  // Final flush + checkpoint
  if (!DRY_RUN) {
    await flushProvenance();
    saveCheckpoint(cp);
  } else {
    console.log(`[wikidata-geocode] DRY-RUN: checkpoint untouched (${cp.processedIds.length} remain as before)`);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const summary = {
    mode: DRY_RUN ? 'dry-run' : 'applied',
    total_places: places.length,
    processed_this_run: remaining.length,
    total_processed: cp.processedIds.length,
    elapsed_seconds: Number(elapsed),
    stats,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'wikidata-geocode-summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`[wikidata-geocode] Done in ${elapsed}s`);
}

main().catch((e) => { console.error('[wikidata-geocode] FATAL:', e.message); process.exit(1); }).finally(() => prisma.$disconnect());
