import { processPendingMediaCleanup } from '../../src/modules/upload/media-cleanup.service';
import { prisma } from '../../src/config/database';

/**
 * Retry Cloudinary deletions that failed during account deletion
 * (media_cleanup_tasks queue). Safe to run repeatedly (cron / Render cron job).
 *
 * Usage: ts-node scripts/jobs/retry-media-cleanup.ts [--limit=50] [--max-attempts=8]
 * Exit codes: 0 = ok, 1 = unexpected crash.
 */
async function main() {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const attemptsArg = process.argv.find((a) => a.startsWith('--max-attempts='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1] || '50', 10) : 50;
  const maxAttempts = attemptsArg ? parseInt(attemptsArg.split('=')[1] || '8', 10) : 8;

  const pending = await prisma.mediaCleanupTask.count({ where: { status: 'PENDING' } });
  console.log(`[retry-media-cleanup] Pending tasks: ${pending} (limit=${limit}, maxAttempts=${maxAttempts})`);

  const stats = await processPendingMediaCleanup({ limit, maxAttempts });
  console.log(JSON.stringify({ job: 'retry-media-cleanup', ...stats }, null, 2));

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('[retry-media-cleanup] Job crashed:', err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
