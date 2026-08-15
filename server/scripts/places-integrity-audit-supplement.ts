/**
 * Supplemental read-only queries for places integrity audit.
 */
import { prisma } from '../src/config/database';

async function main() {
  const [
    emptyDesc,
    shortDesc,
    totalReviews,
    totalReels,
    reelsLinked,
    vendorsTotal,
    suspicious,
    duplicateNameState,
    sharedUnsplashUrl,
    wikimediaImages,
    stockImages,
    aiSuspectImages,
    invalidCloudinary,
    placesWithContact,
    placesWithTimings,
    placesWithTicket,
  ] = await Promise.all([
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count FROM places
      WHERE merged_into_id IS NULL AND (description IS NULL OR TRIM(description) = '')
    `.then((r) => Number(r[0]?.count ?? 0)),
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count FROM places
      WHERE merged_into_id IS NULL
        AND description IS NOT NULL AND TRIM(description) <> ''
        AND LENGTH(description) < 40
    `.then((r) => Number(r[0]?.count ?? 0)),
    prisma.review.count(),
    prisma.reel.count(),
    prisma.reel.count({ where: { placeId: { not: null } } }),
    prisma.vendor.count(),
    prisma.place.findMany({
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
      select: { id: true, name: true, city: true, state: true, source: true },
    }),
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count FROM (
        SELECT LOWER(TRIM(name)) AS n, LOWER(TRIM(state)) AS s
        FROM places WHERE merged_into_id IS NULL
        GROUP BY LOWER(TRIM(name)), LOWER(TRIM(state))
        HAVING COUNT(*) > 1
      ) d
    `.then((r) => Number(r[0]?.count ?? 0)),
    prisma.$queryRaw<[{ url: string; place_count: bigint }]>`
      SELECT img AS url, COUNT(DISTINCT p.id)::bigint AS place_count
      FROM places p, unnest(p.images) AS img
      WHERE p.merged_into_id IS NULL AND img ~* 'unsplash'
      GROUP BY img
      ORDER BY place_count DESC
      LIMIT 10
    `.catch(() => []),
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT p.id)::bigint AS count FROM places p
      WHERE p.merged_into_id IS NULL
        AND (
          EXISTS (SELECT 1 FROM unnest(p.images) img WHERE img ~* 'wikimedia|wikipedia')
          OR p.thumbnail ~* 'wikimedia|wikipedia'
        )
    `.then((r) => Number(r[0]?.count ?? 0)),
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT p.id)::bigint AS count FROM places p
      WHERE p.merged_into_id IS NULL
        AND (
          EXISTS (SELECT 1 FROM unnest(p.images) img WHERE img ~* 'pexels|pixabay|freepik|shutterstock')
          OR p.thumbnail ~* 'pexels|pixabay|freepik|shutterstock'
        )
    `.then((r) => Number(r[0]?.count ?? 0)),
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT p.id)::bigint AS count FROM places p
      WHERE p.merged_into_id IS NULL
        AND (
          EXISTS (SELECT 1 FROM unnest(p.images) img WHERE img ~* 'midjourney|dalle|stable.?diffusion|openai')
          OR p.thumbnail ~* 'midjourney|dalle|stable.?diffusion|openai'
        )
    `.then((r) => Number(r[0]?.count ?? 0)),
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT p.id)::bigint AS count FROM places p
      WHERE p.merged_into_id IS NULL
        AND (
          EXISTS (
            SELECT 1 FROM unnest(p.images) img
            WHERE img ~* 'res\\.cloudinary\\.com' AND img !~* '/upload/v[0-9]+/'
          )
          OR (p.thumbnail ~* 'res\\.cloudinary\\.com' AND p.thumbnail !~* '/upload/v[0-9]+/')
        )
    `.then((r) => Number(r[0]?.count ?? 0)),
    prisma.place.count({
      where: {
        mergedIntoId: null,
        OR: [{ website: { not: null } }, { emergencyContact: { not: null } }],
      },
    }),
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count FROM places
      WHERE merged_into_id IS NULL AND opening_hours IS NOT NULL
    `.then((r) => Number(r[0]?.count ?? 0)),
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count FROM places
      WHERE merged_into_id IS NULL AND ticket_price IS NOT NULL
    `.then((r) => Number(r[0]?.count ?? 0)),
  ]);

  const duplicateExamples = await prisma.$queryRaw<
    { name: string; state: string; cnt: bigint }[]
  >`
    SELECT TRIM(name) AS name, TRIM(state) AS state, COUNT(*)::bigint AS cnt
    FROM places WHERE merged_into_id IS NULL
    GROUP BY LOWER(TRIM(name)), LOWER(TRIM(state)), TRIM(name), TRIM(state)
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
    LIMIT 15
  `;

  const curatedUnsplash = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*)::bigint AS count FROM places p
    WHERE p.merged_into_id IS NULL AND p.source = 'CURATED'
      AND (
        EXISTS (SELECT 1 FROM unnest(p.images) img WHERE img ~* 'unsplash')
        OR p.thumbnail ~* 'unsplash'
      )
  `.then((r) => Number(r[0]?.count ?? 0));

  console.log(
    JSON.stringify(
      {
        emptyDesc,
        shortDesc,
        totalReviews,
        totalReels,
        reelsLinked,
        vendorsTotal,
        suspicious,
        duplicateNameStateGroups: duplicateNameState,
        duplicateExamples: duplicateExamples.map((d) => ({
          name: d.name,
          state: d.state,
          cnt: Number(d.cnt),
        })),
        sharedUnsplashUrl: sharedUnsplashUrl.map((u) => ({
          url: u.url,
          place_count: Number(u.place_count),
        })),
        wikimediaImages,
        stockImages,
        aiSuspectImages,
        invalidCloudinaryPattern: invalidCloudinary,
        placesWithContact,
        placesWithTimings,
        placesWithTicket,
        curatedUnsplash,
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
