import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('Connecting to database and deleting all places...');
  
  let success = false;
  for (let i = 0; i < 3; i++) {
    try {
      // TRUNCATE is faster and cascades
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE places CASCADE;`);
      console.log('Successfully truncated "places" table with CASCADE.');
      success = true;
      break;
    } catch (error: any) {
      console.error(`Attempt ${i + 1} failed: ${error.message}`);
      await delay(2000); // wait for database to become ready
    }
  }

  if (!success) {
    throw new Error('Failed to delete places after 3 attempts.');
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
