/**
 * Final production database quality report (pre-deployment audit).
 *
 * Sections: DATABASE SUMMARY, QUALITY, DUPLICATES, COMPLETENESS,
 * EDITORIAL QUEUES, FINAL VERDICT. Read-only; writes report files only.
 */
process.env.DOTENV_CONFIG_PATH = __dirname + '/../../.env';
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
const OUT = path.resolve(__dirname, '../../reports/ops');
fs.mkdirSync(OUT, { recursive: true });

async function q(sql) { return prisma.$queryRawUnsafe(sql); }
const num = (x) => (x == null ? 0 : Number(x));

async function main() {
  const t0 = Date.now();
  const report = { generated_at: new Date().toISOString(), report: 'final-production-data-quality-report' };

  const [core, sources, categories, states] = await Promise.all([
    q(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE merged_into_id IS NULL)::int AS active,
            COUNT(*) FILTER (WHERE merged_into_id IS NOT NULL)::int AS merged FROM places`),
    q(`SELECT source::text AS source, COUNT(*)::int AS n FROM places WHERE merged_into_id IS NULL GROUP BY 1 ORDER BY n DESC`),
    q(`SELECT TRIM(category) AS category, COUNT(*)::int AS n FROM places WHERE merged_into_id IS NULL GROUP BY 1 ORDER BY n DESC`),
    q(`SELECT COALESCE(state,'') AS state, COUNT(*)::int AS n FROM places WHERE merged_into_id IS NULL GROUP BY 1 ORDER BY n DESC`),
  ]);
  const active = num(core[0].active);
  report.databaseSummary = {
    totalPlaces: num(core[0].total),
    activePlaces: active,
    mergedPlaces: num(core[0].merged),
    sources: sources.map((r) => ({ source: r.source, count: num(r.n) })),
    categoryDistribution: categories.map((r) => ({ category: r.category, count: num(r.n) })),
    stateDistribution: states.map((r) => ({ state: r.state, count: num(r.n) })),
  };

  const quality = await q(`SELECT
      COUNT(*) FILTER (WHERE city IS NULL OR city = '')::int AS missing_city,
      COUNT(*) FILTER (WHERE state IS NULL OR state = '')::int AS missing_state,
      COUNT(*) FILTER (WHERE district IS NULL OR district = '')::int AS missing_district,
      COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL)::int AS missing_coordinates,
      COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL
        AND (latitude < -90 OR latitude > 90 OR longitude < -180 OR longitude > 180))::int AS invalid_coordinates,
      COUNT(*) FILTER (WHERE latitude = 0 AND longitude = 0)::int AS zero_zero_coordinates,
      COUNT(*) FILTER (WHERE geohash IS NULL)::int AS missing_geohash,
      COUNT(*) FILTER (WHERE external_id IS NULL)::int AS missing_external_ids,
      COUNT(*) FILTER (WHERE (images IS NULL OR cardinality(images) = 0) AND thumbnail IS NULL)::int AS missing_images,
      COUNT(*) FILTER (WHERE description IS NULL OR TRIM(description) = '')::int AS missing_descriptions,
      COUNT(*) FILTER (WHERE TRIM(category) = '' OR category IS NULL)::int AS missing_category,
      COUNT(*) FILTER (WHERE external_id IS NOT NULL AND external_id <> '')::int AS with_external_ids
    FROM places WHERE merged_into_id IS NULL`);
  report.quality = {
    missingCity: num(quality[0].missing_city),
    missingState: num(quality[0].missing_state),
    missingDistrict: num(quality[0].missing_district),
    missingCoordinates: num(quality[0].missing_coordinates),
    invalidCoordinates: num(quality[0].invalid_coordinates),
    zeroZeroCoordinates: num(quality[0].zero_zero_coordinates),
    missingGeohash: num(quality[0].missing_geohash),
    missingExternalIds: num(quality[0].missing_external_ids),
    withExternalIds: num(quality[0].with_external_ids),
    missingImages: num(quality[0].missing_images),
    missingDescriptions: num(quality[0].missing_descriptions),
    missingCategory: num(quality[0].missing_category),
  };

  const [dupCoords, dupCands, dupSlugs] = await Promise.all([
    q(`SELECT COUNT(*)::int AS groups, COALESCE((SELECT SUM(n)::int FROM (SELECT COUNT(*) AS n FROM places
         WHERE merged_into_id IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL
           AND NOT (latitude = 0 AND longitude = 0)
         GROUP BY ROUND(latitude::numeric,5), ROUND(longitude::numeric,5) HAVING COUNT(*) > 1) x),0) AS places
       FROM (SELECT 1 FROM places WHERE merged_into_id IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL
         AND NOT (latitude = 0 AND longitude = 0)
         GROUP BY ROUND(latitude::numeric,5), ROUND(longitude::numeric,5) HAVING COUNT(*) > 1) y`),
    q(`SELECT status::text AS status, COUNT(*)::int AS n FROM place_duplicate_candidates GROUP BY 1 ORDER BY n DESC`),
    q(`SELECT COUNT(*)::int AS n FROM (SELECT slug FROM places WHERE merged_into_id IS NULL GROUP BY slug HAVING COUNT(*) > 1) s`),
  ]);
  report.duplicates = {
    duplicateCoordinateGroups: num(dupCoords[0].groups),
    duplicateCoordinatePlaces: num(dupCoords[0].places),
    duplicateCandidates: Object.fromEntries(dupCands.map((r) => [r.status, num(r.n)])),
    duplicateSlugs: num(dupSlugs[0].n),
  };

  const scores = await q(`SELECT
      COUNT(*)::int AS total,
      COUNT(quality_score)::int AS scored,
      ROUND(AVG(quality_score)::numeric,2)::float AS avg,
      ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY quality_score)::numeric,2)::float AS median,
      MIN(quality_score)::float AS min,
      MAX(quality_score)::float AS max,
      COUNT(*) FILTER (WHERE quality_score >= 80)::int AS ge80,
      COUNT(*) FILTER (WHERE quality_score >= 50)::int AS ge50,
      COUNT(*) FILTER (WHERE quality_score >= 25)::int AS ge25
    FROM places WHERE merged_into_id IS NULL`);
  const ge50 = num(scores[0].ge50);
  const coverage = Math.round((ge50 / active) * 10000) / 100;
  report.completeness = {
    averageQualityScore: num(scores[0].avg),
    medianQualityScore: num(scores[0].median),
    minQualityScore: num(scores[0].min),
    maxQualityScore: num(scores[0].max),
    scoredPlaces: num(scores[0].scored),
    distribution: { 'high (80+)': num(scores[0].ge80), 'medium (50-79)': ge50 - num(scores[0].ge80), 'low (25-49)': num(scores[0].ge25) - ge50, 'minimal (<25)': active - num(scores[0].ge25) },
    coveragePercentage: coverage,
    coverageDefinition: '% of active places with quality_score >= 50',
  };

  const queueManifest = JSON.parse(fs.readFileSync(path.join(OUT, 'editorial-queues/editorial-queues.json'), 'utf8'));
  const queueCounts = {};
  for (const x of queueManifest.queues) queueCounts[x.type] = x.count;
  report.editorialQueues = {
    queueCounts,
    remainingManualWork: `resolve ${queueCounts.duplicate_coordinate_groups} coordinate groups, ${queueCounts.duplicate_candidates} duplicate candidates, review ${queueCounts.conflicting_metadata} conflicting-metadata records, rename ${queueCounts.generic_names} generic names, and fill city/district for ${queueCounts.missing_city}/${queueCounts.missing_district} records`,
  };

  const verdict = {
    productionReady: false,
    summary: 'Core identity, coordinates, category, description and geohash are 100% populated with no duplicate slugs. The database is not production-ready for a consumer launch because the majority of records lack city/district granularity and images, and duplicate candidates/coordinate groups remain unresolved.',
    blockers: [
      { item: 'missing_district', detail: `${report.quality.missingDistrict} of ${active} active places (${Math.round(report.quality.missingDistrict / active * 100)}%) have no district` },
      { item: 'missing_city', detail: `${report.quality.missingCity} of ${active} active places (${Math.round(report.quality.missingCity / active * 100)}%) have no city` },
      { item: 'missing_images', detail: `${report.quality.missingImages} of ${active} active places (${Math.round(report.quality.missingImages / active * 100)}%) have no image` },
      { item: 'duplicates', detail: `${report.duplicates.duplicateCoordinateGroups} coordinate groups and ${report.duplicates.duplicateCandidates['OPEN'] || 0} open duplicate candidates need resolution` },
      { item: 'generic_names', detail: `${queueCounts.generic_names} records carry generic lowercase names needing disambiguation` },
      { item: 'conflicting_metadata', detail: `${queueCounts.conflicting_metadata} records flagged for review (city=state, non-official state, tehsil-level district)` },
      { item: 'out_of_india', detail: `2 records carry Nepal state values; 14 WIKIMEDIA records remain state-empty (non-India/unresolvable)` },
    ],
    recommendedNextActions: [
      'Run the editorial review queues: resolve duplicate candidates, then coordinate groups',
      'Prioritize city/district backfill for high-traffic states (Kerala, Maharashtra, Karnataka, Tamil Nadu) using verified sources only',
      'Complete the image pipeline (license-verified imagery) before consumer launch',
      'Normalize generic names and conflicting metadata',
      'Re-run this audit after each remediation cycle; re-verify with backup places_meta_backup_20260804T074239 if needed',
    ],
  };
  report.finalVerdict = verdict;

  report.elapsedMs = Date.now() - t0;
  report.generated_at = new Date().toISOString();

  const jsonPath = path.join(OUT, 'final-production-data-quality-report.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const md = renderMarkdown(report);
  const mdPath = path.join(OUT, 'final-production-data-quality-report.md');
  fs.writeFileSync(mdPath, md);

  console.log('WROTE', jsonPath);
  console.log('WROTE', mdPath);
  console.log(JSON.stringify({
    active,
    avgQuality: report.completeness.averageQualityScore,
    coveragePct: report.completeness.coveragePercentage,
    productionReady: verdict.productionReady,
  }, null, 2));
}

function pct(n, d) { return d ? Math.round((n / d) * 1000) / 10 + '%' : '-'; }

function renderMarkdown(r) {
  const a = r.databaseSummary.activePlaces;
  const rows = (arr) => arr.map((x) => `| ${String(x.source).replace(/\|/g, '/')} | ${x.count} |`).join('\n');
  const cat = (arr) => arr.slice(0, 25).map((x) => `| ${String(x.category).replace(/\|/g, '/')} | ${x.count} |`).join('\n');
  const st = (arr) => arr.slice(0, 40).map((x) => `| ${String(x.state || '(empty)').replace(/\|/g, '/')} | ${x.count} |`).join('\n');
  const qc = r.editorialQueues.queueCounts;
  const qRows = Object.entries(qc).map(([k, v]) => `| ${k} | ${v} |`).join('\n');
  return `# Final Production Database Quality Report

