import { PrismaClient, Role, VendorStatus, CreatorStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export async function seedStreetStory(prisma: PrismaClient) {
  console.log('--- Seeding 09_street_story.ts ---');

  const rawVendorPw = process.env.SEED_VENDOR_PASSWORD;
  const rawCreatorPw = process.env.SEED_CREATOR_PASSWORD;
  if (!rawVendorPw || !rawCreatorPw) {
    console.error('FATAL: SEED_VENDOR_PASSWORD and SEED_CREATOR_PASSWORD are required. Aborting.');
    process.exit(1);
  }
  const vendorPassword = await bcrypt.hash(rawVendorPw, 12);
  const creatorPassword = await bcrypt.hash(rawCreatorPw, 12);

  // Specialty exclusivity: vendor XOR creator (never both on one account).
  const streetStoryUser = await prisma.user.upsert({
    where: { email: 'streetstory@palsafar.com' },
    update: {
      password: vendorPassword,
      name: 'Street Story',
      permission: Role.VENDOR,
      activeMode: Role.USER,
    },
    create: {
      email: 'streetstory@palsafar.com',
      password: vendorPassword,
      name: 'Street Story',
      permission: Role.VENDOR,
      activeMode: Role.USER,
    },
  });

  const rahulUser = await prisma.user.upsert({
    where: { email: 'rahul.chelani@palsafar.com' },
    update: {
      password: creatorPassword,
      name: 'Rahul Chelani',
      permission: Role.CONTENT_CREATOR,
      activeMode: Role.USER,
    },
    create: {
      email: 'rahul.chelani@palsafar.com',
      password: creatorPassword,
      name: 'Rahul Chelani',
      permission: Role.CONTENT_CREATOR,
      activeMode: Role.USER,
      bio: 'Travel storyteller | Exploring India one hidden gem at a time. Based in MP.',
      avatar: 'https://images.unsplash.com/photo-1589156280159-27698b8d0d9c?w=200',
    },
  });



  await prisma.wallet.upsert({
    where: { userId: rahulUser.id },
    update: {},
    create: {
      userId: rahulUser.id,
      palPoints: 12000,
      lifetimeEarned: 25000,
      lifetimeSpent: 13000,
    },
  });

  await prisma.wallet.upsert({
    where: { userId: streetStoryUser.id },
    update: {},
    create: {
      userId: streetStoryUser.id,
      palPoints: 2500,
      lifetimeEarned: 5000,
      lifetimeSpent: 2500,
    },
  });

  const adminUser = await prisma.user.findFirst({ where: { permission: Role.ADMIN } });
  const adminId = adminUser?.id || null;

  let vendor = await prisma.vendor.findFirst({
    where: {
      OR: [
        { userId: streetStoryUser.id },
        { userId: rahulUser.id },
        { businessName: 'Street Story Cafe' },
      ],
    },
  });
  if (vendor && vendor.userId !== streetStoryUser.id) {
    vendor = await prisma.vendor.update({
      where: { id: vendor.id },
      data: { userId: streetStoryUser.id },
    });
    console.log('Migrated Street Story Cafe ownership to streetstory@palsafar.com');
  }

  await prisma.creatorProfile.deleteMany({ where: { userId: streetStoryUser.id } });

  if (!vendor) {
    const vendorCode = 'STR_' + crypto.randomBytes(4).toString('hex').toUpperCase();
    vendor = await prisma.vendor.create({
      data: {
        userId: streetStoryUser.id,
        businessName: 'Street Story Cafe',
        businessType: 'restaurant',
        phone: '+91 761 4567890',
        address: '111, Napier Town, Near Civic Centre',
        city: 'Jabalpur',
        state: 'Madhya Pradesh',
        latitude: 23.1650,
        longitude: 79.9320,
        description: 'Street Story brings the vibrant street food culture of Jabalpur under one roof. From sizzling bhutte ka kees to crispy kachoris, fluffy malpua to tangy pani puri — every dish tells a story. Our cafe is a celebration of local flavors, traditional recipes, and the warmth of Madhya Pradesh hospitality. Come for the food, stay for the stories.',
        imageUrl: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800',
        website: 'https://streetstoryjabalpur.com',
        operatingHours: '10:00 AM - 11:00 PM',
        images: [
          'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800',
          'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800',
          'https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?w=800',
          'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800',
        ],
        status: VendorStatus.APPROVED,
        vendorCode,
        reviewedById: adminId,
        reviewedAt: new Date(),
        linkedSpotIds: [],
        services: {
          cuisineTypes: ['madhya-pradesh', 'street-food', 'north-indian'],
          mealOptions: ['breakfast', 'lunch', 'dinner', 'snacks'],
          seatingCapacity: 80,
          hasVegan: true,
          hasDelivery: true,
          hasOutdoor: true,
          hasWifi: true,
          hasParking: true,
          priceRange: { min: 100, max: 800 },
          timings: '10:00 AM - 11:00 PM',
          specialties: ['Bhutte Ka Kees', 'Malpua', 'Sabudana Khichdi', 'Poha Jalebi', 'Kachori Sabzi'],
          ambiance: 'Casual, Family-friendly, Vibrant',
        },
        showOnMap: true,
        showContact: true,
        showWebsite: true,
        showImages: true,
        showOffers: true,
        showReels: true,
        showNavigation: true,
      },
    });
    console.log('Created vendor: Street Story Cafe');

    // Vendor Offers
    const offers = [
      {
        title: '20% Off on Local Thali',
        description: 'Taste our signature MP Thali with 20% discount. Includes dal bafla, bhutte ka kees, sabudana khichdi, and sweet malpua.',
        discountType: 'PERCENTAGE',
        discountValue: 20,
        pointsRequired: 150,
        minBillAmount: 300,
        couponCode: 'PALS20STORY',
        validTill: new Date(Date.now() + 90 * 86400000).toISOString(),
        category: 'food',
        isActive: true,
        isApproved: true,
        approvedById: adminId,
        approvedAt: new Date(),
      },
      {
        title: 'Free Dessert with Main Course',
        description: 'Enjoy a complimentary Malpua or Gulab Jamun with any main course order above ₹400.',
        discountType: 'OTHER',
        discountValue: 0,
        pointsRequired: 100,
        minBillAmount: 400,
        couponCode: 'PALDESSERT',
        validTill: new Date(Date.now() + 60 * 86400000).toISOString(),
        category: 'food',
        isActive: true,
        isApproved: true,
        approvedById: adminId,
        approvedAt: new Date(),
      },
      {
        title: 'Buy 2 Get 1 Free - Street Snacks',
        description: 'Order any 2 street snacks and get the 3rd one absolutely free!',
        discountType: 'OTHER',
        discountValue: 0,
        pointsRequired: 200,
        minBillAmount: 0,
        couponCode: 'PALBOGO',
        validTill: new Date(Date.now() + 45 * 86400000).toISOString(),
        category: 'food',
        isActive: true,
        isApproved: true,
        approvedById: adminId,
        approvedAt: new Date(),
      },
    ];

    for (const o of offers) {
      await prisma.vendorOffer.create({ data: { vendorId: vendor.id, ...o } });
    }
    console.log('Created 3 vendor offers for Street Story');

    // Vendor Reels
    const reelData = [
      { title: 'Street Story Jabalpur Tour', description: 'Take a walk through our vibrant cafe and see what makes Street Story special! 🎬🍜', views: 5800, likes: 420 },
      { title: 'Bhutte Ka Kees - The MP Special', description: 'Watch our chef prepare the famous Bhutte Ka Kees, a Madhya Pradesh delicacy! 🌽✨', views: 12400, likes: 890 },
      { title: 'Malpua - Sweet ending to every meal', description: 'The perfect crispy, syrupy Malpua that keeps our customers coming back! 🍯😋', views: 7600, likes: 630 },
    ];

    for (const r of reelData) {
      await prisma.vendorReel.create({
        data: {
          vendorId: vendor.id,
          videoUrl: `/uploads/reels/WRRO3394.MP4`,
          thumbnail: r.title.includes('Bhutte') ? 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=480' :
                     r.title.includes('Malpua') ? 'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=480' :
                     'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=480',
          title: r.title,
          description: r.description,
          views: r.views,
          likes: r.likes,
        },
      });
    }
    console.log('Created 3 vendor reels for Street Story');
  } else {
    console.log('Street Story vendor already exists, skipping...');
  }

  // ─── 2. RAHUL CHELANI - CONTENT CREATOR ───────────────────────────
  const snehaUser = rahulUser;

  // Creator Profile
  let creatorProfile = await prisma.creatorProfile.findUnique({ where: { userId: snehaUser.id } });
  if (!creatorProfile) {
    creatorProfile = await prisma.creatorProfile.create({
      data: {
        userId: snehaUser.id,
        username: 'rahulchelani',
        displayName: 'Rahul Chelani',
        bio: 'Travel storyteller exploring the hidden gems of Madhya Pradesh and beyond. 📸 | 🌍 15 states covered | 🏆 Top Creator 2025',
        avatar: 'https://images.unsplash.com/photo-1589156280159-27698b8d0d9c?w=400',
        coverImage: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1200',
        instagramUrl: 'https://instagram.com/rahul.chelani.travels',
        youtubeUrl: 'https://youtube.com/@rahulchelanitravels',
        travelCategories: ['solo', 'culture', 'food', 'heritage', 'nature'],
        verified: true,
        status: CreatorStatus.APPROVED,
        analytics: {
          totalViews: 284500,
          totalLikes: 45200,
          totalShares: 12800,
          engagement: 8.7,
          topCountry: 'India',
        },
        referralCode: 'RAHULC10',
        totalEarned: 25000,
        totalWithdrawn: 13000,
      },
    });
    console.log('Created creator profile: @rahulchelani');

    // Followers - have existing users follow Rahul
    const existingUsers = await prisma.user.findMany({ where: { permission: { in: [Role.USER, Role.VENDOR] } } });
    let followCount = 0;
    for (const u of existingUsers) {
      if (u.id !== snehaUser.id && followCount < 20) {
        const existing = await prisma.follow.findUnique({
          where: { followerId_followingId: { followerId: u.id, followingId: snehaUser.id } },
        });
        if (!existing) {
          await prisma.follow.create({
            data: { followerId: u.id, followingId: snehaUser.id },
          });
          followCount++;
        }
      }
    }

    // Rahul follows some creators back
    const creators = await prisma.creatorProfile.findMany({ take: 5 });
    for (const cp of creators) {
      if (cp.id !== creatorProfile.id) {
        const existing = await prisma.follow.findUnique({
          where: { followerId_followingId: { followerId: snehaUser.id, followingId: cp.userId } },
        });
        if (!existing) {
          await prisma.follow.create({
            data: { followerId: snehaUser.id, followingId: cp.userId },
          });
        }
      }
    }
    console.log(`Created ${followCount} followers and follow-backs for Rahul`);

    // 0 Reels
    const snehaReels: any[] = [];

    for (const r of snehaReels) {
      const reel = await prisma.reel.create({ data: r as any });
      console.log(`Created reel: ${r.title}`);

      // Add some likes and comments
      const reelUsers = await prisma.user.findMany({ take: 15 });
      for (const u of reelUsers) {
        if (u.id !== snehaUser.id) {
          await prisma.reelLike.upsert({
            where: { reelId_userId: { reelId: reel.id, userId: u.id } },
            update: {},
            create: { reelId: reel.id, userId: u.id },
          });
        }
      }

      const comments = [
        'Absolutely stunning! Adding to my bucket list! ✨',
        'I visited last month, can confirm it is amazing!',
        'Rahul, your content is always so inspiring! 🔥',
        'This place looks magical. Great video quality!',
        'We need more hidden gems like this! 🙌',
        'Can you share the exact location please?',
      ];
      for (const comment of comments) {
        const randomUser = reelUsers[Math.floor(Math.random() * reelUsers.length)];
        await prisma.reelComment.create({
          data: { reelId: reel.id, userId: randomUser.id, content: comment },
        });
      }
    }
    console.log('Created 3 reels with likes and comments for Rahul Chelani');
  } else {
    console.log('Rahul creator profile already exists, skipping...');
  }

  console.log('--- 09_street_story.ts completed ---');
}
