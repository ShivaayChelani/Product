/**
 * Fill core India place fields from free authoritative sources only:
 *   name     — already in DB (OSM/Wikidata import)
 *   city     — Nominatim reverse geocode from lat/lng
 *   state    — Nominatim reverse geocode (only if empty)
 *   description — Wikidata + Wikipedia (only if empty)
 *   coordinates — Wikidata P625 (only if missing)
 *
 * NO synthetic text. NO Google API. NO invented ratings.
 *
 * Usage:
 *   npm run job:fill-core-fields -- --phase=report
 *   npm run job:fill-core-fields -- --phase=geocode --limit=5000 --resume
 *   npm run job:fill-core-fields -- --phase=describe --limit=500
 *   npm run job:fill-core-fields -- --phase=all --geocode-limit=10000
 */
import { execSync } from 'child_process';
import path from 'path';
import { prisma } from '../../src/config/database';

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}

function run(cmd: string) {
  console.log(`\n>>> ${cmd}\n`);
  execSync(cmd, { stdio: 'inherit', cwd: path.resolve('.') });
}

async function report() {
  const [total, missingCity, missingState, emptyDesc, missingCoords] = await Promise.all([
    prisma.place.count({ where: { mergedIntoId: null } }),
    prisma.place.count({ where: { mergedIntoId: null, city: '' } }),
    prisma.place.count({ where: { mergedIntoId: null, state: '' } }),
    prisma.place.count({ where: { mergedIntoId: null, description: '' } }),
    prisma.place.count({
      where: { mergedIntoId: null, OR: [{ latitude: null }, { longitude: null }] },
    }),
  ]);

  const snapshot = {
    generatedAt: new Date().toISOString(),
    total,
    coreFieldGaps: { missingCity, missingState, emptyDescription: emptyDesc, missingCoordinates: missingCoords },
    dataPolicy: 'Wikidata + OSM + Nominatim only — never synthesized',
    estimatedGeocodeHours: Math.ceil(missingCity / 3600),
  };
  console.log(JSON.stringify(snapshot, null, 2));
  return snapshot;
}

async function main() {
  const phase = arg('phase', 'report');
  const geocodeLimit = arg('geocode-limit', arg('limit', '5000'));
  const describeLimit = arg('describe-limit', '500');
  const resume = process.argv.includes('--resume') ? '--resume' : '';

  console.log('PalSafar — Fill India Core Fields (real data only)\n');

  if (phase === 'report' || phase === 'all') {
    await report();
    if (phase === 'report') return;
  }

  if (phase === 'geocode' || phase === 'all') {
    run(
      `npx ts-node scripts/jobs/places-metadata-geocode-backfill.ts --phase=geocode --limit=${geocodeLimit} ${resume}`.trim(),
    );
  }

  if (phase === 'describe' || phase === 'all') {
    run(
      `npx ts-node scripts/jobs/run-factual-enrichment.ts --source=wikidata --nominatim --limit=${describeLimit}`,
    );
  }

  if (phase === 'all') {
    await report();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
