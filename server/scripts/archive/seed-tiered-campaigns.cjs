const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  // 1. Delete all existing data
  console.log('--- Cleaning old campaigns & catalog ---');
  await p.rewardClaim.deleteMany();
  await p.rewardCampaign.deleteMany();
  await p.rewardCatalog.deleteMany();
  console.log('  Deleted all claims, campaigns, catalog entries');

  // 2. Create tiered campaigns (lifetimeEarned milestones, spend points to claim)
  const CAMPAIGNS = [
    {
      name: 'PalSafar Merchandise Bundle',
      description: 'Reach 15,000 Pal Points and claim an exclusive PalSafar merchandise bundle — includes a branded t-shirt, travel pouch, and sticker pack shipped to your doorstep.',
      imageUrl: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400',
      pointsRequired: 15000,
      totalWinnerSlots: 100,
      remainingWinnerSlots: 100,
      maxClaimsPerUser: 1,
      startDate: new Date('2026-01-01T00:00:00Z'),
      endDate: new Date('2027-12-31T23:59:59Z'),
      status: 'ACTIVE',
      termsAndConditions: 'Valid while stocks last. Shipping within India only. Allow 7-10 business days for delivery.',
    },
    {
      name: 'PalSafar Premium Travel Voucher',
      description: 'Accumulate 20,000 Pal Points and redeem for a ₹5,000 travel voucher usable across partner hotels, homestays, and experiences on PalSafar — plan your dream trip on us!',
      imageUrl: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=400',
      pointsRequired: 20000,
      totalWinnerSlots: 50,
      remainingWinnerSlots: 50,
      maxClaimsPerUser: 1,
      startDate: new Date('2026-01-01T00:00:00Z'),
      endDate: new Date('2027-12-31T23:59:59Z'),
      status: 'ACTIVE',
      termsAndConditions: 'Voucher valid for 6 months from issue. Cannot be clubbed with other offers. Applicable at partner properties listed on PalSafar.',
    },
  ];

  for (const c of CAMPAIGNS) {
    const created = await p.rewardCampaign.create({ data: c });
    console.log(`  Created campaign: ${created.name} (${created.pointsRequired} pts)`);
  }

  // 3. Create catalog entries that users can see as milestone rewards
  const CATALOG = [
    {
      title: 'PalSafar Explorer T-Shirt',
      description: 'Premium cotton t-shirt with PalSafar logo — perfect for your travel adventures',
      category: 'merchandise',
      pointsRequired: 15000,
      value: '₹1,500',
      imageUrl: 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=200',
      isActive: true,
      sortOrder: 1,
    },
    {
      title: 'PalSafar Travel Pouch Set',
      description: 'Set of 3 travel organizer pouches with waterproof lining',
      category: 'merchandise',
      pointsRequired: 15000,
      value: '₹1,200',
      imageUrl: 'https://images.unsplash.com/photo-1547949003-9792a18a2601?w=200',
      isActive: true,
      sortOrder: 2,
    },
    {
      title: 'PalSafar Sticker Pack',
      description: '10 premium vinyl stickers featuring Indian travel destinations',
      category: 'merchandise',
      pointsRequired: 15000,
      value: '₹300',
      imageUrl: 'https://images.unsplash.com/photo-1572375992501-4b0892d50c69?w=200',
      isActive: true,
      sortOrder: 3,
    },
    {
      title: '₹5,000 Travel Voucher',
      description: 'Usable across all partner hotels, homestays, and experiences on PalSafar platform',
      category: 'voucher',
      pointsRequired: 20000,
      value: '₹5,000',
      imageUrl: 'https://images.unsplash.com/photo-1598439210625-5067c578f3f6?w=200',
      isActive: true,
      sortOrder: 4,
    },
    {
      title: 'PalSafar Elite Badge',
      description: 'Exclusive elite badge on your profile — recognized as a top PalSafar explorer',
      category: 'recognition',
      pointsRequired: 20000,
      value: '—',
      imageUrl: 'https://images.unsplash.com/photo-1567427017947-545c5f8d16ad?w=200',
      isActive: true,
      sortOrder: 5,
    },
  ];

  for (const entry of CATALOG) {
    const created = await p.rewardCatalog.create({ data: entry });
    console.log(`  Created catalog: ${created.title} (${created.pointsRequired} pts)`);
  }

  // 4. Give Rahul Chelani enough wallet points to actually claim
  const sneha = await p.user.findUnique({ where: { email: 'rahul.chelani@palsafar.com' } });
  if (sneha) {
    const wallet = await p.wallet.findUnique({ where: { userId: sneha.id } });
    if (wallet) {
      if (wallet.palPoints < 20000) {
        await p.wallet.update({
          where: { userId: sneha.id },
          data: {
            palPoints: 25000,
            lifetimeEarned: { increment: wallet.palPoints < 25000 ? (25000 - wallet.palPoints) : 0 },
          },
        });
        console.log(`  Updated Rahul Chelani wallet: 25,000 pts (can claim both tiers)`);
      } else {
        console.log(`  Rahul Chelani already has ${wallet.palPoints} pts`);
      }
    }
  }

  // 5. Also give Priya enough to reach 15000
  const priya = await p.user.findUnique({ where: { email: 'tourist@palsafar.com' } });
  if (priya) {
    const wallet = await p.wallet.findUnique({ where: { userId: priya.id } });
    if (wallet && wallet.palPoints < 15000) {
      await p.wallet.update({
        where: { userId: priya.id },
        data: {
          palPoints: 16000,
          lifetimeEarned: { increment: 11000 },
        },
      });
      console.log(`  Updated Priya Sharma wallet: 16,000 pts (can claim Tier 1)`);
    }
  }

  console.log('\n--- Done ---');
  await p.$disconnect();
})();
