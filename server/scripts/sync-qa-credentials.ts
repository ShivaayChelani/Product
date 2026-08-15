/**
 * One-shot sync of canonical QA account passwords (admin, vendor, creator, tourist).
 * Usage: npx ts-node scripts/sync-qa-credentials.ts
 */
import { prisma } from '../src/config/database';
import { syncQaCredentials } from '../src/config/db-seed';

async function main() {
  await prisma.$connect();
  await syncQaCredentials();
  console.log('QA credentials synced.');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
