/** Read-only operational metrics snapshot. */
import { prisma } from '../src/config/database';

async function main() {
  const [
    places,
    geohashFilled,
    dupOpen,
    dupReview,
    dupMerge,
    imagesTotal,
    imagesRejected,
    imagesLicensed,
    reelsOrphan,
    reviewsOrphan,
    verified,
    missingCity,
    missingImages,
    syntheticRatings,
    unsplashPlaces,
  ] = await Promise.all([
    prisma.place.count({ where: { mergedIntoId: null } }),
    prisma.place.count({ where: { mergedIntoId: null, geohash: { not: null } } }),
    prisma.placeDuplicateCandidate.count({ where: { status: 'OPEN' } }),
    prisma.placeDuplicateCandidate.count({
      where: { status: 'OPEN', confidenceScore: { gte: 0.72, lt: 0.86 } },
    }),
    prisma.placeDuplicateCandidate.count({
      where: { status: 'OPEN', confidenceScore: { gte: 0.86 } },
    }),
    prisma.placeImage.count(),
    prisma.placeImage.count({ where: { verificationStatus: 'REJECTED' } }),
    prisma.placeImage.count({ where: { verificationStatus: 'LICENSE_VERIFIED' } }),
    prisma.reel.count({ where: { placeId: null } }),
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count FROM reviews r
      LEFT JOIN places p ON p.id = r.place_id
      WHERE p.id IS NULL
    `.then((r) => Number(r[0]?.count ?? 0)),
    prisma.place.count({ where: { mergedIntoId: null, dataQuality: 'VERIFIED' } }),
    prisma.place.count({ where: { mergedIntoId: null, city: '' } }),
    prisma.place.count({
      where: { mergedIntoId: null, images: { equals: [] }, thumbnail: null },
    }),
    prisma.place.count({
      where: {
        reviewCount: 0,
        OR: [{ rating: { not: null } }, { bayesianRating: { not: null } }],
      },
    }),
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT p.id)::bigint AS count FROM places p
      WHERE p.merged_into_id IS NULL
        AND (
          EXISTS (SELECT 1 FROM unnest(p.images) img WHERE img ~* 'unsplash|pexels|pixabay')
          OR p.thumbnail ~* 'unsplash|pexels|pixabay'
        )
    `.then((r) => Number(r[0]?.count ?? 0)),
  ]);

  const bySource = await prisma.place.groupBy({
    by: ['source'],
    where: { mergedIntoId: null },
    _count: true,
  });

  const verificationBatches = {
    curated: await prisma.place.count({
      where: { mergedIntoId: null, source: 'CURATED', dataQuality: { not: 'VERIFIED' } },
    }),
    admin: await prisma.place.count({
      where: { mergedIntoId: null, source: 'ADMIN', dataQuality: { not: 'VERIFIED' } },
    }),
    wikimediaWithImage: await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT p.id)::bigint AS count
      FROM places p
      WHERE p.merged_into_id IS NULL AND p.source = 'WIKIMEDIA'
        AND p.data_quality <> 'VERIFIED'
        AND (
          EXISTS (SELECT 1 FROM unnest(p.images) img WHERE img ~* 'wikimedia|upload\.wikimedia')
          OR EXISTS (SELECT 1 FROM place_images pi WHERE pi.place_id = p.id AND pi.verification_status = 'LICENSE_VERIFIED')
        )
    `.then((r) => Number(r[0]?.count ?? 0)),
    osmComplete: await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count FROM places p
      WHERE p.merged_into_id IS NULL AND p.source = 'OSM'
        AND p.data_quality <> 'VERIFIED'
        AND p.city <> '' AND p.state <> ''
        AND LENGTH(TRIM(p.description)) >= 40
        AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
    `.then((r) => Number(r[0]?.count ?? 0)),
  };

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        places,
        geohashFilled,
        geohashMissing: places - geohashFilled,
        duplicates: { open: dupOpen, reviewBand: dupReview, highConfidence: dupMerge },
        images: { total: imagesTotal, rejected: imagesRejected, licensed: imagesLicensed },
        orphans: { reels: reelsOrphan, reviews: reviewsOrphan },
        verified,
        metadata: { missingCity, missingImages, syntheticRatings, unsplashPlaces },
        bySource: bySource.map((r) => ({ source: r.source, count: r._count })),
        verificationBatches,
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
