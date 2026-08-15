/**
 * Run geohash backfill until complete, then duplicate scan (no auto-merge).
 * Usage: npx ts-node scripts/ops-phase3-duplicate-scan.ts
 */
import { prisma } from '../src/config/database';
import { backfillPlaceGeohashes } from '../src/modules/canonical/services/duplicate-scan.service';
import { runGeohashBlockedDuplicateScanPage } from '../src/modules/canonical/services/corpus-dedupe.service';

async function main() {
  let totalBackfill = 0;
  let rounds = 0;
  while (rounds < 300) {
    const filled = await backfillPlaceGeohashes(10000);
    totalBackfill += filled;
    rounds++;
    const remaining = await prisma.place.count({
      where: { geohash: null, latitude: { not: null }, longitude: { not: null } },
    });
    console.log(JSON.stringify({ step: 'geohash_backfill', round: rounds, filled, totalBackfill, remaining }));
    if (filled === 0 || remaining === 0) break;
  }

  let prefixOffset = 0;
  const scanTotals = { prefixesScanned: 0, pairsEvaluated: 0, candidatesUpserted: 0 };
  for (let r = 0; r < 500; r++) {
    const page = await runGeohashBlockedDuplicateScanPage({
      precision: 6,
      prefixBatch: 400,
      prefixOffset,
    });
    scanTotals.prefixesScanned += page.prefixesScanned;
    scanTotals.pairsEvaluated += page.pairsEvaluated;
    scanTotals.candidatesUpserted += page.candidatesUpserted;
    prefixOffset += page.prefixesScanned;
    console.log(JSON.stringify({ step: 'duplicate_scan', round: r + 1, ...page, nextOffset: prefixOffset }));
    if (!page.hasMore) break;
  }

  const [open, reviewBand, highConf] = await Promise.all([
    prisma.placeDuplicateCandidate.count({ where: { status: 'OPEN' } }),
    prisma.placeDuplicateCandidate.count({
      where: { status: 'OPEN', confidenceScore: { gte: 0.72, lt: 0.86 } },
    }),
    prisma.placeDuplicateCandidate.count({
      where: { status: 'OPEN', confidenceScore: { gte: 0.86 } },
    }),
  ]);

  console.log(
    JSON.stringify(
      {
        job: 'ops-phase3-duplicate-scan',
        geohashBackfilled: totalBackfill,
        scanTotals,
        duplicateQueue: { open, reviewBand, highConfidence: highConf },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
