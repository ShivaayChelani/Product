import { PrismaClient, User } from '@prisma/client';

export async function seedCampaigns(prisma: PrismaClient, users: User[], vendorOffers: any[]) {
  console.log('--- Seeding 07_campaigns.ts ---');

  if (users.length === 0) return;

  // 1. Reward Campaigns
  const campaignsData = [
    {
      name: 'GoPro Hero 12 Giveaway',
      description: 'Exchange 50,000 points to enter the lucky draw for a GoPro Hero 12!',
      pointsRequired: 50000,
      totalWinnerSlots: 5,
      remainingWinnerSlots: 5,
      imageUrl: 'https://images.unsplash.com/photo-1527631120902-38d58c87ab24?w=500',
      startDate: new Date(Date.now() - 5 * 86400000),
      endDate: new Date(Date.now() + 25 * 86400000),
      status: 'ACTIVE',
    },
    {
      name: 'Free Domestic Flight Ticket',
      description: 'Redeem 100,000 points for a free round-trip domestic flight anywhere in India.',
      pointsRequired: 100000,
      totalWinnerSlots: 10,
      remainingWinnerSlots: 8,
      imageUrl: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=500',
      startDate: new Date(Date.now() - 10 * 86400000),
      endDate: new Date(Date.now() + 20 * 86400000),
      status: 'ACTIVE',
    },
    {
      name: 'PalSafar Exclusive Travel Mug',
      description: 'Redeem 5,000 points for a limited edition travel mug.',
      pointsRequired: 5000,
      totalWinnerSlots: 100,
      remainingWinnerSlots: 45,
      imageUrl: 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=500',
      startDate: new Date(Date.now() - 30 * 86400000),
      endDate: new Date(Date.now() + 30 * 86400000),
      status: 'ACTIVE',
    }
  ];

  const createdCampaigns = [];
  for (const c of campaignsData) {
    const campaign = await prisma.rewardCampaign.create({ data: c as any });
    createdCampaigns.push(campaign);
  }
  console.log(`Seeded ${createdCampaigns.length} Reward Campaigns`);

  // 2. Reward Claims
  const claimsData = [];
  for (const u of users) {
    if (Math.random() > 0.8) {
      claimsData.push({
        userId: u.id,
        campaignId: createdCampaigns[2].id, // Mug
        redemptionId: `REWARD-${Date.now()}-${Math.random()}`,
        pointsSpent: 5000,
        status: 'PENDING',
        notes: 'Shipping address: 123 Fake Street, Delhi, India',
        claimedAt: new Date(Date.now() - Math.floor(Math.random() * 20 * 86400000)),
      });
    }
  }

  if (claimsData.length > 0) {
    await prisma.rewardClaim.createMany({ data: claimsData as any });
  }
  console.log(`Seeded ${claimsData.length} Reward Claims`);

  // 3. QR Redemptions (Vendor Offers)
  if (vendorOffers.length > 0) {
    const redemptionsData = [];
    for (const u of users) {
      const redemptionCount = Math.floor(Math.random() * 5);
      for (let i = 0; i < redemptionCount; i++) {
        const offer = vendorOffers[Math.floor(Math.random() * vendorOffers.length)];
        redemptionsData.push({
          userId: u.id,
          offerId: offer.id,
          vendorId: offer.vendorId,
          pointsSpent: offer.pointsRequired,
          discountValue: offer.discountValue,
          discountType: offer.discountType,
          status: 'VERIFIED',
          qrCode: `QR-SEED-${Date.now()}-${Math.random()}`,
          createdAt: new Date(Date.now() - Math.floor(Math.random() * 30 * 86400000)),
          verifiedAt: new Date(Date.now() - Math.floor(Math.random() * 29 * 86400000)),
        });
      }
    }

    if (redemptionsData.length > 0) {
      await prisma.redemption.createMany({ data: redemptionsData as any });
    }
    console.log(`Seeded ${redemptionsData.length} QR Redemptions`);
  }
}
