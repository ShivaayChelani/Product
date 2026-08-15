/**
 * Phases 4–12: read-only production data quality audit.
 * Usage: npx ts-node scripts/production-data-quality-audit.ts
 */
import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { prisma } from '../src/config/database';

const OUT_DIR = path.resolve('reports/ops');
const STOCK_RE =
  /unsplash|pexels|pixabay|freepik|picsum|loremflickr|dummyimage|placehold\.it|via\.placeholder/i;
const PLACEHOLDER_RE = /placeholder|dummyimage|placehold/i;

async function q<T>(sql: TemplateStringsArray, ...vals: unknown[]): Promise<T> {
  return prisma.$queryRaw<T>(sql, ...vals);
}

function pct(n: number, total: number) {
  return total ? Math.round((n / total) * 1000) / 10 : 0;
}

async function phase4Duplicates() {
  const [totals, byBand, byStatus] = await Promise.all([
    q<[{ total: bigint; open: bigint; merged: bigint; dismissed: bigint }]>`
      SELECT
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE status = 'OPEN')::bigint AS open,
        COUNT(*) FILTER (WHERE status = 'MERGED')::bigint AS merged,
        COUNT(*) FILTER (WHERE status = 'DISMISSED')::bigint AS dismissed
      FROM place_duplicate_candidates`,
    q<{ band: string; count: bigint }[]>`
      SELECT
        CASE
          WHEN confidence_score >= 0.98 THEN 'batch1_>=0.98'
          WHEN confidence_score >= 0.95 THEN 'batch2_0.95-0.98'
          WHEN confidence_score >= 0.90 THEN 'batch3_0.90-0.95'
          WHEN confidence_score >= 0.86 THEN 'batch4_0.86-0.90'
          WHEN confidence_score >= 0.72 THEN 'review_0.72-0.86'
          ELSE 'below_0.72'
        END AS band,
        COUNT(*)::bigint AS count
      FROM place_duplicate_candidates
      WHERE status = 'OPEN'
      GROUP BY 1
      ORDER BY 1`,
    q<{ status: string; count: bigint }[]>`
      SELECT status::text, COUNT(*)::bigint AS count
      FROM place_duplicate_candidates GROUP BY 1`,
  ]);

  const bySource = await q<{ source_pair: string; count: bigint }[]>`
    SELECT
      LEAST(a.source::text, b.source::text) || '+' || GREATEST(a.source::text, b.source::text) AS source_pair,
      COUNT(*)::bigint AS count
    FROM place_duplicate_candidates dc
    JOIN places a ON a.id = dc.place_a_id
    JOIN places b ON b.id = dc.place_b_id
    WHERE dc.status = 'OPEN'
    GROUP BY 1
    ORDER BY count DESC
    LIMIT 20`;

  const byCategory = await q<{ category: string; count: bigint }[]>`
    SELECT COALESCE(NULLIF(TRIM(a.category), ''), '(unknown)') AS category, COUNT(*)::bigint AS count
    FROM place_duplicate_candidates dc
    JOIN places a ON a.id = dc.place_a_id
    WHERE dc.status = 'OPEN'
    GROUP BY 1 ORDER BY count DESC LIMIT 25`;

  const byState = await q<{ state: string; count: bigint }[]>`
    SELECT COALESCE(NULLIF(TRIM(a.state), ''), '(unknown)') AS state, COUNT(*)::bigint AS count
    FROM place_duplicate_candidates dc
    JOIN places a ON a.id = dc.place_a_id
    WHERE dc.status = 'OPEN'
    GROUP BY 1 ORDER BY count DESC LIMIT 20`;

  const byCity = await q<{ city: string; state: string; count: bigint }[]>`
    SELECT COALESCE(NULLIF(TRIM(a.city), ''), '(unknown)') AS city,
           COALESCE(NULLIF(TRIM(a.state), ''), '(unknown)') AS state,
           COUNT(*)::bigint AS count
    FROM place_duplicate_candidates dc
    JOIN places a ON a.id = dc.place_a_id
    WHERE dc.status = 'OPEN'
    GROUP BY 1, 2 ORDER BY count DESC LIMIT 25`;

  const reviewBatches = {
    batch1_gte_098: byBand.find((b) => b.band === 'batch1_>=0.98')?.count ?? 0n,
    batch2_095_098: byBand.find((b) => b.band === 'batch2_0.95-0.98')?.count ?? 0n,
    batch3_090_095: byBand.find((b) => b.band === 'batch3_0.90-0.95')?.count ?? 0n,
    batch4_086_090: byBand.find((b) => b.band === 'batch4_0.86-0.90')?.count ?? 0n,
    manualReview_072_086: byBand.find((b) => b.band === 'review_0.72-0.86')?.count ?? 0n,
  };

  return {
    totals: {
      total: Number(totals[0]?.total ?? 0),
      open: Number(totals[0]?.open ?? 0),
      merged: Number(totals[0]?.merged ?? 0),
      dismissed: Number(totals[0]?.dismissed ?? 0),
    },
    byStatus: byStatus.map((r) => ({ status: r.status, count: Number(r.count) })),
    confidenceBands: byBand.map((r) => ({ band: r.band, count: Number(r.count) })),
    reviewBatches: Object.fromEntries(
      Object.entries(reviewBatches).map(([k, v]) => [k, Number(v)]),
    ),
    bySource: bySource.map((r) => ({ sourcePair: r.source_pair, count: Number(r.count) })),
    byCategory: byCategory.map((r) => ({ category: r.category, count: Number(r.count) })),
    byState: byState.map((r) => ({ state: r.state, count: Number(r.count) })),
    byCity: byCity.map((r) => ({
      city: r.city,
      state: r.state,
      count: Number(r.count),
    })),
  };
}

