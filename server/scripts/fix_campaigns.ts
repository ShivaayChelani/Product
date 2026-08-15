import { prisma } from '../src/config/database';

async function main() {
  console.log('Inspecting RewardCampaigns in database...');
  const campaigns = await prisma.rewardCampaign.findMany();
  console.log('Current campaigns count:', campaigns.length);

  for (const c of campaigns) {
    console.log(`Campaign ID: ${c.id}, Name: ${c.name}, Slots: ${c.remainingWinnerSlots}/${c.totalWinnerSlots}, Status: ${c.status}`);
  }

  // Update existing campaigns to have 50 totalWinnerSlots and 35 remainingWinnerSlots (so 15/50 claimed, 35 available!)
  if (campaigns.length > 0) {
    const updated = await prisma.rewardCampaign.updateMany({
      data: {
        totalWinnerSlots: 50,
        remainingWinnerSlots: 35,
        status: 'ACTIVE',
      },
    });
    console.log(`Updated ${updated.count} campaigns to 35/50 available.`);
  } else {
    // Seed standard reward campaigns if empty
    const c1 = await prisma.rewardCampaign.create({
      data: {
        name: 'PalSafar Travel Helmet & Accessories',
        description: 'Premium DOT certified riding helmet with bluetooth headset compatibility for road trips!',
        imageUrl: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=600',
        pointsRequired: 2500,
        totalWinnerSlots: 50,
        remainingWinnerSlots: 38,
        maxClaimsPerUser: 1,
        startDate: new Date(Date.now() - 86400000),
        endDate: new Date(Date.now() + 30 * 86400000),
        status: 'ACTIVE',
      },
    });
    const c2 = await prisma.rewardCampaign.create({
      data: {
        name: '4K Action Camera Travel Voucher',
        description: 'Capture high-speed reels in 4K 60fps with waterproof housing and chest mount.',
        imageUrl: 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600',
        pointsRequired: 5000,
        totalWinnerSlots: 30,
        remainingWinnerSlots: 22,
        maxClaimsPerUser: 1,
        startDate: new Date(Date.now() - 86400000),
        endDate: new Date(Date.now() + 30 * 86400000),
        status: 'ACTIVE',
      },
    });
    const c3 = await prisma.rewardCampaign.create({
      data: {
        name: 'Luxury Resort Weekend Stay Voucher',
        description: 'Free 2-night stay for 2 adults at partner heritage resorts in Madhya Pradesh.',
        imageUrl: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600',
        pointsRequired: 10000,
        totalWinnerSlots: 20,
        remainingWinnerSlots: 14,
        maxClaimsPerUser: 1,
        startDate: new Date(Date.now() - 86400000),
        endDate: new Date(Date.now() + 30 * 86400000),
        status: 'ACTIVE',
      },
    });
    console.log(`Created 3 new active reward campaigns.`);
  }
}

main()
  .catch((e) => console.error('Error fixing campaigns:', e))
  .finally(async () => {
    await prisma.$disconnect();
  });
