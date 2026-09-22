import path from 'path';
import { fileURLToPath, URL } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '.env.test') });

// Resolve test DB in JS config (vitest runs before ts-node helpers load).
// Keep in sync with src/config/test-database.ts.
const KNOWN_PRODUCTION_DB_HOSTS = new Set([
  'ep-sweet-morning-az9jhg9t-pooler.c-3.ap-southeast-1.aws.neon.tech',
  'ep-sweet-morning-az9jhg9t.c-3.ap-southeast-1.aws.neon.tech',
  'dpg-d9rqpkf10e5c738lgckg-a.singapore-postgres.render.com',
]);

function dbHostname(dbUrl) {
  try {
    return new URL(dbUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Canonical host:port/dbname identity — credentials and query params ignored. */
function dbIdentity(dbUrl) {
  try {
    const u = new URL(dbUrl);
    const db = (u.pathname || '/').replace(/^\//, '') || '';
    return `${u.hostname.toLowerCase()}:${u.port || '5432'}/${db.toLowerCase()}`;
  } catch {
    return null;
  }
}

function sameDatabase(a, b) {
  const idA = dbIdentity(a);
  return idA !== null && idA === dbIdentity(b);
}

function withTestPoolParams(url) {
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
  if (!parsed.searchParams.has('keepalives')) {
    parsed.searchParams.set('keepalives', '1');
  }
  if (!parsed.searchParams.has('keepalives_idle')) {
    parsed.searchParams.set('keepalives_idle', '30');
  }
  return parsed.toString();
}

function resolveTestDatabaseEnv() {
  const LOCAL_DEFAULT =
    'postgresql://postgres:postgres@localhost:5433/palsafar_test?connection_limit=3';
  const databaseUrl = withTestPoolParams(process.env.TEST_DATABASE_URL?.trim() || LOCAL_DEFAULT);
  const directUrl = withTestPoolParams(process.env.TEST_DIRECT_URL?.trim() || databaseUrl);

  const prod = process.env.PRODUCTION_DATABASE_URL?.trim();
  if (prod && sameDatabase(prod, databaseUrl)) {
    throw new Error(
      'Refusing to run tests: TEST_DATABASE_URL matches PRODUCTION_DATABASE_URL.',
    );
  }

  const testHost = dbHostname(databaseUrl);
  if (testHost && KNOWN_PRODUCTION_DB_HOSTS.has(testHost)) {
    throw new Error(
      'Refusing to run tests: TEST_DATABASE_URL resolves to a known PRODUCTION database host. ' +
        'Set TEST_DATABASE_URL to a local PostGIS or a dedicated isolated test database.',
    );
  }

  return {
    DATABASE_URL: databaseUrl,
    DIRECT_URL: directUrl,
  };
}

export const UNIT_TEST_FILES = [
  'src/__tests__/admin-rbac.test.ts',
  'src/__tests__/canonical.test.ts',
  'src/__tests__/email.test.ts',
  'src/__tests__/geohash-duplicate-scan.test.ts',
  'src/__tests__/boundary-dataset.test.ts',
  'src/__tests__/canonical-pick.test.ts',
  'src/__tests__/destination.test.ts',
  'src/__tests__/places-public-visibility.test.ts',
  'src/__tests__/plan-catalog.test.ts',
  'src/__tests__/vendor-public-visibility.unit.test.ts',
  'src/__tests__/vendor-tagged-reels.unit.test.ts',
  'src/__tests__/vendor-reel-idempotency.unit.test.ts',
  'src/__tests__/reel-video-upload-options.unit.test.ts',
  'src/__tests__/plan-enforcement.unit.test.ts',
  'src/__tests__/routes-directions.unit.test.ts',
  'src/__tests__/rides.providers.test.ts',
  'src/__tests__/place-images.sync.test.ts',
  'src/__tests__/itinerary-checkpoint-gps.test.ts',
  'src/__tests__/rewarded-ad-claim.test.ts',
  'src/__tests__/palpoints-rule-defaults.unit.test.ts',
  'src/__tests__/itinerary-cluster.unit.test.ts',
  'src/__tests__/creator-username.unit.test.ts',
  'src/__tests__/creator-privilege-escalation.unit.test.ts',
  'src/__tests__/creator-dashboard-query.unit.test.ts',
  'src/__tests__/challenge-proof.unit.test.ts',
  'src/__tests__/brevo-template-flows.unit.test.ts',
  'src/__tests__/pal-points-partner-redeem.unit.test.ts',
  'src/__tests__/security-refresh-token.unit.test.ts',
  'src/__tests__/rate-limit-client-ip.unit.test.ts',
  'src/__tests__/pagination.unit.test.ts',
  'src/__tests__/crash-audit-guards.unit.test.ts',
  'src/__tests__/action-dedup.unit.test.ts',
  'src/__tests__/jwt-admin-revalidation.unit.test.ts',
  'src/__tests__/error-handler-json.unit.test.ts',
  'src/__tests__/google-identity.unit.test.ts',
  'src/__tests__/google-account-resolution.unit.test.ts',
  'src/__tests__/safe-fetch-url.unit.test.ts',
  'src/__tests__/env-db-isolation.unit.test.ts',
  'src/__tests__/test-database-guard.unit.test.ts',
  'src/__tests__/place-review.unit.test.ts',
  'src/__tests__/budget-filter.unit.test.ts',
  'src/__tests__/admin-places-query.unit.test.ts',
  'src/__tests__/admin-grant-subscription.unit.test.ts',
  'src/__tests__/palpoints-earn-message.unit.test.ts',
  'src/__tests__/vendor-itinerary-place.unit.test.ts',
  'src/__tests__/trip-intent-parser.unit.test.ts',
  'src/__tests__/prompt-place-resolution.unit.test.ts',
  'src/__tests__/itinerary-opening-hours.unit.test.ts',
  'src/__tests__/itinerary-budget-attempts.unit.test.ts',
  'src/__tests__/itinerary-interest-scoring.unit.test.ts',
  'src/__tests__/itinerary-reasons.unit.test.ts',
  'src/__tests__/place-hours-validation.unit.test.ts',
  'src/__tests__/bulk-import-coordinates.unit.test.ts',
  'src/__tests__/fee-basis.unit.test.ts',
  'src/__tests__/riddles-import.unit.test.ts',
  'src/__tests__/riddles-import-delete.unit.test.ts',
  'src/__tests__/riddles-overview.unit.test.ts',
  'src/__tests__/riddles-scoring.unit.test.ts',
  'src/__tests__/riddles-city-resolution.unit.test.ts',
  'src/__tests__/hunt-city-resolution.unit.test.ts',
  'src/__tests__/answer-matching.unit.test.ts',
  'src/__tests__/daily-open-reward.unit.test.ts',
  'src/__tests__/reverse-geocode.unit.test.ts',
  'src/__tests__/riddles-daily.unit.test.ts',
  'src/__tests__/legal-current-versions.unit.test.ts',
  // Phase 1 itinerary intelligence engine (pure, DB-free)
  'src/__tests__/itinerary-phase1-intent.unit.test.ts',
  'src/__tests__/itinerary-phase1-candidates.unit.test.ts',
  'src/__tests__/itinerary-phase1-enrichment.unit.test.ts',
  'src/__tests__/itinerary-phase1-scoring.unit.test.ts',
  'src/__tests__/itinerary-phase1-clustering.unit.test.ts',
  'src/__tests__/itinerary-phase1-route.unit.test.ts',
  'src/__tests__/itinerary-phase1-schedule.unit.test.ts',
  'src/__tests__/itinerary-phase1-constraints.unit.test.ts',
  // Phase 2 canonical planner layer (pure, DB-free)
  'src/modules/trips/itinerary/__tests__/dayAllocator.test.ts',
  'src/modules/trips/itinerary/__tests__/candidateGenerator.test.ts',
  'src/modules/trips/itinerary/__tests__/qualityScorer.test.ts',
  'src/modules/trips/itinerary/__tests__/aiExplainer.test.ts',
  'src/modules/trips/itinerary/__tests__/planner.test.ts',
  // Phase 3 canonical /plan wiring (pure, DB-free)
  'src/__tests__/plan-schema.unit.test.ts',
  'src/__tests__/canonical-plan-mapper.unit.test.ts',
  'src/__tests__/itinerary-previous-stop-distance.unit.test.ts',
  'src/__tests__/custom-budget-regen.unit.test.ts',
];

export const E2E_TEST_GLOB = 'src/__tests__/**/*.integration.test.ts';

/** Serial DB-backed suites against the test database (local PostGIS or TEST_DATABASE_URL).
 *  Vitest 4: keep isolate true so vi.mock (e.g. upload tests) still applies.
 *  One worker avoids opening multiple Prisma pools from the test worker pool. */
export const SERIAL_DB_TEST_OPTIONS = {
  fileParallelism: false,
  maxWorkers: 1,
  isolate: true,
  pool: 'forks',
};

export function baseVitestConfig(overrides = {}) {
  const { test: testOverrides, resolve: resolveOverrides, ...restOverrides } = overrides;
  return {
    ...restOverrides,
    resolve: {
      alias: {
        shared: path.resolve(__dirname, '../shared'),
      },
      ...resolveOverrides,
    },
    test: {
      globals: true,
      environment: 'node',
      exclude: ['**/dist/**', '**/node_modules/**'],
      testTimeout: 90_000,
      hookTimeout: 90_000,
      pool: 'forks',
      env: resolveTestDatabaseEnv(),
      ...testOverrides,
    },
  };
}

export { resolveTestDatabaseEnv };
