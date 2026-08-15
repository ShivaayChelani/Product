import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

export async function seedUsers(prisma: PrismaClient) {
  console.log('--- Seeding 02_users.ts ---');

  const adminPassword = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD || 'Admin@123', 12);
  const userPassword = await bcrypt.hash(process.env.SEED_USER_PASSWORD || 'User@123', 12);

  const shivaay = await prisma.user.upsert({
    where: { email: 'shivaay@palsafar.com' },
    update: { password: adminPassword, name: 'Shivaay (Admin)', permission: Role.ADMIN, activeMode: Role.ADMIN },
    create: { email: 'shivaay@palsafar.com', password: adminPassword, name: 'Shivaay (Admin)', permission: Role.ADMIN, activeMode: Role.ADMIN },
  });

  const tourist = await prisma.user.upsert({
    where: { email: 'user@palsafar.com' },
    update: { password: userPassword, name: 'Test User', permission: Role.USER, activeMode: Role.USER },
    create: {
      email: 'user@palsafar.com',
      password: userPassword,
      name: 'Test User',
      permission: Role.USER,
      activeMode: Role.USER,
      bio: 'Love exploring historical monuments.',
    },
  });

  for (const u of [shivaay, tourist]) {
    await prisma.wallet.upsert({
      where: { userId: u.id },
      update: {},
      create: { userId: u.id, palPoints: 500, lifetimeEarned: 500 },
    });
  }

  console.log('Seeded admin + tourist user');

  return {
    admin: shivaay,
    standardUser: tourist,
    tourist,
    creators: [] as Array<typeof shivaay>,
    vendors: [] as Array<typeof shivaay>,
  };
}
