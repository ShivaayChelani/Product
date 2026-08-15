import { prisma } from '../../../config/database';
import { geohashPrefixCenter, geohashBlockingPrefixes } from '../../../shared/utils/geohash';
import { comparePlacesInBlock } from './duplicate-scan.service';
import { pickCanonicalPlace, pickDuplicateSide } from './canonical-pick.service';
import { placesMergeService } from '../../places/services/places.merge.service';

export type AutoMergeResult = {
  attempted: number;
  merged: number;
  skipped: number;
  errors: number;
};

export async function autoMergeHighConfidenceCandidates(opts: {
  minConfidence: number;
  limit: number;
  mergedById?: string;
}): Promise<AutoMergeResult> {
  const rows = await prisma.placeDuplicateCandidate.findMany({
    where: {
      status: 'OPEN',
      confidenceScore: { gte: opts.minConfidence },
    },
    orderBy: { confidenceScore: 'desc' },
    take: opts.limit,
    include: {
      placeA: true,
      placeB: true,
    },
  });

  let merged = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    if (row.placeA.mergedIntoId || row.placeB.mergedIntoId) {
      skipped++;
      continue;
    }
    const canonical = pickCanonicalPlace(row.placeA, row.placeB);
    const { canonicalPlaceId, duplicatePlaceId } = pickDuplicateSide(
      canonical,
      row.placeA,
      row.placeB,
    );

    try {
      await placesMergeService.mergeDuplicates({
        canonicalPlaceId,
        duplicatePlaceIds: [duplicatePlaceId],
        mergedById: opts.mergedById,
        reason: `auto_merge_confidence_${row.confidenceScore}`,
      });
      merged++;
    } catch {
      errors++;
    }
  }

  return { attempted: rows.length, merged, skipped, errors };
}

export type CorpusScanOptions = {
  precision?: number;
  prefixBatch?: number;
  prefixOffset?: number;
  maxPlacesPerBlock?: number;
};

/** Page through geohash prefixes for full-India duplicate discovery. */
export async function runGeohashBlockedDuplicateScanPage(
  options: CorpusScanOptions = {},
): Promise<{
  prefixesScanned: number;
  pairsEvaluated: number;
  candidatesUpserted: number;
  hasMore: boolean;
}> {
  const precision = options.precision ?? 6;
  const prefixBatch = options.prefixBatch ?? 200;
  const prefixOffset = options.prefixOffset ?? 0;
  const maxPlacesPerBlock = options.maxPlacesPerBlock ?? 120;

  const prefixRows = await prisma.$queryRaw<{ prefix: string }[]>`
    SELECT DISTINCT LEFT(geohash, ${precision}::int) AS prefix
    FROM places
    WHERE merged_into_id IS NULL
      AND status = 'APPROVED'
      AND geohash IS NOT NULL
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
    ORDER BY prefix
    OFFSET ${prefixOffset}
    LIMIT ${prefixBatch}
  `;

  let pairsEvaluated = 0;
  let candidatesUpserted = 0;

  for (const { prefix } of prefixRows) {
    const center = geohashPrefixCenter(prefix);
    const blockPrefixes = geohashBlockingPrefixes(center.lat, center.lng, precision);

    const places = await prisma.place.findMany({
      where: {
        mergedIntoId: null,
        status: 'APPROVED',
        OR: blockPrefixes.map((p) => ({ geohash: { startsWith: p } })),
        latitude: { not: null },
        longitude: { not: null },
      },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        state: true,
        district: true,
        category: true,
        aliases: { select: { alias: true } },
      },
      take: maxPlacesPerBlock,
    });

    const unique = [...new Map(places.map((r) => [r.id, r])).values()] as any[];
    const { evaluated, upserted } = await comparePlacesInBlock(unique);
    pairsEvaluated += evaluated;
    candidatesUpserted += upserted;
  }

  return {
    prefixesScanned: prefixRows.length,
    pairsEvaluated,
    candidatesUpserted,
    hasMore: prefixRows.length === prefixBatch,
  };
}

export async function countGeohashPrefixes(precision = 6): Promise<number> {
  const row = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(DISTINCT LEFT(geohash, ${precision}::int))::bigint AS count
    FROM places
    WHERE merged_into_id IS NULL
      AND status = 'APPROVED'
      AND geohash IS NOT NULL
  `;
  return Number(row[0]?.count ?? 0);
}
