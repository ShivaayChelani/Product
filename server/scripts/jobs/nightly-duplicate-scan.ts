import {
  backfillPlaceGeohashes,
  runGeohashBlockedDuplicateScan,
} from '../../src/modules/canonical/services/duplicate-scan.service';
import { prisma } from '../../src/config/database';

/**
 * Geohash-blocked duplicate scan (production nightly job).
 * Usage: ts-node scripts/jobs/nightly-duplicate-scan.ts --backfill=5000 --precision=6 --prefix-batch=200
 */
async function main() {
  const backfillArg = process.argv.find((a) => a.startsWith('--backfill='));
  if (backfillArg) {
    const n = parseInt(backfillArg.split('=')[1] || '5000', 10);
    const filled = await backfillPlaceGeohashes(n);
    console.log(`Geohash backfill updated ${filled} places`);
  }

  const precisionArg = process.argv.find((a) => a.startsWith('--precision='));
  const batchArg = process.argv.find((a) => a.startsWith('--prefix-batch='));
  const precision = precisionArg ? parseInt(precisionArg.split('=')[1] || '6', 10) : 6;
  const prefixBatch = batchArg ? parseInt(batchArg.split('=')[1] || '200', 10) : 200;

  const stats = await runGeohashBlockedDuplicateScan({ precision, prefixBatch });
  console.log(JSON.stringify({ job: 'nightly-duplicate-scan', ...stats }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
