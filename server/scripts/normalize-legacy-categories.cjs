const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const map = [
    ['HERITAGE', 'MONUMENT'],
    ['NATURE', 'PARK'],
    ['SPIRITUAL', 'TEMPLE'],
  ];
  for (const [from, to] of map) {
    const n = await p.$executeRawUnsafe(
      `UPDATE places SET category = $1::"PlaceCategory" WHERE category::text = $2`,
      to,
      from,
    );
    console.log(`${from} -> ${to}: ${n}`);
  }
  console.log('total', await p.place.count());
  console.log(await p.place.groupBy({ by: ['source'], _count: true }));
  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
