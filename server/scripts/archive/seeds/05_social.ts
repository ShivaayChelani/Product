import { PrismaClient, Place, User } from '@prisma/client';

export async function seedSocial(prisma: PrismaClient, users: User[], places: Place[]) {
  console.log('--- Seeding 05_social.ts ---');

  if (users.length === 0 || places.length === 0) return;

  const creators = users.filter(u => ['priya.travels@example.com', 'aditya.vlogs@example.com', 'neha.foodie@example.com'].includes(u.email));
  const normalUsers = users.filter(u => u.permission === 'USER' && !creators.map(c=>c.id).includes(u.id));

  // 1. Follows
  for (const c of creators) {
    for (const u of normalUsers) {
      try {
        await prisma.follow.create({
          data: { followerId: u.id, followingId: c.id }
        });
      } catch (err) {
        // Skip duplicate follows
      }
    }
  }
  console.log(`Seeded Follows`);

  // 2. Reviews
  const reviewTexts = [
    "Absolutely breathtaking! Must visit when in India.",
    "Very crowded on weekends, but the architecture is stunning.",
    "Loved the vibe! Great place for photography.",
    "Make sure to hire a local guide to understand the history.",
    "Clean, well-maintained, and safe for solo travelers.",
    "The sunset view here is unparalleled. Highly recommend.",
    "Decent place, but the entry fee is a bit high for foreigners.",
    "Food nearby is amazing. Try the local street vendors!",
  ];

  const BATCH_SIZE = 500;
  const reviewsData = [];
  const checkinsData = [];
  const placeStatsData = [];

  for (const p of places) {
    // Generate 5-15 reviews per place
    const reviewCount = Math.floor(Math.random() * 11) + 5;
    const shuffledUsersForReviews = [...users].sort(() => 0.5 - Math.random());
    for (let i = 0; i < Math.min(reviewCount, shuffledUsersForReviews.length); i++) {
      const u = shuffledUsersForReviews[i];
      reviewsData.push({
        placeId: p.id,
        userId: u.id,
        rating: Math.floor(Math.random() * 2) + 4, // 4 or 5
        content: reviewTexts[Math.floor(Math.random() * reviewTexts.length)],
        createdAt: new Date(Date.now() - Math.floor(Math.random() * 30 * 86400000)),
      });
    }

    // Generate 20-50 checkins per place
    const checkinCount = Math.floor(Math.random() * 31) + 20;
    const shuffledUsersForCheckins = [...users].sort(() => 0.5 - Math.random());
    for (let i = 0; i < Math.min(checkinCount, shuffledUsersForCheckins.length); i++) {
      const u = shuffledUsersForCheckins[i];
      checkinsData.push({
        placeId: p.id,
        userId: u.id,
        createdAt: new Date(Date.now() - Math.floor(Math.random() * 30 * 86400000)),
      });
    }

    // Generate Place Stats (views, likes, saves)
    // PlaceStat doesn't have unique constraint per user, but let's avoid duplicates for likes/saves
    const viewCount = Math.floor(Math.random() * 100) + 50;
    const likeCount = Math.floor(Math.random() * 30) + 10;
    const saveCount = Math.floor(Math.random() * 20) + 5;
    
    for (let i = 0; i < viewCount; i++) placeStatsData.push({ placeId: p.id, userId: users[Math.floor(Math.random() * users.length)].id, action: 'view', createdAt: new Date(Date.now() - Math.floor(Math.random() * 30 * 86400000)) });
    const shuffledUsersForLikes = [...users].sort(() => 0.5 - Math.random());
    for (let i = 0; i < Math.min(likeCount, shuffledUsersForLikes.length); i++) placeStatsData.push({ placeId: p.id, userId: shuffledUsersForLikes[i].id, action: 'like', createdAt: new Date(Date.now() - Math.floor(Math.random() * 30 * 86400000)) });
    const shuffledUsersForSaves = [...users].sort(() => 0.5 - Math.random());
    for (let i = 0; i < Math.min(saveCount, shuffledUsersForSaves.length); i++) placeStatsData.push({ placeId: p.id, userId: shuffledUsersForSaves[i].id, action: 'save', createdAt: new Date(Date.now() - Math.floor(Math.random() * 30 * 86400000)) });
  }

  for (let i = 0; i < reviewsData.length; i += BATCH_SIZE) {
    await prisma.review.createMany({ data: reviewsData.slice(i, i + BATCH_SIZE) });
  }
  console.log(`Seeded ${reviewsData.length} Reviews`);

  for (let i = 0; i < checkinsData.length; i += BATCH_SIZE) {
    await prisma.checkIn.createMany({ data: checkinsData.slice(i, i + BATCH_SIZE) });
  }
  console.log(`Seeded ${checkinsData.length} Check-ins`);

  for (let i = 0; i < placeStatsData.length; i += BATCH_SIZE) {
    await prisma.placeStat.createMany({ data: placeStatsData.slice(i, i + BATCH_SIZE) });
  }
  console.log(`Seeded ${placeStatsData.length} Place Stats`);

  // 3. Reels
  const creatorProfiles = [];
  for (const c of creators) {
    const cp = await prisma.creatorProfile.findUnique({ where: { userId: c.id } });
    if (cp) creatorProfiles.push(cp);
  }

  const reelsData = [
    {
      creatorId: creatorProfiles[0]?.id,
      placeId: places[0]?.id,
      videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
      thumbnail: 'https://images.unsplash.com/photo-1548013146-72479768bada?w=500',
      description: 'The majestic Taj Mahal at sunrise! 🌅 #IncredibleIndia',
      views: 15400,
      likes: 3200,
      createdAt: new Date(Date.now() - 5 * 86400000),
    },
    {
      creatorId: creatorProfiles[1]?.id,
      placeId: places[1]?.id,
      videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
      thumbnail: 'https://images.unsplash.com/photo-1600100397608-f010f41cb8ea?w=500',
      description: 'Riding through the Rohtang Pass 🏍️❄️',
      views: 8900,
      likes: 1500,
      createdAt: new Date(Date.now() - 2 * 86400000),
    },
    {
      creatorId: creatorProfiles[2]?.id,
      placeId: places[2]?.id,
      videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
      thumbnail: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500',
      description: 'Best Chole Bhature in Delhi! 🤤',
      views: 22000,
      likes: 5600,
      createdAt: new Date(Date.now() - 10 * 86400000),
    },
  ];

  for (const r of reelsData) {
    if(r.placeId && r.creatorId) {
      await prisma.reel.create({ data: r as any });
    }
  }
  console.log(`Seeded Reels`);
}
