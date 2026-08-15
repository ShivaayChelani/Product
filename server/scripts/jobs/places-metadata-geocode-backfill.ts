/**
 * Production Places metadata backfill — reverse geocode only (city/state/district/country).
 *
 * Never overwrites existing verified city/state. No invented ratings/reviews/images.
 *
 * Usage:
 *   npx ts-node scripts/jobs/places-metadata-geocode-backfill.ts --phase=report
 *   npx ts-node scripts/jobs/places-metadata-geocode-backfill.ts --phase=geocode --limit=2000 --resume
 *   npx ts-node scripts/jobs/places-metadata-geocode-backfill.ts --phase=geocode --run-all --resume
 *   npx ts-node scripts/jobs/places-metadata-geocode-backfill.ts --phase=qa
 */
import fs from 'fs';
import path from 'path';
import { prisma } from '../../src/config/database';
import { isCoordinateInIndia } from '../../src/shared/utils/indiaGeo';
import { withRetry } from '../../src/utils/retry';
import type { NominatimExtract } from '../lib/factual-enrichment-types';
import { reverseGeocodeNominatim } from '../lib/osm-nominatim-client';

const DEFAULT_BATCH = 2000;
const CHECKPOINT_PATH = path.resolve('reports/ops/places-metadata-geocode-checkpoint.json');
const LEGACY_CHECKPOINT_PATH = path.resolve('reports/ops/places-backfill-checkpoint.json');
const LOG_PATH = path.resolve('reports/ops/places-metadata-geocode.log');
const REPORT_DIR = path.resolve('reports/ops');

const STATE_FRAGMENT_CITIES = new Set([
  'pradesh',
  'nadu',
  'bengal',
  'khand',
  'garh',
  'desh',
]);

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1500;
const REQUEST_TIMEOUT_MS = 25_000;
const CHECKPOINT_EVERY = 25;
const QA_SAMPLE_SIZE = 100;

async function reconnectPrisma(): Promise<void> {
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  await prisma.$connect();
}

/** Retry Postgres transient drops (P1017) with reconnect between attempts. */
async function withPrismaRetry<T>(fn: () => Promise<T>): Promise<T> {
  return withRetry(
    async () => {
      try {
        return await fn();
      } catch (err) {
        await reconnectPrisma();
        throw err;
      }
    },
    { maxRetries: 6, baseDelayMs: 2000 },
  );
}

type Metrics = {
  total: number;
  missingCity: number;
  missingState: number;
  missingDistrict: number;
};

type Checkpoint = {
  startedAt: string;
  lastProcessedId: string | null;
  batchNumber: number;
  totalScanned: number;
  totalUpdated: number;
  totalSkipped: number;
  totalErrors: number;
  totalRetries: number;
  permanentlyFailedIds: string[];
  updatedPlaceIds: string[];
  beforeMetrics?: Metrics;
  completedAt?: string;
};

type BatchResult = {
  scanned: number;
  updated: number;
  skipped: number;
  errors: number;
  retries: number;
  lastId: string | null;
  hasMore: boolean;
  elapsedMs: number;
};

type QaMismatch = {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  dbCity: string;
  dbState: string;
  verifyCity: string;
  verifyState: string;
  reason: string;
};

