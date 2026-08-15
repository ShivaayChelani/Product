process.env.DOTENV_CONFIG_PATH = __dirname + '/../../.env';
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const triggers = await prisma.$queryRawUnsafe(`
    SELECT event_object_table AS tbl, trigger_name, action_timing, action_statement
    FROM information_schema.triggers WHERE event_object_table IN ('places') ORDER BY 1,2`);
  console.log('triggers:', JSON.stringify(triggers, null, 1));

  const cols = await prisma.$queryRawUnsafe(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'places' AND column_name IN ('search_vector','geohash','slug')
    ORDER BY 1`);
  console.log('relevant cols:', cols.map((c) => c.column_name));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
