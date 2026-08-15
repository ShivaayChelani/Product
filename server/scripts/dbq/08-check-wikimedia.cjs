process.env.DOTENV_CONFIG_PATH = __dirname + '/../../.env';
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

async function main() {
  // WIKIMEDIA places missing state
  const wikimediaMissing = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS cnt FROM places
    WHERE merged_into_id IS NULL AND source = 'WIKIMEDIA'
      AND (state IS NULL OR state = '')`);
  console.log('WIKIMEDIA missing state:', wikimediaMissing[0].cnt);

  // Total places missing state (all sources)
  const totalMissing = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS cnt FROM places
    WHERE merged_into_id IS NULL AND (state IS NULL OR state = '')`);
  console.log('Total missing state:', totalMissing[0].cnt);

  // WIKIMEDIA missing city
  const wikimediaMissingCity = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS cnt FROM places
    WHERE merged_into_id IS NULL AND source = 'WIKIMEDIA'
      AND (city IS NULL OR city = '')`);
  console.log('WIKIMEDIA missing city:', wikimediaMissingCity[0].cnt);

  // WIKIMEDIA missing district
  const wikimediaMissingDist = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS cnt FROM places
    WHERE merged_into_id IS NULL AND source = 'WIKIMEDIA'
      AND (district IS NULL OR district = '')`);
  console.log('WIKIMEDIA missing district:', wikimediaMissingDist[0].cnt);

  // Sample 5 WIKIMEDIA missing state
  const samples = await prisma.$queryRawUnsafe(`
    SELECT id, name, external_id, latitude::double precision AS lat, longitude::double precision AS lng,
           city, state, district, country
    FROM places
    WHERE merged_into_id IS NULL AND source = 'WIKIMEDIA'
      AND (state IS NULL OR state = '')
    LIMIT 5`);
  console.log('\nSample WIKIMEDIA missing state:');
  for (const s of samples) console.log(JSON.stringify(s, null, 2));

  // Check existing checkpoint
  const fs = require('fs');
  const cpPaths = [
    'D:/PalSafar/server/reports/ops/places-metadata-geocode-checkpoint.json',
    'D:/PalSafar/server/reports/ops/checkpoint-wikidata.json',
    'D:/PalSafar/server/reports/phase2-apply-progress.jsonl',
  ];
  for (const p of cpPaths) {
    if (fs.existsSync(p)) {
      const stat = fs.statSync(p);
      console.log(`\nCheckpoint exists: ${p} (${stat.size} bytes, ${stat.mtime.toISOString()})`);
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
