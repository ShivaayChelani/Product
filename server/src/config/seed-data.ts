import { PrismaClient, Role, VendorStatus, CreatorStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { logger } from './logger';

function generateVendorCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars[crypto.randomInt(0, chars.length)];
  }
  return `VND-${suffix}`;
}

async function generateUniqueVendorCode(prisma: PrismaClient): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateVendorCode();
    const clash = await prisma.vendor.findUnique({ where: { vendorCode: code }, select: { id: true } });
    if (!clash) return code;
  }
  return `VND-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

/** Seed the single canonical vendor: Street Story Cafe. */
export async function seedStreetStory(prisma: PrismaClient): Promise<void> {
  try {
    const vendorPassword = await bcrypt.hash(process.env.SEED_VENDOR_PASSWORD || 'Vendor@123', 12);

    const streetStoryUser = await prisma.user.upsert({
      where: { email: 'streetstory@palsafar.com' },
      update: {
        ...(process.env.NODE_ENV !== 'production' ? { password: vendorPassword } : {}),
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

    await prisma.creatorProfile.deleteMany({ where: { userId: streetStoryUser.id } });

    let vendor = await prisma.vendor.findFirst({
      where: {
        OR: [
          { userId: streetStoryUser.id },
          { businessName: 'Street Story Cafe' },
        ],
      },
    });
    if (vendor && vendor.userId !== streetStoryUser.id) {
      vendor = await prisma.vendor.update({
        where: { id: vendor.id },
        data: { userId: streetStoryUser.id },
      });
      logger.info('Migrated Street Story Cafe ownership to streetstory@palsafar.com');
    }

    if (vendor) {
      // Do NOT wipe imageUrl/images on every boot — that permanently clears production galleries.
      if (!vendor.vendorCode || vendor.vendorCode.toUpperCase().startsWith('STR_')) {
        const vendorCode = await generateUniqueVendorCode(prisma);
        vendor = await prisma.vendor.update({
          where: { id: vendor.id },
          data: { vendorCode },
        });
        logger.info({ vendorCode }, 'Migrated legacy vendor code to VND format');
      }
    }

    if (!vendor) {
      const vendorCode = await generateUniqueVendorCode(prisma);
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
          description: 'Street Story brings the vibrant street food culture of Jabalpur under one roof. From sizzling bhutte ka kees to crispy kachoris, fluffy malpua to tangy pani puri — every dish tells a story.',
          imageUrl: null,
          website: 'https://streetstoryjabalpur.com',
          operatingHours: '10:00 AM - 11:00 PM',
          images: [],
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
          description: 'Enjoy a complimentary Malpua or Gulab Jamun with any main course order above Rs.400.',
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

      const reelData = [
        { title: 'Street Story Jabalpur Tour', description: 'Take a walk through our vibrant cafe!' },
        { title: 'Bhutte Ka Kees - The MP Special', description: 'Watch our chef prepare the famous Bhutte Ka Kees!' },
        { title: 'Malpua - Sweet ending', description: 'The perfect crispy, syrupy Malpua!' },
      ];

      for (const r of reelData) {
        await prisma.vendorReel.create({
          data: {
            vendorId: vendor.id,
            videoUrl: '/uploads/reels/WRRO3394.MP4',
            thumbnail: null,
            title: r.title,
            description: r.description,
            views: 0,
            likes: 0,
          },
        });
      }
      logger.info('Street Story vendor with offers and reels seeded');
    }

    logger.info('Street Story vendor seeding completed');

    // ─── Rahul Chelani — content creator ───────────────────────────
    const creatorPassword = await bcrypt.hash(process.env.SEED_CREATOR_PASSWORD || 'Creator@123', 12);
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
        avatar: null,
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

    let creatorProfile = await prisma.creatorProfile.findUnique({ where: { userId: rahulUser.id } });
    if (!creatorProfile) {
      creatorProfile = await prisma.creatorProfile.create({
        data: {
          userId: rahulUser.id,
          username: 'rahulchelani',
          fullName: 'Rahul Chelani',
          bio: 'Travel storyteller exploring the hidden gems of Madhya Pradesh and beyond.',
          avatar: null,
          instagramUrl: 'https://instagram.com/rahul.chelani.travels',
          youtubeUrl: 'https://youtube.com/@rahulchelanitravels',
          travelCategories: ['solo', 'culture', 'food', 'heritage', 'nature'],
          verified: true,
          status: CreatorStatus.APPROVED,
          followerCount: 0,
          totalViews: 0,
        },
      });
      logger.info('Rahul Chelani creator profile created');
    } else {
      await prisma.creatorProfile.update({
        where: { id: creatorProfile.id },
        data: { avatar: null, followerCount: 0, totalViews: 0 },
      });
    }

    logger.info('Street Story vendor and Rahul Chelani creator seeding completed');
  } catch (error) {
    logger.error({ err: error }, 'Failed to seed Street Story / Rahul Chelani');
  }
}
