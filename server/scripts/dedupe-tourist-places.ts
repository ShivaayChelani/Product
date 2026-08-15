/**
 * Dedupe tourist places: merge names into aliases, delete duplicate rows.
 * Same normalized name within 1km → keep best source/quality row.
 *
 *   ts-node scripts/dedupe-tourist-places.ts --dry-run
 *   ts-node scripts/dedupe-tourist-places.ts
 */
import { PrismaClient, PlaceAliasType } from '@prisma/client';
import { normalizeForMatch } from '../src/shared/utils/canonicalText';
import { isTouristWorthyPlace } from '../src/shared/utils/touristPlaceFilter';

const prisma = new PrismaClient();
const DRY = process.argv.includes('--dry-run');
const RADIUS_KM = 1.0;

const SOURCE_RANK: Record<string, number> = {
  CURATED: 500,
  WIKIMEDIA: 200,
  ADMIN: 180,
  HIDDEN_GEM: 150,
  VENDOR: 100,
  OSM: 50,
};

function score(p: {
  source: string;
  verificationLevel: number | null;
  description: string | null;
  images: string[];
  thumbnail: string | null;
  city: string;
  state: string;
  status: string;
  editorialPriority: number | null;
  externalId: string | null;
}) {
  let s = SOURCE_RANK[p.source] || 0;
  s += (p.verificationLevel || 0) * 10;
  s += Math.min(String(p.description || '').length / 10, 40);
  s += Math.min((p.images?.length || 0) * 8, 40);
  if (p.thumbnail) s += 10;
  if (p.city?.trim()) s += 15;
  if (p.state?.trim()) s += 5;
  if (p.status === 'APPROVED') s += 20;
  s += (p.editorialPriority || 0) * 5;
  if (p.externalId?.startsWith('wikidata:')) s += 10;
  return s;
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const retryable = ['P1017', 'P1001', 'P1008', 'P2024'].includes(err?.code);
      if (!retryable || attempt >= 3) throw err;
      console.warn(`\n  ${label}: DB reconnect (attempt ${attempt + 2}/4)...`);
      await prisma.$disconnect();
      await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
    }
  }
  throw new Error(`${label}: retries exhausted`);
}

async function reassignReferences(loserToWinner: Map<string, string>) {
  if (DRY || loserToWinner.size === 0) return;

  const pairs = [...loserToWinner.entries()];
  const chunk = 350;

  for (let i = 0; i < pairs.length; i += chunk) {
    const batch = pairs.slice(i, i + chunk);
    const values = batch.map(([l, w]) => `('${l.replace(/'/g, "''")}', '${w.replace(/'/g, "''")}')`).join(',');

    await withRetry(async () => {
      await prisma.$executeRawUnsafe(`
        DELETE FROM trip_plan_stops loser
        USING trip_plan_stops winner, (VALUES ${values}) AS m(loser_id, winner_id)
        WHERE loser.place_id = m.loser_id AND winner.place_id = m.winner_id
          AND loser.trip_plan_day_id = winner.trip_plan_day_id
      `);
      await prisma.$executeRawUnsafe(`
        UPDATE trip_plan_stops t
        SET place_id = m.winner_id
        FROM (VALUES ${values}) AS m(loser_id, winner_id)
        WHERE t.place_id = m.loser_id
      `);
      await prisma.$executeRawUnsafe(`
        DELETE FROM collection_places loser
        USING collection_places winner, (VALUES ${values}) AS m(loser_id, winner_id)
        WHERE loser.place_id = m.loser_id AND winner.place_id = m.winner_id
          AND loser.collection_id = winner.collection_id
      `);
      await prisma.$executeRawUnsafe(`
        UPDATE collection_places t
        SET place_id = m.winner_id
        FROM (VALUES ${values}) AS m(loser_id, winner_id)
        WHERE t.place_id = m.loser_id
      `);
    }, 'FK batch');

    process.stdout.write(`\r  FK reassigned ${Math.min(i + chunk, pairs.length)}/${pairs.length}`);
  }
  console.log('');
}

async function deleteLosers(ids: string[]) {
  if (!ids.length) return 0;
  if (DRY) {
    console.log(`[dry-run] would delete ${ids.length} duplicates`);
    return ids.length;
  }
  const chunk = 150;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += chunk) {
    const batch = ids.slice(i, i + chunk);
    await withRetry(async () => {
      await prisma.$transaction([
      prisma.tripPlanStop.deleteMany({ where: { placeId: { in: batch } } }),
      prisma.collectionPlace.deleteMany({ where: { placeId: { in: batch } } }),
      prisma.placeAlias.deleteMany({ where: { placeId: { in: batch } } }),
      prisma.placeStat.deleteMany({ where: { placeId: { in: batch } } }),
      prisma.checkIn.deleteMany({ where: { placeId: { in: batch } } }),
      prisma.review.deleteMany({ where: { placeId: { in: batch } } }),
      prisma.placeImage.deleteMany({ where: { placeId: { in: batch } } }),
      prisma.placeVideo.deleteMany({ where: { placeId: { in: batch } } }),
      prisma.placeOffer.deleteMany({ where: { placeId: { in: batch } } }),
      prisma.placeEvent.deleteMany({ where: { placeId: { in: batch } } }),
      prisma.reel.updateMany({ where: { placeId: { in: batch } }, data: { placeId: null } }),
      prisma.auditLog.updateMany({ where: { placeId: { in: batch } }, data: { placeId: null } }),
      prisma.place.deleteMany({ where: { id: { in: batch } } }),
    ]);
    }, 'delete batch');
    deleted += batch.length;
    process.stdout.write(`\r  deleted ${deleted}/${ids.length}`);
  }
  console.log('');
  return deleted;
}

