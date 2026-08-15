const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const r = await p.place.deleteMany({
    where: { category: { in: ['RESTAURANT', 'HOTEL', 'SHOPPING'] } },
  });
  console.log('Deleted: ' + r.count + ' places');
  const t = await p.place.count();
  console.log('Remaining: ' + t);
  const cat = await p.$queryRaw`SELECT category, COUNT(*)::int as cnt FROM places GROUP BY category ORDER BY cnt DESC`;
  console.log('Categories:');
  cat.forEach(c => console.log('  ' + c.category + ': ' + c.cnt));
  await p.$disconnect();
})();
