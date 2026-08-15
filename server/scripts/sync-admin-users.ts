/**
 * Provision or upgrade PalSafar admin dashboard accounts.
 *
 * Usage:
 *   cd server && npx ts-node scripts/sync-admin-users.ts
 *
 * Creates missing admins (forgot-password onboarding) or upgrades existing users to ADMIN.
 * Set SYNC_CANONICAL_CREDENTIALS=true and SEED_ADMIN_PASSWORD to apply a shared password.
 */
import { prisma } from '../src/config/database';
import { ADMIN_USER_EMAILS, ensureAdminUsers } from '../src/config/db-seed';

async function main() {
  await prisma.$connect();
  await ensureAdminUsers();
  console.log('Admin dashboard accounts synced:');
  for (const email of ADMIN_USER_EMAILS) {
    console.log(`  - ${email}`);
  }
  console.log(
    '\nNew admins without SYNC_CANONICAL_CREDENTIALS should use Forgot password on the admin login page.',
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
