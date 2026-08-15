/**
 * Correction: normalize 3 straggler state values to proper-case official names
 * (matching DB convention). Updates places.state and the matching
 * place_field_provenance value_json atomically.
 */
process.env.DOTENV_CONFIG_PATH = __dirname + '/../../.env';
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

const FIXES = [
  { id: 'cmrnxh36l01qff9dk6lmbhepp', from: 'tamil nadu', to: 'Tamil Nadu' },
  { id: 'cmrnxti2404h7f9dksze45kdk', from: 'andhra pradesh', to: 'Andhra Pradesh' },
  { id: 'cmrnxud8q04ntf9dk6fla00ch', from: 'goa', to: 'Goa' },
];

(async () => {
  await prisma.$executeRawUnsafe('BEGIN');
  try {
    for (const f of FIXES) {
      const rows = await prisma.$executeRawUnsafe(
        `UPDATE places SET state = $2, updated_at = NOW() WHERE id = $1 AND state = $3`,
        f.id, f.to, f.from);
      const provRows = await prisma.$executeRawUnsafe(
        `UPDATE place_field_provenance
         SET value_json = jsonb_build_object('value', $2)
         WHERE place_id = $1 AND field_name = 'state' AND value_json->>'value' = $3`,
        f.id, f.to, f.from);
      console.log(`${f.id}: place_rows=${rows} provenance_rows=${provRows}`);
    }
    await prisma.$executeRawUnsafe('COMMIT');
    console.log('COMMIT ok');
  } catch (e) {
    await prisma.$executeRawUnsafe('ROLLBACK').catch(() => {});
    throw e;
  }
  const bad = await prisma.$queryRawUnsafe(`SELECT id, name, state FROM places WHERE id IN (${FIXES.map(() => '?').join(',')})`, ...FIXES.map((f) => f.id));
  for (const r of bad) console.log(`${r.name}: state=${JSON.stringify(r.state)}`);
  await prisma.$disconnect();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
