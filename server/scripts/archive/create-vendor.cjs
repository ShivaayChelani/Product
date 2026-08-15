/**
 * Create/upsert the vendor user in the database
 *
 * Run: node scripts/create-vendor.cjs
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function run() {
  console.log('=== Vendor Creation/Sync Utility ===');
  console.log('Connecting to database...');

  try {
    const email = 'vendor_user_1@palsafar.com';
    const password = process.env.SEED_VENDOR_PASSWORD;
    if (!password) {
      console.error('FATAL: Missing SEED_VENDOR_PASSWORD environment variable. Aborting.');
      process.exit(1);
    }
    const name = 'Vendor User';
    const roles = ['USER', 'VENDOR'];
    const activeRole = 'VENDOR';

    console.log(`Hashing password for ${email}...`);
    const hashedPassword = await bcrypt.hash(password, 12);

    console.log(`Upserting vendor user in database...`);
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name,
        roles,
        activeRole,
        password: hashedPassword,
      },
      create: {
        email,
        name,
        roles,
        activeRole,
        password: hashedPassword,
      },
    });

    console.log(`\n=== Vendor User Sync Successful ===`);
    console.log(`User ID: ${user.id}`);
    console.log(`Email:   ${user.email}`);
    console.log(`Roles:   ${user.roles.join(',')} (active=${user.activeRole})`);
    console.log(`Name:    ${user.name}`);
  } catch (err) {
    console.error('[Error] Execution failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
