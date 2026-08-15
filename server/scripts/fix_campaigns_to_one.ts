import { prisma } from '../src/config/database';

async function main() {
  console.log('Setting reward campaigns to 0/1 claimed (1 total slot, 1 remaining slot)...');
  
  const updated = await prisma.rewardCampaign.updateMany({
    data: {
      totalWinnerSlots: 1,
      remainingWinnerSlots: 1,
      maxClaimsPerUser: 1,
      status: 'ACTIVE',
    },
  });

  console.log(`Updated ${updated.count} campaigns to 0/1 claimed (1 slot available for 1 user).`);
}

main()
  .catch((e) => console.error('Error fixing campaigns:', e))
  .finally(async () => {
    await prisma.$disconnect();
  });
