import { PrismaClient, User, Place } from '@prisma/client';

export async function seedTrips(prisma: PrismaClient, users: User[], places: Place[]) {
  console.log('--- Seeding 08_trips.ts ---');

  if (users.length === 0 || places.length === 0) return;

  const delhiPlaces = places.filter(p => p.city.toLowerCase() === 'delhi' || p.city.toLowerCase() === 'new delhi');
  
  if (delhiPlaces.length < 3) return;

  // 1. Trip Plans
  const tripPlan = await prisma.tripPlan.create({
    data: {
      userId: users[0].id,
      title: 'Weekend in Delhi',
      description: 'A 2-day itinerary covering the best heritage sites and street food.',
      days: 2,
      isPublished: true,
      tripDays: {
        create: [
          {
            dayNumber: 1,
            theme: 'Heritage Tour',
            stops: {
              create: [
                { placeId: delhiPlaces[0].id, order: 1, timeSlot: 'MORNING', notes: 'Start early to beat the crowd' },
                { placeId: delhiPlaces[1].id, order: 2, timeSlot: 'AFTERNOON', notes: 'Lunch nearby' },
              ]
            }
          },
          {
            dayNumber: 2,
            theme: 'Sunset Views',
            stops: {
              create: [
                { placeId: delhiPlaces[2].id, order: 1, timeSlot: 'EVENING', notes: 'Sunset views' },
              ]
            }
          }
        ]
      }
    }
  });
  console.log(`Seeded TripPlan: ${tripPlan.title}`);

  // 2. Collections
  const shuffledPlaces = [...places].sort(() => 0.5 - Math.random());
  if (shuffledPlaces.length >= 2) {
    const collection = await prisma.collection.create({
      data: {
        userId: users[0].id,
        name: 'My Bucket List',
        description: 'Places I must visit before I die',
        isPublic: true,
        places: {
          create: [
            { placeId: shuffledPlaces[0].id },
            { placeId: shuffledPlaces[1].id },
          ]
        }
      }
    });
    console.log(`Seeded Collection: ${collection.name}`);
  }
}