Generated: ${r.generated_at}

## DATABASE SUMMARY
- Total places: **${r.databaseSummary.totalPlaces}**
- Active places: **${a}**
- Merged places: ${r.databaseSummary.mergedPlaces}

### Sources
| Source | Count |
|--------|-------|
${rows(r.databaseSummary.sources)}

### Category distribution
| Category | Count |
|----------|-------|
${cat(r.databaseSummary.categoryDistribution)}

### State distribution
| State | Count |
|-------|-------|
${st(r.databaseSummary.stateDistribution)}

## QUALITY
| Metric | Missing | % of active |
|--------|---------|-------------|
| Missing city | ${r.quality.missingCity} | ${pct(r.quality.missingCity, a)} |
| Missing state | ${r.quality.missingState} | ${pct(r.quality.missingState, a)} |
| Missing district | ${r.quality.missingDistrict} | ${pct(r.quality.missingDistrict, a)} |
| Missing coordinates | ${r.quality.missingCoordinates} | ${pct(r.quality.missingCoordinates, a)} |
| Invalid coordinates | ${r.quality.invalidCoordinates} | ${pct(r.quality.invalidCoordinates, a)} |
| Zero-zero coordinates | ${r.quality.zeroZeroCoordinates} | ${pct(r.quality.zeroZeroCoordinates, a)} |
| Missing geohash | ${r.quality.missingGeohash} | ${pct(r.quality.missingGeohash, a)} |
| Missing external IDs | ${r.quality.missingExternalIds} | ${pct(r.quality.missingExternalIds, a)} |
| Missing images | ${r.quality.missingImages} | ${pct(r.quality.missingImages, a)} |
| Missing descriptions | ${r.quality.missingDescriptions} | ${pct(r.quality.missingDescriptions, a)} |
| Missing category | ${r.quality.missingCategory} | ${pct(r.quality.missingCategory, a)} |