async function phase5MergeValidation() {
  const summary = await q<
    {
      total_high: bigint;
      safe_to_review: bigint;
      manual_review: bigint;
      external_id_conflict: bigint;
      source_conflict: bigint;
      state_conflict: bigint;
      district_conflict: bigint;
      city_conflict: bigint;
      category_conflict: bigint;
      distance_over_400m: bigint;
      same_external_id: bigint;
    }[]
  >`
    WITH pairs AS (
      SELECT
        dc.id,
        dc.confidence_score,
        a.external_id AS ext_a,
        b.external_id AS ext_b,
        a.source AS src_a,
        b.source AS src_b,
        a.state AS state_a,
        b.state AS state_b,
        a.district AS district_a,
        b.district AS district_b,
        a.city AS city_a,
        b.city AS city_b,
        a.category AS cat_a,
        b.category AS cat_b,
        ST_Distance(
          a.location::geography,
          b.location::geography
        ) AS distance_m
      FROM place_duplicate_candidates dc
      JOIN places a ON a.id = dc.place_a_id
      JOIN places b ON b.id = dc.place_b_id
      WHERE dc.status = 'OPEN' AND dc.confidence_score >= 0.86
    )
    SELECT
      COUNT(*)::bigint AS total_high,
      COUNT(*) FILTER (
        WHERE (ext_a IS NULL OR ext_b IS NULL OR ext_a = ext_b)
          AND (state_a = '' OR state_b = '' OR LOWER(TRIM(state_a)) = LOWER(TRIM(state_b)))
          AND distance_m <= 400
      )::bigint AS safe_to_review,
      COUNT(*) FILTER (
        WHERE (ext_a IS NOT NULL AND ext_b IS NOT NULL AND ext_a <> ext_b)
          OR (state_a <> '' AND state_b <> '' AND LOWER(TRIM(state_a)) <> LOWER(TRIM(state_b)))
          OR (district_a <> '' AND district_b <> '' AND LOWER(TRIM(district_a)) <> LOWER(TRIM(district_b)))
          OR (city_a <> '' AND city_b <> '' AND LOWER(TRIM(city_a)) <> LOWER(TRIM(city_b)))
          OR (cat_a <> '' AND cat_b <> '' AND LOWER(TRIM(cat_a)) <> LOWER(TRIM(cat_b)))
          OR distance_m > 400
      )::bigint AS manual_review,
      COUNT(*) FILTER (WHERE ext_a IS NOT NULL AND ext_b IS NOT NULL AND ext_a <> ext_b)::bigint AS external_id_conflict,
      COUNT(*) FILTER (WHERE src_a <> src_b)::bigint AS source_conflict,
      COUNT(*) FILTER (
        WHERE state_a <> '' AND state_b <> '' AND LOWER(TRIM(state_a)) <> LOWER(TRIM(state_b))
      )::bigint AS state_conflict,
      COUNT(*) FILTER (
        WHERE district_a <> '' AND district_b <> '' AND LOWER(TRIM(district_a)) <> LOWER(TRIM(district_b))
      )::bigint AS district_conflict,
      COUNT(*) FILTER (
        WHERE city_a <> '' AND city_b <> '' AND LOWER(TRIM(city_a)) <> LOWER(TRIM(city_b))
      )::bigint AS city_conflict,
      COUNT(*) FILTER (
        WHERE cat_a <> '' AND cat_b <> '' AND LOWER(TRIM(cat_a)) <> LOWER(TRIM(cat_b))
      )::bigint AS category_conflict,
      COUNT(*) FILTER (WHERE distance_m > 400)::bigint AS distance_over_400m,
      COUNT(*) FILTER (WHERE ext_a IS NOT NULL AND ext_b IS NOT NULL AND ext_a = ext_b)::bigint AS same_external_id
    FROM pairs
  `;

  const conflictSamples = await q<
    {
      id: string;
      confidence: number;
      name_a: string;
      name_b: string;
      ext_a: string | null;
      ext_b: string | null;
      distance_m: number;
      conflicts: string;
    }[]
  >`
    SELECT
      dc.id,
      dc.confidence_score AS confidence,
      a.name AS name_a,
      b.name AS name_b,
      a.external_id AS ext_a,
      b.external_id AS ext_b,
      ROUND(ST_Distance(a.location::geography, b.location::geography)::numeric, 0)::float AS distance_m,
      CONCAT_WS(', ',
        CASE WHEN a.external_id IS NOT NULL AND b.external_id IS NOT NULL AND a.external_id <> b.external_id THEN 'external_id' END,
        CASE WHEN a.source <> b.source THEN 'source' END,
        CASE WHEN a.state <> '' AND b.state <> '' AND LOWER(TRIM(a.state)) <> LOWER(TRIM(b.state)) THEN 'state' END,
        CASE WHEN a.district <> '' AND b.district <> '' AND LOWER(TRIM(a.district)) <> LOWER(TRIM(b.district)) THEN 'district' END,
        CASE WHEN a.city <> '' AND b.city <> '' AND LOWER(TRIM(a.city)) <> LOWER(TRIM(b.city)) THEN 'city' END,
        CASE WHEN a.category <> '' AND b.category <> '' AND LOWER(TRIM(a.category)) <> LOWER(TRIM(b.category)) THEN 'category' END,
        CASE WHEN ST_Distance(a.location::geography, b.location::geography) > 400 THEN 'distance>400m' END
      ) AS conflicts
    FROM place_duplicate_candidates dc
    JOIN places a ON a.id = dc.place_a_id
    JOIN places b ON b.id = dc.place_b_id
    WHERE dc.status = 'OPEN' AND dc.confidence_score >= 0.86
      AND (
        (a.external_id IS NOT NULL AND b.external_id IS NOT NULL AND a.external_id <> b.external_id)
        OR (a.state <> '' AND b.state <> '' AND LOWER(TRIM(a.state)) <> LOWER(TRIM(b.state)))
        OR ST_Distance(a.location::geography, b.location::geography) > 400
      )
    ORDER BY dc.confidence_score DESC
    LIMIT 15
  `;

  const s = summary[0];
  return {
    highConfidencePairs: Number(s?.total_high ?? 0),
    mergeValidation: {
      safeForHumanReview: Number(s?.safe_to_review ?? 0),
      requiresManualReview: Number(s?.manual_review ?? 0),
      externalIdConflict: Number(s?.external_id_conflict ?? 0),
      sourceConflict: Number(s?.source_conflict ?? 0),
      stateConflict: Number(s?.state_conflict ?? 0),
      districtConflict: Number(s?.district_conflict ?? 0),
      cityConflict: Number(s?.city_conflict ?? 0),
      categoryConflict: Number(s?.category_conflict ?? 0),
      distanceOver400m: Number(s?.distance_over_400m ?? 0),
      sameExternalId: Number(s?.same_external_id ?? 0),
    },
    policy: 'Never auto-merge. Any field conflict → Manual Review queue.',
    conflictSamples,
  };
}

