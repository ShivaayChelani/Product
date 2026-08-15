const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const rows = await p.place.findMany({
    where: {
      status: 'APPROVED',
      category: { notIn: ['SHOPPING', 'RESTAURANT', 'HOTEL'] },
    },
    select: {
      name: true,
      city: true,
      state: true,
      latitude: true,
      longitude: true,
      source: true,
    },
  });

  const byNameCityState = new Map();
  const byCoordName = new Map();

  for (const r of rows) {
    const n = String(r.name || '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');
    const c = String(r.city || '')
      .toLowerCase()
      .trim();
    const s = String(r.state || '')
      .toLowerCase()
      .trim();
    const k1 = `${n}|${c}|${s}`;
    byNameCityState.set(k1, (byNameCityState.get(k1) || 0) + 1);

    const lat = Math.round(Number(r.latitude) * 1000);
    const lng = Math.round(Number(r.longitude) * 1000);
    const k2 = `${n}|${lat},${lng}`;
    byCoordName.set(k2, (byCoordName.get(k2) || 0) + 1);
  }

  const uniqueNameCityState = byNameCityState.size;
  const uniqueCoordName = byCoordName.size;
  const dupNameCityState = [...byNameCityState.values()].filter((v) => v > 1).length;
  const extraNameCityState = [...byNameCityState.values()].reduce((a, v) => a + (v - 1), 0);
  const dupCoord = [...byCoordName.values()].filter((v) => v > 1).length;
  const extraCoord = [...byCoordName.values()].reduce((a, v) => a + (v - 1), 0);

  console.log(
    JSON.stringify(
      {
        approvedTouristRows: rows.length,
        uniqueByNameCityState: uniqueNameCityState,
        duplicateGroups_nameCityState: dupNameCityState,
        extraDuplicateRows_nameCityState: extraNameCityState,
        uniqueByNameAndApproxCoord100m: uniqueCoordName,
        duplicateGroups_nameCoord: dupCoord,
        extraDuplicateRows_nameCoord: extraCoord,
        recommendedUniqueCount: uniqueCoordName,
      },
      null,
      2,
    ),
  );

  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
