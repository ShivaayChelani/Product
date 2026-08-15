/**
 * Factual canonical place enrichment — Wikidata, OpenStreetMap, Nominatim only.
 * Never invents data. Empty fields stay NULL. Provenance logged per field.
 *
 * Usage:
 *   npx ts-node scripts/jobs/factual-place-enrichment.ts --limit=200 --source=wikidata
 *   npx ts-node scripts/jobs/factual-place-enrichment.ts --limit=50 --source=osm --nominatim
 *   npx ts-node scripts/jobs/factual-place-enrichment.ts --limit=100 --dry-run
 */
import fs from 'fs';
import path from 'path';
import { runFactualEnrichment } from './factual-place-enrichment';
import type { EnrichmentReport } from '../lib/factual-enrichment-types';

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}

function renderMarkdown(report: EnrichmentReport): string {
  const lines: string[] = [
    '# Factual Place Enrichment Report',
    '',
    `**Generated:** ${report.generatedAt}`,
    `**Mode:** ${report.dryRun ? 'DRY RUN (no writes)' : 'LIVE'}`,
    `**Batch:** offset=${report.offset}, limit=${report.limit}`,
    '',
    '## Summary',
    '',
    `| Metric | Count |`,
    `|--------|------:|`,
    `| Places processed | ${report.processed} |`,
    `| Places enriched (≥1 field filled) | ${report.enrichedCount} |`,
    `| Unchanged | ${report.unchangedCount} |`,
    `| Errors | ${report.errorCount} |`,
    `| Requiring manual review | ${report.manualReviewCount} |`,
    '',
    '## Fields',
    '',
    '| Field | Filled | Left NULL | Skipped (existing) |',
    '|-------|-------:|----------:|-----------------:|',
  ];

  for (const [field, stats] of Object.entries(report.fieldSummary)) {
    lines.push(`| ${field} | ${stats.filled} | ${stats.leftNull} | ${stats.skippedExisting} |`);
  }

  lines.push('', '## Places requiring manual review', '');
  if (!report.placesRequiringManualReview.length) {
    lines.push('_None in this batch._');
  } else {
    for (const p of report.placesRequiringManualReview) {
      lines.push(`- **${p.name}** (\`${p.placeId}\`): ${p.reasons.join('; ')}`);
    }
  }

  lines.push('', '## Sample enriched places', '');
  for (const p of report.sampleEnriched.slice(0, 15)) {
    const filled = Object.entries(p.outcomes)
      .filter(([, v]) => v === 'filled')
      .map(([k]) => k);
    lines.push(`- **${p.name}** — filled: ${filled.join(', ') || '(none)'}`);
  }

  lines.push('', '---', '*Sources: Wikidata API, OpenStreetMap tags, Nominatim reverse geocode, PostGIS proximity (NEARBY only).*');
  return lines.join('\n');
}

async function main() {
  const limit = parseInt(arg('limit', '100'), 10);
  const offset = parseInt(arg('offset', '0'), 10);
  const dryRun = process.argv.includes('--dry-run');
  const linkNearby = process.argv.includes('--link-nearby');
  const nominatim = process.argv.includes('--nominatim');
  const source = arg('source', 'all') as 'wikidata' | 'osm' | 'all';

  const report = await runFactualEnrichment({
    limit,
    offset,
    dryRun,
    linkNearby,
    nominatim,
    recalcScores: !dryRun,
    sourceFilter: source === 'all' ? undefined : source,
  });

  const outDir = path.resolve('reports/ops/enrichment');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, '-');
  const jsonPath = path.join(outDir, `factual-enrichment-${stamp}.json`);
  const mdPath = path.join(outDir, `factual-enrichment-${stamp}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, renderMarkdown(report));

  console.log(JSON.stringify({ jsonPath, mdPath, ...report, sampleEnriched: undefined, fieldSummary: report.fieldSummary }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