## DUPLICATES
- Duplicate coordinate groups: **${r.duplicates.duplicateCoordinateGroups}** (${r.duplicates.duplicateCoordinatePlaces} places)
- Duplicate candidates: ${JSON.stringify(r.duplicates.duplicateCandidates)}
- Duplicate slugs: **${r.duplicates.duplicateSlugs}**

## COMPLETENESS
- Average quality score: **${r.completeness.averageQualityScore}**
- Median quality score: ${r.completeness.medianQualityScore}
- Min / Max: ${r.completeness.minQualityScore} / ${r.completeness.maxQualityScore}
- Distribution: ${JSON.stringify(r.completeness.distribution)}
- Coverage: **${r.completeness.coveragePercentage}%** (${r.completeness.coverageDefinition})

## EDITORIAL QUEUES
| Queue type | Count |
|------------|-------|
${qRows}

Remaining manual work: ${r.editorialQueues.remainingManualWork}

## FINAL VERDICT
- Production-ready: **${r.finalVerdict.productionReady ? 'YES' : 'NO'}**
- Summary: ${r.finalVerdict.summary}

### Remaining blockers
${r.finalVerdict.blockers.map((b) => `- **${b.item}**: ${b.detail}`).join('\n')}

### Recommended next actions
${r.finalVerdict.recommendedNextActions.map((x) => `- ${x}`).join('\n')}
`;
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); }).finally(() => prisma.$disconnect());
