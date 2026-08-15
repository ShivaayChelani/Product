const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const CAMPAIGNS = [
  {
    name: 'Summer Travel Bonanza',
    description: 'Win a curated travel experience package including guided tours, stay discounts, and exclusive access to hidden gems across India.',
    imageUrl: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=400',
    pointsRequired: 500,
    totalWinnerSlots: 200,
    remainingWinnerSlots: 200,
    maxClaimsPerUser: 1,
    startDate: new Date('2026-06-01T00:00:00Z'),
    endDate: new Date('2026-08-31T23:59:59Z'),
    status: 'ACTIVE',
  },
  {
    name: 'Street Food Festival',
    description: 'Redeem your Pal Points for exclusive food tours and discounts at top-rated street food vendors across Delhi, Mumbai, and Jabalpur.',
    imageUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400',
    pointsRequired: 200,
    totalWinnerSlots: 100,
    remainingWinnerSlots: 85,
    maxClaimsPerUser: 2,
    startDate: new Date('2026-05-15T00:00:00Z'),
    endDate: new Date('2026-07-15T23:59:59Z'),
    status: 'ACTIVE',
  },
  {
    name: 'Monsoon Retreat',
    description: 'Get up to 40% off on homestays and resort stays in Kerala, Goa, and Himachal. Perfect for the rainy season getaway.',
    imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400',
    pointsRequired: 300,
    totalWinnerSlots: 150,
    remainingWinnerSlots: 120,
    maxClaimsPerUser: 1,
    startDate: new Date('2026-07-01T00:00:00Z'),
    endDate: new Date('2026-09-30T23:59:59Z'),
    status: 'ACTIVE',
  },
  {
    name: 'Weekend Gateway',
    description: 'Plan a quick weekend trip with exclusive discounts on vehicle rentals, guided tours, and cafe visits — all in one package.',
    imageUrl: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=400',
    pointsRequired: 250,
    totalWinnerSlots: 50,
    remainingWinnerSlots: 35,
    maxClaimsPerUser: 1,
    startDate: new Date('2026-05-01T00:00:00Z'),
    endDate: new Date('2026-10-31T23:59:59Z'),
    status: 'ACTIVE',
  },
  {
    name: 'Heritage & Culture Walk',
    description: 'Explore India\'s rich heritage with guided walking tours of Jaipur, Varanasi, and Delhi. Includes entry fees and local snacks.',
    imageUrl: 'https://images.unsplash.com/photo-1599661046289-e31897846e41?w=400',
    pointsRequired: 150,
    totalWinnerSlots: 300,
    remainingWinnerSlots: 280,
    maxClaimsPerUser: 3,
    startDate: new Date('2026-04-01T00:00:00Z'),
    endDate: new Date('2026-12-31T23:59:59Z'),
    status: 'ACTIVE',
  },
  {
    name: 'New Year Celebration',
    description: 'Ring in 2027 with a premium celebration package — dinner at top restaurants, harbour cruise tickets, and souvenir hampers.',
    imageUrl: 'https://images.unsplash.com/photo-1467810563316-b5476525c0f9?w=400',
    pointsRequired: 600,
    totalWinnerSlots: 75,
    remainingWinnerSlots: 75,
    maxClaimsPerUser: 1,
    startDate: new Date('2026-12-20T00:00:00Z'),
    endDate: new Date('2027-01-05T23:59:59Z'),
    status: 'PAUSED',
  },
  {
    name: 'Diwali Dhamaka',
    description: 'Celebrate the festival of lights with special discounts on shopping, sweets hampers, and festive tour packages across India.',
    imageUrl: 'https://images.unsplash.com/photo-1577083552431-6e5fd01988ec?w=400',
    pointsRequired: 400,
    totalWinnerSlots: 100,
    remainingWinnerSlots: 100,
    maxClaimsPerUser: 2,
    startDate: new Date('2026-10-15T00:00:00Z'),
    endDate: new Date('2026-11-15T23:59:59Z'),
    status: 'DRAFT',
  },
  {
    name: 'Souvenir Shopping Spree',
    description: 'Redeem points for exclusive handloom and handicraft souvenirs from Banaras Silk Emporium, Jaipur Blue Pottery Studio, and Mumbai Harbour Gifts.',
    imageUrl: 'https://images.unsplash.com/photo-1560343090-f0409e92791a?w=400',
    pointsRequired: 350,
    totalWinnerSlots: 80,
    remainingWinnerSlots: 80,
    maxClaimsPerUser: 2,
    startDate: new Date('2026-09-01T00:00:00Z'),
    endDate: new Date('2026-11-30T23:59:59Z'),
    status: 'DRAFT',
  },
];

