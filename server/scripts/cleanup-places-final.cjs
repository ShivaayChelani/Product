const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const markets = await p.place.findMany({
    where: { OR: [{ category: 'market' }, { category: 'MARKET' }] },
    select: { id: true, name: true },
  });
  console.log('markets', markets.length);
  if (markets.length) {
    const ids = markets.map((m) => m.id);
    await p.reel.updateMany({ where: { placeId: { in: ids } }, data: { placeId: null } });
    await p.auditLog.updateMany({ where: { placeId: { in: ids } }, data: { placeId: null } });
    await p.place.deleteMany({ where: { id: { in: ids } } });
  }

  const rej = await p.place.deleteMany({ where: { status: 'REJECTED' } });
  console.log('rejected deleted', rej.count);

  const rows = await p.place.findMany({
    select: {
      id: true,
      name: true,
      city: true,
      state: true,
      source: true,
      createdAt: true,
    },
  });
  const map = new Map();
  for (const r of rows) {
    const city = String(r.city || '').trim().toLowerCase();
    if (!city) continue;
    const k = `${String(r.name).toLowerCase().trim()}|${city}|${String(r.state || '')
      .toLowerCase()
      .trim()}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  const del = [];
  for (const g of map.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => {
      const rank = { CURATED: 4, WIKIMEDIA: 3, OSM: 2, ADMIN: 1 };
      return (rank[b.source] || 0) - (rank[a.source] || 0) || a.createdAt - b.createdAt;
    });
    for (const x of g.slice(1)) del.push(x.id);
  }
  if (del.length) {
    await p.reel.updateMany({ where: { placeId: { in: del } }, data: { placeId: null } });
    await p.auditLog.updateMany({ where: { placeId: { in: del } }, data: { placeId: null } });
    await p.place.deleteMany({ where: { id: { in: del } } });
  }
  console.log('extra loc dups deleted', del.length);
  console.log('final', await p.place.count());
  console.log(await p.place.groupBy({ by: ['source'], _count: true }));
  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
