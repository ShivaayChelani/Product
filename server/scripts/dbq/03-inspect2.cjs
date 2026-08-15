process.env.DOTENV_CONFIG_PATH = __dirname + '/../../.env';
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const gh = await prisma.$queryRawUnsafe(`
    SELECT LENGTH(geohash)::int AS len, COUNT(*)::int AS n FROM places
    WHERE merged_into_id IS NULL AND geohash IS NOT NULL GROUP BY 1 ORDER BY 1`);
  console.log('geohash lengths:', gh);

  const osmCities = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS missing_city_osm_ext
    FROM places p
    WHERE p.merged_into_id IS NULL AND (p.city = '' OR p.city IS NULL)
      AND p.external_id LIKE 'osm:%'`);
  console.log('missing-city places with osm ext:', osmCities[0].missing_city_osm_ext);

  const osmCitiesAll = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS n FROM places p
    WHERE p.merged_into_id IS NULL AND p.external_id LIKE 'osm:%'`);
  console.log('all osm-ext places:', osmCitiesAll[0].n);

  const tehsilSet = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) FILTER (WHERE tehsil <> '')::int AS has_tehsil FROM places WHERE merged_into_id IS NULL`);
  console.log('places with tehsil:', tehsilSet[0].has_tehsil);

  const nep = await prisma.$queryRawUnsafe(`
    SELECT id, name, latitude, longitude, state, city FROM places
    WHERE merged_into_id IS NULL AND state IN ('Bagmati','लुम्बिनी प्रदेश')`);
  console.log('nepal-state places:', JSON.stringify(nep, null, 1));

  const categoryCase = await prisma.$queryRawUnsafe(`
    SELECT category, COUNT(*)::int AS n FROM places
    WHERE merged_into_id IS NULL AND category <> LOWER(category) GROUP BY 1`);
  console.log('category case violations:', categoryCase);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
