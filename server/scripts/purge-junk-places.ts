/**
 * Remove junk places (Wikidata inventory lists, "108 temples" groups, etc.)
 *
 *   ts-node scripts/purge-junk-places.ts --dry-run
 *   ts-node scripts/purge-junk-places.ts
 */
import { PrismaClient } from '@prisma/client';
import { isJunkPlaceName } from '../src/shared/utils/placeNameQuality';

const prisma = new PrismaClient();
const DRY = process.argv.includes('--dry-run');

async function main() {
  const rows = await prisma.place.findMany({
    where: { mergedIntoId: null },
    select: { id: true, name: true, externalId: true, source: true },
  });

  const junk = rows.filter((r) => isJunkPlaceName(r.name));
  console.log(`Found ${junk.length} junk places out of ${rows.length}`);

  if (junk.length > 0) {
    console.log('Sample:', junk.slice(0, 8).map((j) => j.name));
  }

  if (DRY || junk.length === 0) {
    console.log(DRY ? '(dry-run — no deletes)' : 'Nothing to purge.');
    return;
  }

  const ids = junk.map((j) => j.id);
  const chunk = 150;
  let deleted = 0;

  for (let i = 0; i < ids.length; i += chunk) {
    const batch = ids.slice(i, i + chunk);
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
    deleted += batch.length;
    process.stdout.write(`\r  purged ${deleted}/${ids.length}`);
  }

  console.log(`\nDone. Removed ${deleted} junk places. DB total: ${await prisma.place.count()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
