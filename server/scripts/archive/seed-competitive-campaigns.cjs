const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  console.log('--- Resetting campaigns & catalog ---');
  await p.rewardClaim.deleteMany();
  await p.rewardCampaign.deleteMany();
  await p.rewardCatalog.deleteMany();
  console.log('  Cleared all claims, campaigns, catalog');

  const CAMPAIGNS = [
    {
      name: 'PalSafar Merchandise Bundle — Only 10 Left!',
      description: '🚀 First 10 users to reach 15,000 Pal Points get an exclusive PalSafar merchandise bundle! Branded t-shirt, travel pouch, and sticker pack shipped free. Once all 10 slots are gone, the reward is locked forever. Race to 15,000 points and claim yours before others!',
      imageUrl: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400',
      pointsRequired: 15000,
      totalWinnerSlots: 10,
      remainingWinnerSlots: 10,
      maxClaimsPerUser: 1,
      startDate: new Date('2026-01-01T00:00:00Z'),
      endDate: new Date('2027-12-31T23:59:59Z'),
      status: 'ACTIVE',
      termsAndConditions: 'First come first served. Only 10 winners. Shipping within India only. Allow 7-10 business days for delivery.',
    },
    {
      name: '₹5,000 Travel Voucher — Only 5 Left!',
      description: '🏆 The ultimate reward! First 5 users to reach 25,000 Pal Points can claim a ₹5,000 travel voucher usable at any PalSafar partner hotel, homestay, or experience. Only 5 slots available — be among the elite explorers!',
      imageUrl: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=400',
      pointsRequired: 25000,
      totalWinnerSlots: 5,
      remainingWinnerSlots: 5,
      maxClaimsPerUser: 1,
      startDate: new Date('2026-01-01T00:00:00Z'),
      endDate: new Date('2027-12-31T23:59:59Z'),
      status: 'ACTIVE',
      termsAndConditions: 'First come first served. Only 5 winners. Voucher valid for 6 months from issue. Cannot be clubbed with other offers. Applicable at partner properties on PalSafar.',
    },
  ];

  for (const c of CAMPAIGNS) {
    const created = await p.rewardCampaign.create({ data: c });
    console.log(`  Campaign: ${created.name} (${created.pointsRequired} pts, ${created.totalWinnerSlots} slots)`);
  }

  const CATALOG = [
    {
      title: 'PalSafar Explorer T-Shirt',
      description: 'Premium cotton t-shirt with PalSafar logo — claim when you reach 15,000 points!',
      category: 'merchandise',
      pointsRequired: 15000,
      value: '₹1,500',
      imageUrl: 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=200',
      isActive: true,
      sortOrder: 1,
    },
    {
      title: 'PalSafar Travel Pouch Set',
      description: 'Set of 3 travel organizer pouches with waterproof lining — 15,000 point milestone reward',
      category: 'merchandise',
      pointsRequired: 15000,
      value: '₹1,200',
      imageUrl: 'https://images.unsplash.com/photo-1547949003-9792a18a2601?w=200',
      isActive: true,
      sortOrder: 2,
    },
    {
      title: 'PalSafar Sticker Pack',
      description: '10 premium vinyl stickers featuring Indian travel destinations — exclusive 15K reward',
      category: 'merchandise',
      pointsRequired: 15000,
      value: '₹300',
      imageUrl: 'https://images.unsplash.com/photo-1572375992501-4b0892d50c69?w=200',
      isActive: true,
      sortOrder: 3,
    },
    {
      title: '₹5,000 Travel Voucher',
      description: 'Usable across all partner hotels, homestays, and experiences — only 5 available at 25,000 points!',
      category: 'voucher',
      pointsRequired: 25000,
      value: '₹5,000',
      imageUrl: 'https://images.unsplash.com/photo-1598439210625-5067c578f3f6?w=200',
      isActive: true,
      sortOrder: 4,
    },
    {
      title: 'PalSafar Elite Status',
      description: 'Exclusive elite badge on your profile + priority support — recognized as a top explorer (25K club)',
      category: 'recognition',
      pointsRequired: 25000,
      value: '—',
      imageUrl: 'https://images.unsplash.com/photo-1567427017947-545c5f8d16ad?w=200',
      isActive: true,
      sortOrder: 5,
    },
  ];

  for (const entry of CATALOG) {
    const created = await p.rewardCatalog.create({ data: entry });
    console.log(`  Catalog: ${created.title} (${created.pointsRequired} pts)`);
  }

  // Give users enough points to claim and test
  const sneha = await p.user.findUnique({ where: { email: 'rahul.chelani@palsafar.com' } });
  if (sneha) {
    await p.wallet.upsert({
      where: { userId: sneha.id },
      update: { palPoints: 28000, lifetimeEarned: { increment: 3000 } },
      create: { userId: sneha.id, palPoints: 28000, lifetimeEarned: 28000 },
    });
    console.log('  Rahul Chelani: 28,000 pts — can claim both tiers');
  }

  const priya = await p.user.findUnique({ where: { email: 'tourist@palsafar.com' } });
  if (priya) {
    await p.wallet.upsert({
      where: { userId: priya.id },
      update: { palPoints: 18000, lifetimeEarned: { increment: 3000 } },
      create: { userId: priya.id, palPoints: 18000, lifetimeEarned: 18000 },
    });
    console.log('  Priya Sharma: 18,000 pts — can claim Tier 1');
  }

  console.log('\n--- Done ---');
  await p.$disconnect();
})();
