/**
 * One-shot: dedupe Place.images arrays and PlaceImage rows (keep oldest).
 * Usage: node server/scripts/cleanup-duplicate-images.cjs
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function dedupe(urls) {
  const seen = new Set();
  const out = [];
  for (const u of urls || []) {
    const url = String(u || '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

(async () => {
  const places = await prisma.place.findMany({
    select: { id: true, images: true, thumbnail: true },
  });
  let placesFixed = 0;
  for (const p of places) {
    const next = dedupe(p.images);
    if (next.length !== (p.images || []).length) {
      await prisma.place.update({
        where: { id: p.id },
        data: {
          images: next,
          thumbnail: p.thumbnail && next.includes(p.thumbnail) ? p.thumbnail : next[0] || null,
        },
      });
      placesFixed++;
    }
  }

  const rows = await prisma.placeImage.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, placeId: true, url: true },
  });
  const seen = new Set();
  const dupIds = [];
  for (const r of rows) {
    const key = `${r.placeId}|${r.url}`;
    if (seen.has(key)) dupIds.push(r.id);
    else seen.add(key);
  }
  if (dupIds.length) {
    // delete in chunks
    for (let i = 0; i < dupIds.length; i += 200) {
      await prisma.placeImage.deleteMany({ where: { id: { in: dupIds.slice(i, i + 200) } } });
    }
  }

  console.log(
    JSON.stringify(
      { placesFixed, placeImageDupesDeleted: dupIds.length, placesScanned: places.length },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
