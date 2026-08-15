import { PrismaClient, User, Place } from '@prisma/client';

export async function seedGamification(prisma: PrismaClient, users: User[], places: Place[]) {
  console.log('--- Seeding 06_gamification.ts ---');

  if (users.length === 0) return;

  const BATCH_SIZE = 500;

  // 1. Transactions (Points)
  const pointTransactions = [];

  for (const u of users) {
    const txCount = Math.floor(Math.random() * 10) + 5;
    for (let i = 0; i < txCount; i++) {
      const date = new Date(Date.now() - Math.floor(Math.random() * 30 * 86400000));
      const amount = Math.floor(Math.random() * 50) + 10;

      pointTransactions.push({
        userId: u.id,
        amount,
        type: 'EARN',
        reason: 'check_in',
        createdAt: date,
      });
    }
  }

  for (let i = 0; i < pointTransactions.length; i += BATCH_SIZE) {
    await prisma.pointTransaction.createMany({ data: pointTransactions.slice(i, i + BATCH_SIZE) as any });
  }
  console.log(`Seeded ${pointTransactions.length} Point Transactions`);
}
