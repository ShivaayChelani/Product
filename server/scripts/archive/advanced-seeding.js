const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// Load environment variables
const dotenvPath = path.join(__dirname, '../.env');
require('dotenv').config({ path: dotenvPath });

const prisma = new PrismaClient();

const VENDOR_DATA = [
  // Jabalpur
  { name: "Madan Mahal Heritage Cafe", type: "restaurant", category: "Cafe", city: "Jabalpur", lat: 23.1610, lng: 79.9020, desc: "A cozy cafe near the historic Madan Mahal Fort serving delicious snacks." },
  { name: "Goolgappa Express", type: "restaurant", category: "Restaurant", city: "Jabalpur", lat: 23.1750, lng: 79.9320, desc: "Authentic local chaats, golgappas, and street food favorites." },
  { name: "Jabalpur Grand Hotel", type: "hotel", category: "Hotel", city: "Jabalpur", lat: 23.1810, lng: 79.9860, desc: "Luxury rooms and fine dining in the heart of Jabalpur." },
  { name: "Narmada Adventure Sports", type: "guide", category: "Adventure Vendor", city: "Jabalpur", lat: 23.1250, lng: 79.8880, desc: "Rafting, kayaking, and camping adventures along the holy Narmada." },
  { name: "Kalchuri Souvenirs", type: "local_shop", category: "Souvenir Shop", city: "Jabalpur", lat: 23.1550, lng: 79.9450, desc: "Handcrafted marble items, tribal paintings, and local souvenirs." },
  // Bhedaghat
  { name: "Marble Gorge Restaurant", type: "restaurant", category: "Restaurant", city: "Bhedaghat", lat: 23.1310, lng: 79.8020, desc: "Savor North Indian delicacies while looking at the towering white marble cliffs." },
  { name: "Dhuandhar Retreat", type: "hotel", category: "Hotel", city: "Bhedaghat", lat: 23.1280, lng: 79.8090, desc: "Beautiful resort offering direct views of the thundering Dhuandhar Falls." },
  { name: "Narmada Boat Guides", type: "guide", category: "Local Guide", city: "Bhedaghat", lat: 23.1306, lng: 79.8016, desc: "Certified boating guides explaining the mythology and geology of the Marble Rocks." },
  { name: "Bhedaghat Travels", type: "travel_agent", category: "Travel Agency", city: "Bhedaghat", lat: 23.1350, lng: 79.8050, desc: "Providing cab bookings, sightseeing packages, and river tours." },
  // Khajuraho
  { name: "Temple View Cafe", type: "restaurant", category: "Cafe", city: "Khajuraho", lat: 24.8510, lng: 79.9210, desc: "A rooftop cafe offering panoramic views of the Western Group of Temples." },
  { name: "Lalaji Tourist Lodge", type: "hotel", category: "Hotel", city: "Khajuraho", lat: 24.8310, lng: 79.9190, desc: "Budget-friendly rooms with modern amenities, just walking distance from temple gates." },
  { name: "Khajuraho Heritage Guides", type: "guide", category: "Local Guide", city: "Khajuraho", lat: 24.8320, lng: 79.9250, desc: "Specialized guides sharing the rich history, architecture, and legends of the temples." },
  { name: "Bundelkhand Handicrafts", type: "local_shop", category: "Souvenir Shop", city: "Khajuraho", lat: 24.8330, lng: 79.9300, desc: "Authentic brass idols, stone replicas of temple sculptures, and local textiles." },
  // Pachmarhi
  { name: "Satpura Adventure Trails", type: "guide", category: "Adventure Vendor", city: "Pachmarhi", lat: 22.4674, lng: 78.4356, desc: "Trekking, rock climbing, and gypsy safaris into the Satpura National Park." },
  { name: "Woodland Restaurant", type: "restaurant", category: "Restaurant", city: "Pachmarhi", lat: 22.4700, lng: 78.4410, desc: "Multicuisine garden restaurant serving delicious local and continental food." },
  { name: "Satpura Retreat Hotel", type: "hotel", category: "Hotel", city: "Pachmarhi", lat: 22.4630, lng: 78.4300, desc: "A colonial-era heritage bungalow converted into a peaceful forest resort." },
  { name: "Pachmarhi Hill Guide Group", type: "guide", category: "Local Guide", city: "Pachmarhi", lat: 22.4680, lng: 78.4380, desc: "Local experts leading tours to Bee Falls, Dhoopgarh, and Jata Shankar Caves." },
  // Sanchi
  { name: "Sanchi Stupa Cafe", type: "restaurant", category: "Cafe", city: "Sanchi", lat: 23.4810, lng: 77.7390, desc: "A peaceful spot serving herbal tea, organic snacks, and refreshments." },
  { name: "The Buddhist Gateway Inn", type: "hotel", category: "Hotel", city: "Sanchi", lat: 23.4790, lng: 77.7410, desc: "Comfortable rooms and meditation halls close to the Sanchi Stupa." },
  { name: "Sanchi Archeology Guide", type: "guide", category: "Local Guide", city: "Sanchi", lat: 23.4813, lng: 77.7407, desc: "Guides authorized by ASI providing insights into Emperor Ashoka's edicts." },
  { name: "Emperor Ashoka Souvenirs", type: "local_shop", category: "Souvenir Shop", city: "Sanchi", lat: 23.4830, lng: 77.7450, desc: "Selling Buddha statues, stupa models, spiritual books, and paintings." },
  // Ujjain
  { name: "Shipra Riverview Restaurant", type: "restaurant", category: "Restaurant", city: "Ujjain", lat: 23.1890, lng: 75.7610, desc: "Pure vegetarian delicacies overlooking the holy Ram Ghat and Kshipra River." },
  { name: "Mahakal Guest House", type: "hotel", category: "Hotel", city: "Ujjain", lat: 23.1760, lng: 75.7885, desc: "Homely rooms near the Mahakaleshwar Jyotirlinga Temple for pilgrims." },
  { name: "Ujjain Spiritual Tour Agency", type: "travel_agent", category: "Travel Agency", city: "Ujjain", lat: 23.1820, lng: 75.7820, desc: "Arranging Bhasma Aarti bookings, local temple circuits, and cab rentals." },
  { name: "Mahakaleshwar Guides Alliance", type: "guide", category: "Local Guide", city: "Ujjain", lat: 23.1790, lng: 75.7850, desc: "Experienced guides detailing Ujjain's rich history, Harsiddhi temple, and Kal Bhairav." }
];