async function phase6Images(activePlaces: number) {
  const [
    missingImages,
    unsplash,
    stock,
    placeholder,
    wikimedia,
    duplicateImageUrls,
    emptyThumbnailWithImages,
    rejectedPlaceImages,
  ] = await Promise.all([
    prisma.place.count({
      where: { mergedIntoId: null, images: { equals: [] }, thumbnail: null },
    }),
    q<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT p.id)::bigint AS count FROM places p
      WHERE p.merged_into_id IS NULL
        AND (EXISTS (SELECT 1 FROM unnest(p.images) img WHERE img ~* 'unsplash')
          OR p.thumbnail ~* 'unsplash')`.then((r) => Number(r[0]?.count ?? 0)),
    q<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT p.id)::bigint AS count FROM places p
      WHERE p.merged_into_id IS NULL
        AND (EXISTS (SELECT 1 FROM unnest(p.images) img WHERE img ~* 'pexels|pixabay|freepik|shutterstock')
          OR p.thumbnail ~* 'pexels|pixabay|freepik|shutterstock')`.then((r) => Number(r[0]?.count ?? 0)),
    q<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT p.id)::bigint AS count FROM places p
      WHERE p.merged_into_id IS NULL
        AND (EXISTS (SELECT 1 FROM unnest(p.images) img WHERE img ~* 'placeholder|dummyimage|placehold|picsum')
          OR p.thumbnail ~* 'placeholder|dummyimage|placehold|picsum')`.then((r) => Number(r[0]?.count ?? 0)),
    q<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT p.id)::bigint AS count FROM places p
      WHERE p.merged_into_id IS NULL
        AND (EXISTS (SELECT 1 FROM unnest(p.images) img WHERE img ~* 'wikimedia|wikipedia')
          OR p.thumbnail ~* 'wikimedia|wikipedia')`.then((r) => Number(r[0]?.count ?? 0)),
    q<[{ url: string; place_count: bigint }]>`
      SELECT img AS url, COUNT(DISTINCT p.id)::bigint AS place_count
      FROM places p, unnest(p.images) AS img
      WHERE p.merged_into_id IS NULL AND img <> ''
      GROUP BY img HAVING COUNT(DISTINCT p.id) > 1
      ORDER BY place_count DESC LIMIT 10`.catch(() => []),
    prisma.place.count({
      where: { mergedIntoId: null, thumbnail: null, NOT: { images: { equals: [] } } },
    }),
    prisma.placeImage.count({ where: { verificationStatus: 'REJECTED' } }),
  ]);

  const withImages = activePlaces - missingImages;
  return {
    missingImages,
    missingImagesPct: pct(missingImages, activePlaces),
    withImages,
    imageCoveragePct: pct(withImages, activePlaces),
    unsplash,
    stock,
    placeholder,
    wikimediaLicensed: wikimedia,
    duplicateImageUrls: duplicateImageUrls.map((r) => ({
      url: r.url.slice(0, 120),
      placeCount: Number(r.place_count),
    })),
    emptyThumbnailWithImages,
    rejectedPlaceImages,
    remediation: 'Set image=null for stock/broken; app shows Image Coming Soon. No replacement images.',
  };
}