const CATALOG_ENTRIES = [
  {
    title: 'Handwoven Banaras Silk Scarf',
    description: 'Authentic Banarasi silk scarf — a perfect souvenir from Varanasi',
    category: 'handicrafts',
    pointsRequired: 200,
    value: '₹1,200',
    imageUrl: 'https://images.unsplash.com/photo-1603400521630-9f2de124b33b?w=200',
  },
  {
    title: 'Blue Pottery Coffee Mug Set',
    description: 'Set of 2 hand-painted blue pottery mugs from Jaipur',
    category: 'handicrafts',
    pointsRequired: 150,
    value: '₹800',
    imageUrl: 'https://images.unsplash.com/photo-1514228742587-6b4658e1d0b6?w=200',
  },
  {
    title: 'Goa Beachside Stay Voucher',
    description: 'One night complimentary stay at Goa Beachside Cafe homestay',
    category: 'stay',
    pointsRequired: 500,
    value: '₹3,000',
    imageUrl: 'https://images.unsplash.com/photo-1596394516093-501ba68a0ba6?w=200',
  },
  {
    title: 'Kerala Backwater Homestay - 2 Nights',
    description: '2 nights stay at Kerala Backwater Homestay, Alleppey with breakfast',
    category: 'stay',
    pointsRequired: 800,
    value: '₹5,000',
    imageUrl: 'https://images.unsplash.com/photo-1596178060671-7a80dc8058f0?w=200',
  },
  {
    title: 'Chennai Auto Day Rental',
    description: 'Full day auto-rickshaw rental for sightseeing in Chennai',
    category: 'transport',
    pointsRequired: 300,
    value: '₹1,500',
    imageUrl: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=200',
  },
  {
    title: 'Mumbai Harbour Gift Hamper',
    description: 'Curated gift hamper with local Mumbai souvenirs and snacks',
    category: 'gifts',
    pointsRequired: 250,
    value: '₹1,000',
    imageUrl: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=200',
  },
  {
    title: 'Street Story Cafe - Free Thali',
    description: 'Complimentary local thali at Street Story Cafe, Jabalpur',
    category: 'food',
    pointsRequired: 100,
    value: '₹350',
    imageUrl: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=200',
  },
  {
    title: 'Delhi Spice Cafe - Dinner for Two',
    description: 'Complimentary dinner for two at Delhi Spice Cafe',
    category: 'food',
    pointsRequired: 350,
    value: '₹1,800',
    imageUrl: 'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=200',
  },
  {
    title: 'Jaipur Blue Pottery Workshop',
    description: '2-hour pottery workshop with a master artisan in Jaipur',
    category: 'experiences',
    pointsRequired: 400,
    value: '₹2,000',
    imageUrl: 'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=200',
  },
  {
    title: 'Taj Palace - High Tea Voucher',
    description: 'Afternoon high tea for two at Taj Palace Hotel, Delhi',
    category: 'food',
    pointsRequired: 250,
    value: '₹1,500',
    imageUrl: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=200',
  },
  {
    title: 'Narmada Adventure - River Rafting',
    description: 'Half-day river rafting experience with Narmada Adventure Sports',
    category: 'experiences',
    pointsRequired: 450,
    value: '₹2,500',
    imageUrl: 'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=200',
  },
  {
    title: 'Raj Rajputana - 3-Day Rajasthan Tour',
    description: '3-day curated Rajasthan tour covering Jaipur, Jodhpur & Udaipur',
    category: 'experiences',
    pointsRequired: 1000,
    value: '₹8,000',
    imageUrl: 'https://images.unsplash.com/photo-1477587458883-47145ed94245?w=200',
  },
];

async function seed() {
  console.log('--- Seeding Reward Campaigns ---');

  const existing = await p.rewardCampaign.count();
  if (existing > 0) {
    console.log(`Already have ${existing} campaigns, skipping campaigns seed.`);
  } else {
    for (const c of CAMPAIGNS) {
      const created = await p.rewardCampaign.create({ data: c });
      console.log(`  Created campaign: ${created.name} (${created.status})`);
    }
  }

  console.log('\n--- Seeding Reward Catalog ---');
  const existingCatalog = await p.rewardCatalog.count();
  if (existingCatalog > 0) {
    console.log(`Already have ${existingCatalog} catalog entries, skipping catalog seed.`);
  } else {
    for (const entry of CATALOG_ENTRIES) {
      const created = await p.rewardCatalog.create({ data: entry });
      console.log(`  Created catalog: ${created.title} (${created.pointsRequired} pts)`);
    }
  }

  console.log('\n--- Adding wallet points for all non-admin users ---');
  const users = await p.user.findMany({ where: { NOT: { roles: { has: 'ADMIN' } } } });
  for (const u of users) {
    const existingWallet = await p.wallet.findUnique({ where: { userId: u.id } });
    if (!existingWallet) {
      await p.wallet.create({
        data: {
          userId: u.id,
          palPoints: 5000,
          lifetimeEarned: 10000,
          lifetimeSpent: 5000,
        },
      });
      console.log(`  Created wallet for ${u.name}: 5000 pts`);
    } else if (existingWallet.palPoints === 0) {
      await p.wallet.update({
        where: { userId: u.id },
        data: { palPoints: { increment: 3000 }, lifetimeEarned: { increment: 3000 } },
      });
      console.log(`  Added 3000 pts to ${u.name}'s wallet`);
    }
  }

  console.log('\n--- Done ---');
  await p.$disconnect();
}

seed().catch((e) => { console.error(e); process.exit(1); });
