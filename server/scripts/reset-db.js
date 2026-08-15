const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Truncating all tables...');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE
    users, vendors, places, reels, creator_profiles,
    reward_campaigns, system_settings, notification_templates,
    point_rules, user_levels, sync_queue
  RESTART IDENTITY CASCADE`);
  console.log('All tables truncated.');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
