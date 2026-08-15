/**
 * Master pipeline: fetch → import → geocode → dedupe → normalize tags
 *
 *   ts-node scripts/india-tourist-master-pipeline.ts
 *   ts-node scripts/india-tourist-master-pipeline.ts --skip-fetch --geocode=3000
 *   ts-node scripts/india-tourist-master-pipeline.ts --dry-run
 */
import { execSync } from 'child_process';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry-run');
const SKIP_FETCH = process.argv.includes('--skip-fetch');
const SKIP_DEDUPE = process.argv.includes('--skip-dedupe');

function run(cmd: string, label: string) {
  console.log(`\n=== ${label} ===\n`);
  const dryFlag = DRY ? ' --dry-run' : '';
  execSync(cmd + dryFlag, { cwd: ROOT, stdio: 'inherit', env: process.env });
}

function runRaw(cmd: string, label: string) {
  console.log(`\n=== ${label} ===\n`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', env: process.env });
}

async function main() {
  console.log('India Tourist Master Pipeline');
  console.log(`Options: dryRun=${DRY} skipFetch=${SKIP_FETCH} skipDedupe=${SKIP_DEDUPE}`);

  if (!SKIP_FETCH && !DRY) {
    runRaw('node ../scripts/fetch-india-places-expand.cjs', '1/6 Fetch OSM (all states)');
    runRaw('npx ts-node scripts/wikidata-coverage-fetch.ts --out=prisma/seed-data/wikidata-coverage-pending.json', '2/6 Fetch Wikidata coverage');
  } else if (!SKIP_FETCH) {
    console.log('\n[skip fetch execution in dry-run — use without --dry-run to fetch]\n');
  }

  const geocodeArg = process.argv.find((a) => a.startsWith('--geocode='));
  const geocode = geocodeArg ? geocodeArg.split('=')[1] : '5000';

  if (DRY) {
    run('npx ts-node scripts/bulk-tourist-import.ts --limit=100', '3/6 Import preview');
  } else {
    runRaw('npx ts-node scripts/bulk-tourist-import.ts', '3/6 Bulk import tourist places');
    runRaw(`npx ts-node scripts/bulk-tourist-import.ts --geocode=${geocode}`, `4/6 Geocode missing city/state (${geocode})`);
  }

  if (!SKIP_DEDUPE) {
    run('npx ts-node scripts/dedupe-tourist-places.ts', '5/6 Dedupe + alias merge + delete duplicates');
  }

  run('npx ts-node scripts/normalize-all-place-tags.ts', '6/6 Normalize all tags');

  console.log('\n=== Pipeline complete ===\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
