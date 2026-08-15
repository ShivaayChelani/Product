/**
 * Isolated single-place enrichment worker (spawned by resilient pipeline runner).
 * Outputs one JSON line with result; exits 0 on handled completion, 1 on failure.
 */
import { enrichSinglePlace } from './factual-place-enrichment';
import { prisma } from '../../src/config/database';
import type { PlaceWorkerResult } from '../lib/pipeline-reliability/types';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : undefined;
}

async function main() {
  const placeId = arg('place-id');
  if (!placeId) {
    console.log(JSON.stringify({ ok: false, errors: ['Missing --place-id'] }));
    process.exit(1);
  }

  const started = Date.now();
  const dryRun = process.argv.includes('--dry-run');
  const linkNearby = process.argv.includes('--link-nearby');
  const nominatim = process.argv.includes('--nominatim');
  const recalcScores = process.argv.includes('--recalc-scores');

  try {
    const rec = await enrichSinglePlace(placeId, { dryRun, linkNearby, nominatim, recalcScores });
    if (!rec) {
      const out: PlaceWorkerResult = {
        ok: false,
        placeId,
        name: '',
        externalId: null,
        source: '',
        enriched: false,
        errorCount: 1,
        errors: ['Place not found or merged'],
        manualReviewReasons: [],
        durationMs: Date.now() - started,
        filledFields: [],
      };
      console.log(JSON.stringify(out));
      process.exit(1);
    }

    const filledFields = Object.entries(rec.outcomes)
      .filter(([, v]) => v === 'filled')
      .map(([k]) => k);
    const enriched = filledFields.length > 0;
    const out: PlaceWorkerResult = {
      ok: rec.errors.length === 0,
      placeId: rec.placeId,
      name: rec.name,
      externalId: rec.externalId,
      source: rec.source,
      enriched,
      errorCount: rec.errors.length,
      errors: rec.errors,
      manualReviewReasons: rec.manualReviewReasons,
      durationMs: Date.now() - started,
      filledFields,
    };
    console.log(JSON.stringify(out));
    process.exit(out.ok ? 0 : 1);
  } catch (err) {
    const place = await prisma.place.findFirst({
      where: { id: placeId },
      select: { name: true, externalId: true, source: true },
    }).catch(() => null);

    const out: PlaceWorkerResult = {
      ok: false,
      placeId,
      name: place?.name ?? '',
      externalId: place?.externalId ?? null,
      source: place?.source ?? '',
      enriched: false,
      errorCount: 1,
      errors: [(err as Error).message],
      manualReviewReasons: ['Enrichment threw an exception'],
      durationMs: Date.now() - started,
      filledFields: [],
    };
    console.log(JSON.stringify(out));
    process.exit(1);
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

main();
