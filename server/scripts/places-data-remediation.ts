/**
 * PalSafar production data remediation (Places only).
 *
 * Usage:
 *   npx ts-node scripts/places-data-remediation.ts --dry-run
 *   npx ts-node scripts/places-data-remediation.ts --apply
 */
import { prisma } from '../src/config/database';

const STOCK_IMAGE_RE =
  /unsplash|pexels|pixabay|freepik|picsum|loremflickr|dummyimage|placehold\.it|via\.placeholder/i;

/** Exact or prefix junk names — never match legitimate OSM generic names like "Temple". */
const JUNK_NAME_SQL = `
  LOWER(TRIM(name)) IN ('sample', 'test', 'dummy', 'placeholder', 'foobar', 'test place', 'dummy place', 'fake', 'lorem ipsum')
  OR slug ILIKE 'bulk-place%'
  OR (LENGTH(TRIM(name)) <= 6 AND LOWER(TRIM(name)) IN ('sample', 'test', 'dummy', 'fake'))
`;

type PhaseResult = {
  phase: string;
  dryRun: boolean;
  matched: number;
  affected: number;
  details?: unknown;
};

async function countUnsplashPlaces(): Promise<number> {
  const rows = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(DISTINCT p.id)::bigint AS count
    FROM places p
    WHERE p.merged_into_id IS NULL
      AND (
        EXISTS (
          SELECT 1 FROM unnest(p.images) img
          WHERE img ~* 'unsplash|pexels|pixabay|freepik|picsum|loremflickr|dummyimage|placehold'
        )
        OR p.thumbnail ~* 'unsplash|pexels|pixabay|freepik|picsum|loremflickr|dummyimage|placehold'
      )
  `;
  return Number(rows[0]?.count ?? 0);
}

async function countJunkPlaces(): Promise<{ count: number; rows: unknown[] }> {
  const rows = await prisma.$queryRaw<
    { id: string; name: string; slug: string; source: string }[]
  >`
    SELECT id, name, slug, source::text AS source
    FROM places
    WHERE merged_into_id IS NULL
      AND (
        LOWER(TRIM(name)) IN (
          'sample', 'test', 'dummy', 'placeholder', 'foobar',
          'test place', 'dummy place', 'fake', 'lorem ipsum'
        )
        OR slug ILIKE 'bulk-place%'
        OR (LENGTH(TRIM(name)) <= 6 AND LOWER(TRIM(name)) IN ('sample', 'test', 'dummy', 'fake'))
      )
  `;
  return { count: rows.length, rows };
}

async function countCategoryNormalizations(): Promise<number> {
  const rows = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*)::bigint AS count
    FROM places
    WHERE merged_into_id IS NULL AND category <> LOWER(category)
  `;
  return Number(rows[0]?.count ?? 0);
}

async function removeStockImages(dryRun: boolean): Promise<PhaseResult> {
  const matched = await countUnsplashPlaces();

  if (dryRun) {
    return { phase: 'remove_stock_images', dryRun: true, matched, affected: 0 };
  }

  // Clear thumbnail when stock; strip stock URLs from images array; empty array if all stock.
  const affected = await prisma.$executeRaw`
    UPDATE places p
    SET
      thumbnail = CASE
        WHEN p.thumbnail ~* 'unsplash|pexels|pixabay|freepik|picsum|loremflickr|dummyimage|placehold'
        THEN NULL
        ELSE p.thumbnail
      END,
      images = COALESCE(
        (
          SELECT array_agg(img ORDER BY ord)
          FROM (
            SELECT img, ord
            FROM unnest(p.images) WITH ORDINALITY AS t(img, ord)
            WHERE img !~* 'unsplash|pexels|pixabay|freepik|picsum|loremflickr|dummyimage|placehold'
          ) kept
        ),
        '{}'::text[]
      )
    WHERE p.merged_into_id IS NULL
      AND (
        EXISTS (
          SELECT 1 FROM unnest(p.images) img
          WHERE img ~* 'unsplash|pexels|pixabay|freepik|picsum|loremflickr|dummyimage|placehold'
        )
        OR p.thumbnail ~* 'unsplash|pexels|pixabay|freepik|picsum|loremflickr|dummyimage|placehold'
      )
  `;

  // Also remove stock rows from place_images table (not architecture — data cleanup).
  const placeImagesCleared = await prisma.$executeRaw`
    DELETE FROM place_images
    WHERE url ~* 'unsplash|pexels|pixabay|freepik|picsum|loremflickr|dummyimage|placehold'
  `;

  return {
    phase: 'remove_stock_images',
    dryRun: false,
    matched,
    affected: Number(affected),
    details: { placeImagesDeleted: Number(placeImagesCleared) },
  };
}

async function removeSyntheticRatings(dryRun: boolean): Promise<PhaseResult> {
  const matched = await prisma.place.count({
    where: {
      reviewCount: 0,
      OR: [{ rating: { not: null } }, { bayesianRating: { not: null } }, { popularityScore: { not: null } }],
    },
  });

  if (dryRun) {
    return { phase: 'remove_synthetic_ratings', dryRun: true, matched, affected: 0 };
  }

  const result = await prisma.place.updateMany({
    where: {
      reviewCount: 0,
      OR: [{ rating: { not: null } }, { bayesianRating: { not: null } }, { popularityScore: { not: null } }],
    },
    data: {
      rating: null,
      bayesianRating: null,
      popularityScore: null,
    },
  });

  return { phase: 'remove_synthetic_ratings', dryRun: false, matched, affected: result.count };
}

