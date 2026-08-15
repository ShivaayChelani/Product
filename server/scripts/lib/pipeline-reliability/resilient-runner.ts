import fs from 'fs';
import path from 'path';
import { Prisma } from '@prisma/client';
import { prisma } from '../../../src/config/database';
import { loadCheckpoint, saveCheckpoint, defaultCheckpoint } from './checkpoint';
import { FailedEnrichmentQueue } from './dead-letter-queue';
import { PipelineLogger } from './pipeline-logger';
import { PipelineMetricsTracker } from './metrics';
import { AdaptiveRateLimiter, parseRetryAfterMs } from './rate-limiter';
import { EventLoopMonitor, maybeGc, snapshotMemory, suggestBatchSize } from './memory-monitor';
import { runBatchWorker } from './batch-worker-runner';
import {
  exponentialBackoffMs,
  isTransientError,
  sleep,
} from './retry-policy';
import type { PipelineCheckpointV2, PipelineSource, PlaceWorkerResult } from './types';

const MAX_CONSECUTIVE_FAILURES = 3;
const PROGRESS_EVERY = 25;

type AttemptMap = Record<string, { attempts: number; lastError?: string }>;
type PlaceRow = { id: string; name: string; externalId: string | null; source: string };

function attemptsPath(baseDir: string, source: PipelineSource) {
  return path.join(baseDir, `retry-attempts-${source}.json`);
}

function loadAttempts(baseDir: string, source: PipelineSource): AttemptMap {
  const p = attemptsPath(baseDir, source);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as AttemptMap;
  } catch {
    return {};
  }
}

function saveAttempts(baseDir: string, source: PipelineSource, map: AttemptMap) {
  fs.mkdirSync(baseDir, { recursive: true });
  fs.writeFileSync(attemptsPath(baseDir, source), JSON.stringify(map, null, 2));
}

