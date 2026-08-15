process.env.DOTENV_CONFIG_PATH = __dirname + '/../../.env';
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT external_id, COUNT(*)::int AS n FROM places
    WHERE merged_into_id IS NULL AND external_id IS NOT NULL AND external_id <> ''
    GROUP BY external_id ORDER BY n DESC LIMIT 10`);
  console.log('external_id samples:', rows);

  const missingStateRows = await prisma.$queryRawUnsafe(`
    SELECT external_id, source::text, name, tags, full_address FROM places
    WHERE merged_into_id IS NULL AND (state = '' OR state IS NULL)
    LIMIT 8`);
  console.log('missing-state samples:', JSON.stringify(missingStateRows, null, 1));

  const missingStateBySource = await prisma.$queryRawUnsafe(`
    SELECT source::text, COUNT(*)::int AS n,
           COUNT(*) FILTER (WHERE external_id IS NOT NULL)::int AS with_ext
    FROM places WHERE merged_into_id IS NULL AND (state = '' OR state IS NULL)
    GROUP BY 1`);
  console.log('missing-state by source:', missingStateBySource);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