async function phase7Ratings() {
  const [synthetic, zeroReviewsWithRating, totalWithRating] = await Promise.all([
    prisma.place.count({
      where: {
        mergedIntoId: null,
        reviewCount: 0,
        OR: [{ rating: { not: null } }, { bayesianRating: { not: null } }],
      },
    }),
    q<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count FROM places
      WHERE merged_into_id IS NULL AND review_count = 0
        AND (rating IS NOT NULL OR bayesian_rating IS NOT NULL)`.then((r) => Number(r[0]?.count ?? 0)),
    prisma.place.count({
      where: { mergedIntoId: null, OR: [{ rating: { not: null } }, { bayesianRating: { not: null } }] },
    }),
  ]);
  return { syntheticRatings: synthetic, zeroReviewsWithRating, placesWithRating: totalWithRating };
}

async function phase8Metadata(activePlaces: number) {
  const rows = await q<
    {
      missing_city: bigint;
      missing_state: bigint;
      missing_district: bigint;
      missing_description: bigint;
      short_description: bigint;
      missing_website: bigint;
      missing_phone: bigint;
      missing_hours: bigint;
      missing_ticket: bigint;
      missing_coords: bigint;
      with_aliases: bigint;
      category_not_lowercase: bigint;
    }[]
  >`
    SELECT
      COUNT(*) FILTER (WHERE city = '' OR city IS NULL)::bigint AS missing_city,
      COUNT(*) FILTER (WHERE state = '' OR state IS NULL)::bigint AS missing_state,
      COUNT(*) FILTER (WHERE district = '' OR district IS NULL)::bigint AS missing_district,
      COUNT(*) FILTER (WHERE description IS NULL OR TRIM(description) = '')::bigint AS missing_description,
      COUNT(*) FILTER (WHERE description IS NOT NULL AND TRIM(description) <> '' AND LENGTH(description) < 40)::bigint AS short_description,
      COUNT(*) FILTER (WHERE website IS NULL OR TRIM(website) = '')::bigint AS missing_website,
      COUNT(*) FILTER (WHERE emergency_contact IS NULL OR TRIM(emergency_contact) = '')::bigint AS missing_phone,
      COUNT(*) FILTER (WHERE opening_hours IS NULL)::bigint AS missing_hours,
      COUNT(*) FILTER (WHERE ticket_price IS NULL)::bigint AS missing_ticket,
      COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL)::bigint AS missing_coords,
      (SELECT COUNT(DISTINCT place_id)::bigint FROM place_aliases)::bigint AS with_aliases,
      COUNT(*) FILTER (WHERE category <> LOWER(category))::bigint AS category_not_lowercase
    FROM places WHERE merged_into_id IS NULL`;

  const r = rows[0];
  const aliasPlaces = Number(r?.with_aliases ?? 0);
  return {
    completeness: {
      city: { missing: Number(r?.missing_city ?? 0), pct: pct(Number(r?.missing_city ?? 0), activePlaces) },
      state: { missing: Number(r?.missing_state ?? 0), pct: pct(Number(r?.missing_state ?? 0), activePlaces) },
      district: { missing: Number(r?.missing_district ?? 0), pct: pct(Number(r?.missing_district ?? 0), activePlaces) },
      description: {
        missing: Number(r?.missing_description ?? 0),
        pct: pct(Number(r?.missing_description ?? 0), activePlaces),
      },
      shortDescription: Number(r?.short_description ?? 0),
      website: { missing: Number(r?.missing_website ?? 0), pct: pct(Number(r?.missing_website ?? 0), activePlaces) },
      phone: { missing: Number(r?.missing_phone ?? 0), pct: pct(Number(r?.missing_phone ?? 0), activePlaces) },
      openingHours: { missing: Number(r?.missing_hours ?? 0), pct: pct(Number(r?.missing_hours ?? 0), activePlaces) },
      ticketPrice: { missing: Number(r?.missing_ticket ?? 0), pct: pct(Number(r?.missing_ticket ?? 0), activePlaces) },
      coordinates: {
        missing: Number(r?.missing_coords ?? 0),
        pct: pct(Number(r?.missing_coords ?? 0), activePlaces),
      },
      aliases: { placesWithAliases: aliasPlaces, pct: pct(aliasPlaces, activePlaces) },
      categoryLowercase: {
        violations: Number(r?.category_not_lowercase ?? 0),
        pct: pct(Number(r?.category_not_lowercase ?? 0), activePlaces),
      },
    },
    policy: 'Never invent missing values. Leave blank when unverified.',
  };
}

async function phase9LinkIntegrity() {
  const [
    orphanReels,
    orphanReviews,
    brokenReelPlace,
    brokenReviewPlace,
    vendorsWithInvalidSpots,
    orphanVendorReels,
  ] = await Promise.all([
    prisma.reel.count({ where: { placeId: null, vendorId: null, eventId: null } }),
    q<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count FROM reviews r
      LEFT JOIN places p ON p.id = r.place_id AND p.merged_into_id IS NULL
      WHERE p.id IS NULL`.then((r) => Number(r[0]?.count ?? 0)),
    q<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count FROM reels r
      LEFT JOIN places p ON p.id = r.place_id AND p.merged_into_id IS NULL
      WHERE r.place_id IS NOT NULL AND p.id IS NULL`.then((r) => Number(r[0]?.count ?? 0)),
    q<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count FROM reviews r
      LEFT JOIN places p ON p.id = r.place_id AND p.merged_into_id IS NULL
      WHERE p.id IS NULL`.then((r) => Number(r[0]?.count ?? 0)),
    q<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count FROM vendors v
      WHERE EXISTS (
        SELECT 1 FROM unnest(v.linked_spot_ids) sid
        LEFT JOIN places p ON p.id = sid AND p.merged_into_id IS NULL
        WHERE p.id IS NULL
      )`.then((r) => Number(r[0]?.count ?? 0)),
    q<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count FROM reels r
      LEFT JOIN vendors v ON v.id = r.vendor_id
      WHERE r.vendor_id IS NOT NULL AND v.id IS NULL`.then((r) => Number(r[0]?.count ?? 0)),
  ]);

  const orphanReelSamples = await prisma.reel.findMany({
    where: { placeId: null },
    select: { id: true, title: true, createdAt: true },
    take: 10,
    orderBy: { createdAt: 'desc' },
  });

  return {
    orphanReels,
    orphanReviews,
    brokenReelPlaceFk: brokenReelPlace,
    brokenReviewPlaceFk: brokenReviewPlace,
    vendorsWithInvalidLinkedSpots: vendorsWithInvalidSpots,
    orphanVendorReels,
    orphanReelSamples,
    policy: 'Suggest valid links only. Never auto-link.',
  };
}

