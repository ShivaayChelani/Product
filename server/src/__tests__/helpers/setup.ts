// Apply TEST_DATABASE_URL/DIRECT_URL before Prisma binds its datasource URL.
// This import MUST stay first among the imports below.
import './apply-test-env';
import { prisma } from '../../config/database';
import { withRetry } from '../../utils/retry';

beforeAll(async () => {
  await withRetry(() => prisma.$connect(), { maxRetries: 5, baseDelayMs: 500 });
}, 60_000);

// Do not $disconnect per file. Per-file disconnect races with in-flight event-bus
// queries (notifications/audit) and forces a new TCP handshake to Render on every
// file. The worker process and globalTeardown close the pool.
