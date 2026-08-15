const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// Load environment variables
const dotenvPath = path.join(__dirname, '../.env');
require('dotenv').config({ path: dotenvPath });

// Use direct connection URL to bypass connection pooling limits/errors in local scripts
if (process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

const prisma = new PrismaClient();

const CREATORS = [
  { username: 'TravelWithRahul', email: 'rahul@palsafar.com', bio: 'Exploring India one town at a time. Wanderer & storyteller. 🇮🇳', avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150' },
  { username: 'ExploreIndia', email: 'explore@palsafar.com', bio: 'Highlighting India\'s rich history, architectural marvels, and heritage sites.', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150' },
  { username: 'WanderGirl', email: 'wander@palsafar.com', bio: 'Solo traveler. Finding beauty in hidden gems and street food lanes. 🗺️✈️', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150' },
  { username: 'HiddenGemHunter', email: 'hunter@palsafar.com', bio: 'Uncovering untouched valleys, secret waterfalls, and pristine views.', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150' },
  { username: 'MPExplorer', email: 'mpexp@palsafar.com', bio: 'Your ultimate guide to Madhya Pradesh tourism - Bhedaghat, Kanha, Pachmarhi!', avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150' },
  { username: 'BharatTrails', email: 'bharat@palsafar.com', bio: 'Documenting regional cultures, folk festivals, and tribal arts.', avatar: 'https://images.unsplash.com/photo-1489980508314-941910ded1f4?w=150' },
  { username: 'BackpackerAman', email: 'aman@palsafar.com', bio: 'Budget traveling across India. Backpacking, hostels, and local transits.', avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150' },
  { username: 'DiscoverJabalpur', email: 'discover@palsafar.com', bio: 'Local expert. Marble Rocks, Dhuandhar, Bargi Dam, and Jabalpur street food.', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150' },
  { username: 'RoadTripIndia', email: 'roadtrip@palsafar.com', bio: 'Chasing highways, high passes, and scenic road trip trails. 🛣️🏍️', avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150' },
  { username: 'PalSafarOfficial', email: 'official@palsafar.com', bio: 'The official voice of PalSafar. Discover India with our curated guides and tours.', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150' },
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

const TRAVEL_CAPTIONS = [
  'Exploring the majestic sights! The absolute peace here is unmatched. 🌄✨ #TravelIndia #Peace',
  'Witnessing nature\'s roar at its best! Must-visit for every traveler. 🌊⛰️ #Waterfall #Wanderlust',
  'Wandering through ancient alleys and discovering architectural history. 🏰🇮🇳 #Heritage #History',
  'A true hidden gem! No crowd, crystal-clear water, and pure nature. 🌲🚶‍♂️ #HiddenGem #Adventure',
  'Chasing beautiful sunrises on high roads. The journey is always better. 🏍️🛣️ #RoadTrip #Sunrise',
  'Experiencing regional flavors and local street food highlights! 🍛🤤 #Foodie #LocalCulture',
  'Capturing the traditional morning prayers by the ghats. Sacred vibes. 🙏🕯️ #SpiritualIndia #Ghats',
  'Backpacking on a budget but living like a king with these views! 🎒⛰️ #Backpacking #BudgetTravel',
  'The official spot highlight! Plan your weekend getaway here. 🗓️🗺️ #PalSafarGuide #Weekend',
];

async function main() {
  console.log('--- Starting Reel Content Migration & Seeding ---');

  const statusFolder = path.join(__dirname, '../../src/assets/status');
  const uploadDest = path.join(__dirname, '../uploads/reels');

  // Verify status folder exists
  if (!fs.existsSync(statusFolder)) {
    console.error(`Source status folder does not exist at: ${statusFolder}`);
    process.exit(1);
  }

  // Ensure dest folder exists
  if (!fs.existsSync(uploadDest)) {
    fs.mkdirSync(uploadDest, { recursive: true });
    console.log(`Created uploads destination folder at: ${uploadDest}`);
  }

  // Scan status videos
  const files = fs.readdirSync(statusFolder);
  const videoFiles = files.filter(f => f.toLowerCase().endsWith('.mp4'));
  console.log(`Found ${videoFiles.length} video files in status folder.`);

  if (videoFiles.length === 0) {
    console.log('No video files to migrate. Exiting.');
    process.exit(0);
  }

  // Ensure Creators exist in DB
  const rawPw = process.env.SEED_USER_PASSWORD;
  if (!rawPw) {
    console.error('FATAL: Missing SEED_USER_PASSWORD environment variable. Aborting.');
    process.exit(1);
  }
  const hashedPw = bcrypt.hashSync(rawPw, 10);
  const creatorProfiles = [];

  for (const c of CREATORS) {
    // Check user
    let user = await prisma.user.findUnique({ where: { email: c.email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: c.email,
          name: c.username,
          password: hashedPw,
          roles: ['USER', 'CONTENT_CREATOR'],
          activeRole: 'CONTENT_CREATOR',
        },
      });
      console.log(`Created User for creator: ${c.username}`);
    } else if (!user.roles?.includes('CONTENT_CREATOR')) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          roles: Array.from(new Set([...(user.roles || ['USER']), 'CONTENT_CREATOR'])),
          activeRole: 'CONTENT_CREATOR',
        },
      });
    }

    // Check creator profile
    let profile = await prisma.creatorProfile.findUnique({ where: { userId: user.id } });
    if (!profile) {
      profile = await prisma.creatorProfile.create({
        data: {
          userId: user.id,
          username: c.username,
          bio: c.bio,
          avatar: c.avatar,
          status: 'APPROVED',
          verified: c.username.endsWith('Official') || c.username === 'ExploreIndia',
        },
      });
      console.log(`Created APPROVED CreatorProfile for: ${c.username}`);
    } else if (profile.status !== 'APPROVED') {
      profile = await prisma.creatorProfile.update({
        where: { id: profile.id },
        data: { status: 'APPROVED' },
      });
      console.log(`Updated CreatorProfile status to APPROVED for: ${c.username}`);
    }
    creatorProfiles.push(profile);
  }

  // Fetch approved places to link reels
  const places = await prisma.place.findMany({
    where: { status: 'APPROVED' },
    select: { id: true, name: true },
  });
  console.log(`Fetched ${places.length} approved places to link.`);

  // Loop & copy videos, seed Reel records
  for (let i = 0; i < videoFiles.length; i++) {
    const filename = videoFiles[i];
    const srcPath = path.join(statusFolder, filename);
    const destPath = path.join(uploadDest, filename);

    // Copy file
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied video ${i + 1}/${videoFiles.length}: ${filename}`);

    const videoUrl = `/uploads/reels/${filename}`;
    const thumbnail = THUMBNAILS[i % THUMBNAILS.length];
    const creator = creatorProfiles[i % creatorProfiles.length];
    const place = places.length > 0 ? places[i % places.length] : null;
    const caption = TRAVEL_CAPTIONS[i % TRAVEL_CAPTIONS.length];
    const title = filename.replace(/\.(mp4|MP4)$/, '').replace(/[_-]/g, ' ').trim().slice(0, 50);

    // Check if reel already exists
    const existingReel = await prisma.reel.findFirst({
      where: { videoUrl },
    });

    if (!existingReel) {
      await prisma.reel.create({
        data: {
          creatorId: creator.id,
          videoUrl,
          thumbnail,
          title,
          description: caption,
          placeId: place ? place.id : null,
          likes: Math.floor(Math.random() * 450) + 50,
          views: Math.floor(Math.random() * 2000) + 500,
          shares: Math.floor(Math.random() * 80) + 10,
          saves: Math.floor(Math.random() * 60) + 5,
          featured: i % 3 === 0,
        },
      });
      console.log(`Seeded Reel record: "${title}" linked to creator "${creator.username}" and place "${place ? place.name : 'None'}"`);
    } else {
      console.log(`Reel record for ${filename} already exists in database.`);
    }
  }

  console.log('--- Migration & Seeding Successful! ---');
}

main()
  .catch(e => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
