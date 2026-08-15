/**
 * Normalize place.category to Prisma PlaceCategory uppercase enums.
 * Run: node scripts/normalize-place-categories.cjs
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const MAP = {
  temple: 'TEMPLE',
  spiritual: 'TEMPLE',
  religious: 'TEMPLE',
  monument: 'MONUMENT',
  heritage: 'MONUMENT',
  history: 'MONUMENT',
  cave: 'MONUMENT',
  fort: 'FORT',
  palace: 'PALACE',
  museum: 'MUSEUM',
  park: 'PARK',
  nature: 'PARK',
  garden: 'PARK',
  wildlife: 'WILDLIFE',
  waterfall: 'WATERFALL',
  beach: 'BEACH',
  lake: 'LAKE',
  ghat: 'GHAT',
  trek: 'TREKKING',
  trekking: 'TREKKING',
  adventure: 'TREKKING',
  church: 'OTHER',
  mosque: 'OTHER',
  gurudwara: 'OTHER',
  market: 'SHOPPING',
};

async function main() {
  const rows = await p.$queryRawUnsafe(
    `SELECT DISTINCT category::text AS category FROM places WHERE category::text <> upper(category::text)`,
  );
  console.log('Lowercase/mixed categories:', rows);

  let updated = 0;
  for (const [from, to] of Object.entries(MAP)) {
    // Only update rows whose text form matches lowercase alias
    const res = await p.$executeRawUnsafe(
      `UPDATE places SET category = $1::"PlaceCategory" WHERE category::text = $2`,
      to,
      from,
    );
    if (res) {
      console.log(`  ${from} → ${to}: ${res}`);
      updated += Number(res);
    }
  }

  // Delete any remaining commercial after normalize
  const commercial = await p.place.deleteMany({
    where: { category: { in: ['SHOPPING', 'RESTAURANT', 'HOTEL'] } },
  });

  console.log(`Normalized ${updated} rows; removed commercial ${commercial.count}`);
  console.log('Total places:', await p.place.count());
  await p.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
