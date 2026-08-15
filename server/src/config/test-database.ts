/**
 * Test database URL resolution — never use production DATABASE_URL for automated tests.
 *
 * Priority:
 *   1. TEST_DATABASE_URL (+ optional TEST_DIRECT_URL)
 *   2. Local Docker PostGIS default (palsafar_test)
 *
 * Production DATABASE_URL from .env is ignored unless explicitly copied into TEST_DATABASE_URL.
 */

const LOCAL_TEST_DEFAULT =
  'postgresql://postgres:postgres@localhost:5433/palsafar_test?connection_limit=3';

/**
 * Prisma URL params for the TEST database only.
 * Does not raise connection_limit (Render TEST max_connections=100; keep a small client pool).
 * connect_timeout/pool_timeout cover transcontinental RTT without changing production DATABASE_URL.
 */
export function withTestPoolParams(url: string): string {
  const parsed = new URL(url);
  if (!parsed.searchParams.has('connection_limit')) {
    parsed.searchParams.set('connection_limit', '3');
  }
  if (!parsed.searchParams.has('pool_timeout')) {
    parsed.searchParams.set('pool_timeout', '20');
  }
  if (!parsed.searchParams.has('connect_timeout')) {
    parsed.searchParams.set('connect_timeout', '15');
  }
  // Keep idle pooled sockets alive across Render's external proxy (TEST DB only).
  if (!parsed.searchParams.has('keepalives')) {
    parsed.searchParams.set('keepalives', '1');
  }
  if (!parsed.searchParams.has('keepalives_idle')) {
    parsed.searchParams.set('keepalives_idle', '30');
  }
  return parsed.toString();
}

export function resolveTestDatabaseUrls(): { databaseUrl: string; directUrl: string } {
  const databaseUrl = withTestPoolParams(process.env.TEST_DATABASE_URL?.trim() || LOCAL_TEST_DEFAULT);
  const directUrl = withTestPoolParams(process.env.TEST_DIRECT_URL?.trim() || databaseUrl);
  return { databaseUrl, directUrl };
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/**
 * Refuse to run tests against the production database connection string.
 * Set ALLOW_PRODUCTION_DATABASE_FOR_TESTS=true only for emergency debugging (not CI).
 */
export function assertSafeTestDatabase(): void {
  const { databaseUrl } = resolveTestDatabaseUrls();
  const normalizedTest = normalizeUrl(databaseUrl);

  const productionUrl = process.env.PRODUCTION_DATABASE_URL?.trim();
  if (productionUrl && normalizeUrl(productionUrl) === normalizedTest) {
    throw new Error(
      'Refusing to run tests: TEST_DATABASE_URL matches PRODUCTION_DATABASE_URL. ' +
        'Use local Docker PostGIS for automated tests.',
    );
  }

  const envDatabaseUrl = process.env.DATABASE_URL?.trim();
  const explicitTestDb = Boolean(process.env.TEST_DATABASE_URL?.trim());
  if (
    envDatabaseUrl &&
    normalizeUrl(envDatabaseUrl) === normalizedTest &&
    !explicitTestDb &&
    process.env.ALLOW_PRODUCTION_DATABASE_FOR_TESTS !== 'true'
  ) {
    throw new Error(
      'Refusing to run tests: test target equals DATABASE_URL from .env (production). ' +
        'Set TEST_DATABASE_URL to a local PostGIS test URL. ' +
        'See server/docs/TESTING.md.',
    );
  }
}

/** Apply resolved URLs to process.env before Prisma client initializes. */
export function applyTestDatabaseEnv(): { databaseUrl: string; directUrl: string } {
  assertSafeTestDatabase();
  const urls = resolveTestDatabaseUrls();
  process.env.DATABASE_URL = urls.databaseUrl;
  process.env.DIRECT_URL = urls.directUrl;
  return urls;
}
