import { PrismaClient } from '@prisma/client';
import { seedSystem } from './seeds/01_system';
import { seedUsers } from './seeds/02_users';

const prisma = new PrismaClient();

async function cleanDatabase(client: PrismaClient) {
  console.log('--- Cleaning Database ---');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed script cannot run in production — it would delete all data.');
  }

  const placeCount = await client.place.count();
  if (placeCount > 50) {
    console.log(
      `[SAFEGUARD] Database contains ${placeCount} existing places. Skipping database wipe to protect live data.`,
    );
    return;
  }

  await client.auditLog.deleteMany({});
  await client.redemption.deleteMany({});
  await client.rewardClaim.deleteMany({});
  await client.rewardCampaign.deleteMany({});
  await client.pointTransaction.deleteMany({});
  await client.tripPlanStop.deleteMany({});
  await client.tripPlan.deleteMany({});
  await client.collectionPlace.deleteMany({});
  await client.collection.deleteMany({});
  await client.reelLike.deleteMany({});
  await client.reelComment.deleteMany({});
  await client.reel.deleteMany({});
  await client.placeStat.deleteMany({});
  await client.checkIn.deleteMany({});
  await client.review.deleteMany({});
  await client.follow.deleteMany({});
  await client.vendorOffer.deleteMany({});
  await client.vendor.deleteMany({});
  await client.place.deleteMany({});
  await client.creatorProfile.deleteMany({});
  await client.wallet.deleteMany({});
  await client.user.deleteMany({});
  await client.pointRule.deleteMany({});
  await client.systemSetting.deleteMany({});
  console.log('Database wiped successfully.');
}

async function main() {
  console.log('=== PalSafar Minimal Seed Pipeline (system + canonical users only) ===\n');

  try {
    await cleanDatabase(prisma);
    await seedSystem(prisma);
    await seedUsers(prisma);
    console.log('\n=== Seed Completed Successfully ===\n');
  } catch (e) {
    console.error('\nSeed failed:', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
