process.env.NODE_ENV = 'test';

import { ensureDbExtensions } from '../../config/db-extensions';
import { ensureSeedData } from '../../config/db-seed';
import { prisma } from '../../config/database';
import { applyTestDatabaseEnv } from '../../config/test-database';
import { withRetry } from '../../utils/retry';

export async function setup() {
  applyTestDatabaseEnv();
  await withRetry(() => ensureDbExtensions(), { maxRetries: 5, baseDelayMs: 500 });
  await withRetry(() => ensureSeedData(), { maxRetries: 5, baseDelayMs: 500 });
  // Release the globalSetup process pool so workers are not competing for Render TEST slots
  // for the entire suite (each PrismaClient defaults to connection_limit from TEST_DATABASE_URL).
  await prisma.$disconnect().catch(() => {});
}

export async function teardown() {
  await prisma.$disconnect().catch(() => {});
}
