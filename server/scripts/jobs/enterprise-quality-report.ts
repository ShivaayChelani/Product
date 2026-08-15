/**
 * Enterprise-quality report for the canonical India tourism database.
 *
 * Usage: npx ts-node scripts/jobs/enterprise-quality-report.ts
 */
import fs from 'fs';
import path from 'path';
import { prisma } from '../../src/config/database';

async function main() {
  const isFinal = process.argv.includes('--final');
  const [
    totalCanonical,
    verified,
    pendingReview,
    openDupes,
    mergedDupes,
    missingExtId,
    missingCoords,
    missingWebsite,
    missingHeritage,
    missingNearby,
    missingImages,
    withProvenance,
    enrichedRecently,
  ] = await Promise.all([
    prisma.place.count({ where: { mergedIntoId: null } }),
    prisma.place.count({ where: { mergedIntoId: null, dataQuality: 'VERIFIED' } }),
    prisma.place.count({ where: { mergedIntoId: null, dataQuality: { in: ['DRAFT', 'PENDING_REVIEW'] } } }),
    prisma.placeDuplicateCandidate.count({ where: { status: 'OPEN' } }),
    prisma.placeDuplicateCandidate.count({ where: { status: 'MERGED' } }),
    prisma.place.count({
      where: {
        mergedIntoId: null,
        OR: [
          { externalId: null },
          { NOT: { OR: [{ externalId: { startsWith: 'wikidata:' } }, { externalId: { startsWith: 'osm:' } }] } },
        ],
      },
    }),
    prisma.place.count({ where: { mergedIntoId: null, OR: [{ latitude: null }, { longitude: null }] } }),
    prisma.place.count({ where: { mergedIntoId: null, OR: [{ website: null }, { website: '' }] } }),
    prisma.place.count({
      where: { mergedIntoId: null, heritageStatus: null, unescoStatus: null },
    }),
    prisma.place.count({
      where: {
        mergedIntoId: null,
        relationshipsFrom: { none: { relationshipType: 'NEARBY' } },
        latitude: { not: null },
        longitude: { not: null },
      },
    }),
    prisma.place.count({
      where: {
        mergedIntoId: null,
        placeImages: { none: { verificationStatus: 'LICENSE_VERIFIED' } },
        images: { equals: [] },
      },
    }),
    prisma.$queryRaw<[{ c: bigint }]>`SELECT COUNT(DISTINCT place_id) AS c FROM place_field_provenance`,
    prisma.placeFieldProvenance.count({
      where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) } },
    }),
  ]);

  const missingDescription = await prisma.$queryRaw<[{ c: bigint }]>`
    SELECT COUNT(*)::bigint AS c FROM places
    WHERE merged_into_id IS NULL
      AND (description IS NULL OR LENGTH(TRIM(description)) < 40)`;

  const wikidataCount = await prisma.place.count({
    where: { mergedIntoId: null, externalId: { startsWith: 'wikidata:' } },
  });
  const osmCount = await prisma.place.count({
    where: { mergedIntoId: null, externalId: { startsWith: 'osm:' } },
  });

  const aliasCoverage = await prisma.$queryRaw<[{ with_aliases: bigint; total: bigint }]>`
    SELECT
      COUNT(DISTINCT pa.place_id)::bigint AS with_aliases,
      (SELECT COUNT(*)::bigint FROM places WHERE merged_into_id IS NULL) AS total
    FROM place_aliases pa
    INNER JOIN places p ON p.id = pa.place_id AND p.merged_into_id IS NULL`;

  const qualityDistribution = await prisma.$queryRaw<{ band: string; c: bigint }[]>`
    SELECT
      CASE
        WHEN quality_score IS NULL THEN 'unscored'
        WHEN quality_score >= 80 THEN 'high (80+)'
        WHEN quality_score >= 50 THEN 'medium (50-79)'
        WHEN quality_score >= 25 THEN 'low (25-49)'
        ELSE 'minimal (<25)'
      END AS band,
      COUNT(*)::bigint AS c
    FROM places
    WHERE merged_into_id IS NULL
    GROUP BY 1
    ORDER BY 1`;

  const stateCoverage = await prisma.$queryRaw<{ state: string; total: bigint; avg_score: number | null }[]>`
    SELECT state, COUNT(*)::bigint AS total, ROUND(AVG(quality_score)::numeric, 1)::float AS avg_score
    FROM places
    WHERE merged_into_id IS NULL AND state <> ''
    GROUP BY state
    ORDER BY total DESC
    LIMIT 20`;

  const categoryCoverage = await prisma.$queryRaw<{ category: string; total: bigint }[]>`
    SELECT category, COUNT(*)::bigint AS total
    FROM places WHERE merged_into_id IS NULL
    GROUP BY category ORDER BY total DESC LIMIT 15`;

  const visitorCoverage = await prisma.$queryRaw<[{ visitor: bigint; tourism: bigint; travel: bigint; activities: bigint; total: bigint }]>`
    SELECT
      COUNT(*) FILTER (WHERE (highlights::jsonb)->'visitorInfo' IS NOT NULL)::bigint AS visitor,
      COUNT(*) FILTER (WHERE (highlights::jsonb)->'tourismContent' IS NOT NULL)::bigint AS tourism,
      COUNT(*) FILTER (WHERE (highlights::jsonb)->'travelAccess' IS NOT NULL)::bigint AS travel,
      COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE((highlights::jsonb)->'officialActivities', '[]'::jsonb)) > 0)::bigint AS activities,
      COUNT(*)::bigint AS total
    FROM places WHERE merged_into_id IS NULL`;

  const verificationReady = await prisma.$queryRaw<[{ ready: bigint }]>`
    SELECT COUNT(*)::bigint AS ready FROM places p
    WHERE p.merged_into_id IS NULL
      AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
      AND p.state <> '' AND LENGTH(TRIM(p.description)) >= 40
      AND EXISTS (SELECT 1 FROM place_field_provenance fp WHERE fp.place_id = p.id)
      AND p.quality_score >= 50`;

  const avgCompleteness = await prisma.$queryRaw<[{ avg: number | null; scored: bigint }]>`
    SELECT ROUND(AVG(quality_score)::numeric, 1)::float AS avg,
           COUNT(quality_score)::bigint AS scored
    FROM places WHERE merged_into_id IS NULL`;

  const districtCoverage = await prisma.$queryRaw<{ district: string; total: bigint; avg_score: number | null }[]>`
    SELECT district, COUNT(*)::bigint AS total, ROUND(AVG(quality_score)::numeric, 1)::float AS avg_score
    FROM places
    WHERE merged_into_id IS NULL AND district <> ''
    GROUP BY district
    ORDER BY total DESC
    LIMIT 25`;

  const nullFieldCounts = await prisma.$queryRaw<[{
    no_state: bigint;
    no_district: bigint;
    no_city: bigint;
    no_description: bigint;
    no_history: bigint;
    no_website: bigint;
    no_hours: bigint;
    no_fee: bigint;
    no_heritage: bigint;
    no_nearby: bigint;
  }]>`
    SELECT
      COUNT(*) FILTER (WHERE state IS NULL OR state = '')::bigint AS no_state,
      COUNT(*) FILTER (WHERE district IS NULL OR district = '')::bigint AS no_district,
      COUNT(*) FILTER (WHERE city IS NULL OR city = '')::bigint AS no_city,
      COUNT(*) FILTER (WHERE description IS NULL OR LENGTH(TRIM(description)) < 40)::bigint AS no_description,
      COUNT(*) FILTER (WHERE history IS NULL OR LENGTH(TRIM(history)) < 20)::bigint AS no_history,
      COUNT(*) FILTER (WHERE website IS NULL OR website = '')::bigint AS no_website,
      COUNT(*) FILTER (WHERE opening_hours IS NULL)::bigint AS no_hours,
      COUNT(*) FILTER (WHERE ticket_price IS NULL)::bigint AS no_fee,
      COUNT(*) FILTER (WHERE heritage_status IS NULL AND unesco_status IS NULL)::bigint AS no_heritage,
      COUNT(*) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM place_relationships pr
        WHERE pr.from_place_id = places.id AND pr.relationship_type = 'NEARBY'
      ) AND latitude IS NOT NULL)::bigint AS no_nearby
    FROM places WHERE merged_into_id IS NULL`;

  const extIdResolution = await prisma.$queryRaw<[{ resolved: bigint }]>`
    SELECT COUNT(DISTINCT place_id)::bigint AS resolved
    FROM place_field_provenance
    WHERE field_name = 'externalId'`;

  const extIdCheckpoint = (() => {
    try {
      const p = path.resolve('reports/ops/enrichment/checkpoint-external-ids.json');
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch { /* ignore */ }
    return null;
  })();

  const wikidataCheckpoint = (() => {
    try {
      const p = path.resolve('reports/ops/enrichment/checkpoint-wikidata.json');
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch { /* ignore */ }
    return null;
  })();

  const scoredCount = Number(avgCompleteness[0]?.scored ?? 0);
  const overallCompletenessPct = scoredCount
    ? Math.round(Number(avgCompleteness[0]?.avg ?? 0))
    : 0;
  const externalIdCoveragePct = totalCanonical
    ? Math.round(((wikidataCount + osmCount) / totalCanonical) * 100)
    : 0;

  const report = {
    reportType: isFinal ? 'FINAL_ENTERPRISE_DATA_QUALITY' : 'ENTERPRISE_QUALITY',
    generatedAt: new Date().toISOString(),
    summary: {
      totalCanonicalPlaces: totalCanonical,
      verifiedPlaces: verified,
      pendingReview,
      duplicateCandidatesOpen: openDupes,
      duplicatesMerged: mergedDupes,
      wikidataLinked: wikidataCount,
      osmLinked: osmCount,
      externalIdCoveragePct,
      missingExternalIds: missingExtId,
      externalIdsResolvedViaMatching: Number(extIdResolution[0]?.resolved ?? 0),
      placesWithProvenance: Number(withProvenance[0]?.c ?? 0),
      provenanceRecordsLast7Days: enrichedRecently,
      overallCompletenessPct,
      placesWithCompletenessScore: scoredCount,
    },
    gaps: {
      missingCoordinates: missingCoords,
      missingDescription: Number(missingDescription[0]?.c ?? 0),
      missingWebsite,
      missingHeritageData: missingHeritage,
      missingNearbyAttractions: missingNearby,
      missingVerifiedImages: missingImages,
    },
    search: {
      placesWithAliases: Number(aliasCoverage[0]?.with_aliases ?? 0),
      aliasCoveragePct: totalCanonical
        ? Math.round((Number(aliasCoverage[0]?.with_aliases ?? 0) / totalCanonical) * 100)
        : 0,
    },
    qualityDistribution: qualityDistribution.map((r) => ({ band: r.band, count: Number(r.c) })),
    coverageByState: stateCoverage.map((r) => ({
      state: r.state,
      count: Number(r.total),
      avgCompletenessScore: r.avg_score,
    })),
    coverageByCategory: categoryCoverage.map((r) => ({
      category: r.category,
      count: Number(r.total),
    })),
    structuredVisitorCoverage: {
      visitorInfo: Number(visitorCoverage[0]?.visitor ?? 0),
      tourismContent: Number(visitorCoverage[0]?.tourism ?? 0),
      travelAccess: Number(visitorCoverage[0]?.travel ?? 0),
      officialActivities: Number(visitorCoverage[0]?.activities ?? 0),
      visitorInfoPct: totalCanonical
        ? Math.round((Number(visitorCoverage[0]?.visitor ?? 0) / totalCanonical) * 100)
        : 0,
    },
    verificationReadiness: {
      placesMeetingThreshold: Number(verificationReady[0]?.ready ?? 0),
      pctOfCorpus: totalCanonical
        ? Math.round((Number(verificationReady[0]?.ready ?? 0) / totalCanonical) * 100)
        : 0,
    },
    coverageByDistrict: districtCoverage.map((r) => ({
      district: r.district,
      count: Number(r.total),
      avgCompletenessScore: r.avg_score,
    })),
    remainingNullFields: {
      state: Number(nullFieldCounts[0]?.no_state ?? 0),
      district: Number(nullFieldCounts[0]?.no_district ?? 0),
      city: Number(nullFieldCounts[0]?.no_city ?? 0),
      description: Number(nullFieldCounts[0]?.no_description ?? 0),
      history: Number(nullFieldCounts[0]?.no_history ?? 0),
      website: Number(nullFieldCounts[0]?.no_website ?? 0),
      openingHours: Number(nullFieldCounts[0]?.no_hours ?? 0),
      entryFee: Number(nullFieldCounts[0]?.no_fee ?? 0),
      heritageUnesco: Number(nullFieldCounts[0]?.no_heritage ?? 0),
      nearbyRelationships: Number(nullFieldCounts[0]?.no_nearby ?? 0),
    },
    pipelineProgress: {
      wikidataEnrichmentCheckpoint: wikidataCheckpoint,
      externalIdResolutionCheckpoint: extIdCheckpoint,
    },
    duplicateResolution: {
      openCandidates: openDupes,
      merged: mergedDupes,
      resolutionPct: openDupes + mergedDupes
        ? Math.round((mergedDupes / (openDupes + mergedDupes)) * 100)
        : 0,
    },
    recommendations: [
      missingExtId > 0
        ? `Continue external ID resolution for ${missingExtId.toLocaleString()} places (${externalIdCoveragePct}% currently linked to Wikidata/OSM).`
        : 'External ID resolution complete for all resolvable matches.',
      openDupes > 0
        ? `Review ${openDupes.toLocaleString()} open duplicate candidates; auto-merge only at confidence ≥0.86.`
        : 'No open duplicate candidates.',
      scoredCount < totalCanonical
        ? `Run completeness scoring across full corpus (${scoredCount.toLocaleString()} / ${totalCanonical.toLocaleString()} scored).`
        : 'Completeness scoring complete.',
      Number(nullFieldCounts[0]?.no_hours ?? 0) > 0
        ? 'OSM opening_hours/fee tags remain the primary authoritative source for visitor information gaps.'
        : null,
      'Government source adapters (ASI, state tourism portals) required for fields not available in Wikidata/OSM.',
      'Never auto-verify; editorial promotion to VERIFIED only after quality gates pass.',
    ].filter(Boolean),
  };

  const outDir = path.resolve('reports/ops/enrichment');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, '-');
  const prefix = isFinal ? 'final-enterprise-quality' : 'enterprise-quality';
  const jsonPath = path.join(outDir, `${prefix}-${stamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const title = isFinal
    ? '# FINAL ENTERPRISE DATA QUALITY REPORT — PalSafar India Tourism Database'
    : '# Enterprise Quality Report — PalSafar India Tourism Database';

  const md = [
    title,
    '',
    `**Generated:** ${report.generatedAt}`,
    '',
    '## Executive Summary',
    '',
    `- **Overall completeness (avg quality score):** ${report.summary.overallCompletenessPct}% (${report.summary.placesWithCompletenessScore.toLocaleString()} places scored)`,
    `- **External ID coverage:** ${report.summary.externalIdCoveragePct}% (Wikidata: ${report.summary.wikidataLinked.toLocaleString()}, OSM: ${report.summary.osmLinked.toLocaleString()})`,
    `- **Verified places:** ${report.summary.verifiedPlaces.toLocaleString()} / ${report.summary.totalCanonicalPlaces.toLocaleString()}`,
    `- **Verification readiness:** ${report.verificationReadiness.placesMeetingThreshold.toLocaleString()} places (${report.verificationReadiness.pctOfCorpus}%)`,
    '',
    '## Summary',
    '',
    `| Metric | Value |`,
    `|--------|------:|`,
    ...Object.entries(report.summary).map(([k, v]) => `| ${k} | ${v} |`),
    '',
    '## Data Gaps',
    '',
    ...Object.entries(report.gaps).map(([k, v]) => `- **${k}:** ${v}`),
    '',
    '## Quality Distribution',
    '',
    ...report.qualityDistribution.map((r) => `- ${r.band}: ${r.count}`),
    '',
    '## Top States by Place Count',
    '',
    ...report.coverageByState.slice(0, 10).map(
      (r) => `- ${r.state}: ${r.count} places (avg completeness ${r.avgCompletenessScore ?? 'N/A'})`,
    ),
    '',
    '## Structured Visitor Coverage',
    '',
    ...Object.entries(report.structuredVisitorCoverage).map(([k, v]) => `- **${k}:** ${v}`),
    '',
    '## Verification Readiness',
    '',
    `- Places meeting threshold: ${report.verificationReadiness.placesMeetingThreshold} (${report.verificationReadiness.pctOfCorpus}%)`,
    '',
    '## Duplicate Resolution',
    '',
    `- Open candidates: ${report.duplicateResolution.openCandidates.toLocaleString()}`,
    `- Merged: ${report.duplicateResolution.merged.toLocaleString()}`,
    `- Resolution progress: ${report.duplicateResolution.resolutionPct}%`,
    '',
    '## Remaining NULL Fields (authoritative gaps)',
    '',
    ...Object.entries(report.remainingNullFields).map(([k, v]) => `- **${k}:** ${Number(v).toLocaleString()}`),
    '',
    '## Pipeline Progress',
    '',
    `- Wikidata enrichment checkpoint: ${JSON.stringify(report.pipelineProgress.wikidataEnrichmentCheckpoint)}`,
    `- External ID resolution checkpoint: ${JSON.stringify(report.pipelineProgress.externalIdResolutionCheckpoint)}`,
    '',
    '## Recommendations for Operational Teams',
    '',
    ...report.recommendations.map((r) => `- ${r}`),
    '',
    `Full JSON: \`${jsonPath}\``,
  ].join('\n');

  const mdPath = path.join(outDir, `${prefix}-${stamp}.md`);
  fs.writeFileSync(mdPath, md);

  console.log(JSON.stringify({ jsonPath, mdPath, summary: report.summary, gaps: report.gaps }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