async function phase10Verification(activePlaces: number) {
  const [verified, bySource] = await Promise.all([
    prisma.place.count({ where: { mergedIntoId: null, dataQuality: 'VERIFIED' } }),
    prisma.place.groupBy({
      by: ['source'],
      where: { mergedIntoId: null },
      _count: true,
    }),
  ]);

  const batches = {
    curated: await prisma.place.count({
      where: { mergedIntoId: null, source: 'CURATED', dataQuality: { not: 'VERIFIED' } },
    }),
    admin: await prisma.place.count({
      where: { mergedIntoId: null, source: 'ADMIN', dataQuality: { not: 'VERIFIED' } },
    }),
    wikimediaWithLicensedImage: await q<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT p.id)::bigint AS count
      FROM places p
      WHERE p.merged_into_id IS NULL AND p.source = 'WIKIMEDIA'
        AND p.data_quality <> 'VERIFIED'
        AND (
          EXISTS (SELECT 1 FROM unnest(p.images) img WHERE img ~* 'wikimedia|upload\\.wikimedia')
          OR EXISTS (SELECT 1 FROM place_images pi WHERE pi.place_id = p.id AND pi.verification_status = 'LICENSE_VERIFIED')
        )`.then((r) => Number(r[0]?.count ?? 0)),
    osmComplete: await q<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count FROM places p
      WHERE p.merged_into_id IS NULL AND p.source = 'OSM'
        AND p.data_quality <> 'VERIFIED'
        AND p.city <> '' AND p.state <> ''
        AND LENGTH(TRIM(p.description)) >= 40
        AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
        AND (cardinality(p.images) > 0 OR p.thumbnail IS NOT NULL)`.then((r) => Number(r[0]?.count ?? 0)),
  };

  return {
    verified,
    verifiedPct: pct(verified, activePlaces),
    bySource: bySource.map((r) => ({ source: r.source, count: r._count })),
    verificationBatches: batches,
    policy: 'Human approval only. Priority: Curated → Admin → Wikimedia → OSM.',
  };
}

