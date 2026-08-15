import { prisma } from '../../../config/database';
import { countGeohashPrefixes } from './corpus-dedupe.service';

export async function buildDatabaseQualityReport() {
  async function safeCount(fn: () => Promise<number>): Promise<number> {
    try {
      return await fn();
    } catch {
      return 0;
    }
  }

  const [
    canonicalActive,
    mergedRecords,
    verified,
    draft,
    pendingReview,
    aliasCount,
    dupOpen,
    dupMerged,
    dupDismissed,
    mergeLogs,
    missingGeohash,
    missingCoords,
    manualReviewQueue,
  ] = await Promise.all([
    safeCount(() => prisma.place.count({ where: { mergedIntoId: null } })),
    safeCount(() => prisma.place.count({ where: { mergedIntoId: { not: null } } })),
    safeCount(() => prisma.place.count({ where: { mergedIntoId: null, dataQuality: 'VERIFIED' } })),
    safeCount(() => prisma.place.count({ where: { mergedIntoId: null, dataQuality: 'DRAFT' } })),
    safeCount(() => prisma.place.count({ where: { mergedIntoId: null, dataQuality: 'PENDING_REVIEW' } })),
    safeCount(() => prisma.placeAlias.count()),
    safeCount(() => prisma.placeDuplicateCandidate.count({ where: { status: 'OPEN' } })),
    safeCount(() => prisma.placeDuplicateCandidate.count({ where: { status: 'MERGED' } })),
    safeCount(() => prisma.placeDuplicateCandidate.count({ where: { status: 'DISMISSED' } })),
    safeCount(() => prisma.placeMergeLog.count()),
    safeCount(() => prisma.place.count({ where: { mergedIntoId: null, geohash: null, latitude: { not: null } } })),
    safeCount(() => prisma.place.count({ where: { mergedIntoId: null, OR: [{ latitude: null }, { longitude: null }] } })),
    safeCount(() =>
      prisma.placeDuplicateCandidate.count({ where: { status: 'OPEN', confidenceScore: { lt: 0.86, gte: 0.72 } } }),
    ),
  ]);

  const canonicalFallback =
    canonicalActive === 0 && mergedRecords === 0
      ? await safeCount(() => prisma.place.count())
      : canonicalActive;

  const byState = await prisma.$queryRaw<{ state: string; count: bigint }[]>`
    SELECT COALESCE(NULLIF(TRIM(state), ''), '(unknown)') AS state, COUNT(*)::bigint AS count
    FROM places GROUP BY 1 ORDER BY count DESC LIMIT 40
  `.catch(() => [] as { state: string; count: bigint }[]);

  const byCategory = await prisma.$queryRaw<{ category: string; count: bigint }[]>`
    SELECT category, COUNT(*)::bigint AS count
    FROM places GROUP BY category ORDER BY count DESC LIMIT 40
  `.catch(() => [] as { category: string; count: bigint }[]);

  const geohashPrefixes = await countGeohashPrefixes(6).catch(() => 0);

  let reviewSamples: Awaited<ReturnType<typeof prisma.placeDuplicateCandidate.findMany>>;
  try {
    reviewSamples = await prisma.placeDuplicateCandidate.findMany({
      where: { status: 'OPEN' },
      orderBy: { confidenceScore: 'desc' },
      take: 25,
      include: {
        placeA: { select: { id: true, name: true, state: true, publicPlaceId: true } },
        placeB: { select: { id: true, name: true, state: true, publicPlaceId: true } },
      },
    });
  } catch {
    reviewSamples = [];
  }

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      canonicalActive: canonicalFallback,
      mergedRecords,
      mergeLogs,
      aliasCount,
      verified,
      draft,
      pendingReview,
      duplicateCandidatesOpen: dupOpen,
      duplicateCandidatesMerged: dupMerged,
      duplicateCandidatesDismissed: dupDismissed,
      manualReviewBandCount: manualReviewQueue,
      missingGeohash,
      missingCoordinates: missingCoords,
      geohashCellsPrecision6: geohashPrefixes,
    },
    coverageByState: byState.map((r) => ({ state: r.state, count: Number(r.count) })),
    coverageByCategory: byCategory.map((r) => ({ category: r.category, count: Number(r.count) })),
    manualReviewSamples: reviewSamples.map((c) => ({
      confidenceScore: c.confidenceScore,
      placeA: 'placeA' in c ? (c as any).placeA : null,
      placeB: 'placeB' in c ? (c as any).placeB : null,
    })),
  };
}
