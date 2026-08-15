process.env.DOTENV_CONFIG_PATH = __dirname + '/../../.env';
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const INDIA_BOUNDS = { minLat: 6.5, maxLat: 37.6, minLng: 68.0, maxLng: 97.5 };

const GENERIC_RE =
  /^(ancient mound|temple|ruins|ruin|tank|fort|hill fort|stupa|park|garden|view ?point|waterfall|falls|statue|museum|market|colony park|public park|old fort|gate|monument|cave|temple complex|village|town|area|road|school|college|hospital|church|csi|mandir|mata mandir|balaji mandir|shiv mandir|shiv temple|hanuman temple|ganesh temple|durga temple|raam temple|ram temple|maa durga|kali mandir|sai baba temple|masjid|mosque|church|cross|po|crc|ntr|ysr|check post|bus stop|railway station|water tank|overhead tank|well|pond|lake|river|beach|island|point|peak|pass|valley|meadow|glacier|hot spring|hotwater|hot water spring|camp site|campsite|scout camp|trek|track|trail|hiking|bird watching|nature trail)$/i;

function isIndia(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= INDIA_BOUNDS.minLat &&
    lat <= INDIA_BOUNDS.maxLat &&
    lng >= INDIA_BOUNDS.minLng &&
    lng <= INDIA_BOUNDS.maxLng
  );
}

async function q(sql, ...vals) {
  return prisma.$queryRawUnsafe(sql, ...vals);
}

const OUT_DIR = path.resolve(__dirname, '../../reports/dbq');
fs.mkdirSync(OUT_DIR, { recursive: true });