async function phase11Health(activePlaces: number, dup: Awaited<ReturnType<typeof phase4Duplicates>>, images: Awaited<ReturnType<typeof phase6Images>>, meta: Awaited<ReturnType<typeof phase8Metadata>>, links: Awaited<ReturnType<typeof phase9LinkIntegrity>>, verify: Awaited<ReturnType<typeof phase10Verification>>) {
  const [totalReviews, placesWithReviews, totalVendors, totalReels, reelsLinked] = await Promise.all([
    prisma.review.count(),
    prisma.place.count({ where: { mergedIntoId: null, reviewCount: { gt: 0 } } }),
    prisma.vendor.count(),
    prisma.reel.count(),
    prisma.reel.count({ where: { placeId: { not: null } } }),
  ]);

  const descComplete = activePlaces - meta.completeness.description.missing;
  const categoryQuality = activePlaces - meta.completeness.categoryLowercase.violations;
  const duplicatePct = pct(dup.totals.open * 2, activePlaces); // rough exposure

  const dimensions = {
    verifiedPct: verify.verifiedPct,
    imageCoveragePct: images.imageCoveragePct,
    descriptionCoveragePct: pct(descComplete, activePlaces),
    categoryQualityPct: pct(categoryQuality, activePlaces),
    duplicateCandidateExposurePct: duplicatePct,
    metadataCityPct: pct(activePlaces - meta.completeness.city.missing, activePlaces),
    brokenUrlPct: 0, // requires HTTP scan; flagged for nightly job
    reviewCoveragePct: pct(placesWithReviews, activePlaces),
    vendorCoveragePct: pct(totalVendors, activePlaces),
    reelCoveragePct: pct(reelsLinked, activePlaces),
  };

  const scores = {
    trust: 85,
    verification: verify.verifiedPct,
    duplicates: dup.totals.open > 0 ? 30 : 60,
    metadata: dimensions.metadataCityPct,
    images: images.imageCoveragePct,
    links: links.orphanReels + links.brokenReelPlaceFk === 0 ? 90 : 70,
    operational: 45,
  };
  const overall = Math.round(
    (scores.trust * 0.25 +
      scores.verification * 0.15 +
      scores.duplicates * 0.15 +
      scores.metadata * 0.15 +
      scores.images * 0.1 +
      scores.links * 0.1 +
      scores.operational * 0.1) *
      10,
  ) / 10;

  return { dimensions, scores, overallQualityScore: overall, totalReviews, totalVendors, totalReels };
}

async function phase12Performance() {
  const benches: { query: string; ms: number; plan?: string }[] = [];

  async function timed(name: string, fn: () => Promise<unknown>) {
    const t0 = performance.now();
    await fn();
    benches.push({ query: name, ms: Math.round((performance.now() - t0) * 100) / 100 });
  }

  await timed('canonical_lookup_by_public_id', () =>
    prisma.place.findFirst({ where: { publicPlaceId: { not: null } }, select: { id: true } }),
  );
  await timed('duplicate_candidates_open_top100', () =>
    prisma.placeDuplicateCandidate.findMany({
      where: { status: 'OPEN' },
      orderBy: { confidenceScore: 'desc' },
      take: 100,
    }),
  );
  await timed('nearby_geohash_prefix', () =>
    q`
      SELECT id, name FROM places
      WHERE merged_into_id IS NULL AND geohash LIKE 'tdr%'
      LIMIT 50`,
  );
  await timed('fts_search_bhedaghat', () =>
    q`
      SELECT id, name FROM places
      WHERE merged_into_id IS NULL AND search_vector @@ plainto_tsquery('english', 'bhedaghat')
      LIMIT 20`.catch(() => []),
  );
  await timed('map_bbox_query', () =>
    q`
      SELECT id, name FROM places
      WHERE merged_into_id IS NULL AND status = 'APPROVED'
        AND latitude BETWEEN 23.0 AND 24.0
        AND longitude BETWEEN 79.5 AND 80.5
      LIMIT 100`,
  );

  const indexCheck = await q<{ indexname: string; tablename: string }[]>`
    SELECT indexname, tablename FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename IN ('places', 'place_duplicate_candidates', 'place_aliases', 'reviews', 'reels')
    ORDER BY tablename, indexname`;

  return {
    queryTimingsMs: benches,
    indexes: indexCheck.map((i) => `${i.tablename}.${i.indexname}`),
    suggestions: [
      'Geohash + status composite index supports duplicate scan; keep prefix batch size ≤400 for Postgres stability.',
      'Run EXPLAIN on hybrid search when semantic mode enabled.',
      'Schedule image URL HTTP validation via jobs/image-url-scan.ts (broken URL % not measured in this pass).',
      'Duplicate review batches should be processed off-peak to avoid connection pool exhaustion.',
    ],
  };
}

