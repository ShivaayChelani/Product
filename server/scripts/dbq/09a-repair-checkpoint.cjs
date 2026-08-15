/**
 * Repair the wikidata-geocode checkpoint.
 *
 * The checkpoint's first records came from a --limit=10 DRY RUN, which wrote
 * nothing to the DB but marked those ids as processed. On resume they would be
 * permanently skipped while still missing state.
 *
 * Fix: remove from processedIds any id whose place currently still has empty
 * state (i.e. was never actually backfilled). Those will be re-processed on
 * resume. Foreign/Nepal-border records get re-skipped safely by the country
 * check — no data risk.
 *
 * Usage:
 *   node scripts/dbq/09a-repair-checkpoint.cjs
 */
process.env.DOTENV_CONFIG_PATH = __dirname + '/../../.env';
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

const CHECKPOINT_PATH = path.resolve(__dirname, '../../reports/ops/wikidata-geocode-checkpoint.json');

async function main() {
  const cp = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'));
  const ids = cp.processedIds;
  console.log(`[repair] Checkpoint has ${ids.length} processed ids`);

  // Query current state for all checkpoint ids
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, state, city, district, country, latitude::double precision AS lat, longitude::double precision AS lng
     FROM places WHERE id = ANY($1::text[])`, ids);

  const byId = new Map(rows.map((r) => [r.id, r]));
  const keep = [];
  const readd = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) { keep.push(id); continue; } // merged/deleted — leave as processed
    const emptyState = !row.state || row.state === '';
    const hasCoords = row.lat != null && row.lng != null;
    if (emptyState && hasCoords) {
      readd.push(id); // never actually backfilled — reprocess
    } else {
      keep.push(id);
    }
  }

  console.log(`[repair] Keep (already filled / non-reprocessable): ${keep.length}`);
  console.log(`[repair] Re-add to processing queue (state still empty): ${readd.length}`);
  for (const id of readd) {
    const r = byId.get(id);
    console.log(`  re-add ${id}  ${r.state || '(empty)'}  (${r.lat},${r.lng})`);
  }

  cp.processedIds = keep;
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(cp, null, 2));
  console.log(`[repair] Checkpoint rewritten with ${keep.length} processed ids`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