async function deleteJunkPlaces(dryRun: boolean): Promise<PhaseResult> {
  const { count, rows } = await countJunkPlaces();

  if (dryRun) {
    return { phase: 'delete_junk_places', dryRun: true, matched: count, affected: 0, details: rows };
  }

  const result = await prisma.$executeRaw`
    DELETE FROM places
    WHERE merged_into_id IS NULL
      AND (
        LOWER(TRIM(name)) IN (
          'sample', 'test', 'dummy', 'placeholder', 'foobar',
          'test place', 'dummy place', 'fake', 'lorem ipsum'
        )
        OR slug ILIKE 'bulk-place%'
        OR (LENGTH(TRIM(name)) <= 6 AND LOWER(TRIM(name)) IN ('sample', 'test', 'dummy', 'fake'))
      )
  `;

  return { phase: 'delete_junk_places', dryRun: false, matched: count, affected: Number(result), details: rows };
}

async function normalizeCategories(dryRun: boolean): Promise<PhaseResult> {
  const matched = await countCategoryNormalizations();

  if (dryRun) {
    return { phase: 'normalize_categories', dryRun: true, matched, affected: 0 };
  }

  const affected = await prisma.$executeRaw`
    UPDATE places
    SET category = LOWER(category)
    WHERE merged_into_id IS NULL AND category <> LOWER(category)
  `;

  return { phase: 'normalize_categories', dryRun: false, matched, affected: Number(affected) };
}

async function postValidation() {
  const [
    totalPlaces,
    unsplashRemaining,
    syntheticRatingsRemaining,
    missingImages,
    emptyDescription,
    junkRemaining,
    nonLowerCategories,
  ] = await Promise.all([
    prisma.place.count({ where: { mergedIntoId: null } }),
    countUnsplashPlaces(),
    prisma.place.count({
      where: {
        reviewCount: 0,
        OR: [{ rating: { not: null } }, { bayesianRating: { not: null } }],
      },
    }),
    prisma.place.count({
      where: { mergedIntoId: null, images: { equals: [] }, thumbnail: null },
    }),
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count FROM places
      WHERE merged_into_id IS NULL AND TRIM(description) = ''
    `.then((r) => Number(r[0]?.count ?? 0)),
    countJunkPlaces().then((j) => j.count),
    countCategoryNormalizations(),
  ]);

  return {
    totalPlaces,
    unsplashRemaining,
    syntheticRatingsRemaining,
    missingImages,
    emptyDescription,
    junkRemaining,
    nonLowerCategories,
  };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--apply');

  if (dryRun) {
    console.log('=== PRE-REMEDIATION REPORT (dry-run) ===\n');
  } else {
    console.log('=== APPLYING DATA REMEDIATION ===\n');
  }

  const pre = {
    unsplashPlaces: await countUnsplashPlaces(),
    syntheticRatings: await prisma.place.count({
      where: {
        reviewCount: 0,
        OR: [{ rating: { not: null } }, { bayesianRating: { not: null } }],
      },
    }),
    junkPlaces: await countJunkPlaces(),
    categoryNormalizations: await countCategoryNormalizations(),
    totalPlaces: await prisma.place.count({ where: { mergedIntoId: null } }),
  };

  console.log(JSON.stringify({ preRemediation: pre }, null, 2));

  if (pre.junkPlaces.count > 100) {
    console.error(
      `\nSTOP: Junk place deletion would affect ${pre.junkPlaces.count} records (>100). Manual confirmation required.`,
    );
    console.error(JSON.stringify(pre.junkPlaces.rows.slice(0, 50), null, 2));
    process.exit(2);
  }

  const results: PhaseResult[] = [];

  results.push(await removeStockImages(dryRun));
  results.push(await removeSyntheticRatings(dryRun));
  results.push(await deleteJunkPlaces(dryRun));
  results.push(await normalizeCategories(dryRun));

  const post = dryRun ? null : await postValidation();

  const report = {
    mode: dryRun ? 'dry-run' : 'applied',
    timestamp: new Date().toISOString(),
    preRemediation: pre,
    phases: results,
    postValidation: post,
    summary: dryRun
      ? {
          imagesToRemove: pre.unsplashPlaces,
          ratingsToRemove: pre.syntheticRatings,
          placesToDelete: pre.junkPlaces.count,
          categoriesToNormalize: pre.categoryNormalizations,
        }
      : {
          imagesRemoved: results.find((r) => r.phase === 'remove_stock_images')?.affected ?? 0,
          ratingsRemoved: results.find((r) => r.phase === 'remove_synthetic_ratings')?.affected ?? 0,
          invalidPlacesDeleted: results.find((r) => r.phase === 'delete_junk_places')?.affected ?? 0,
          categoryNormalizations: results.find((r) => r.phase === 'normalize_categories')?.affected ?? 0,
          remaining: post,
        },
  };

  console.log('\n=== REMEDIATION REPORT ===\n');
  console.log(JSON.stringify(report, null, 2));

  if (dryRun) {
    console.log('\nRe-run with --apply to execute remediation.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