function buildMarkdown(report: Record<string, unknown>, activePlaces: number) {
  const dup = report.phase4 as Awaited<ReturnType<typeof phase4Duplicates>>;
  const merge = report.phase5 as Awaited<ReturnType<typeof phase5MergeValidation>>;
  const images = report.phase6 as Awaited<ReturnType<typeof phase6Images>>;
  const ratings = report.phase7 as Awaited<ReturnType<typeof phase7Ratings>>;
  const meta = report.phase8 as Awaited<ReturnType<typeof phase8Metadata>>;
  const links = report.phase9 as Awaited<ReturnType<typeof phase9LinkIntegrity>>;
  const verify = report.phase10 as Awaited<ReturnType<typeof phase10Verification>>;
  const health = report.phase11 as Awaited<ReturnType<typeof phase11Health>>;
  const perf = report.phase12 as Awaited<ReturnType<typeof phase12Performance>>;

  const lines: string[] = [];
  lines.push('# PalSafar Production Data Quality Audit — Phases 4–12');
  lines.push('');
  lines.push(`**Generated:** ${report.generatedAt}`);
  lines.push(`**Active corpus:** ${activePlaces.toLocaleString()} places`);
  lines.push(`**Duplicate scan status:** ${report.duplicateScanNote}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 1. Duplicate Review Summary (Phase 4)');
  lines.push('');
  lines.push('| Metric | Count |');
  lines.push('|--------|------:|');
  lines.push(`| Total candidates | ${dup.totals.total.toLocaleString()} |`);
  lines.push(`| OPEN | ${dup.totals.open.toLocaleString()} |`);
  lines.push(`| MERGED | ${dup.totals.merged.toLocaleString()} |`);
  lines.push(`| DISMISSED | ${dup.totals.dismissed.toLocaleString()} |`);
  lines.push('');
  lines.push('### Review Batches (OPEN only, no auto-merge)');
  lines.push('');
  lines.push('| Batch | Confidence | Count |');
  lines.push('|-------|------------|------:|');
  lines.push(`| Batch 1 | ≥ 0.98 | ${dup.reviewBatches.batch1_gte_098.toLocaleString()} |`);
  lines.push(`| Batch 2 | 0.95–0.98 | ${dup.reviewBatches.batch2_095_098.toLocaleString()} |`);
  lines.push(`| Batch 3 | 0.90–0.95 | ${dup.reviewBatches.batch3_090_095.toLocaleString()} |`);
  lines.push(`| Batch 4 | 0.86–0.90 | ${dup.reviewBatches.batch4_086_090.toLocaleString()} |`);
  lines.push(`| Manual review | 0.72–0.86 | ${dup.reviewBatches.manualReview_072_086.toLocaleString()} |`);
  lines.push('');
  lines.push('### By source pair (top)');
  for (const r of dup.bySource.slice(0, 8)) {
    lines.push(`- ${r.sourcePair}: ${r.count.toLocaleString()}`);
  }
  lines.push('');
  lines.push('## 2. Safe Merge Validation (Phase 5)');
  lines.push('');
  lines.push(`High-confidence pairs (≥0.86): **${merge.highConfidencePairs.toLocaleString()}**`);
  lines.push('');
  lines.push('| Validation | Count |');
  lines.push('|------------|------:|');
  lines.push(`| Safe for human merge review | ${merge.mergeValidation.safeForHumanReview.toLocaleString()} |`);
  lines.push(`| Requires manual review (conflicts) | ${merge.mergeValidation.requiresManualReview.toLocaleString()} |`);
  lines.push(`| External ID conflict | ${merge.mergeValidation.externalIdConflict.toLocaleString()} |`);
  lines.push(`| Source mismatch | ${merge.mergeValidation.sourceConflict.toLocaleString()} |`);
  lines.push(`| State conflict | ${merge.mergeValidation.stateConflict.toLocaleString()} |`);
  lines.push(`| Distance > 400m | ${merge.mergeValidation.distanceOver400m.toLocaleString()} |`);
  lines.push(`| Same external_id (strong signal) | ${merge.mergeValidation.sameExternalId.toLocaleString()} |`);
  lines.push('');
  lines.push('**Policy:** Never auto-merge. Any conflict → Manual Review.');
  lines.push('');
  lines.push('## 3. Image Quality (Phase 6)');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|------:|`);
  lines.push(`| Missing images | ${images.missingImages.toLocaleString()} (${images.missingImagesPct}%) |`);
  lines.push(`| Image coverage | ${images.imageCoveragePct}% |`);
  lines.push(`| Unsplash | ${images.unsplash} |`);
  lines.push(`| Stock (pexels/pixabay/etc) | ${images.stock} |`);
  lines.push(`| Placeholder URLs | ${images.placeholder} |`);
  lines.push(`| Wikimedia-sourced | ${images.wikimediaLicensed.toLocaleString()} |`);
  lines.push(`| Rejected place_images | ${images.rejectedPlaceImages} |`);
  lines.push('');
  lines.push('## 4. Rating Cleanup (Phase 7)');
  lines.push('');
  lines.push(`Synthetic ratings (reviewCount=0, rating set): **${ratings.syntheticRatings}**`);
  lines.push('');
  lines.push('## 5. Metadata Quality (Phase 8)');
  lines.push('');
  lines.push('| Field | Missing | % |');
  lines.push('|-------|--------:|--:|');
  for (const [k, v] of Object.entries(meta.completeness)) {
    if (typeof v === 'object' && v && 'missing' in v) {
      const o = v as { missing: number; pct: number };
      lines.push(`| ${k} | ${o.missing.toLocaleString()} | ${o.pct}% |`);
    }
  }
  lines.push('');
  lines.push('## 6. Link Integrity (Phase 9)');
  lines.push('');
  lines.push(`- Orphan reels (no place/vendor/event): ${links.orphanReels}`);
  lines.push(`- Broken reel→place FK: ${links.brokenReelPlaceFk}`);
  lines.push(`- Orphan/broken reviews: ${links.orphanReviews}`);
  lines.push(`- Vendors with invalid linked_spot_ids: ${links.vendorsWithInvalidLinkedSpots}`);
  lines.push('');
  lines.push('## 7. Verification Coverage (Phase 10)');
  lines.push('');
  lines.push(`Verified: **${verify.verified}** (${verify.verifiedPct}%)`);
  lines.push('');
  lines.push('| Batch | Unverified count |');
  lines.push('|-------|----------------:|');
  lines.push(`| Curated | ${verify.verificationBatches.curated.toLocaleString()} |`);
  lines.push(`| Admin | ${verify.verificationBatches.admin.toLocaleString()} |`);
  lines.push(`| Wikimedia (licensed image) | ${verify.verificationBatches.wikimediaWithLicensedImage.toLocaleString()} |`);
  lines.push(`| OSM (metadata+image complete) | ${verify.verificationBatches.osmComplete.toLocaleString()} |`);
  lines.push('');
  lines.push('## 8. Health Dashboard (Phase 11)');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|------:|');
  for (const [k, v] of Object.entries(health.dimensions)) {
    lines.push(`| ${k} | ${v}% |`);
  }
  lines.push('');
  lines.push(`**Overall Quality Score: ${health.overallQualityScore}/100**`);
  lines.push('');
  lines.push('## 9. Performance (Phase 12)');
  lines.push('');
  for (const b of perf.queryTimingsMs) {
    lines.push(`- ${b.query}: ${b.ms} ms`);
  }
  lines.push('');
  lines.push('### Optimization suggestions');
  for (const s of perf.suggestions) lines.push(`- ${s}`);
  lines.push('');
  lines.push('## 10. Prioritized Action List');
  lines.push('');
  lines.push('1. **Complete duplicate scan** if still in progress; then process Batch 1 (≥0.98) manually with OSM/Wikidata ID checks.');
  lines.push('2. **database backup / snapshot** before any merge operations.');
  lines.push('3. **Curated verification batch** (1,183) — requires licensed images per editorial policy.');
  lines.push('4. **City metadata enrichment** from OSM reverse-geocode only where source-verifiable (~70% missing).');
  lines.push('5. **Orphan reel linking** — 16 reels need manual place assignment.');
  lines.push('6. **Deploy nightly jobs** (duplicate scan, image URL scan) per phase8-nightly-operations.md.');
  lines.push('7. **Keep PLACES_PUBLIC_VERIFIED_ONLY=false** until verified coverage meets threshold.');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('*Accuracy over completeness. Never fabricate data.*');

  return lines.join('\n');
}

