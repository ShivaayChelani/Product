process.env.DOTENV_CONFIG_PATH = __dirname + '/../../.env';
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
const fs = require('fs');

async function main() {
  const log = fs.readFileSync('D:/PalSafar/server/reports/dbq/fix-deterministic-log-dryrun.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
  const allIds = [...new Set(log.map(e => e.placeId))];
  const placeholders = allIds.map(id => `'${id}'`).join(',');

  const r = await prisma.$queryRawUnsafe(`
    SELECT
      COUNT(*) FILTER (WHERE city IS NULL OR city = '')::int AS missing_city,
      COUNT(*)::int AS total
    FROM places WHERE id IN (${placeholders})`);
  console.log('Among', allIds.length, 'log IDs:', JSON.stringify(r[0]));

  // Check how many city_tehsil candidates also have the tehsil suffix but we also detect it in the cleanCity logic
  const tehsilCheck = await prisma.$queryRawUnsafe(`
    SELECT city, COUNT(*)::int AS cnt FROM places
    WHERE merged_into_id IS NULL AND city IS NOT NULL AND city <> ''
    AND city LIKE '%tehsil%' OR city LIKE '%taluk%' OR city LIKE '%taluka%' OR city LIKE '%mandal%'
    GROUP BY city ORDER BY cnt DESC LIMIT 10`);
  console.log('\nTehsil/taluk/mandal in city field (top 10):');
  for (const r of tehsilCheck) console.log(`  "${r.city}": ${r.cnt}`);
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