const THUMBNAILS = [
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=480',
  'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=480',
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=480',
  'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=480',
  'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=480',
  'https://images.unsplash.com/photo-1548013146-72479768bada?w=480',
  'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=480',
  'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=480',
  'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=480',
];

const CAPTIONS = [
  'Exploring the absolute best travel sights! The vibes here are unmatched. 🌄✨ #Wanderlust #MPTourism',
  'Nature is presenting its true raw beauty! Check out this must-visit spot. ⛰️🍃 #PalSafar #Nature',
  'Chasing beautiful sunrises on high roads. The journey is always better. 🏍️🛣️ #RoadTrip #Sunrise',
  'Uncovering the untouched corners and hidden waterfalls! pure bliss. 🌲🚶‍♂️ #HiddenGem #Adventure',
  'Wandering through ancient alleys and discovering architectural history. 🏰🇮🇳 #Heritage #History',
  'Experiencing regional flavors and local street food highlights! 🍛🤤 #Foodie #LocalCulture',
  'Capturing the traditional morning prayers by the ghats. Sacred vibes. 🙏🕯 #SpiritualIndia #Ghats',
  'Backpacking on a budget but living like a king with these views! 🎒⛰️ #Backpacking #BudgetTravel',
  'Plan your next weekend getaway here with PalSafar guides! 🗓️🗺️ #PalSafarGuide #Weekend',
];

