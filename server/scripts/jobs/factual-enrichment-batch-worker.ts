/**
 * Batch enrichment worker — processes up to N places then exits cleanly.
 * Spawned by resilient pipeline; never runs for hours.
 */
import fs from 'fs';
import path from 'path';
import { enrichSinglePlace } from './factual-place-enrichment';
import { prisma } from '../../src/config/database';
import { MemoryTracker, EventLoopLagMonitor } from '../lib/pipeline-reliability/memory-timeline';
import { installWorkerRuntime, cleanupWorkerResources } from '../lib/pipeline-reliability/worker-runtime';
import type { BatchWorkerResult, PlaceWorkerResult } from '../lib/pipeline-reliability/types';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : undefined;
}

function appendResult(outputFile: string, result: PlaceWorkerResult) {
  fs.appendFileSync(outputFile, `${JSON.stringify(result)}\n`, 'utf8');
}

async function main() {
  const placeIdsRaw = arg('place-ids');
  const workerId = arg('worker-id') ?? `worker-${process.pid}`;
  const outputFile = arg('output-file');
  const rssLimitMb = parseInt(arg('rss-limit-mb') ?? '700', 10);
  const heapLimitMb = parseInt(arg('heap-limit-mb') ?? '620', 10);

  if (!placeIdsRaw || !outputFile) {
    console.log('BATCH_RESULT:' + JSON.stringify({
      ok: false,
      workerId,
      crashed: false,
      durationMs: 0,
      results: [],
      placesProcessed: 0,
      placesRequested: 0,
      stoppedEarly: true,
      stopReason: 'Missing --place-ids or --output-file',
      memory: {},
    }));
    process.exit(1);
  }

  const placeIds = placeIdsRaw.split(',').map((s) => s.trim()).filter(Boolean);
  installWorkerRuntime({ workerId });

  const dryRun = process.argv.includes('--dry-run');
  const linkNearby = process.argv.includes('--link-nearby');
  const nominatim = process.argv.includes('--nominatim');
  const recalcScores = process.argv.includes('--recalc-scores');

  const memTracker = new MemoryTracker();
  const lagMonitor = new EventLoopLagMonitor();
  const started = Date.now();
  const results: PlaceWorkerResult[] = [];
  let stoppedEarly = false;
  let stopReason: string | undefined;

  memTracker.sample('worker_start');

  for (const placeId of placeIds) {
    lagMonitor.tick();
    memTracker.sample('before_place', placeId);

    if (memTracker.exceedsThreshold(rssLimitMb, heapLimitMb)) {
      stoppedEarly = true;
      stopReason = `Memory threshold exceeded (rss>=${rssLimitMb}MB or heap>=${heapLimitMb}MB)`;
      break;
    }

    const placeStarted = Date.now();
    let result: PlaceWorkerResult;

    try {
      const rec = await enrichSinglePlace(placeId, { dryRun, linkNearby, nominatim, recalcScores });
      if (!rec) {
        result = {
          ok: false,
          placeId,
          name: '',
          externalId: null,
          source: '',
          enriched: false,
          errorCount: 1,
          errors: ['Place not found or merged'],
          manualReviewReasons: [],
          durationMs: Date.now() - placeStarted,
          filledFields: [],
        };
      } else {
        const filledFields = Object.entries(rec.outcomes)
          .filter(([, v]) => v === 'filled')
          .map(([k]) => k);
        result = {
          ok: rec.errors.length === 0,
          placeId: rec.placeId,
          name: rec.name,
          externalId: rec.externalId,
          source: rec.source,
          enriched: filledFields.length > 0,
          errorCount: rec.errors.length,
          errors: rec.errors,
          manualReviewReasons: rec.manualReviewReasons,
          durationMs: Date.now() - placeStarted,
          filledFields,
        };
      }
    } catch (err) {
      result = {
        ok: false,
        placeId,
        name: '',
        externalId: null,
        source: '',
        enriched: false,
        errorCount: 1,
        errors: [(err as Error).message],
        manualReviewReasons: ['Enrichment threw an exception'],
        durationMs: Date.now() - placeStarted,
        filledFields: [],
      };
    }

    results.push(result);
    appendResult(outputFile, result);
    memTracker.sample('after_place', placeId);

    if (typeof global.gc === 'function') {
      global.gc();
    }
  }

  const timelinePath = memTracker.writeTimeline(
    path.resolve('reports/ops/enrichment/memory'),
    workerId,
  );

  const batch: BatchWorkerResult = {
    ok: results.every((r) => r.ok) && !stoppedEarly,
    workerId,
    crashed: false,
    durationMs: Date.now() - started,
    results,
    placesProcessed: results.length,
    placesRequested: placeIds.length,
    stoppedEarly,
    stopReason,
    memory: {
      ...memTracker.peaks(),
      maxEventLoopLagMs: lagMonitor.maxLag(),
    },
  };

  console.log(`BATCH_RESULT:${JSON.stringify({ ...batch, memoryTimeline: timelinePath })}`);

  await cleanupWorkerResources(() => prisma.$disconnect());
  process.exit(batch.ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error(JSON.stringify({ event: 'batch_worker_fatal', error: (err as Error).message }));
  await cleanupWorkerResources(() => prisma.$disconnect());
  process.exit(134);
});
