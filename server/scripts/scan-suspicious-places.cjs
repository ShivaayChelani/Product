const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const SUSPICIOUS_WORDS = ['dummy', 'sample', 'placeholder', 'foobar', 'test spot', 'test place', 'testing spot', 'secret waterfall', 'temp place'];

async function run() {
  console.log('=== Checking for Suspicious Places ===');
  try {
    const suspiciousPlaces = await prisma.place.findMany({
      where: {
        OR: SUSPICIOUS_WORDS.map(word => ({
          name: { contains: word, mode: 'insensitive' }
        }))
      },
      select: {
        id: true,
        name: true,
        city: true,
        state: true,
        source: true,
      }
    });

    console.log(`Found ${suspiciousPlaces.length} suspicious places:`);
    suspiciousPlaces.forEach(p => {
      console.log(`  - [${p.id}] ${p.name} in ${p.city}, ${p.state} (${p.source})`);
    });

    if (suspiciousPlaces.length > 0) {
      console.log('Deleting suspicious places...');
      const ids = suspiciousPlaces.map(p => p.id);
      
      // Clean up dependent records first
      await prisma.placeStat.deleteMany({ where: { placeId: { in: ids } } });
      await prisma.checkIn.deleteMany({ where: { placeId: { in: ids } } });
      await prisma.review.deleteMany({ where: { placeId: { in: ids } } });
      await prisma.collectionPlace.deleteMany({ where: { placeId: { in: ids } } });

      const deleteRes = await prisma.place.deleteMany({
        where: { id: { in: ids } }
      });
      console.log(`Deleted ${deleteRes.count} suspicious place records!`);
    } else {
      console.log('No suspicious places found.');
    }
  } catch (err) {
    console.error('Error during check:', err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
