import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Starting deletion of OSM places...');
  const result = await prisma.place.deleteMany({
    where: {
      source: 'OSM',
    },
  });
  console.log(`Successfully deleted ${result.count} OSM places.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
