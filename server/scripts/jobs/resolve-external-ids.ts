/**
 * Resolve authoritative Wikidata / OSM external IDs for canonical places
 * missing wikidata: or osm: links. High-confidence matches only; never guess.
 *
 * Usage:
 *   npx ts-node scripts/jobs/resolve-external-ids.ts --batch-size=50 --limit=500
 *   npx ts-node scripts/jobs/resolve-external-ids.ts --all
 */
import fs from 'fs';
import path from 'path';
import { prisma } from '../../src/config/database';
import {
  pickBestMatch,
  searchOsmCandidates,
  searchWikidataCandidates,
} from '../lib/external-id-matcher';
import { sleep } from '../lib/wikidata-client';

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}

const CHECKPOINT_PATH = path.resolve('reports/ops/enrichment/checkpoint-external-ids.json');
const REPORT_DIR = path.resolve('reports/ops/enrichment');

type Checkpoint = { offset: number; linked: number; review: number; skipped: number; errors: number };

function loadCheckpoint(): Checkpoint {
  if (!fs.existsSync(CHECKPOINT_PATH)) {
    return { offset: 0, linked: 0, review: 0, skipped: 0, errors: 0 };
  }
  try {
    return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'));
  } catch {
    return { offset: 0, linked: 0, review: 0, skipped: 0, errors: 0 };
  }
}

function saveCheckpoint(cp: Checkpoint) {
  fs.mkdirSync(path.dirname(CHECKPOINT_PATH), { recursive: true });
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify({ ...cp, updatedAt: new Date().toISOString() }, null, 2));
}

const missingExtIdWhere = {
  mergedIntoId: null as null,
  OR: [
    { externalId: null },
    {
      NOT: {
        OR: [
          { externalId: { startsWith: 'wikidata:' } },
          { externalId: { startsWith: 'osm:' } },
        ],
      },
    },
  ],
};

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const batchSize = parseInt(arg('batch-size', '50'), 10);
  const maxBatches = parseInt(arg('max-batches', '0'), 10);
  const runAll = process.argv.includes('--all');
  const limit = runAll ? 0 : parseInt(arg('limit', '500'), 10);
  const reset = process.argv.includes('--reset');

  const cp = reset
    ? { offset: 0, linked: 0, review: 0, skipped: 0, errors: 0 }
    : loadCheckpoint();

  const total = await prisma.place.count({ where: missingExtIdWhere });
  console.log(JSON.stringify({ totalMissingExternalIds: total, checkpoint: cp, dryRun }, null, 2));

  const manualReview: {
    placeId: string;
    name: string;
    confidence: number;
    candidate: string;
    reason: string;
  }[] = [];

  let batches = 0;
  while (true) {
    if (maxBatches > 0 && batches >= maxBatches) break;
    if (!runAll && limit > 0 && cp.offset >= limit) break;
    if (cp.offset >= total) break;

    const places = await prisma.place.findMany({
      where: missingExtIdWhere,
      orderBy: [{ state: 'asc' }, { name: 'asc' }],
      skip: cp.offset,
      take: batchSize,
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        state: true,
        district: true,
        externalId: true,
        dataQuality: true,
        aliases: { select: { alias: true } },
      },
    });

    if (!places.length) break;
    batches += 1;
    console.log(`Batch ${batches}: offset=${cp.offset}, size=${places.length}`);

    for (const place of places) {
      try {
        if (!place.latitude || !place.longitude) {
          cp.skipped += 1;
          continue;
        }

        const aliases = place.aliases.map((a) => a.alias);
        const searchName = place.name.trim();
        if (searchName.length < 2) {
          cp.skipped += 1;
          continue;
        }

        const [wdCandidates, osmCandidates] = await Promise.all([
          searchWikidataCandidates(searchName),
          searchOsmCandidates(searchName, place.latitude, place.longitude),
        ]);
        await sleep(400);

        const best = pickBestMatch(
          place.name,
          aliases,
          place.latitude,
          place.longitude,
          place.state,
          [...wdCandidates, ...osmCandidates],
        );

        if (!best) {
          cp.skipped += 1;
          continue;
        }

        if (best.action === 'REVIEW') {
          cp.review += 1;
          manualReview.push({
            placeId: place.id,
            name: place.name,
            confidence: best.confidence,
            candidate: `${best.candidate.externalId} (${best.candidate.label})`,
            reason: `nameScore=${best.nameScore}, distanceM=${best.distanceM}`,
          });
          continue;
        }

        const existing = await prisma.place.findFirst({
          where: { externalId: best.candidate.externalId, mergedIntoId: null, NOT: { id: place.id } },
          select: { id: true, name: true },
        });
        if (existing) {
          cp.skipped += 1;
          manualReview.push({
            placeId: place.id,
            name: place.name,
            confidence: best.confidence,
            candidate: best.candidate.externalId,
            reason: `external_id_conflict_with:${existing.id}:${existing.name}`,
          });
          continue;
        }

        if (!dryRun) {
          await prisma.$transaction(async (tx) => {
            await tx.place.update({
              where: { id: place.id },
              data: { externalId: best.candidate.externalId },
            });
            await tx.placeFieldProvenance.create({
              data: {
                placeId: place.id,
                fieldName: 'externalId',
                valueJson: {
                  previous: place.externalId,
                  linked: best.candidate.externalId,
                  confidence: best.confidence,
                  label: best.candidate.label,
                },
                sourceType: best.candidate.source,
                sourceUri: best.candidate.sourceUri,
                confidence: best.confidence,
              },
            });
          });
        }

        cp.linked += 1;
        if (cp.linked % 25 === 0) {
          console.log(`  linked=${cp.linked}, review=${cp.review}, skipped=${cp.skipped}`);
        }
      } catch (e) {
        cp.errors += 1;
        console.error(`Error on ${place.id} (${place.name}):`, e);
      }
    }

    cp.offset += places.length;
    saveCheckpoint(cp);
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(REPORT_DIR, `external-id-resolution-${stamp}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        dryRun,
        totalMissingExternalIds: total,
        ...cp,
        manualReviewSample: manualReview.slice(0, 500),
        manualReviewCount: manualReview.length,
      },
      null,
      2,
    ),
  );

  console.log(JSON.stringify({ reportPath, ...cp, manualReviewQueued: manualReview.length }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
