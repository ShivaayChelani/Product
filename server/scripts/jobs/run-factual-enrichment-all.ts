/**
 * Production-grade factual enrichment runner with per-place isolation,
 * granular checkpoints, dead-letter queue, and crash recovery.
 *
 * Usage:
 *   npx ts-node scripts/jobs/run-factual-enrichment-all.ts --source=wikidata --nominatim --link-nearby
 *   npx ts-node scripts/jobs/run-factual-enrichment-all.ts --source=wikidata --legacy-batch
 *   npx ts-node scripts/jobs/run-factual-enrichment-all.ts --source=wikidata --in-process
 */
import fs from 'fs';
import path from 'path';
import { prisma } from '../../src/config/database';
import { runFactualEnrichment } from './factual-place-enrichment';
import type { EnrichmentFieldKey, EnrichmentReport } from '../lib/factual-enrichment-types';
import { runResilientEnrichment } from '../lib/pipeline-reliability/resilient-runner';
import type { PipelineSource } from '../lib/pipeline-reliability/types';

type EnrichmentSource = 'wikidata' | 'osm' | 'all';

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}

function mergeFieldSummary(
  a: EnrichmentReport['fieldSummary'],
  b: EnrichmentReport['fieldSummary'],
): EnrichmentReport['fieldSummary'] {
  const out = { ...a };
  for (const [key, stats] of Object.entries(b)) {
    const k = key as EnrichmentFieldKey;
    if (!out[k]) out[k] = { filled: 0, leftNull: 0, skippedExisting: 0 };
    out[k].filled += stats.filled;
    out[k].leftNull += stats.leftNull;
    out[k].skippedExisting += stats.skippedExisting;
  }
  return out;
}

function mergeReports(base: EnrichmentReport, batch: EnrichmentReport): EnrichmentReport {
  const manualById = new Map(base.placesRequiringManualReview.map((p) => [p.placeId, p]));
  for (const p of batch.placesRequiringManualReview) {
    manualById.set(p.placeId, p);
  }
  return {
    generatedAt: new Date().toISOString(),
    dryRun: base.dryRun,
    limit: base.limit + batch.processed,
    offset: 0,
    processed: base.processed + batch.processed,
    enrichedCount: base.enrichedCount + batch.enrichedCount,
    unchangedCount: base.unchangedCount + batch.unchangedCount,
    errorCount: base.errorCount + batch.errorCount,
    manualReviewCount: manualById.size,
    fieldSummary: mergeFieldSummary(base.fieldSummary, batch.fieldSummary),
    placesRequiringManualReview: [...manualById.values()].slice(0, 2000),
    sampleEnriched: [...base.sampleEnriched, ...batch.sampleEnriched].slice(0, 50),
  };
}

function emptyReport(dryRun: boolean): EnrichmentReport {
  return {
    generatedAt: new Date().toISOString(),
    dryRun,
    limit: 0,
    offset: 0,
    processed: 0,
    enrichedCount: 0,
    unchangedCount: 0,
    errorCount: 0,
    manualReviewCount: 0,
    fieldSummary: {} as EnrichmentReport['fieldSummary'],
    placesRequiringManualReview: [],
    sampleEnriched: [],
  };
}

async function runLegacyBatchMode() {
  const batchSize = parseInt(arg('batch-size', '50'), 10);
  const startOffset = parseInt(arg('offset', '0'), 10);
  const maxBatches = parseInt(arg('max-batches', '0'), 10) || Infinity;
  const dryRun = process.argv.includes('--dry-run');
  const linkNearby = process.argv.includes('--link-nearby');
  const nominatim = process.argv.includes('--nominatim');
  const source = arg('source', 'wikidata') as EnrichmentSource;

  const where: { mergedIntoId: null; externalId?: { startsWith: string } } = { mergedIntoId: null };
  if (source === 'wikidata') where.externalId = { startsWith: 'wikidata:' };
  else if (source === 'osm') where.externalId = { startsWith: 'osm:' };
  const total = await prisma.place.count({ where });

  const outDir = path.resolve('reports/ops/enrichment');
  fs.mkdirSync(outDir, { recursive: true });
  const checkpointPath = path.join(outDir, `checkpoint-${source}.json`);

  let offset = startOffset;
  if (fs.existsSync(checkpointPath) && startOffset === 0 && !process.argv.includes('--no-resume')) {
    try {
      const cp = JSON.parse(fs.readFileSync(checkpointPath, 'utf8')) as { offset: number };
      if (cp.offset > 0) {
        offset = cp.offset;
        console.log(`Resuming from checkpoint offset=${offset}`);
      }
    } catch { /* fresh run */ }
  }

  let cumulative = emptyReport(dryRun);
  let batches = 0;

  while (offset < total && batches < maxBatches) {
    console.log(`Batch ${batches + 1}: offset=${offset}, batchSize=${batchSize}, total=${total}`);
    const batch = await runFactualEnrichment({
      limit: batchSize,
      offset,
      dryRun,
      linkNearby,
      nominatim,
      recalcScores: true,
      sourceFilter: source === 'all' ? undefined : source,
    });
    cumulative = mergeReports(cumulative, batch);
    offset += batch.processed;
    batches++;
    fs.writeFileSync(checkpointPath, JSON.stringify({ offset, updatedAt: new Date().toISOString(), source }, null, 2));
    console.log(`  processed=${batch.processed} enriched=${batch.enrichedCount} errors=${batch.errorCount}`);
    if (batch.processed === 0) break;
  }

  console.log(JSON.stringify({
    mode: 'legacy-batch',
    totalEligible: total,
    finalOffset: offset,
    processed: cumulative.processed,
    enrichedCount: cumulative.enrichedCount,
    errorCount: cumulative.errorCount,
  }, null, 2));
}

async function main() {
  const legacyBatch = process.argv.includes('--legacy-batch');
  if (legacyBatch) {
    await runLegacyBatchMode();
    await prisma.$disconnect();
    return;
  }

  const source = arg('source', 'wikidata') as EnrichmentSource;
  const dryRun = process.argv.includes('--dry-run');
  const linkNearby = process.argv.includes('--link-nearby');
  const nominatim = process.argv.includes('--nominatim');
  const inProcess = process.argv.includes('--in-process');
  const batchSize = parseInt(arg('batch-size', '10'), 10);
  const maxBatches = parseInt(arg('max-batches', '0'), 10) || Infinity;
  const maxPlacesPerWorker = parseInt(arg('max-places-per-worker', '25'), 10);
  const startOffset = parseInt(arg('offset', '0'), 10);
  const noResume = process.argv.includes('--no-resume') || process.argv.includes('--reset');

  const outDir = path.resolve('reports/ops/enrichment');
  fs.mkdirSync(outDir, { recursive: true });

  const result = await runResilientEnrichment({
    source: source as PipelineSource,
    baseDir: outDir,
    cwd: path.resolve('.'),
    dryRun,
    linkNearby,
    nominatim,
    recalcScores: true,
    initialBatchSize: Math.max(1, batchSize),
    maxBatches,
    maxPlacesPerWorker: Math.max(1, maxPlacesPerWorker),
    inProcess,
    startOffset,
    noResume,
  });

  console.log(JSON.stringify({
    mode: 'resilient',
    inProcess,
    maxPlacesPerWorker,
    ...result,
  }, null, 2));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