async function main() {
  console.log(`Dedupe tourist places${DRY ? ' (dry-run)' : ''}...`);

  const rows = await prisma.place.findMany({
    where: {
      mergedIntoId: null,
      latitude: { not: null },
      longitude: { not: null },
      category: { notIn: ['SHOPPING', 'RESTAURANT', 'HOTEL'] },
    },
    select: {
      id: true,
      name: true,
      city: true,
      state: true,
      source: true,
      status: true,
      description: true,
      images: true,
      thumbnail: true,
      verificationLevel: true,
      editorialPriority: true,
      externalId: true,
      latitude: true,
      longitude: true,
      category: true,
      tags: true,
      createdAt: true,
    },
  });

  const touristRows = rows.filter((r) =>
    isTouristWorthyPlace({
      name: r.name,
      category: r.category,
      source: r.source,
      editorialPriority: r.editorialPriority,
      tags: r.tags,
      description: r.description,
    }),
  );

  console.log(`Loaded ${rows.length} places, ${touristRows.length} tourist-worthy`);

  const byName = new Map<string, typeof touristRows>();
  for (const r of touristRows) {
    const n = normalizeForMatch(r.name);
    if (!n || n.length < 3) continue;
    const list = byName.get(n) || [];
    list.push(r);
    byName.set(n, list);
  }

  const loserToWinner = new Map<string, string>();
  const aliasInserts: { placeId: string; alias: string; normalizedAlias: string; aliasType: PlaceAliasType; source: string }[] = [];
  const toDelete = new Set<string>();

  for (const [, group] of byName) {
    if (group.length < 2) continue;

    const clusters: (typeof group)[] = [];
    const used = new Set<string>();

    for (const p of group) {
      if (used.has(p.id)) continue;
      const cluster = [p];
      used.add(p.id);
      for (const q of group) {
        if (used.has(q.id)) continue;
        if (p.latitude == null || p.longitude == null || q.latitude == null || q.longitude == null) continue;
        const d = haversineKm(p.latitude, p.longitude, q.latitude, q.longitude);
        if (d <= RADIUS_KM) {
          cluster.push(q);
          used.add(q.id);
        }
      }
      if (cluster.length > 1) clusters.push(cluster);
    }

    for (const cluster of clusters) {
      const winner = [...cluster].sort((a, b) => score(b) - score(a))[0];
      for (const loser of cluster) {
        if (loser.id === winner.id) continue;
        loserToWinner.set(loser.id, winner.id);
        toDelete.add(loser.id);

        const aliasNorm = normalizeForMatch(loser.name);
        const winnerNorm = normalizeForMatch(winner.name);
        if (loser.name.trim() !== winner.name.trim() && aliasNorm !== winnerNorm) {
          aliasInserts.push({
            placeId: winner.id,
            alias: loser.name,
            normalizedAlias: aliasNorm,
            aliasType: PlaceAliasType.OFFICIAL_VARIANT,
            source: 'dedupe-merge',
          });
        } else if (loser.name.trim() !== winner.name.trim()) {
          aliasInserts.push({
            placeId: winner.id,
            alias: loser.name,
            normalizedAlias: aliasNorm || normalizeForMatch(loser.name + '-dup'),
            aliasType: PlaceAliasType.OFFICIAL_VARIANT,
            source: 'dedupe-merge',
          });
        }
      }
    }
  }

  console.log(`Found ${toDelete.size} duplicates → aliases for ${aliasInserts.length} names`);

  if (!DRY && aliasInserts.length > 0) {
    const chunk = 500;
    for (let i = 0; i < aliasInserts.length; i += chunk) {
      await prisma.placeAlias.createMany({
        data: aliasInserts.slice(i, i + chunk),
        skipDuplicates: true,
      });
    }
    console.log(`Created ${aliasInserts.length} aliases on canonical rows`);
  }

  await reassignReferences(loserToWinner);
  const deleted = await deleteLosers([...toDelete]);

  const total = await prisma.place.count();
  console.log(`Done. Removed ${deleted} duplicates. DB total: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
