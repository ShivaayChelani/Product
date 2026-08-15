process.env.DOTENV_CONFIG_PATH = __dirname + '/../../.env';
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

async function main() {
  // Check if any geohash was recently set (partial apply effect)
  const recentGeohash = await prisma.$queryRawUnsafe(`
    SELECT updated_at::date AS day, COUNT(*)::int AS cnt
    FROM places WHERE merged_into_id IS NULL AND geohash IS NOT NULL
    GROUP BY updated_at::date ORDER BY day DESC LIMIT 5`);
  console.log('Geohash update dates (last 5):');
  for (const r of recentGeohash) console.log(`  ${r.day}: ${r.cnt}`);

  // How many total geohash = NULL?
  const ghNull = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS cnt FROM places
    WHERE merged_into_id IS NULL AND geohash IS NULL
      AND latitude IS NOT NULL AND longitude IS NOT NULL`);
  console.log(`\nCurrent geohash NULL (with coords): ${ghNull[0].cnt}`);

  // How many total geohash != NULL?
  const ghNotNull = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS cnt FROM places
    WHERE merged_into_id IS NULL AND geohash IS NOT NULL`);
  console.log(`Current geohash set: ${ghNotNull[0].cnt}`);

  // Also check: city_is_state_in_compound — how many?
  const compoundState = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS cnt FROM places
    WHERE merged_into_id IS NULL AND city IS NOT NULL AND city LIKE '%,%'`);
  console.log(`\nCities with comma: ${compoundState[0].cnt}`);

  // Admin path as city (len > 45)
  const longCity = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS cnt FROM places
    WHERE merged_into_id IS NULL AND city IS NOT NULL AND LENGTH(city) > 45`);
  console.log(`Cities longer than 45 chars: ${longCity[0].cnt}`);

  // City blanked: total empty + null
  const cityMissing = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) FILTER (WHERE city IS NULL)::int AS null_c,
           COUNT(*) FILTER (WHERE city = '')::int AS empty_c
    FROM places WHERE merged_into_id IS NULL`);
  console.log(`City NULL: ${cityMissing[0].null_c}, empty: ${cityMissing[0].empty_c}`);
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
