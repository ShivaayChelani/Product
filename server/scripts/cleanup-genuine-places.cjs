/**
 * Keep only genuine, unique tourist places.
 *
 * Removes:
 *  - commercial categories (SHOPPING / RESTAURANT / HOTEL)
 *  - synthetic bulk rows (bulk-place-* slugs / names)
 *  - invalid coords / empty names
 *  - duplicates (same name + ~100m coords, and same name+city+state)
 *
 * Preference when keeping one of a duplicate group:
 *  CURATED > WIKIMEDIA > OSM > others, then richer data, then older row.
 *
 * Run:
 *   node scripts/cleanup-genuine-places.cjs --dry-run
 *   node scripts/cleanup-genuine-places.cjs
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

const COMMERCIAL = new Set(['SHOPPING', 'RESTAURANT', 'HOTEL']);
const SOURCE_RANK = {
  CURATED: 400,
  WIKIMEDIA: 300,
  OSM: 200,
  HIDDEN_GEM: 150,
  PARTNER: 120,
  ADMIN: 50,
};

function normName(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function coordKey(lat, lng) {
  // ~100m buckets
  return `${Math.round(Number(lat) * 1000)},${Math.round(Number(lng) * 1000)}`;
}

function score(p) {
  let s = SOURCE_RANK[String(p.source || '').toUpperCase()] || 0;
  if (String(p.status).toUpperCase() === 'APPROVED') s += 100;
  else if (String(p.status).toUpperCase() === 'PENDING') s += 40;
  if (p.city && String(p.city).trim()) s += 40;
  if (p.state && String(p.state).trim()) s += 10;
  s += Math.min(String(p.description || '').length / 20, 40);
  s += Math.min((Array.isArray(p.images) ? p.images.length : 0) * 5, 25);
  if (p.externalId) s += 15;
  // Prefer older canonical import
  s -= Math.min(new Date(p.createdAt).getTime() / 1e12, 5);
  return s;
}

function pickWinner(group) {
  return [...group].sort((a, b) => {
    const d = score(b) - score(a);
    if (d !== 0) return d;
    return new Date(a.createdAt) - new Date(b.createdAt);
  })[0];
}

async function deleteIds(ids, label) {
  if (!ids.length) {
    console.log(`[${label}] nothing to delete`);
    return 0;
  }
  console.log(`[${label}] ${DRY_RUN ? 'would delete' : 'deleting'} ${ids.length} rows…`);
  if (DRY_RUN) return ids.length;

  // Clear nullable FKs that may not cascade
  await prisma.reel.updateMany({ where: { placeId: { in: ids } }, data: { placeId: null } });
  await prisma.auditLog.updateMany({ where: { placeId: { in: ids } }, data: { placeId: null } });

  const BATCH = 500;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const res = await prisma.place.deleteMany({ where: { id: { in: chunk } } });
    deleted += res.count;
    if (i % 5000 === 0 || i + BATCH >= ids.length) {
      console.log(`  … ${deleted}/${ids.length}`);
    }
  }
  return deleted;
}

async function main() {
  console.log(`=== Genuine place cleanup [${DRY_RUN ? 'DRY RUN' : 'LIVE'}] ===\n`);

  const before = await prisma.place.count();
  console.log(`Places before: ${before}`);

  // 1) Remove commercial / fake / invalid
  const junk = await prisma.place.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      category: true,
      latitude: true,
      longitude: true,
      source: true,
    },
  });

  const junkIds = [];
  for (const p of junk) {
    const cat = String(p.category || '').toUpperCase();
    const name = String(p.name || '').trim();
    const slug = String(p.slug || '');
    const lat = Number(p.latitude);
    const lng = Number(p.longitude);
    const isCommercial = COMMERCIAL.has(cat);
    const isBulk =
      slug.startsWith('bulk-place') ||
      /^bulk[\s_-]?place/i.test(name) ||
      /^fake[\s_-]?place/i.test(name);
    const badName = !name || name.length < 2 || /^unnamed$/i.test(name);
    const badCoords =
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < 6 ||
      lat > 38 ||
      lng < 68 ||
      lng > 98;

    if (isCommercial || isBulk || badName || badCoords) junkIds.push(p.id);
  }

  await deleteIds(junkIds, 'junk/commercial/fake/invalid');

  // 2) Load remaining for dedupe
  const places = await prisma.place.findMany({
    select: {
      id: true,
      name: true,
      city: true,
      state: true,
      latitude: true,
      longitude: true,
      status: true,
      source: true,
      description: true,
      images: true,
      externalId: true,
      createdAt: true,
      slug: true,
    },
  });
  console.log(`\nPlaces after junk purge: ${places.length}`);

  const remove = new Set();

  // 2a) Dedupe by name + approx coordinates (main OSM re-import duplicates)
  const byCoordName = new Map();
  for (const p of places) {
    if (remove.has(p.id)) continue;
    const key = `${normName(p.name)}|${coordKey(p.latitude, p.longitude)}`;
    if (!byCoordName.has(key)) byCoordName.set(key, []);
    byCoordName.get(key).push(p);
  }
  let coordDupGroups = 0;
  for (const group of byCoordName.values()) {
    if (group.length < 2) continue;
    coordDupGroups++;
    const winner = pickWinner(group);
    for (const p of group) {
      if (p.id !== winner.id) remove.add(p.id);
    }
  }
  console.log(`Coord+name duplicate groups: ${coordDupGroups}`);

  // 2b) Dedupe by name + city + state (when city present)
  const remaining = places.filter((p) => !remove.has(p.id));
  const byLocName = new Map();
  for (const p of remaining) {
    const city = String(p.city || '').trim().toLowerCase();
    const state = String(p.state || '').trim().toLowerCase();
    if (!city) continue; // empty city keys are too lossy
    const key = `${normName(p.name)}|${city}|${state}`;
    if (!byLocName.has(key)) byLocName.set(key, []);
    byLocName.get(key).push(p);
  }
  let locDupGroups = 0;
  for (const group of byLocName.values()) {
    if (group.length < 2) continue;
    locDupGroups++;
    const winner = pickWinner(group);
    for (const p of group) {
      if (p.id !== winner.id) remove.add(p.id);
    }
  }
  console.log(`Name+city+state duplicate groups: ${locDupGroups}`);

  const dupIds = [...remove];
  await deleteIds(dupIds, 'duplicates');

  const after = await prisma.place.count();
  const bySource = await prisma.place.groupBy({ by: ['source'], _count: true });
  const commercial = await prisma.place.count({
    where: { category: { in: ['SHOPPING', 'RESTAURANT', 'HOTEL'] } },
  });
  const bulk = await prisma.place.count({
    where: { OR: [{ slug: { startsWith: 'bulk-place' } }, { name: { startsWith: 'Bulk Place' } }] },
  });

  console.log('\n=== Result ===');
  console.log(
    JSON.stringify(
      {
        before,
        after,
        removed: before - after,
        commercialLeft: commercial,
        bulkLeft: bulk,
        bySource,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