function writeProgressReport(baseDir: string, source: PipelineSource, metrics: ReturnType<PipelineMetricsTracker['snapshot']>) {
  const reportPath = path.join(baseDir, `progress-${source}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), ...metrics }, null, 2));
}

async function fetchPlaceIds(
  source: PipelineSource,
  offset: number,
  limit: number,
): Promise<PlaceRow[]> {
  const where: Prisma.PlaceWhereInput = { mergedIntoId: null };
  if (source === 'wikidata') where.externalId = { startsWith: 'wikidata:' };
  else if (source === 'osm') where.externalId = { startsWith: 'osm:' };

  return prisma.place.findMany({
    where,
    orderBy: [{ source: 'asc' }, { updatedAt: 'asc' }],
    skip: offset,
    take: limit,
    select: { id: true, name: true, externalId: true, source: true },
  });
}

async function countEligible(source: PipelineSource): Promise<number> {
  const where: Prisma.PlaceWhereInput = { mergedIntoId: null };
  if (source === 'wikidata') where.externalId = { startsWith: 'wikidata:' };
  else if (source === 'osm') where.externalId = { startsWith: 'osm:' };
  return prisma.place.count({ where });
}

export type ResilientRunnerOptions = {
  source: PipelineSource;
  baseDir: string;
  cwd: string;
  dryRun: boolean;
  linkNearby: boolean;
  nominatim: boolean;
  recalcScores: boolean;
  initialBatchSize: number;
  maxBatches: number;
  maxPlacesPerWorker?: number;
  inProcess?: boolean;
  startOffset?: number;
  noResume?: boolean;
};

type RunnerCtx = {
  opts: ResilientRunnerOptions;
  cp: PipelineCheckpointV2;
  attempts: AttemptMap;
  dlq: FailedEnrichmentQueue;
  logger: PipelineLogger;
  metrics: PipelineMetricsTracker;
  rateLimiter: AdaptiveRateLimiter;
  loopMonitor: EventLoopMonitor;
  total: number;
  batchSize: number;
  lastCheckpointAt: number;
  workerSeq: number;
};

function maybeReportProgress(ctx: RunnerCtx): void {
  if (ctx.cp.processed % PROGRESS_EVERY !== 0) return;
  const memSnap = snapshotMemory();
  const snap = ctx.metrics.snapshot({
    processed: ctx.cp.processed,
    enriched: ctx.cp.enriched,
    errors: ctx.cp.errors,
    remaining: ctx.total - ctx.cp.offset,
    queueSize: ctx.dlq.size(),
    checkpointAgeMs: Date.now() - ctx.lastCheckpointAt,
    memoryRssMb: memSnap.rssMb,
    memoryHeapUsedMb: memSnap.heapUsedMb,
    memoryHeapTotalMb: memSnap.heapTotalMb,
    memoryExternalMb: memSnap.externalMb,
    eventLoopDelayMs: ctx.loopMonitor.delay(),
    currentBatchSize: ctx.batchSize,
  });
  writeProgressReport(ctx.opts.baseDir, ctx.opts.source, snap);
  ctx.logger.log('progress_report', snap as unknown as Record<string, unknown>);
}

async function enrichOnePlace(ctx: RunnerCtx, place: PlaceRow): Promise<PlaceWorkerResult> {
  if (ctx.opts.inProcess) {
    const { enrichSinglePlace } = await import('../../jobs/factual-place-enrichment');
    const started = Date.now();
    try {
      const rec = await enrichSinglePlace(place.id, {
        dryRun: ctx.opts.dryRun,
        linkNearby: ctx.opts.linkNearby,
        nominatim: ctx.opts.nominatim,
        recalcScores: ctx.opts.recalcScores,
      });
      return {
        ok: !!rec && rec.errors.length === 0,
        placeId: place.id,
        name: rec?.name ?? place.name,
        externalId: rec?.externalId ?? place.externalId,
        source: rec?.source ?? place.source,
        enriched: !!rec && Object.values(rec.outcomes).some((o) => o === 'filled'),
        errorCount: rec?.errors.length ?? 1,
        errors: rec?.errors ?? ['No result'],
        manualReviewReasons: rec?.manualReviewReasons ?? [],
        durationMs: Date.now() - started,
        filledFields: rec
          ? Object.entries(rec.outcomes).filter(([, v]) => v === 'filled').map(([k]) => k)
          : [],
        crashed: false,
      };
    } catch (err) {
      return {
        ok: false,
        placeId: place.id,
        name: place.name,
        externalId: place.externalId,
        source: place.source,
        enriched: false,
        errorCount: 1,
        errors: [(err as Error).message],
        manualReviewReasons: ['Enrichment threw an exception'],
        durationMs: Date.now() - started,
        filledFields: [],
        crashed: false,
      };
    }
  }

  ctx.workerSeq += 1;
  const workerId = `${ctx.opts.source}-solo-${ctx.workerSeq}-${place.id.slice(0, 8)}`;
  const batch = await runBatchWorker({
    placeIds: [place.id],
    dryRun: ctx.opts.dryRun,
    linkNearby: ctx.opts.linkNearby,
    nominatim: ctx.opts.nominatim,
    recalcScores: ctx.opts.recalcScores,
    cwd: ctx.opts.cwd,
    workerId,
  });

  if (batch.results[0]) {
    return batch.results[0];
  }

  return {
    ok: false,
    placeId: place.id,
    name: place.name,
    externalId: place.externalId,
    source: place.source,
    enriched: false,
    errorCount: 1,
    errors: [batch.stopReason ?? 'Worker returned no result'],
    manualReviewReasons: [],
    durationMs: batch.durationMs,
    filledFields: [],
    exitCode: batch.exitCode ?? undefined,
    crashed: batch.crashed,
  };
}

async function handlePlace(ctx: RunnerCtx, place: PlaceRow, initialResult?: PlaceWorkerResult): Promise<void> {
  const { opts, dlq, logger, metrics, rateLimiter, attempts } = ctx;
  const cp = ctx.cp;

  if (dlq.has(place.id)) {
    cp.offset += 1;
    cp.skipped += 1;
    cp.processed += 1;
    cp.lastPlaceId = place.id;
    cp.lastExternalId = place.externalId;
    saveCheckpoint({ ...cp, failedQueueSize: dlq.size() }, opts.baseDir);
    ctx.cp = cp;
    return;
  }

  let useInitial = !!initialResult;

  placeLoop: while (true) {
    const placeAttempts = attempts[place.id]?.attempts ?? 0;
    if (placeAttempts >= MAX_CONSECUTIVE_FAILURES) {
      if (!dlq.has(place.id)) {
        dlq.enqueue({
          placeId: place.id,
          externalId: place.externalId,
          name: place.name,
          source: place.source,
          error: attempts[place.id]?.lastError ?? 'Max consecutive failures',
          stackTrace: '',
          attemptCount: placeAttempts,
          timestamp: new Date().toISOString(),
        });
        logger.log('dlq_enqueue', { placeId: place.id, name: place.name, attempts: placeAttempts });
      }
      cp.offset += 1;
      cp.skipped += 1;
      cp.processed += 1;
      cp.failedQueueSize = dlq.size();
      saveCheckpoint(cp, opts.baseDir);
      ctx.cp = cp;
      break placeLoop;
    }

    logger.log('place_start', {
      placeId: place.id,
      name: place.name,
      externalId: place.externalId,
      source: opts.source,
      offset: cp.offset,
      attempt: placeAttempts + 1,
    });

    await rateLimiter.wait();

    let result: PlaceWorkerResult;
    if (useInitial && initialResult) {
      result = initialResult;
      useInitial = false;
    } else {
      result = await enrichOnePlace(ctx, place);
    }

    if (result.ok) {
      rateLimiter.onSuccess();
      delete attempts[place.id];
      metrics.recordSuccess(result.durationMs);
      cp.enriched += result.enriched ? 1 : 0;
      cp.processed += 1;
      cp.offset += 1;
      cp.lastPlaceId = place.id;
      cp.lastExternalId = place.externalId;
      cp.retryCount = 0;
      ctx.lastCheckpointAt = Date.now();
      saveCheckpoint({ ...cp, failedQueueSize: dlq.size() }, opts.baseDir);
      logger.log('place_success', {
        placeId: place.id,
        name: result.name,
        externalId: result.externalId,
        offset: cp.offset,
        enriched: result.enriched,
        filledFields: result.filledFields,
        durationMs: result.durationMs,
      });
      ctx.cp = cp;
      maybeReportProgress(ctx);
      break placeLoop;
    }

    const errMsg = result.errors.join('; ') || 'Unknown failure';
    const transient = result.crashed || isTransientError(errMsg);
    attempts[place.id] = {
      attempts: placeAttempts + 1,
      lastError: errMsg,
    };
    saveAttempts(opts.baseDir, opts.source, attempts);

    if (/429|too many requests|connection refused|ECONNREFUSED/i.test(errMsg)) {
      rateLimiter.onRateLimit(parseRetryAfterMs(errMsg));
      logger.log('rate_limit', { delayMs: rateLimiter.currentDelayMs(), errMsg });
    }

    metrics.recordFailure();
    cp.errors += 1;

    if (result.crashed) {
      logger.log('place_crash', {
        placeId: place.id,
        name: place.name,
        exitCode: result.exitCode,
        errMsg,
      });
    } else {
      logger.log('place_failure', {
        placeId: place.id,
        name: place.name,
        errMsg,
        stackTrace: errMsg,
        attempt: placeAttempts + 1,
      });
    }

    if (transient && placeAttempts + 1 < MAX_CONSECUTIVE_FAILURES) {
      metrics.recordRetry();
      cp.retryCount += 1;
      const backoff = exponentialBackoffMs(placeAttempts + 1);
      logger.log('retry', { placeId: place.id, backoffMs: backoff, attempt: placeAttempts + 1 });
      await sleep(backoff);
      continue placeLoop;
    }

    if (placeAttempts + 1 >= MAX_CONSECUTIVE_FAILURES) {
      dlq.enqueue({
        placeId: place.id,
        externalId: place.externalId,
        name: place.name,
        source: place.source,
        error: errMsg,
        stackTrace: errMsg,
        attemptCount: placeAttempts + 1,
        timestamp: new Date().toISOString(),
        exitCode: result.exitCode,
      });
      cp.failedQueueSize = dlq.size();
      logger.log('dlq_enqueue', { placeId: place.id, name: place.name, error: errMsg });
    }

    cp.processed += 1;
    cp.offset += 1;
    cp.lastPlaceId = place.id;
    cp.lastExternalId = place.externalId;
    ctx.lastCheckpointAt = Date.now();
    saveCheckpoint(cp, opts.baseDir);
    ctx.cp = cp;
    maybeReportProgress(ctx);
    break placeLoop;
  }
}

async function processPlaceBatch(ctx: RunnerCtx, places: PlaceRow[]): Promise<void> {
  if (ctx.opts.inProcess) {
    for (const place of places) {
      await handlePlace(ctx, place);
    }
    return;
  }

  const maxPerWorker = Math.max(1, ctx.opts.maxPlacesPerWorker ?? 25);

  for (let i = 0; i < places.length; i += maxPerWorker) {
    const chunk = places.slice(i, i + maxPerWorker);
    ctx.workerSeq += 1;
    const workerId = `${ctx.opts.source}-batch-${ctx.workerSeq}-${Date.now()}`;

    const batchResult = await runBatchWorker({
      placeIds: chunk.map((p) => p.id),
      dryRun: ctx.opts.dryRun,
      linkNearby: ctx.opts.linkNearby,
      nominatim: ctx.opts.nominatim,
      recalcScores: ctx.opts.recalcScores,
      cwd: ctx.opts.cwd,
      workerId,
    });

    ctx.logger.log('worker_lifecycle', {
      workerId,
      placesProcessed: batchResult.placesProcessed,
      placesRequested: batchResult.placesRequested,
      crashed: batchResult.crashed,
      stoppedEarly: batchResult.stoppedEarly,
      stopReason: batchResult.stopReason,
      exitCode: batchResult.exitCode,
      durationMs: batchResult.durationMs,
      peakRssMb: batchResult.memory.peakRssMb,
      peakHeapMb: batchResult.memory.peakHeapMb,
      maxEventLoopLagMs: batchResult.memory.maxEventLoopLagMs,
    });

    const processedIds = new Set<string>();
    for (const result of batchResult.results) {
      processedIds.add(result.placeId);
      const place = chunk.find((p) => p.id === result.placeId);
      if (!place) continue;
      await handlePlace(ctx, place, result);
    }

    for (const place of chunk) {
      if (!processedIds.has(place.id)) {
        await handlePlace(ctx, place);
      }
    }
  }
}

export async function runResilientEnrichment(opts: ResilientRunnerOptions) {
  const logger = new PipelineLogger(opts.baseDir);
  const dlq = new FailedEnrichmentQueue(opts.baseDir);
  const metrics = new PipelineMetricsTracker();
  const rateLimiter = new AdaptiveRateLimiter(0, 0, 8000);
  const loopMonitor = new EventLoopMonitor();

  const cp: PipelineCheckpointV2 = opts.noResume
    ? defaultCheckpoint(opts.source)
    : loadCheckpoint(opts.source, opts.baseDir);

  if (opts.startOffset && opts.startOffset > 0) {
    cp.offset = opts.startOffset;
  }

  const total = await countEligible(opts.source);
  let batchSize = Math.max(1, opts.initialBatchSize);
  let batches = 0;
  const attempts = loadAttempts(opts.baseDir, opts.source);
  const lastCheckpointAt = Date.now();
  const workerSeq = 0;

  const ctx: RunnerCtx = {
    opts,
    cp,
    attempts,
    dlq,
    logger,
    metrics,
    rateLimiter,
    loopMonitor,
    total,
    batchSize,
    lastCheckpointAt,
    workerSeq,
  };

  logger.log('progress_report', {
    message: 'Resilient enrichment started',
    source: opts.source,
    total,
    checkpoint: cp,
    dlqPath: dlq.path(),
    maxPlacesPerWorker: opts.maxPlacesPerWorker ?? 25,
    inProcess: !!opts.inProcess,
  });

  while (ctx.cp.offset < total && batches < opts.maxBatches) {
    loopMonitor.tick();
    const mem = snapshotMemory();
    mem.eventLoopDelayMs = loopMonitor.delay();
    batchSize = suggestBatchSize(batchSize, mem);
    ctx.batchSize = batchSize;

    if (mem.rssMb > 900) {
      maybeGc(768);
      logger.log('memory_pressure', mem);
    }

    const places = await fetchPlaceIds(opts.source, ctx.cp.offset, batchSize);
    if (!places.length) break;

    ctx.cp.batchNumber += 1;
    batches += 1;

    await processPlaceBatch(ctx, places);
  }

  saveCheckpoint({ ...ctx.cp, failedQueueSize: dlq.size() }, opts.baseDir);

  const finalMem = snapshotMemory();
  const finalMetrics = metrics.snapshot({
    processed: ctx.cp.processed,
    enriched: ctx.cp.enriched,
    errors: ctx.cp.errors,
    remaining: total - ctx.cp.offset,
    queueSize: dlq.size(),
    checkpointAgeMs: Date.now() - ctx.lastCheckpointAt,
    memoryRssMb: finalMem.rssMb,
    memoryHeapUsedMb: finalMem.heapUsedMb,
    memoryHeapTotalMb: finalMem.heapTotalMb,
    memoryExternalMb: finalMem.externalMb,
    eventLoopDelayMs: loopMonitor.delay(),
    currentBatchSize: batchSize,
  });
  writeProgressReport(opts.baseDir, opts.source, finalMetrics);

  return { checkpoint: ctx.cp, total, metrics: finalMetrics, dlqPath: dlq.path(), logPath: logger.path() };
}