async function main() {
  const report = { generatedAt: new Date().toISOString() };
  const t0 = Date.now();

  // ── Core totals ──────────────────────────────────────────────
  const core = await q(`
    SELECT
      COUNT(*)::int AS total_all,
      COUNT(*) FILTER (WHERE merged_into_id IS NULL)::int AS active,
      COUNT(*) FILTER (WHERE merged_into_id IS NOT NULL)::int AS merged
    FROM places`);
  const totalAll = core[0].total_all;
  const active = core[0].active;
  report.core = { totalAll, active, merged: core[0].merged };

  // ── Verified / status ────────────────────────────────────────
  const [verifiedRows, statusRows] = await Promise.all([
    q(`SELECT data_quality::text AS dq, COUNT(*)::int AS n FROM places WHERE merged_into_id IS NULL GROUP BY 1`),
    q(`SELECT status::text AS st, COUNT(*)::int AS n FROM places WHERE merged_into_id IS NULL GROUP BY 1`),
  ]);
  report.dataQuality = Object.fromEntries(verifiedRows.map((r) => [r.dq, r.n]));
  report.status = Object.fromEntries(statusRows.map((r) => [r.st, r.n]));

  // ── Missing fields ───────────────────────────────────────────
  const missing = await q(`
    SELECT
      COUNT(*) FILTER (WHERE city = '' OR city IS NULL)::int AS missing_city,
      COUNT(*) FILTER (WHERE state = '' OR state IS NULL)::int AS missing_state,
      COUNT(*) FILTER (WHERE district = '' OR district IS NULL)::int AS missing_district,
      COUNT(*) FILTER (WHERE TRIM(category) = '' OR category IS NULL)::int AS missing_category,
      COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL)::int AS missing_coords,
      COUNT(*) FILTER (WHERE description IS NULL OR TRIM(description) = '')::int AS missing_description,
      COUNT(*) FILTER (WHERE (images IS NULL OR cardinality(images) = 0) AND thumbnail IS NULL)::int AS missing_image,
      COUNT(*) FILTER (WHERE country = '' OR country IS NULL OR LOWER(country) <> 'india')::int AS missing_or_foreign_country,
      COUNT(*) FILTER (WHERE external_id IS NULL)::int AS missing_external_id,
      COUNT(*) FILTER (WHERE geohash IS NULL)::int AS missing_geohash,
      COUNT(*) FILTER (WHERE rating IS NOT NULL AND review_count = 0)::int AS synthetic_rating
    FROM places WHERE merged_into_id IS NULL`);
  report.missing = Object.fromEntries(Object.entries(missing[0]).map(([k, v]) => [k, Number(v)]));

  // ── Invalid coordinates ──────────────────────────────────────
  const invalidCoords = await q(`
    SELECT
      COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL)::int AS null_coords,
      COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL
        AND (latitude < -90 OR latitude > 90 OR longitude < -180 OR longitude > 180))::int AS out_of_range,
      COUNT(*) FILTER (WHERE latitude = 0 AND longitude = 0)::int AS zero_zero,
      COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL
        AND NOT (latitude >= 6.5 AND latitude <= 37.6 AND longitude >= 68.0 AND longitude <= 97.5))::int AS outside_india_bbox
    FROM places WHERE merged_into_id IS NULL`);
  report.invalidCoordinates = Object.fromEntries(
    Object.entries(invalidCoords[0]).map(([k, v]) => [k, Number(v)]),
  );

  // Suspect ocean points: near-zero population in bbox edges (coarse, informational)
  const oceanSuspect = await q(`
    SELECT id, name, latitude, longitude FROM places
    WHERE merged_into_id IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL
      AND (
        (longitude < 68.5 OR longitude > 97.0)
        OR (latitude < 7.0 OR latitude > 37.2)
      )
    LIMIT 20`);
  report.oceanSuspectSamples = oceanSuspect;

  // ── Duplicate external IDs ───────────────────────────────────
  const dupExtIds = await q(`
    SELECT s.external_id, COUNT(*)::int AS n,
           (SELECT array_agg(p2.name ORDER BY p2.name) FROM (SELECT name FROM places p2 WHERE p2.merged_into_id IS NULL AND p2.external_id = s.external_id LIMIT 3) p2) AS names
    FROM (SELECT external_id FROM places WHERE merged_into_id IS NULL AND external_id IS NOT NULL AND external_id <> '' GROUP BY external_id HAVING COUNT(*) > 1) s
    GROUP BY s.external_id ORDER BY n DESC LIMIT 50`);
  report.duplicateExternalIds = dupExtIds.map((r) => ({
    externalId: r.external_id,
    count: r.n,
    names: r.names,
  }));
  const dupExtTotal = await q(`
    SELECT COUNT(*)::int AS groups, COALESCE(SUM(n)::int,0) AS places
    FROM (SELECT external_id, COUNT(*) AS n FROM places
          WHERE merged_into_id IS NULL AND external_id IS NOT NULL AND external_id <> ''
          GROUP BY external_id HAVING COUNT(*) > 1) s`);
  report.duplicateExternalIdsSummary = dupExtTotal[0];

  // ── Duplicate coordinates (exact) ────────────────────────────
  const dupCoords = await q(`
    SELECT ROUND(latitude::numeric, 5) AS lat, ROUND(longitude::numeric, 5) AS lng, COUNT(*)::int AS n
    FROM places WHERE merged_into_id IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL
      AND NOT (latitude = 0 AND longitude = 0)
    GROUP BY 1, 2 HAVING COUNT(*) > 1 ORDER BY n DESC LIMIT 50`);
  report.duplicateCoordinates = dupCoords.map((r) => ({
    lat: r.lat,
    lng: r.lng,
    count: r.n,
    names: [],
  }));
  for (const c of report.duplicateCoordinates) {
    const ns = await q(`
      SELECT name FROM places
      WHERE merged_into_id IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL
        AND ROUND(latitude::numeric,5) = $1 AND ROUND(longitude::numeric,5) = $2
      LIMIT 4`, c.lat, c.lng);
    c.names = ns.map((n) => n.name);
  }
  const dupCoordsTotal = await q(`
    SELECT COUNT(*)::int AS groups,
      COALESCE((SELECT SUM(n)::int FROM (
        SELECT COUNT(*) AS n FROM places
        WHERE merged_into_id IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL
          AND NOT (latitude = 0 AND longitude = 0)
        GROUP BY ROUND(latitude::numeric,5), ROUND(longitude::numeric,5) HAVING COUNT(*) > 1) x), 0) AS places
    FROM (
      SELECT ROUND(latitude::numeric,5), ROUND(longitude::numeric,5)
      FROM places
      WHERE merged_into_id IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL
        AND NOT (latitude = 0 AND longitude = 0)
      GROUP BY 1,2 HAVING COUNT(*) > 1) y`);
  report.duplicateCoordinatesSummary = dupCoordsTotal[0];

  // ── Duplicate public ids / slugs (integrity) ─────────────────
  const dupSlugs = await q(`
    SELECT COUNT(*)::int AS n FROM (SELECT slug FROM places WHERE merged_into_id IS NULL GROUP BY slug HAVING COUNT(*) > 1) s`);
  report.duplicateSlugs = dupSlugs[0].n;

  // ── Categories ───────────────────────────────────────────────
  const categories = await q(`
    SELECT TRIM(category) AS category, COUNT(*)::int AS n
    FROM places WHERE merged_into_id IS NULL
    GROUP BY 1 ORDER BY n DESC`);
  report.categories = categories.map((r) => ({ category: r.category, count: r.n }));

  // ── States (raw, to find inconsistent names) ─────────────────
  const states = await q(`
    SELECT state, COUNT(*)::int AS n FROM places WHERE merged_into_id IS NULL
    GROUP BY 1 ORDER BY n DESC`);
  report.states = states.map((r) => ({ state: r.state, count: r.n }));

  // ── Cities (dirty values) ────────────────────────────────────
  const dirtyCities = await q(`
    SELECT city, COUNT(*)::int AS n FROM places
    WHERE merged_into_id IS NULL AND city <> ''
      AND (
        LOWER(city) IN ('pradesh','nadu','kerala','rajasthan','maharashtra','karnataka','telangana','gujarat','bihar','uttar pradesh','himachal','andhra','mp','up','wb','goa','delhi','mumbai','india','unknown','n/a','na','none','null')
        OR city ~* '(^|[^a-z])(pradesh|nadu)([^a-z]|$)'
        OR LOWER(city) LIKE '% india %' OR LOWER(city) LIKE '%india%' AND LENGTH(city) < 20
        OR LOWER(city) LIKE '%village%' OR LOWER(city) LIKE '%tehsil%' OR LOWER(city) LIKE '%district%' OR LOWER(city) LIKE '%block%'
      )
    GROUP BY 1 ORDER BY n DESC LIMIT 50`);
  report.dirtyCities = dirtyCities.map((r) => ({ city: r.city, count: r.n }));

  // ── Generic names (editorial queue) ──────────────────────────
  const genericNames = await q(`
    SELECT name, COUNT(*)::int AS n FROM places
    WHERE merged_into_id IS NULL AND name = LOWER(name)
      AND name ~ '(^| )(temple|mandir|park|garden|fort|stupa|museum|view ?point|waterfall|falls|statue|market|tank|ruins?|monument|cave|church|mosque|masjid|beach|lake|water ?fall|point|peak|trek|track|trail|gate|gurudwara)( |$)'
      AND LENGTH(name) < 40
    GROUP BY 1 ORDER BY n DESC LIMIT 100`);
  report.genericNamesTop = genericNames.map((r) => ({ name: r.name, count: r.n }));

  const genericCount = await q(`
    SELECT COUNT(*)::int AS places FROM places
    WHERE merged_into_id IS NULL AND name = LOWER(name)
      AND name ~ '(^| )(temple|mandir|park|garden|fort|stupa|museum|view ?point|waterfall|falls|statue|market|tank|ruins?|monument|cave|church|mosque|masjid|beach|lake|water ?fall|point|peak|trek|track|trail|gate|gurudwara)( |$)'
      AND LENGTH(name) < 40`);
  report.genericNamesCount = genericCount[0].places;

  // ── Short descriptions ───────────────────────────────────────
  const shortDesc = await q(`
    SELECT COUNT(*) FILTER (WHERE description IS NOT NULL AND LENGTH(TRIM(description)) < 50)::int AS short_lt50,
           COUNT(*) FILTER (WHERE description IS NOT NULL AND LENGTH(TRIM(description)) >= 50)::int AS desc_ge50
    FROM places WHERE merged_into_id IS NULL`);
  report.descriptions = {
    shortLt50: shortDesc[0].short_lt50,
    ge50: shortDesc[0].desc_ge50,
  };

  // ── Aliases / search keywords ────────────────────────────────
  const aliases = await q(`
    SELECT
      (SELECT COUNT(DISTINCT place_id)::int FROM place_aliases) AS places_with_aliases,
      (SELECT COUNT(*)::int FROM place_aliases) AS total_aliases`);
  const keywords = await q(`
    SELECT COUNT(*)::int AS n FROM places WHERE merged_into_id IS NULL AND cardinality(search_keywords) > 0`);
  report.search = {
    placesWithAliases: aliases[0].places_with_aliases,
    totalAliases: aliases[0].total_aliases,
    placesWithKeywords: keywords[0].n,
  };

  // ── Nearby relationships ─────────────────────────────────────
  const nearby = await q(`
    SELECT COUNT(*)::int AS total,
           COUNT(DISTINCT from_place_id)::int AS distinct_from,
           COUNT(*) FILTER (WHERE relationship_type::text = 'NEARBY')::int AS nearby_rels
    FROM place_relationships`);
  const placesWithNearby = await q(`
    SELECT COUNT(DISTINCT from_place_id)::int AS n FROM place_relationships`);
  report.nearby = {
    totalRelationships: nearby[0].total,
    distinctFromPlaces: nearby[0].distinct_from,
    nearbyRelationships: nearby[0].nearby_rels,
    placesWithAnyRelationship: placesWithNearby[0].n,
  };

  // ── Provenance / quality checks / boundary validation ────────
  const prov = await q(`
    SELECT
      (SELECT COUNT(DISTINCT place_id)::int FROM place_field_provenance) AS places_with_prov,
      (SELECT COUNT(*)::int FROM place_field_provenance) AS prov_rows,
      (SELECT COUNT(DISTINCT place_id)::int FROM place_quality_checks) AS places_with_quality_checks,
      (SELECT COUNT(*)::int FROM place_quality_checks WHERE passed = true) AS passed_checks,
      (SELECT COUNT(*)::int FROM place_boundary_validation) AS boundary_validation_rows,
      (SELECT COUNT(*)::int FROM place_boundary_validation WHERE within_india = true) AS within_india_rows,
      (SELECT COUNT(*)::int FROM place_boundary_validation WHERE within_india = false) AS outside_rows`);
  report.provenance = Object.fromEntries(Object.entries(prov[0]).map(([k, v]) => [k, Number(v)]));

  // ── Quality scores ───────────────────────────────────────────
  const scores = await q(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE quality_score IS NOT NULL)::int AS scored,
      ROUND(AVG(quality_score)::numeric, 2)::float AS avg,
      ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY quality_score)::numeric, 2)::float AS median,
      MIN(quality_score)::float AS min,
      MAX(quality_score)::float AS max
    FROM places WHERE merged_into_id IS NULL`);
  report.qualityScores = scores[0];

  // ── Source coverage ──────────────────────────────────────────
  const sources = await q(`
    SELECT source::text AS source, COUNT(*)::int AS n FROM places WHERE merged_into_id IS NULL GROUP BY 1 ORDER BY n DESC`);
  report.sources = sources.map((r) => ({ source: r.source, count: r.n }));

  // ── Open duplicate candidates ────────────────────────────────
  const dupCands = await q(`
    SELECT status::text AS st, COUNT(*)::int AS n FROM place_duplicate_candidates GROUP BY 1`);
  report.duplicateCandidates = Object.fromEntries(dupCands.map((r) => [r.st, r.n]));

  // ── Images: license / source quality ─────────────────────────
  const imageQual = await q(`
    SELECT
      (SELECT COUNT(*)::int FROM place_images) AS total_rows,
      (SELECT COUNT(*)::int FROM place_images WHERE verification_status::text = 'LICENSE_VERIFIED') AS license_verified,
      (SELECT COUNT(*)::int FROM place_images WHERE verification_status::text = 'REJECTED') AS rejected,
      (SELECT COUNT(DISTINCT place_id)::int FROM place_images WHERE url IS NOT NULL AND url <> '') AS places_with_place_image_rows`);
  report.images = Object.fromEntries(Object.entries(imageQual[0]).map(([k, v]) => [k, Number(v)]));

  report.elapsedMs = Date.now() - t0;

  const jsonPath = path.join(OUT_DIR, 'audit-baseline.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log('WROTE', jsonPath);
  console.log(JSON.stringify({
    active,
    missingCity: report.missing.missing_city,
    missingState: report.missing.missing_state,
    missingCategory: report.missing.missing_category,
    missingCoords: report.missing.missing_coords,
    invalidCoords: report.invalidCoordinates,
    dupExtIds: report.duplicateExternalIdsSummary,
    dupCoords: report.duplicateCoordinatesSummary,
    dupCandidates: report.duplicateCandidates,
    avgQuality: scores[0].avg,
    states: states.length,
    categories: categories.length,
    dirtyCities: dirtyCities.length,
  }, null, 2));
}

main()
  .catch((e) => {
    console.error('AUDIT_ERROR:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
