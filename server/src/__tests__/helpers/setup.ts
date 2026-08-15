import { prisma } from '../../config/database';
import { applyTestDatabaseEnv } from '../../config/test-database';
import { withRetry } from '../../utils/retry';

applyTestDatabaseEnv();

beforeAll(async () => {
  await withRetry(() => prisma.$connect(), { maxRetries: 5, baseDelayMs: 500 });
}, 60_000);

// Do not $disconnect per file. Per-file disconnect races with in-flight event-bus
// queries (notifications/audit) and forces a new TCP handshake to Render on every
// file. The worker process and globalTeardown close the pool.
