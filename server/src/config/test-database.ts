/**
 * Test database URL resolution — never use production DATABASE_URL for automated tests.
 *
 * Priority:
 *   1. TEST_DATABASE_URL (+ optional TEST_DIRECT_URL)
 *   2. Local PostGIS default (palsafar_test)
 *
 * Production DATABASE_URL from .env is ignored unless explicitly copied into TEST_DATABASE_URL.
 * assertSafeTestDatabase() must pass before any test connects or mutates the database.
 */

const LOCAL_TEST_DEFAULT =
  'postgresql://postgres:postgres@localhost:5433/palsafar_test?connection_limit=3';

/**
 * Known PRODUCTION database hosts. A test target MUST never resolve to any of
 * these hosts. The current Neon production endpoints are listed here along with
 * the decommissioned Render production host (retained so a stale URL is refused).
 *
 * Deliberately host-based (never credential-based): a dedicated isolated test
 * DB on a SEPARATE host passes, while any TEST_DATABASE_URL copied from
 * production (same host) fails fast before Prisma connects.
 */
const KNOWN_PRODUCTION_DB_HOSTS = new Set([
  'ep-sweet-morning-az9jhg9t-pooler.c-3.ap-southeast-1.aws.neon.tech',
  'ep-sweet-morning-az9jhg9t.c-3.ap-southeast-1.aws.neon.tech',
  'dpg-d9rqpkf10e5c738lgckg-a.singapore-postgres.render.com',
]);

function dbHostname(dbUrl: string): string | null {
  try {
    return new URL(dbUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isKnownProductionHost(dbUrl: string): boolean {
  const hostname = dbHostname(dbUrl);
  return hostname !== null && KNOWN_PRODUCTION_DB_HOSTS.has(hostname);
}

/**
 * Prisma URL params for the TEST database only.
 * Keeps a small client pool with sane timeouts for any remote TEST host
 * (CI PostGIS container or TEST_DATABASE_URL) without changing production DATABASE_URL.
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
  // Keep idle pooled sockets alive across any remote TEST host proxy (TEST DB only).
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

/**
 * Canonical database identity: host:port/dbname (credentials and query params
 * ignored). Two URLs with the same identity refer to the same physical database —
 * this is what test targets must never share with production.
 */
function dbIdentity(dbUrl: string): string | null {
  try {
    const u = new URL(dbUrl);
    const db = (u.pathname || '/').replace(/^\//, '') || '';
    return `${u.hostname.toLowerCase()}:${u.port || '5432'}/${db.toLowerCase()}`;
  } catch {
    return null;
  }
}

function sameDatabase(a: string, b: string): boolean {
  const idA = dbIdentity(a);
  return idA !== null && idA === dbIdentity(b);
}

/**
 * Refuse to run tests against the production database connection string.
 * Set ALLOW_PRODUCTION_DATABASE_FOR_TESTS=true only for emergency debugging (not CI).
 *
 * Fail-fast conditions (production identity is detected via host, never credentials):
 *   1. TEST_DATABASE_URL equals an explicit PRODUCTION_DATABASE_URL override;
 *   2. TEST_DATABASE_URL host is in the known production host set;
 *   3. TEST_DATABASE_URL (or the local-test fallback) equals DATABASE_URL while the
 *      production env file (which loads DATABASE_URL) is the source — i.e. the
 *      fallback path when no TEST_DATABASE_URL is set.
 */
export function assertSafeTestDatabase(): void {
  const { databaseUrl } = resolveTestDatabaseUrls();

  const productionUrl = process.env.PRODUCTION_DATABASE_URL?.trim();
  if (productionUrl && sameDatabase(productionUrl, databaseUrl)) {
    throw new Error(
      'Refusing to run tests: TEST_DATABASE_URL matches PRODUCTION_DATABASE_URL. ' +
        'Use local PostGIS for automated tests.',
    );
  }

  if (isKnownProductionHost(databaseUrl)) {
    throw new Error(
      'Refusing to run tests: TEST_DATABASE_URL resolves to a known PRODUCTION database host. ' +
        'Set TEST_DATABASE_URL to a local PostGIS or a dedicated isolated test database. ' +
        `(test host: ${dbHostname(databaseUrl) ?? 'unknown'})`,
    );
  }

  const envDatabaseUrl = process.env.DATABASE_URL?.trim();
  const explicitTestDb = Boolean(process.env.TEST_DATABASE_URL?.trim());
  if (envDatabaseUrl && isKnownProductionHost(envDatabaseUrl) && sameDatabase(envDatabaseUrl, databaseUrl)) {
    throw new Error(
      'Refusing to run tests: TEST_DATABASE_URL equals the production DATABASE_URL. ' +
        'Set TEST_DATABASE_URL to a local PostGIS test URL. ' +
        'See server/docs/TESTING.md.',
    );
  }
  if (
    envDatabaseUrl &&
    sameDatabase(envDatabaseUrl, databaseUrl) &&
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
