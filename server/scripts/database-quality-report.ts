/**
 * Database quality report for India tourism SSOT.
 * Usage: ts-node scripts/database-quality-report.ts [--out=reports/database-quality-report.md]
 */
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/config/database';
import { buildDatabaseQualityReport } from '../src/modules/canonical/services/database-quality-report.service';

async function main() {
  const outArg = process.argv.find((a) => a.startsWith('--out='));
  const outPath = path.resolve(outArg?.split('=')[1] || 'reports/database-quality-report.md');

  const report = await buildDatabaseQualityReport();
  const s = report.summary;

  const lines: string[] = [];
  lines.push('# PalSafar India Tourism Database Quality Report');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|------:|');
  lines.push(`| Canonical active places | ${s.canonicalActive.toLocaleString()} |`);
  lines.push(`| Merged (non-deleted) duplicate records | ${s.mergedRecords.toLocaleString()} |`);
  lines.push(`| Total merge operations logged | ${s.mergeLogs.toLocaleString()} |`);
  lines.push(`| Aliases | ${s.aliasCount.toLocaleString()} |`);
  lines.push(`| VERIFIED places | ${s.verified.toLocaleString()} |`);
  lines.push(`| DRAFT places | ${s.draft.toLocaleString()} |`);
  lines.push(`| PENDING_REVIEW places | ${s.pendingReview.toLocaleString()} |`);
  lines.push(`| Open duplicate candidates | ${s.duplicateCandidatesOpen.toLocaleString()} |`);
  lines.push(`| Candidates merged | ${s.duplicateCandidatesMerged.toLocaleString()} |`);
  lines.push(`| Candidates dismissed | ${s.duplicateCandidatesDismissed.toLocaleString()} |`);
  lines.push(`| Manual review band (0.72–0.86) | ${s.manualReviewBandCount.toLocaleString()} |`);
  lines.push(`| Missing geohash (has coords) | ${s.missingGeohash.toLocaleString()} |`);
  lines.push(`| Missing coordinates | ${s.missingCoordinates.toLocaleString()} |`);
  lines.push(`| Geohash scan cells (precision 6) | ${s.geohashCellsPrecision6.toLocaleString()} |`);
  lines.push('');
  lines.push('## Coverage by state (top 40)');
  lines.push('');
  lines.push('| State | Places |');
  lines.push('|-------|-------:|');
  for (const r of report.coverageByState) lines.push(`| ${r.state} | ${r.count.toLocaleString()} |`);
  lines.push('');
  lines.push('## Coverage by category (top 40)');
  lines.push('');
  lines.push('| Category | Places |');
  lines.push('|----------|-------:|');
  for (const r of report.coverageByCategory) lines.push(`| ${r.category} | ${r.count.toLocaleString()} |`);
  lines.push('');
  lines.push('## Open duplicate candidates (sample)');
  lines.push('');
  for (const c of report.manualReviewSamples) {
    lines.push(
      `- **${(c.confidenceScore * 100).toFixed(0)}%** — "${c.placeA.name}" (${c.placeA.state}) ↔ "${c.placeB.name}" (${c.placeB.state})`,
    );
  }
  lines.push('');
  lines.push('## Production readiness notes');
  lines.push('');
  lines.push('- One canonical row per destination: active count excludes merged_into_id chains.');
  lines.push('- Auto-merge only above 0.86 confidence; manual review for 0.72–0.86.');
  lines.push('- VERIFIED requires editorial + license checks (promoteToVerified).');
  lines.push('- Run: `npm run job:india-corpus-dedupe -- --backfill=25000 --rounds=50 --auto-merge=200`');

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join('\n'));
  console.log(`Report written to ${outPath}`);
  console.log(JSON.stringify(report.summary, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
