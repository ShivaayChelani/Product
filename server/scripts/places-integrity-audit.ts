/**
 * Read-only Places production integrity audit.
 * Usage: npx ts-node scripts/places-integrity-audit.ts
 */
import { prisma } from '../src/config/database';

const UNSplash = /unsplash\.com/i;
const PLACEHOLDER = /placeholder|picsum|loremflickr|via\.placeholder|dummyimage|placehold\.it/i;
const STOCK = /pexels\.com|pixabay\.com|freepik|shutterstock/i;
const CLOUDINARY = /res\.cloudinary\.com/i;

async function safeCount(fn: () => Promise<number>) {
  try {
    return await fn();
  } catch {
    return -1;
  }
}

async function main() {
  const [
    totalPlaces,
    canonicalActive,
    mergedRecords,
    approved,
    pending,
    rejected,
    verified,
    draft,
    pendingReview,
    missingCoords,
    zeroCoords,
    outsideIndia,
    emptyCity,
    emptyState,
    emptySlug,
    emptyDescription,
    shortDescription,
    missingImages,
    unsplashImages,
    placeholderImages,
    cloudinaryImages,
    bulkPlaces,
    suspiciousNames,
    duplicateSlug,
    orphanReels,
    orphanReviews,
    reelsWithInvalidPlace,
    reviewsWithInvalidPlace,
    placesWithRatingNoReviews,
    missingWebsite,
    missingOpeningHours,
    missingTicketPrice,
    categoryCaseDup,
  ] = await Promise.all([
    safeCount(() => prisma.place.count()),
    safeCount(() => prisma.place.count({ where: { mergedIntoId: null } })),
    safeCount(() => prisma.place.count({ where: { mergedIntoId: { not: null } } })),
    safeCount(() => prisma.place.count({ where: { mergedIntoId: null, status: 'APPROVED' } })),
    safeCount(() => prisma.place.count({ where: { mergedIntoId: null, status: 'PENDING' } })),
    safeCount(() => prisma.place.count({ where: { mergedIntoId: null, status: 'REJECTED' } })),
    safeCount(() => prisma.place.count({ where: { mergedIntoId: null, dataQuality: 'VERIFIED' } })),
    safeCount(() => prisma.place.count({ where: { mergedIntoId: null, dataQuality: 'DRAFT' } })),
    safeCount(() => prisma.place.count({ where: { mergedIntoId: null, dataQuality: 'PENDING_REVIEW' } })),
    safeCount(() =>
      prisma.place.count({
        where: { mergedIntoId: null, OR: [{ latitude: null }, { longitude: null }] },
      }),
    ),
    safeCount(() =>
      prisma.place.count({
        where: { mergedIntoId: null, latitude: 0, longitude: 0 },
      }),
    ),
    safeCount(() =>
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count FROM places
        WHERE merged_into_id IS NULL
          AND latitude IS NOT NULL AND longitude IS NOT NULL
          AND (latitude < 6.5 OR latitude > 37.5 OR longitude < 68.0 OR longitude > 97.5)
      `.then((r) => Number(r[0]?.count ?? 0)),
    ),
    safeCount(() => prisma.place.count({ where: { mergedIntoId: null, city: '' } })),
    safeCount(() => prisma.place.count({ where: { mergedIntoId: null, state: '' } })),
    safeCount(() => prisma.place.count({ where: { mergedIntoId: null, slug: '' } })),
    safeCount(() =>
      prisma.place.count({ where: { mergedIntoId: null, OR: [{ description: '' }, { description: null as any }] } }),
    ),
    safeCount(() =>
      prisma.place.count({
        where: { mergedIntoId: null, description: { not: '' }, AND: [{ description: { not: null as any } }] },
      }).then(async (withDesc) => {
        const short = await prisma.place.count({
          where: {
            mergedIntoId: null,
            description: { not: '' },
            NOT: { description: { gte: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' } },
          },
        });
        return short;
      }),
    ),
    safeCount(() =>
      prisma.place.count({
        where: {
          mergedIntoId: null,
          images: { equals: [] },
          thumbnail: null,
        },
      }),
    ),
    safeCount(() =>
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(DISTINCT p.id)::bigint AS count FROM places p
        WHERE p.merged_into_id IS NULL
          AND (
            EXISTS (SELECT 1 FROM unnest(p.images) img WHERE img ~* 'unsplash')
            OR p.thumbnail ~* 'unsplash'
          )
      `.then((r) => Number(r[0]?.count ?? 0)),
    ),
    safeCount(() =>
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(DISTINCT p.id)::bigint AS count FROM places p
        WHERE p.merged_into_id IS NULL
          AND (
            EXISTS (SELECT 1 FROM unnest(p.images) img WHERE img ~* 'placeholder|picsum|loremflickr|dummyimage')
            OR p.thumbnail ~* 'placeholder|picsum|loremflickr|dummyimage'
          )
      `.then((r) => Number(r[0]?.count ?? 0)),
    ),
    safeCount(() =>
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(DISTINCT p.id)::bigint AS count FROM places p
        WHERE p.merged_into_id IS NULL
          AND (
            EXISTS (SELECT 1 FROM unnest(p.images) img WHERE img ~* 'res\\.cloudinary\\.com')
            OR p.thumbnail ~* 'res\\.cloudinary\\.com'
          )
      `.then((r) => Number(r[0]?.count ?? 0)),
    ),
    safeCount(() =>
      prisma.place.count({
        where: {
          mergedIntoId: null,
          OR: [{ slug: { startsWith: 'bulk-place' } }, { name: { startsWith: 'Bulk Place', mode: 'insensitive' } }],
        },
      }),
    ),
    safeCount(() =>
      prisma.place.count({
        where: {
          mergedIntoId: null,
          OR: [
            { name: { contains: 'dummy', mode: 'insensitive' } },
            { name: { contains: 'test place', mode: 'insensitive' } },
            { name: { contains: 'sample', mode: 'insensitive' } },
            { name: { contains: 'placeholder', mode: 'insensitive' } },
            { name: { contains: 'foobar', mode: 'insensitive' } },
          ],
        },
      }),
    ),
    safeCount(() =>
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count FROM (
          SELECT slug FROM places WHERE merged_into_id IS NULL GROUP BY slug HAVING COUNT(*) > 1
        ) d
      `.then((r) => Number(r[0]?.count ?? 0)),
    ),
    safeCount(() =>
      prisma.reel.count({ where: { placeId: null } }),
    ),
    safeCount(async () => {
      const reels = await prisma.reel.findMany({ where: { placeId: { not: null } }, select: { placeId: true }, take: 5000 });
      const ids = [...new Set(reels.map((r) => r.placeId!).filter(Boolean))];
      if (!ids.length) return 0;
      const existing = await prisma.place.findMany({ where: { id: { in: ids } }, select: { id: true } });
      const set = new Set(existing.map((p) => p.id));
      return ids.filter((id) => !set.has(id)).length;
    }),
    safeCount(() =>
      prisma.review.count({
        where: { place: { mergedIntoId: { not: null } } },
      }),
    ),
    safeCount(async () => {
      const reviews = await prisma.review.findMany({ select: { placeId: true }, take: 10000 });
      const ids = [...new Set(reviews.map((r) => r.placeId))];
      const existing = await prisma.place.findMany({ where: { id: { in: ids } }, select: { id: true } });
      const set = new Set(existing.map((p) => p.id));
      return ids.filter((id) => !set.has(id)).length;
    }),
    safeCount(() =>
      prisma.place.count({
        where: { mergedIntoId: null, rating: { not: null, gt: 0 }, reviewCount: 0 },
      }),
    ),
    safeCount(() =>
      prisma.place.count({ where: { mergedIntoId: null, website: null } }),
    ),
    safeCount(() =>
      prisma.place.count({ where: { mergedIntoId: null, openingHours: { equals: null as any } } }),
    ),
    safeCount(() =>
      prisma.place.count({ where: { mergedIntoId: null, ticketPrice: { equals: null as any } } }),
    ),
    safeCount(() =>
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count FROM (
          SELECT LOWER(category) AS c FROM places WHERE merged_into_id IS NULL GROUP BY LOWER(category) HAVING COUNT(DISTINCT category) > 1
        ) x
      `.then((r) => Number(r[0]?.count ?? 0)),
    ),
  ]);

  const dupCandidates = await safeCount(() =>
    prisma.placeDuplicateCandidate.count({ where: { status: 'OPEN' } }),
  );

  const bySource = await prisma.place.groupBy({
    by: ['source'],
    where: { mergedIntoId: null },
    _count: true,
  });

  const commercial = await safeCount(() =>
    prisma.place.count({
      where: {
        mergedIntoId: null,
        category: { in: ['SHOPPING', 'RESTAURANT', 'HOTEL', 'shopping', 'restaurant', 'hotel'] },
      },
    }),
  );

  const publicVisible = await safeCount(() =>
    prisma.place.count({
      where: { mergedIntoId: null, status: 'APPROVED', dataQuality: 'VERIFIED' },
    }),
  );

  const sampleUnsplash = await prisma.$queryRaw<
    { id: string; name: string; city: string; state: string; source: string; image: string }[]
  >`
    SELECT p.id, p.name, p.city, p.state, p.source::text,
      COALESCE(p.thumbnail, (p.images)[1]) AS image
    FROM places p
    WHERE p.merged_into_id IS NULL
      AND (
        EXISTS (SELECT 1 FROM unnest(p.images) img WHERE img ~* 'unsplash')
        OR p.thumbnail ~* 'unsplash'
      )
    LIMIT 15
  `.catch(() => []);

  const sampleMissingCoords = await prisma.place.findMany({
    where: { mergedIntoId: null, OR: [{ latitude: null }, { longitude: null }] },
    select: { id: true, name: true, city: true, state: true, source: true },
    take: 10,
  });

  const sampleOutsideIndia = await prisma.$queryRaw<
    { id: string; name: string; latitude: number; longitude: number; source: string }[]
  >`
    SELECT id, name, latitude, longitude, source::text
    FROM places
    WHERE merged_into_id IS NULL
      AND latitude IS NOT NULL AND longitude IS NOT NULL
      AND (latitude < 6.5 OR latitude > 37.5 OR longitude < 68.0 OR longitude > 97.5)
    LIMIT 10
  `.catch(() => []);

  const vendorLinked = await safeCount(() =>
    prisma.vendor.count({ where: { linkedSpotIds: { isEmpty: false } } }),
  );

  const placesNeedingReview =
    missingCoords +
    zeroCoords +
    outsideIndia +
    emptyCity +
    emptyState +
    emptyDescription +
    missingImages +
    unsplashImages +
    placeholderImages +
    bulkPlaces +
    suspiciousNames +
    placesWithRatingNoReviews;

  const dataQualityScore = canonicalActive > 0
    ? Math.round(
        ((canonicalActive - Math.min(placesNeedingReview, canonicalActive)) / canonicalActive) * 100,
      )
    : 0;

  const productionReadiness = canonicalActive > 0
    ? Math.round((publicVisible / canonicalActive) * 100)
    : 0;

  const report = {
    generatedAt: new Date().toISOString(),
    totals: {
      totalPlaces,
      canonicalActive,
      mergedRecords,
      publicVisibleVerifiedApproved: publicVisible,
    },
    status: { approved, pending, rejected },
    dataQuality: { verified, draft, pendingReview },
    integrityIssues: {
      missingCoords,
      zeroCoords,
      outsideIndia,
      emptyCity,
      emptyState,
      emptySlug,
      emptyDescription,
      shortDescription,
      missingImages,
      unsplashImages,
      placeholderImages,
      cloudinaryImages,
      bulkPlaces,
      suspiciousNames,
      duplicateSlugGroups: duplicateSlug,
      openDuplicateCandidates: dupCandidates,
      commercialCategories: commercial,
      categoryCaseInconsistency: categoryCaseDup,
      placesWithRatingNoReviews,
      missingWebsite,
      missingOpeningHours,
      missingTicketPrice,
    },
    orphans: {
      reelsWithoutPlace: orphanReels,
      reelsWithDeletedPlace: reelsWithInvalidPlace,
      reviewsOnMergedPlaces: orphanReviews,
      reviewsWithMissingPlace: reviewsWithInvalidPlace,
    },
    linkedEntities: { vendorsWithLinkedSpots: vendorLinked },
    bySource: bySource.map((s) => ({ source: s.source, count: s._count })),
    scores: {
      dataQualityScore,
      productionReadinessScore: productionReadiness,
      placesRequiringReview: placesNeedingReview,
      verifiedPlaces: verified,
    },
    samples: {
      unsplash: sampleUnsplash,
      missingCoords: sampleMissingCoords,
      outsideIndia: sampleOutsideIndia,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
