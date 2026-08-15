/**
 * Full-India corpus dedupe orchestrator.
 *
 * Usage:
 *   ts-node scripts/jobs/india-corpus-dedupe.ts --backfill=25000 --rounds=20 --prefix-batch=300 --auto-merge=50
 *
 * Never deletes rows — high-confidence OPEN candidates are merged into one canonical place.
 */
import { prisma } from '../../src/config/database';
import { backfillPlaceGeohashes } from '../../src/modules/canonical/services/duplicate-scan.service';
import {
  autoMergeHighConfidenceCandidates,
  runGeohashBlockedDuplicateScanPage,
} from '../../src/modules/canonical/services/corpus-dedupe.service';

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] || fallback : fallback;
}

async function main() {
  const backfill = parseInt(arg('backfill', '0'), 10);
  const rounds = parseInt(arg('rounds', '10'), 10);
  const prefixBatch = parseInt(arg('prefix-batch', '200'), 10);
  const prefixOffsetStart = parseInt(arg('prefix-offset', '0'), 10);
  const precision = parseInt(arg('precision', '6'), 10);
  const autoMergeLimit = parseInt(arg('auto-merge', '0'), 10);
  const minConfidence = parseFloat(arg('min-confidence', '0.86'));

  const admin = await prisma.user.findFirst({ where: { permission: 'ADMIN' } });

  if (backfill > 0) {
    const filled = await backfillPlaceGeohashes(backfill);
    console.log(JSON.stringify({ step: 'geohash_backfill', filled }));
  }

  let prefixOffset = prefixOffsetStart;
  const scanTotals = { prefixesScanned: 0, pairsEvaluated: 0, candidatesUpserted: 0 };

  for (let r = 0; r < rounds; r++) {
    const page = await runGeohashBlockedDuplicateScanPage({
      precision,
      prefixBatch,
      prefixOffset,
    });
    scanTotals.prefixesScanned += page.prefixesScanned;
    scanTotals.pairsEvaluated += page.pairsEvaluated;
    scanTotals.candidatesUpserted += page.candidatesUpserted;
    prefixOffset += page.prefixesScanned;

    console.log(JSON.stringify({ step: 'scan_round', round: r + 1, ...page, nextOffset: prefixOffset }));

    if (!page.hasMore) break;
  }

  let mergeResult = { attempted: 0, merged: 0, skipped: 0, errors: 0 };
  if (autoMergeLimit > 0) {
    mergeResult = await autoMergeHighConfidenceCandidates({
      minConfidence,
      limit: autoMergeLimit,
      mergedById: admin?.id,
    });
    console.log(JSON.stringify({ step: 'auto_merge', ...mergeResult }));
  }

  console.log(
    JSON.stringify(
      {
        job: 'india-corpus-dedupe',
        scanTotals,
        mergeResult,
        nextPrefixOffset: prefixOffset,
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
