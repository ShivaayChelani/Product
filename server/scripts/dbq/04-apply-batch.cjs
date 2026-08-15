/**
 * Batch-apply deterministic fixes using UPDATE ... FROM (VALUES ...) syntax.
 *
 * Reads the validated dry-run log and applies all changes in a single
 * transaction with batched SQL (1500 rows per batch, ~8 round trips total).
 *
 * Usage:
 *   node scripts/dbq/04-apply-batch.cjs [--dry-run] [--verify-only]
 *
 * --dry-run      Show what would change, don't apply
 * --verify-only  Verify current DB state matches log expectations, don't apply
 */
process.env.DOTENV_CONFIG_PATH = __dirname + '/../../.env';
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const DRY_RUN = process.argv.includes('--dry-run');
const VERIFY_ONLY = process.argv.includes('--verify-only');
const BATCH_SIZE = 1500;
const OUT_DIR = path.resolve(__dirname, '../../reports/dbq');
fs.mkdirSync(OUT_DIR, { recursive: true });

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL } },
});

// ── Geohash encoder (precision 12, matches existing DB values) ──
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

function esc(val) {
  if (val == null) return 'NULL';
  return "'" + String(val).replace(/'/g, "''") + "'";
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ── Snapshot metrics for a set of IDs ──────────────────────────
async function snapshotMetrics(ids) {
  if (!ids.length) return {};
  const chunks_ = chunk(ids, 3000);
  let result = { city: 0, state: 0, district: 0, geohash: 0, category: 0 };
  for (const c of chunks_) {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*) FILTER (WHERE city IS NULL OR city = '') AS missing_city,
        COUNT(*) FILTER (WHERE state IS NULL OR state = '') AS missing_state,
        COUNT(*) FILTER (WHERE district IS NULL OR district = '') AS missing_district,
        COUNT(*) FILTER (WHERE geohash IS NULL) AS missing_geohash,
        COUNT(*) FILTER (WHERE category IS NULL OR category = '') AS missing_category
      FROM places WHERE id IN (${c.map(esc).join(',')})`);
    const r = rows[0];
    result.city += Number(r.missing_city);
    result.state += Number(r.missing_state);
    result.district += Number(r.missing_district);
    result.geohash += Number(r.missing_geohash);
    result.category += Number(r.missing_category);
  }
  return result;
}

// ── Execute batched VALUES+FROM UPDATE, throws on failure ──────
async function executeBatchedUpdate(label, sqlFn, items, mapItem) {
  if (!items.length) return 0;
  const batches = chunk(items, BATCH_SIZE);
  let affected = 0;
  for (let i = 0; i < batches.length; i++) {
    const values = batches[i].map(mapItem);
    const sql = sqlFn(values);
    const result = await prisma.$executeRawUnsafe(sql);
    affected += Number(result);
    console.log(`  ${label} batch ${i + 1}/${batches.length}: ${result} rows`);
  }
  return affected;
}

async function main() {
  const t0 = Date.now();
  console.log(`[apply-batch] mode=${DRY_RUN ? 'DRY-RUN' : VERIFY_ONLY ? 'VERIFY' : 'APPLY'}`);

  // ── Load dry-run log ──────────────────────────────────────────
  const logPath = path.join(OUT_DIR, 'fix-deterministic-log-dryrun.jsonl');
  if (!fs.existsSync(logPath)) {
    console.error('ERROR: Dry-run log not found at', logPath);
    process.exit(1);
  }
  const logEntries = fs.readFileSync(logPath, 'utf8').trim().split('\n').map(JSON.parse);

  // Group by field + reason
  const stateChanges = logEntries.filter((e) => e.field === 'state');
  const categoryChanges = logEntries.filter((e) => e.field === 'category');
  const cityBlank = logEntries.filter((e) => e.field === 'city' && e.after === '');
  const cityTehsil = logEntries.filter((e) => e.field === 'city' && e.reason === 'admin_unit_moved_to_tehsil');
  const cityRetitle = logEntries.filter((e) => e.field === 'city' && e.reason === 'city_case_normalize');

  const allIds = [...new Set(logEntries.map((e) => e.placeId))];

  console.log(`[apply-batch] ${logEntries.length} changes across ${allIds.length} places`);
  console.log(`  state: ${stateChanges.length} | category: ${categoryChanges.length}`);
  console.log(`  city_blank: ${cityBlank.length} | city_tehsil: ${cityTehsil.length} | city_retitle: ${cityRetitle.length}`);

  // ── Snapshot BEFORE state ─────────────────────────────────────
  console.log('[apply-batch] Snapshotting BEFORE state...');
  const beforeSnap = await snapshotMetrics(allIds);
  console.log('[apply-batch] BEFORE:', beforeSnap);

  if (VERIFY_ONLY) {
    console.log('[apply-batch] Verify-only mode — no changes applied.');
    return;
  }

  // ── Count expected geohash rows (recompute from DB) ───────────
  const ghCountRow = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS cnt FROM places
    WHERE merged_into_id IS NULL AND geohash IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL`);
  const ghExpected = ghCountRow[0].cnt;
  console.log(`[apply-batch] geohash: ${ghExpected} rows to backfill (recomputed from DB)`);

  let applied = {
    geohash_backfilled: 0, state_normalized: 0, category_normalized: 0,
    city_blanked: 0, city_to_tehsil: 0, city_retitled: 0,
  };
  let afterSnap = null;

  if (!DRY_RUN) {
    console.log('[apply-batch] BEGIN transaction...');

    await prisma.$executeRawUnsafe('BEGIN');

    try {
      // 1) Geohash backfill — recompute from lat/lng server-side
      {
        const ghRows = await prisma.$queryRawUnsafe(`
          SELECT id, latitude::double precision AS lat, longitude::double precision AS lng
          FROM places WHERE merged_into_id IS NULL AND geohash IS NULL
            AND latitude IS NOT NULL AND longitude IS NOT NULL`);
        const batches = chunk(ghRows, BATCH_SIZE);
        for (let i = 0; i < batches.length; i++) {
          const b = batches[i];
          const tuples = b.map((r) => `(${esc(r.id)}, ${esc(encodeGeohash(r.lat, r.lng, 12))})`).join(',');
          const result = await prisma.$executeRawUnsafe(
            `UPDATE places SET geohash = v.gh, updated_at = NOW()
             FROM (VALUES ${tuples}) AS v(id, gh) WHERE places.id = v.id`);
          applied.geohash_backfilled += Number(result);
          console.log(`  geohash batch ${i + 1}/${batches.length}: ${result} rows`);
        }
      }

      // 2) State normalization (89 rows)
      applied.state_normalized = await executeBatchedUpdate('state', (vals) =>
        `UPDATE places SET state = v.val, updated_at = NOW()
         FROM (VALUES ${vals.map(([id, val]) => `(${esc(id)}, ${esc(val)})`).join(',')}) AS v(id, val)
         WHERE places.id = v.id`,
        stateChanges, (e) => [e.placeId, e.after]
      );

      // 3) Category normalization (1,911 rows)
      applied.category_normalized = await executeBatchedUpdate('category', (vals) =>
        `UPDATE places SET category = v.val, updated_at = NOW()
         FROM (VALUES ${vals.map(([id, val]) => `(${esc(id)}, ${esc(val)})`).join(',')}) AS v(id, val)
         WHERE places.id = v.id`,
        categoryChanges, (e) => [e.placeId, e.after]
      );

      // 4) City blanking (5,913 rows)
      applied.city_blanked = await executeBatchedUpdate('city_blank', (vals) =>
        `UPDATE places SET city = '', updated_at = NOW()
         WHERE id IN (${vals.map(([id]) => esc(id)).join(',')})`,
        cityBlank, (e) => [e.placeId]
      );

      // 5) City → tehsil (2,318 rows)
      applied.city_to_tehsil = await executeBatchedUpdate('city_tehsil', (vals) =>
        `UPDATE places SET city = '', tehsil = COALESCE(NULLIF(places.tehsil, ''), v.val), updated_at = NOW()
         FROM (VALUES ${vals.map(([id, val]) => `(${esc(id)}, ${esc(val)})`).join(',')}) AS v(id, val)
         WHERE places.id = v.id`,
        cityTehsil, (e) => [e.placeId, e.after]
      );

      // 6) City retitling (235 rows)
      applied.city_retitled = await executeBatchedUpdate('city_retitle', (vals) =>
        `UPDATE places SET city = v.val, updated_at = NOW()
         FROM (VALUES ${vals.map(([id, val]) => `(${esc(id)}, ${esc(val)})`).join(',')}) AS v(id, val)
         WHERE places.id = v.id`,
        cityRetitle, (e) => [e.placeId, e.after]
      );

      await prisma.$executeRawUnsafe('COMMIT');
      console.log('[apply-batch] COMMIT successful.');
    } catch (err) {
      console.error('[apply-batch] ERROR in transaction,ROLLING BACK:', err.message);
      await prisma.$executeRawUnsafe('ROLLBACK').catch(() => {});
      throw err;
    }

    // ── Snapshot AFTER state ────────────────────────────────────
    console.log('[apply-batch] Snapshotting AFTER state...');
    afterSnap = await snapshotMetrics(allIds);
    console.log('[apply-batch] AFTER:', afterSnap);

    // ── Verify row counts ───────────────────────────────────────
    const totalApplied = Object.values(applied).reduce((a, b) => a + b, 0);
    console.log(`[apply-batch] Total rows updated: ${totalApplied} (expected log: ${logEntries.length} + geohash: ${ghExpected})`);
  }

  // ── Write output ──────────────────────────────────────────────
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const summary = {
    mode: DRY_RUN ? 'dry-run' : VERIFY_ONLY ? 'verify-only' : 'applied',
    elapsed_seconds: Number(elapsed),
    expected: { log_changes: logEntries.length, geohash: ghExpected },
    applied,
    total_applied: Object.values(applied).reduce((a, b) => a + b, 0),
    before: beforeSnap,
    after: afterSnap,
    delta: afterSnap ? {
      city: beforeSnap.city - afterSnap.city,
      state: beforeSnap.state - afterSnap.state,
      geohash: beforeSnap.geohash - afterSnap.geohash,
      category: beforeSnap.category - afterSnap.category,
    } : null,
  };

  fs.writeFileSync(path.join(OUT_DIR, 'fix-deterministic-batch-apply.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`[apply-batch] Done in ${elapsed}s`);
}

main().catch((e) => {
  console.error('[apply-batch] FATAL:', e.message);
  process.exit(1);
}).finally(() => prisma.$disconnect());