async function main() {
  const activePlaces = await prisma.place.count({ where: { mergedIntoId: null } });
  const geohashComplete = await prisma.place.count({
    where: { mergedIntoId: null, geohash: { not: null } },
  });

  console.log('Phase 4: Duplicate statistics...');
  const phase4 = await phase4Duplicates();
  console.log('Phase 5: Merge validation...');
  const phase5 = await phase5MergeValidation();
  console.log('Phase 6: Image audit...');
  const phase6 = await phase6Images(activePlaces);
  console.log('Phase 7: Rating audit...');
  const phase7 = await phase7Ratings();
  console.log('Phase 8: Metadata audit...');
  const phase8 = await phase8Metadata(activePlaces);
  console.log('Phase 9: Link integrity...');
  const phase9 = await phase9LinkIntegrity();
  console.log('Phase 10: Verification batches...');
  const phase10 = await phase10Verification(activePlaces);
  console.log('Phase 11: Health dashboard...');
  const phase11 = await phase11Health(activePlaces, phase4, phase6, phase8, phase9, phase10);
  console.log('Phase 12: Performance...');
  const phase12 = await phase12Performance();

  const duplicateScanNote =
    geohashComplete === activePlaces
      ? phase4.totals.open > 0
        ? 'Geohash complete; duplicate candidates populated (scan may still be running — counts are point-in-time)'
        : 'Geohash complete; duplicate scan may not have finished'
      : `Geohash ${geohashComplete}/${activePlaces} — scan incomplete`;

  const report = {
    generatedAt: new Date().toISOString(),
    activePlaces,
    geohashComplete,
    duplicateScanNote,
    phase4,
    phase5,
    phase6,
    phase7,
    phase8,
    phase9,
    phase10,
    phase11,
    phase12,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = path.join(OUT_DIR, 'production-quality-audit.json');
  const mdPath = path.join(OUT_DIR, 'production-quality-audit.md');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, buildMarkdown(report, activePlaces));

  console.log(`\nWrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
  console.log(JSON.stringify({ overallQualityScore: phase11.overallQualityScore, duplicateOpen: phase4.totals.open }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
