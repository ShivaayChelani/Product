import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Deleting all places and related records...');

  await prisma.tripPlanStop.deleteMany({});
  await prisma.collectionPlace.deleteMany({});
  await prisma.placeStat.deleteMany({});
  await prisma.checkIn.deleteMany({});
  await prisma.review.deleteMany({});
  await prisma.placeImage.deleteMany({});
  await prisma.placeVideo.deleteMany({});
  await prisma.placeOffer.deleteMany({});
  await prisma.placeEvent.deleteMany({});

  await prisma.reel.updateMany({ data: { placeId: null } });
  await prisma.auditLog.updateMany({ data: { placeId: null } });

  const result = await prisma.place.deleteMany({});
  console.log(`Deleted ${result.count} places. Database is now empty of places.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
