/**
 * Create a timestamped in-DB backup of the places table metadata fields
 * that the DBQ pipeline may modify. Verified before proceeding.
 *
 * Usage:
 *   node scripts/dbq/10-create-backup.cjs
 */
process.env.DOTENV_CONFIG_PATH = __dirname + '/../../.env';
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

const OUT_DIR = path.resolve(__dirname, '../../reports/dbq');
fs.mkdirSync(OUT_DIR, { recursive: true });

async function main() {
  const t0 = Date.now();

  // Production expected count = all non-deleted places
  const core = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS total_all,
           COUNT(*) FILTER (WHERE merged_into_id IS NULL)::int AS active
    FROM places`);
  const expected = core[0].total_all;
  console.log(`[backup] Expected production rows: ${expected} (active=${core[0].active})`);

  // Unique backup table name
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '');
  const tableName = `places_meta_backup_${ts}`;
  console.log(`[backup] Backup table: ${tableName}`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE "${tableName}" AS
    SELECT id,
           city,
           state,
           district,
           country,
           tehsil,
           geohash,
           category,
           updated_at,
           external_id,
           source,
           latitude,
           longitude
    FROM places`);

  const verify = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS n FROM "${tableName}"`);
  console.log(`[backup] Backup rows: ${verify[0].n}`);

  if (verify[0].n !== expected) {
    console.error(`[backup] MISMATCH: backup=${verify[0].n} expected=${expected}. ABORTING.`);
    process.exit(1);
  }

  // Spot-check content integrity
  const spot = await prisma.$queryRawUnsafe(`
    SELECT
      COUNT(*) FILTER (WHERE city IS NULL OR city = '')::int AS missing_city,
      COUNT(*) FILTER (WHERE state IS NULL OR state = '')::int AS missing_state,
      COUNT(*) FILTER (WHERE geohash IS NULL)::int AS missing_geohash,
      COUNT(*) FILTER (WHERE category IS NULL OR category = '')::int AS missing_category,
      COUNT(*) FILTER (WHERE id IS NULL)::int AS null_ids
    FROM "${tableName}"`);
  console.log('[backup] Content spot-check:', spot[0]);

  const report = {
    created_at: new Date().toISOString(),
    backup_table: tableName,
    expected_rows: expected,
    active_rows: core[0].active,
    backed_up_rows: verify[0].n,
    verified: verify[0].n === expected,
    fields: ['id', 'city', 'state', 'district', 'country', 'tehsil', 'geohash', 'category', 'updated_at', 'external_id', 'source', 'latitude', 'longitude'],
    spot_check: spot[0],
    elapsed_seconds: ((Date.now() - t0) / 1000).toFixed(1),
  };
  fs.writeFileSync(path.join(OUT_DIR, 'backup-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log('[backup] DONE');
}

main().catch((e) => {
  console.error('[backup] FATAL:', e.message);
  process.exit(1);
}).finally(() => prisma.$disconnect());
