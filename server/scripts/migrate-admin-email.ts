/**
 * Migrate admin email shivaay@palsafar.com → shivaay.chelani@gmail.com
 * Usage: cd server && npx ts-node scripts/migrate-admin-email.ts
 */
import dotenv from 'dotenv';
import path from 'path';
import { prisma } from '../src/config/database';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const OLD_EMAIL = 'shivaay@palsafar.com';
const NEW_EMAIL = 'shivaay.chelani@gmail.com';

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: OLD_EMAIL } });
  const target = await prisma.user.findUnique({ where: { email: NEW_EMAIL } });

  if (!existing && target) {
    console.log('Already migrated:', NEW_EMAIL);
    return;
  }

  if (!existing) {
    console.error('No user found with', OLD_EMAIL);
    process.exit(1);
  }

  if (target && target.id !== existing.id) {
    console.error('Conflict: both emails exist as separate users. Merge manually.');
    process.exit(1);
  }

  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.deleteMany({ where: { email: OLD_EMAIL } }).catch(() => {});

    await tx.user.update({
      where: { id: existing.id },
      data: {
        email: NEW_EMAIL,
        name: existing.name === 'Admin User' ? 'Shivaay Chelani' : existing.name,
      },
    });
  });

  const updated = await prisma.user.findUnique({
    where: { email: NEW_EMAIL },
    select: { id: true, email: true, name: true, permission: true },
  });

  console.log('Migrated admin account:', updated);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
