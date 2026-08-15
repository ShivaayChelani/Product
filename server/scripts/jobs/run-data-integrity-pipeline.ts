/**
 * Fill real place data from free sources (Wikidata, OSM, Nominatim) — no Google API key needed.
 * Never invents descriptions or ratings. Removes synthetic ratings, dedupes, enriches, geocodes.
 *
 * Usage:
 *   npx ts-node scripts/jobs/run-data-integrity-pipeline.ts --phase=all
 *   npx ts-node scripts/jobs/run-data-integrity-pipeline.ts --phase=dedupe
 *   npx ts-node scripts/jobs/run-data-integrity-pipeline.ts --phase=enrich-wikidata --limit=500
 *   npx ts-node scripts/jobs/run-data-integrity-pipeline.ts --dry-run
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { prisma } from '../../src/config/database';

type Phase =
  | 'audit'
  | 'strip-fake-ratings'
  | 'backfill-geohash'
  | 'dedupe'
  | 'resolve-ids'
  | 'enrich-wikidata'
  | 'enrich-osm'
  | 'geocode'
  | 'scores'
  | 'report';

const CHECKPOINT = path.resolve('reports/ops/data-integrity-checkpoint.json');

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}

function run(cmd: string) {
  console.log(`\n>>> ${cmd}\n`);
  execSync(cmd, { stdio: 'inherit', cwd: path.resolve('.') });
}

async function audit() {
  const [
    total,
    missingCoords,
    missingGeohash,
    missingExternalId,
    dupOpen,
    noDescription,
    syntheticRatings,
  ] = await Promise.all([
    prisma.place.count({ where: { mergedIntoId: null } }),
    prisma.place.count({
      where: { mergedIntoId: null, OR: [{ latitude: null }, { longitude: null }] },
    }),
    prisma.place.count({ where: { mergedIntoId: null, geohash: null, latitude: { not: null } } }),
    prisma.place.count({ where: { mergedIntoId: null, externalId: null } }),
    prisma.placeDuplicateCandidate.count({ where: { status: 'OPEN' } }),
    prisma.place.count({
      where: { mergedIntoId: null, description: '' },
    }),
    prisma.place.count({
      where: {
        mergedIntoId: null,
        reviewCount: 0,
        OR: [{ rating: { not: null } }, { bayesianRating: { not: null } }],
      },
    }),
  ]);

  const snapshot = {
    generatedAt: new Date().toISOString(),
    total,
    missingCoords,
    missingGeohash,
    missingExternalId,
    duplicateCandidatesOpen: dupOpen,
    missingDescription: noDescription,
    syntheticRatings,
    dataSources: 'Wikidata + OSM + Nominatim (free, no Google API key)',
  };

  fs.mkdirSync(path.dirname(CHECKPOINT), { recursive: true });
  fs.writeFileSync(CHECKPOINT, JSON.stringify(snapshot, null, 2));
  console.log(JSON.stringify(snapshot, null, 2));
  return snapshot;
}

function loadCheckpoint(): { completedPhases: Phase[] } {
  if (!fs.existsSync(CHECKPOINT)) return { completedPhases: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'));
    return { completedPhases: raw.completedPhases ?? [] };
  } catch {
    return { completedPhases: [] };
  }
}

function saveCheckpoint(completedPhases: Phase[], auditData: Record<string, unknown>) {
  fs.mkdirSync(path.dirname(CHECKPOINT), { recursive: true });
  fs.writeFileSync(
    CHECKPOINT,
    JSON.stringify({ ...auditData, completedPhases, updatedAt: new Date().toISOString() }, null, 2),
  );
}

async function runPhase(phase: Phase) {
  const limit = arg('limit', '2000');
  const batchSize = arg('batch-size', '100');

  switch (phase) {
    case 'audit':
      await audit();
      break;
    case 'strip-fake-ratings':
      run('npx ts-node scripts/strip-synthetic-ratings.ts');
      break;
    case 'backfill-geohash':
      run(`npx ts-node scripts/jobs/nightly-duplicate-scan.ts --backfill=${limit}`);
      break;
    case 'dedupe':
      run(
        `npx ts-node scripts/jobs/india-corpus-dedupe.ts --backfill=5000 --rounds=10 --prefix-batch=300 --auto-merge=0`,
      );
      break;
    case 'resolve-ids':
      run(`npx ts-node scripts/jobs/resolve-external-ids.ts --batch-size=50 --limit=${limit}`);
      break;
    case 'enrich-wikidata':
      run(
        `npx ts-node scripts/jobs/run-factual-enrichment.ts --source=wikidata --nominatim --limit=${limit}`,
      );
      break;
    case 'enrich-osm':
      run(
        `npx ts-node scripts/jobs/run-factual-enrichment.ts --source=osm --nominatim --link-nearby --limit=${limit} --batch-size=${batchSize}`,
      );
      break;
    case 'geocode':
      run(`npx ts-node scripts/jobs/places-metadata-geocode-backfill.ts --limit=${limit} --resume`);
      break;
    case 'scores':
      run(`npx ts-node scripts/jobs/recalculate-completeness-scores.ts --all --limit=${limit}`);
      break;
    case 'report':
      run('npx ts-node scripts/jobs/enterprise-quality-report.ts');
      break;
    default:
      throw new Error(`Unknown phase: ${phase}`);
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const reset = process.argv.includes('--reset');
  const phaseArg = arg('phase', 'all');

  const allPhases: Phase[] = [
    'audit',
    'strip-fake-ratings',
    'backfill-geohash',
    'dedupe',
    'resolve-ids',
    'enrich-wikidata',
    'enrich-osm',
    'geocode',
    'scores',
    'report',
  ];

  const phases: Phase[] =
    phaseArg === 'all'
      ? allPhases
      : (phaseArg.split(',').map((p) => p.trim()) as Phase[]);

  const cp = reset ? { completedPhases: [] as Phase[] } : loadCheckpoint();
  let auditData: Record<string, unknown> = {};

  console.log('PalSafar Data Integrity Pipeline');
  console.log('Sources: Wikidata + OpenStreetMap + Nominatim (no Google API key required)');
  console.log(`Phases: ${phases.join(' → ')}`);
  if (dryRun) {
    console.log('\n[DRY RUN] Would execute:');
    for (const p of phases) console.log(`  - ${p}`);
    await audit();
    return;
  }

  for (const phase of phases) {
    if (cp.completedPhases.includes(phase)) {
      console.log(`Skip completed phase: ${phase}`);
      continue;
    }
    if (phase === 'audit') {
      auditData = (await audit()) as Record<string, unknown>;
    } else {
      await runPhase(phase);
    }
    cp.completedPhases.push(phase);
    saveCheckpoint(cp.completedPhases, auditData);
  }

  console.log('\nData integrity pipeline complete.');
  await audit();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
