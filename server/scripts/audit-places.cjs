const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const total = await p.place.count();
  const bySource = await p.place.groupBy({ by: ['source'], _count: true });
  const byStatus = await p.place.groupBy({ by: ['status'], _count: true });
  const byCat = await p.place.groupBy({ by: ['category'], _count: true });
  const bulk = await p.place.count({
    where: {
      OR: [
        { slug: { startsWith: 'bulk-place' } },
        { name: { startsWith: 'Bulk Place' } },
      ],
    },
  });
  const commercial = await p.place.count({
    where: { category: { in: ['SHOPPING', 'RESTAURANT', 'HOTEL'] } },
  });
  const emptyCity = await p.place.count({ where: { city: '' } });
  console.log(JSON.stringify({ total, bySource, byStatus, commercial, bulk, emptyCity, byCat }, null, 2));
  await p.$disconnect();
})().catch(async (e) => {
  console.error(e.message || e);
  await p.$disconnect();
  process.exit(1);
});
