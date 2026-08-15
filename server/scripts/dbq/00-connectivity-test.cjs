process.env.DOTENV_CONFIG_PATH = __dirname + '/../../.env';
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });

const { PrismaClient } = require('@prisma/client');

async function main() {
  const p = new PrismaClient();
  const r = await p.$queryRaw`SELECT version() AS version, now() AS ts`;
  console.log('CONNECTED:', r[0].version);
  console.log('SERVER_TS:', r[0].ts.toISOString());
  await p.$disconnect();
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