async function main() {
  console.log('--- Starting Advanced Data Seeding & Reels Import ---');

  if (process.env.NODE_ENV === 'production') {
    console.error('ERROR: This script is destructive and cannot run in production.');
    process.exit(1);
  }

  // ── 1. Clean Database of Related Data ──
  console.log('Clearing old data...');
  await prisma.vendorOffer.deleteMany({});
  await prisma.vendorReel.deleteMany({});
  await prisma.vendor.deleteMany({});
  
  // Find and delete previous vendor users to prevent unique constraints violations
  await prisma.user.deleteMany({
    where: {
      email: { startsWith: 'vendor_user_' }
    }
  });

  await prisma.reelComment.deleteMany({});
  await prisma.reelLike.deleteMany({});
  await prisma.reelSave.deleteMany({});
  await prisma.reel.deleteMany({});
  await prisma.creatorProfile.deleteMany({});

  console.log('Database cleaned successfully.');

  // ── 2. Create 25 Vendor Users & Vendors ──
  console.log('Seeding 25 Vendors...');
  const admin = await prisma.user.findFirst({ where: { roles: { has: 'ADMIN' } } });
  const adminId = admin ? admin.id : null;
  const rawPw = process.env.SEED_VENDOR_PASSWORD;
  if (!rawPw) {
    console.error('FATAL: Missing SEED_VENDOR_PASSWORD environment variable. Aborting seed.');
    process.exit(1);
  }
  const hashedPw = bcrypt.hashSync(rawPw, 12);
  const createdVendors = [];

  for (let i = 0; i < VENDOR_DATA.length; i++) {
    const data = VENDOR_DATA[i];
    const email = `vendor_user_${i + 1}@palsafar.com`;

    // Create User
    const user = await prisma.user.create({
      data: {
        email,
        name: data.name,
        password: hashedPw,
        roles: ['USER', 'VENDOR'],
        activeRole: 'VENDOR',
      }
    });

    // Create Vendor
    const vendor = await prisma.vendor.create({
      data: {
        userId: user.id,
        businessName: data.name,
        businessType: data.type,
        phone: `+91 98765 432${String(i).padStart(2, '0')}`,
        address: `Street No. ${i + 1}, Near Center, ${data.city}`,
        city: data.city,
        state: "Madhya Pradesh",
        latitude: data.lat,
        longitude: data.lng,
        description: data.desc,
        imageUrl: THUMBNAILS[i % THUMBNAILS.length],
        website: `https://www.${data.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
        operatingHours: "09:00 AM - 10:00 PM",
        images: [
          THUMBNAILS[i % THUMBNAILS.length],
          THUMBNAILS[(i + 1) % THUMBNAILS.length]
        ],
        status: 'APPROVED',
        reviewedById: adminId,
        reviewedAt: new Date(),
        showOnMap: true,
        showContact: true,
        showWebsite: true,
        showImages: true,
        showOffers: true,
        showReels: true,
        showNavigation: true,
      }
    });

    // Seed Offers for the Vendor
    await prisma.vendorOffer.create({
      data: {
        vendorId: vendor.id,
        title: i % 2 === 0 ? "15% Flat Discount" : "Buy 1 Get 1 Free",
        description: `Special discount offer for PalSafar users at ${data.name}. Present coupon on checkout.`,
        discountType: i % 2 === 0 ? "percentage" : "flat",
        discountValue: 15.0,
        pointsRequired: i % 2 === 0 ? 100 : 250,
        minBillAmount: 500.0,
        couponCode: `PAL${data.city.substring(0, 3).toUpperCase()}${i + 100}`,
        validTill: new Date(Date.now() + 30 * 86400000).toISOString(),
        isActive: true,
      }
    });

    // Seed Reels for the Vendor (VendorReel)
    await prisma.vendorReel.create({
      data: {
        vendorId: vendor.id,
        videoUrl: `/uploads/reels/WRRO3394.MP4`,
        thumbnail: THUMBNAILS[(i + 2) % THUMBNAILS.length],
        title: `${data.name} Tour`,
        description: `Explore the amazing services and ambiance of ${data.name} in ${data.city}. 🏨🍴`,
        views: Math.floor(Math.random() * 1000) + 100,
        likes: Math.floor(Math.random() * 200) + 10,
      }
    });

    createdVendors.push(vendor);
  }

  console.log(`Seeded ${createdVendors.length} approved Vendors with offers & reels successfully.`);

  // ── 3. Scan status folder and seed General Reels ──
  console.log('Importing General Reels...');
  const statusFolder = path.join(__dirname, '../../src/assets/status');
  const uploadDest = path.join(__dirname, '../uploads/reels');

  if (!fs.existsSync(statusFolder)) {
    console.error(`Source status folder does not exist at: ${statusFolder}`);
    process.exit(1);
  }

  if (!fs.existsSync(uploadDest)) {
    fs.mkdirSync(uploadDest, { recursive: true });
  }

  const allFiles = fs.readdirSync(statusFolder);
  const allowedExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
  const videoFiles = allFiles.filter(f => {
    const ext = path.extname(f).toLowerCase();
    return allowedExtensions.includes(ext);
  });
  console.log(`Found ${videoFiles.length} videos inside status folder.`);

  // Get existing registered users (non-vendors)
  const registeredUsers = await prisma.user.findMany({
    where: {
      roles: { hasSome: ['USER', 'ADMIN'] }
    }
  });

  if (registeredUsers.length === 0) {
    console.error('No registered users found in database to assign reels. Exiting.');
    process.exit(1);
  }

  console.log(`Users available for reel assignment: ${registeredUsers.length}`);

  // Fetch approved places to link to reels
  const places = await prisma.place.findMany({
    where: { status: 'APPROVED' },
    select: { id: true, name: true }
  });
  console.log(`Fetched ${places.length} approved places to link.`);

  const assignedUserIds = new Set();
  const creatorProfiles = {};

  for (let i = 0; i < videoFiles.length; i++) {
    const filename = videoFiles[i];
    const srcPath = path.join(statusFolder, filename);
    const destPath = path.join(uploadDest, filename);

    // Copy video file
    fs.copyFileSync(srcPath, destPath);
    const videoUrl = `/uploads/reels/${filename}`;

    // Select random user
    const user = registeredUsers[i % registeredUsers.length];
    assignedUserIds.add(user.id);

    // Ensure CreatorProfile exists for the user
    let creator = creatorProfiles[user.id];
    if (!creator) {
      creator = await prisma.creatorProfile.findUnique({
        where: { userId: user.id }
      });

      if (!creator) {
        // Strip email to get username
        const username = user.email.split('@')[0] + "_" + Math.floor(Math.random() * 90 + 10);
        creator = await prisma.creatorProfile.create({
          data: {
            userId: user.id,
            username,
            bio: `Travel Creator. Exploring India with PalSafar 🧭✈️`,
            avatar: THUMBNAILS[i % THUMBNAILS.length],
            status: 'APPROVED',
            verified: true,
          }
        });
        console.log(`Created CreatorProfile for User "${user.name}" (@${username})`);
      }
      creatorProfiles[user.id] = creator;
    }

    const caption = CAPTIONS[i % CAPTIONS.length];
    const title = filename
      .replace(/\.[a-zA-Z0-9]+$/, '') // strip extension
      .replace(/[_-]/g, ' ')
      .trim()
      .slice(0, 50);

    const place = places.length > 0 ? places[i % places.length] : null;
    const vendor = createdVendors.length > 0 ? createdVendors[i % createdVendors.length] : null;

    // Create Reel
    await prisma.reel.create({
      data: {
        creatorId: creator.id,
        videoUrl,
        thumbnail: THUMBNAILS[i % THUMBNAILS.length],
        title,
        description: caption,
        placeId: place ? place.id : null,
        vendorId: i % 2 === 0 && vendor ? vendor.id : null, // Link half of the reels to vendors too
        likes: Math.floor(Math.random() * 400) + 60,
        views: Math.floor(Math.random() * 1500) + 400,
        shares: Math.floor(Math.random() * 90) + 12,
        saves: Math.floor(Math.random() * 50) + 8,
        featured: i % 2 === 0,
        rewardXp: 50,
      }
    });

    console.log(`Imported Reel ${i + 1}/${videoFiles.length}: "${title}" assigned to creator "@${creator.username}"`);
  }

  console.log('--- Seeding & Import Complete! ---');
  console.log(`Vendors created: ${createdVendors.length}`);
  console.log(`Reels imported: ${videoFiles.length}`);
  console.log(`Users assigned reels: ${assignedUserIds.size}`);
  console.log(`Approved creators created/checked: ${Object.keys(creatorProfiles).length}`);
}

main()
  .catch(e => {
    console.error('Advanced Seeding script failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