function parseArgs() {
  const phase = (process.argv.find((a) => a.startsWith('--phase='))?.split('=')[1] || 'geocode') as
    | 'geocode'
    | 'report'
    | 'qa';
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Math.max(1, parseInt(limitArg.split('=')[1] || String(DEFAULT_BATCH), 10)) : DEFAULT_BATCH;
  const dryRun = process.argv.includes('--dry-run');
  const resume = process.argv.includes('--resume');
  const runAll = process.argv.includes('--run-all');
  return { phase, limit, dryRun, resume, runAll };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function maybeCheckpoint(cp: Checkpoint, placeId: string): void {
  if (cp.totalScanned % CHECKPOINT_EVERY === 0) {
    cp.lastProcessedId = placeId;
    saveCheckpoint(cp);
    console.log(`  progress scanned=${cp.totalScanned} updated=${cp.totalUpdated} skipped=${cp.totalSkipped}`);
  }
}

function appendLog(line: string): void {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${line}\n`);
}

function loadCheckpoint(): Checkpoint {
  try {
    if (fs.existsSync(CHECKPOINT_PATH)) {
      return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8')) as Checkpoint;
    }
  } catch {
    /* ignore */
  }

  const cp: Checkpoint = {
    startedAt: new Date().toISOString(),
    lastProcessedId: null,
    batchNumber: 0,
    totalScanned: 0,
    totalUpdated: 0,
    totalSkipped: 0,
    totalErrors: 0,
    totalRetries: 0,
    permanentlyFailedIds: [],
    updatedPlaceIds: [],
  };

  try {
    if (fs.existsSync(LEGACY_CHECKPOINT_PATH)) {
      const legacy = JSON.parse(fs.readFileSync(LEGACY_CHECKPOINT_PATH, 'utf8')) as {
        geocodeLastId?: string;
        geocodeUpdated?: number;
      };
      if (legacy.geocodeLastId) {
        cp.lastProcessedId = legacy.geocodeLastId;
        cp.totalUpdated = legacy.geocodeUpdated ?? 0;
        appendLog(`Migrated legacy checkpoint lastId=${legacy.geocodeLastId}`);
      }
    }
  } catch {
    /* ignore */
  }

  return cp;
}

function saveCheckpoint(cp: Checkpoint): void {
  fs.mkdirSync(path.dirname(CHECKPOINT_PATH), { recursive: true });
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(cp, null, 2));
}

function isBlank(value: string | null | undefined): boolean {
  return !String(value ?? '').trim();
}

function isBadCityName(city: string): boolean {
  const t = city.trim();
  if (t.length < 2) return true;
  const lower = t.toLowerCase();
  if (STATE_FRAGMENT_CITIES.has(lower)) return true;
  if (/^(pradesh|nadu|bengal)$/i.test(lower)) return true;
  return false;
}

function isIndiaCountry(country: string | undefined): boolean {
  if (!country) return true;
  const c = country.trim().toLowerCase();
  return c === 'india' || c === 'in' || c === 'भारत';
}

function normalizeCompare(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '');
}

function citiesMatch(a: string, b: string): boolean {
  const na = normalizeCompare(a);
  const nb = normalizeCompare(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

function statesMatch(a: string, b: string): boolean {
  const na = normalizeCompare(a);
  const nb = normalizeCompare(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

function resolveCity(geo: NominatimExtract): string {
  return (geo.city || geo.village || '').trim();
}

function resolveDistrict(geo: NominatimExtract): string {
  return (geo.district || '').trim();
}

function resolveState(geo: NominatimExtract): string {
  return (geo.state || '').trim();
}

function validateGeocodeForUpdate(
  geo: NominatimExtract,
  needsCity: boolean,
  needsState: boolean,
): { ok: boolean; reason?: string; canUpdateCity: boolean; canUpdateState: boolean } {
  if (!isIndiaCountry(geo.country)) {
    return { ok: false, reason: `non_india_country:${geo.country ?? 'unknown'}`, canUpdateCity: false, canUpdateState: false };
  }

  const city = resolveCity(geo);
  const state = resolveState(geo);

  const canUpdateCity = needsCity && !!city && !isBadCityName(city);
  const canUpdateState = needsState && !!state;

  if (!canUpdateCity && !canUpdateState && (needsCity || needsState)) {
    const reason =
      needsCity && (!city || isBadCityName(city))
        ? 'empty_or_invalid_city'
        : needsState && !state
          ? 'empty_state'
          : 'nothing_to_update';
    return { ok: false, reason, canUpdateCity, canUpdateState };
  }

  return { ok: true, canUpdateCity, canUpdateState };
}

async function reverseGeocodeWithRetry(
  lat: number,
  lng: number,
): Promise<{ geo: NominatimExtract | null; retries: number; error?: string }> {
  let retries = 0;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const geo = await reverseGeocodeNominatim(lat, lng, { timeoutMs: REQUEST_TIMEOUT_MS });
      if (geo) return { geo, retries };
      if (attempt < MAX_RETRIES) {
        retries += 1;
        await sleep(BASE_BACKOFF_MS * 2 ** attempt);
      }
    } catch (e) {
      if (attempt < MAX_RETRIES) {
        retries += 1;
        await sleep(BASE_BACKOFF_MS * 2 ** attempt);
      } else {
        return { geo: null, retries, error: e instanceof Error ? e.message : String(e) };
      }
    }
  }
  return { geo: null, retries, error: 'max_retries_exceeded' };
}

async function getMetrics(): Promise<Metrics> {
  const active = { mergedIntoId: null, status: 'APPROVED' as const };
  const [total, missingCity, missingState, missingDistrict] = await Promise.all([
    prisma.place.count({ where: active }),
    prisma.place.count({ where: { ...active, city: '' } }),
    prisma.place.count({ where: { ...active, state: '' } }),
    prisma.place.count({ where: { ...active, district: '' } }),
  ]);
  return { total, missingCity, missingState, missingDistrict };
}

async function countEligibleAfter(cursor: string | null): Promise<number> {
  return prisma.place.count({
    where: {
      mergedIntoId: null,
      status: 'APPROVED',
      latitude: { not: null },
      longitude: { not: null },
      OR: [{ city: '' }, { state: '' }],
      ...(cursor ? { id: { gt: cursor } } : {}),
    },
  });
}

async function runGeocodeBatch(
  batchSize: number,
  dryRun: boolean,
  resume: boolean,
  cp: Checkpoint,
): Promise<BatchResult> {
  const start = Date.now();
  const cursor = resume ? cp.lastProcessedId ?? undefined : undefined;

  const rows = await withPrismaRetry(() =>
    prisma.place.findMany({
      where: {
        mergedIntoId: null,
        status: 'APPROVED',
        latitude: { not: null },
        longitude: { not: null },
        OR: [{ city: '' }, { state: '' }],
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: {
        id: true,
        latitude: true,
        longitude: true,
        city: true,
        state: true,
        district: true,
        country: true,
        tags: true,
      },
      orderBy: { id: 'asc' },
      take: batchSize,
    }),
  );

  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let retries = 0;
  let lastId: string | null = cp.lastProcessedId;

  for (const r of rows) {
    lastId = r.id;
    cp.totalScanned += 1;

    const lat = r.latitude!;
    const lng = r.longitude!;

    if (!isCoordinateInIndia(lat, lng)) {
      skipped += 1;
      cp.totalSkipped += 1;
      appendLog(`SKIP ${r.id} coords_outside_india lat=${lat} lng=${lng}`);
      maybeCheckpoint(cp, r.id);
      continue;
    }

    const needsCity = isBlank(r.city);
    const needsState = isBlank(r.state);
    const needsDistrict = isBlank(r.district);
    const needsCountry = isBlank(r.country);

    const { geo, retries: rowRetries, error } = await reverseGeocodeWithRetry(lat, lng);
    retries += rowRetries;
    cp.totalRetries += rowRetries;

    if (!geo) {
      skipped += 1;
      cp.totalSkipped += 1;
      errors += 1;
      cp.totalErrors += 1;
      if (error === 'max_retries_exceeded' || rowRetries >= MAX_RETRIES) {
        if (!cp.permanentlyFailedIds.includes(r.id)) {
          cp.permanentlyFailedIds.push(r.id);
        }
      }
      appendLog(`FAIL ${r.id} geocode_error=${error ?? 'null_response'}`);
      maybeCheckpoint(cp, r.id);
      continue;
    }

    const validation = validateGeocodeForUpdate(geo, needsCity, needsState);
    if (!validation.ok) {
      skipped += 1;
      cp.totalSkipped += 1;
      appendLog(`SKIP ${r.id} validation=${validation.reason}`);
      maybeCheckpoint(cp, r.id);
      continue;
    }

    const resolvedCity = resolveCity(geo);
    const resolvedState = resolveState(geo);
    const resolvedDistrict = resolveDistrict(geo);

    const data: {
      city?: string;
      state?: string;
      district?: string;
      country?: string;
      tags?: string[];
    } = {};

    if (validation.canUpdateCity && resolvedCity && !isBadCityName(resolvedCity)) {
      data.city = resolvedCity;
    }
    if (validation.canUpdateState && resolvedState) {
      data.state = resolvedState;
    }
    if (needsDistrict && resolvedDistrict) {
      data.district = resolvedDistrict;
    }
    if (needsCountry && isIndiaCountry(geo.country)) {
      data.country = 'India';
    }

    if (Object.keys(data).length === 0) {
      skipped += 1;
      cp.totalSkipped += 1;
      maybeCheckpoint(cp, r.id);
      continue;
    }

    const newTags = [
      ...new Set([
        ...(r.tags || []),
        ...(data.city ? [data.city.toLowerCase().replace(/\s+/g, '-')] : []),
        ...(data.state ? [data.state.toLowerCase().replace(/\s+/g, '-')] : []),
      ]),
    ];
    if (newTags.length !== (r.tags || []).length) {
      data.tags = newTags;
    }

    if (!dryRun) {
      await withPrismaRetry(() =>
        prisma.place.update({
          where: { id: r.id },
          data,
        }),
      );
    }

    updated += 1;
    cp.totalUpdated += dryRun ? 0 : 1;
    if (!dryRun && cp.updatedPlaceIds.length < 2000) {
      cp.updatedPlaceIds.push(r.id);
    }

    maybeCheckpoint(cp, r.id);
  }

  cp.lastProcessedId = lastId;
  cp.batchNumber += 1;
  saveCheckpoint(cp);

  const remaining = lastId ? await countEligibleAfter(lastId) : 0;
  const elapsedMs = Date.now() - start;

  const logLine = [
    `BATCH ${cp.batchNumber}`,
    `scanned=${rows.length}`,
    `updated=${updated}`,
    `skipped=${skipped}`,
    `errors=${errors}`,
    `retries=${retries}`,
    `elapsedSec=${(elapsedMs / 1000).toFixed(1)}`,
    `remaining=${remaining}`,
    `totalUpdated=${cp.totalUpdated}`,
  ].join(' ');
  console.log(logLine);
  appendLog(logLine);

  return {
    scanned: rows.length,
    updated,
    skipped,
    errors,
    retries,
    lastId,
    hasMore: rows.length === batchSize && remaining > 0,
    elapsedMs,
  };
}

async function runGeocodeLoop(limit: number, dryRun: boolean, resume: boolean, runAll: boolean): Promise<void> {
  const cp = loadCheckpoint();
  if (!cp.beforeMetrics) {
    cp.beforeMetrics = await getMetrics();
    saveCheckpoint(cp);
    console.log('Before metrics:', cp.beforeMetrics);
    appendLog(`BEFORE ${JSON.stringify(cp.beforeMetrics)}`);
  }

  if (runAll) {
    let batchResult: BatchResult;
    do {
      batchResult = await runGeocodeBatch(limit, dryRun, true, cp);
      if (batchResult.scanned === 0) break;
      const avgMs = batchResult.elapsedMs / Math.max(1, batchResult.scanned);
      const remaining = batchResult.lastId ? await countEligibleAfter(batchResult.lastId) : 0;
      const etaHours = ((remaining * avgMs) / 3_600_000).toFixed(1);
      console.log(`  ETA ~${etaHours}h (${remaining} eligible remaining)`);
    } while (batchResult.hasMore);

    cp.completedAt = new Date().toISOString();
    saveCheckpoint(cp);
    await generateFinalReport(cp, dryRun);
    return;
  }

  await runGeocodeBatch(limit, dryRun, resume, cp);
}

async function generateFinalReport(cp: Checkpoint, dryRun: boolean): Promise<void> {
  const after = await getMetrics();
  const before = cp.beforeMetrics ?? after;

  const cityFilled = before.missingCity - after.missingCity;
  const stateFilled = before.missingState - after.missingState;
  const eligibleProcessed = cp.totalScanned;
  const successRate = eligibleProcessed
    ? (((cp.totalUpdated / eligibleProcessed) * 100).toFixed(2))
    : '0';
  const failureRate = eligibleProcessed
    ? (((cp.totalErrors / eligibleProcessed) * 100).toFixed(2))
    : '0';

  const cityCompleteness = after.total
    ? (((after.total - after.missingCity) / after.total) * 100).toFixed(2)
    : '100';
  const stateCompleteness = after.total
    ? (((after.total - after.missingState) / after.total) * 100).toFixed(2)
    : '100';

  const report = {
    timestamp: new Date().toISOString(),
    dryRun,
    duration: {
      startedAt: cp.startedAt,
      completedAt: cp.completedAt ?? new Date().toISOString(),
    },
    before: {
      total: before.total,
      missingCity: before.missingCity,
      missingState: before.missingState,
      pctMissingCity: before.total ? ((before.missingCity / before.total) * 100).toFixed(2) : '0',
      pctMissingState: before.total ? ((before.missingState / before.total) * 100).toFixed(2) : '0',
    },
    after: {
      total: after.total,
      missingCity: after.missingCity,
      missingState: after.missingState,
      pctMissingCity: after.total ? ((after.missingCity / after.total) * 100).toFixed(2) : '0',
      pctMissingState: after.total ? ((after.missingState / after.total) * 100).toFixed(2) : '0',
    },
    progress: {
      totalScanned: cp.totalScanned,
      totalUpdated: cp.totalUpdated,
      totalSkipped: cp.totalSkipped,
      totalErrors: cp.totalErrors,
      totalRetries: cp.totalRetries,
      permanentlyFailed: cp.permanentlyFailedIds.length,
      batches: cp.batchNumber,
      cityFilled,
      stateFilled,
      successRatePct: successRate,
      failureRatePct: failureRate,
    },
    completeness: {
      cityPct: cityCompleteness,
      statePct: stateCompleteness,
    },
    checkpoint: CHECKPOINT_PATH,
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const outPath = path.join(REPORT_DIR, `places-metadata-geocode-final-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  const md = `# Places Metadata Geocode Backfill — Final Report

Generated: ${report.timestamp}

## Before / After

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Total places | ${before.total.toLocaleString()} | ${after.total.toLocaleString()} | — |
| Missing city | ${before.missingCity.toLocaleString()} (${report.before.pctMissingCity}%) | ${after.missingCity.toLocaleString()} (${report.after.pctMissingCity}%) | −${cityFilled.toLocaleString()} |
| Missing state | ${before.missingState.toLocaleString()} (${report.before.pctMissingState}%) | ${after.missingState.toLocaleString()} (${report.after.pctMissingState}%) | −${stateFilled.toLocaleString()} |

## Run Statistics

- **Total scanned:** ${cp.totalScanned.toLocaleString()}
- **Total updated:** ${cp.totalUpdated.toLocaleString()}
- **Skipped:** ${cp.totalSkipped.toLocaleString()}
- **Errors:** ${cp.totalErrors.toLocaleString()}
- **Retries:** ${cp.totalRetries.toLocaleString()}
- **Permanently failed:** ${cp.permanentlyFailedIds.length.toLocaleString()}
- **Success rate:** ${successRate}%
- **Failure rate:** ${failureRate}%
- **City completeness:** ${cityCompleteness}%
- **State completeness:** ${stateCompleteness}%

## Checkpoint

\`${CHECKPOINT_PATH}\`

Full JSON: \`${outPath}\`
`;

  const mdPath = path.join(REPORT_DIR, `places-metadata-geocode-final-${Date.now()}.md`);
  fs.writeFileSync(mdPath, md);

  console.log(JSON.stringify(report, null, 2));
  console.log(`Final report: ${mdPath}`);
}

async function runReport(): Promise<void> {
  const metrics = await getMetrics();
  const cp = loadCheckpoint();
  const eligible = await countEligibleAfter(cp.lastProcessedId);

  const report = {
    timestamp: new Date().toISOString(),
    metrics,
    pctMissingCity: metrics.total ? ((metrics.missingCity / metrics.total) * 100).toFixed(2) : '0',
    pctMissingState: metrics.total ? ((metrics.missingState / metrics.total) * 100).toFixed(2) : '0',
    eligibleRemaining: eligible,
    checkpoint: cp,
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const outPath = path.join(REPORT_DIR, `places-metadata-geocode-snapshot-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

async function runQa(): Promise<void> {
  const cp = loadCheckpoint();
  const pool = cp.updatedPlaceIds;
  if (pool.length === 0) {
    console.log('No updated place IDs in checkpoint — run geocode first.');
    return;
  }

  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const sampleIds = shuffled.slice(0, Math.min(QA_SAMPLE_SIZE, shuffled.length));

  const places = await prisma.place.findMany({
    where: { id: { in: sampleIds } },
    select: {
      id: true,
      name: true,
      latitude: true,
      longitude: true,
      city: true,
      state: true,
    },
  });

  const byState = new Map<string, typeof places>();
  for (const p of places) {
    const st = p.state || 'unknown';
    if (!byState.has(st)) byState.set(st, []);
    byState.get(st)!.push(p);
  }

  console.log(`QA sample: ${places.length} places across ${byState.size} states`);

  const mismatches: QaMismatch[] = [];
  let verified = 0;

  for (const p of places) {
    if (p.latitude == null || p.longitude == null) continue;
    const { geo } = await reverseGeocodeWithRetry(p.latitude, p.longitude);
    if (!geo) {
      mismatches.push({
        placeId: p.id,
        name: p.name,
        lat: p.latitude,
        lng: p.longitude,
        dbCity: p.city,
        dbState: p.state,
        verifyCity: '',
        verifyState: '',
        reason: 'geocode_failed_on_reverify',
      });
      continue;
    }

    const verifyCity = resolveCity(geo);
    const verifyState = resolveState(geo);

    let ok = true;
    let reason = '';

    if (p.city && verifyCity && !citiesMatch(p.city, verifyCity)) {
      ok = false;
      reason = 'city_mismatch';
    }
    if (p.state && verifyState && !statesMatch(p.state, verifyState)) {
      ok = false;
      reason = reason ? `${reason},state_mismatch` : 'state_mismatch';
    }
    if (!isIndiaCountry(geo.country)) {
      ok = false;
      reason = reason ? `${reason},non_india` : 'non_india';
    }

    if (ok) {
      verified += 1;
    } else {
      mismatches.push({
        placeId: p.id,
        name: p.name,
        lat: p.latitude,
        lng: p.longitude,
        dbCity: p.city,
        dbState: p.state,
        verifyCity,
        verifyState,
        reason,
      });
    }
  }

  const qaReport = {
    timestamp: new Date().toISOString(),
    sampleSize: places.length,
    statesCovered: byState.size,
    statesBreakdown: Object.fromEntries([...byState.entries()].map(([k, v]) => [k, v.length])),
    verified,
    mismatches: mismatches.length,
    mismatchRatePct: places.length ? ((mismatches.length / places.length) * 100).toFixed(2) : '0',
    mismatchDetails: mismatches.slice(0, 50),
  };

  const outPath = path.join(REPORT_DIR, `places-metadata-geocode-qa-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(qaReport, null, 2));
  console.log(JSON.stringify(qaReport, null, 2));
  console.log(`QA report: ${outPath}`);
}

async function main() {
  const { phase, limit, dryRun, resume, runAll } = parseArgs();

  if (phase === 'report') {
    await runReport();
    return;
  }
  if (phase === 'qa') {
    await runQa();
    return;
  }
  if (phase === 'geocode') {
    await runGeocodeLoop(limit, dryRun, resume, runAll);
    return;
  }
  throw new Error(`Unknown phase: ${phase}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
