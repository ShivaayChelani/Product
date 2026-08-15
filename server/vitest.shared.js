import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '.env.test') });

// Resolve test DB in JS config (vitest runs before ts-node helpers load).
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

  const normalize = (u) => u.trim().replace(/\/+$/, '');
  const prod = process.env.PRODUCTION_DATABASE_URL?.trim();
  if (prod && normalize(prod) === normalize(databaseUrl)) {
    throw new Error(
      'Refusing to run tests: TEST_DATABASE_URL matches PRODUCTION_DATABASE_URL.',
    );
  }
  const envDb = process.env.DATABASE_URL?.trim();
  const explicitTestDb = Boolean(process.env.TEST_DATABASE_URL?.trim());
  if (
    envDb &&
    normalize(envDb) === normalize(databaseUrl) &&
    !explicitTestDb &&
    process.env.ALLOW_PRODUCTION_DATABASE_FOR_TESTS !== 'true'
  ) {
    throw new Error(
      'Refusing to run tests: test DB equals DATABASE_URL from .env. Set TEST_DATABASE_URL explicitly.',
    );
  }

  return {
    NODE_ENV: 'test',
    JWT_SECRET: process.env.JWT_SECRET || 'test-jwt-secret-for-vitest-min-32-chars!!',
    TEST_DATABASE_URL: databaseUrl,
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
  'src/__tests__/plan-enforcement.unit.test.ts',
  'src/__tests__/osrm-directions.unit.test.ts',
  'src/__tests__/rides.providers.test.ts',
  'src/__tests__/place-images.sync.test.ts',
  'src/__tests__/itinerary-checkpoint-gps.test.ts',
  'src/__tests__/rewarded-ad-claim.test.ts',
  'src/__tests__/palpoints-rule-defaults.unit.test.ts',
  'src/__tests__/itinerary-cluster.unit.test.ts',
  'src/__tests__/itinerary-cluster.unit.test.ts',
  'src/__tests__/creator-username.unit.test.ts',
  'src/__tests__/creator-privilege-escalation.unit.test.ts',
  'src/__tests__/challenge-proof.unit.test.ts',
  'src/__tests__/brevo-template-flows.unit.test.ts',
  'src/__tests__/pal-points-partner-redeem.unit.test.ts',
  'src/__tests__/security-refresh-token.unit.test.ts',
  'src/__tests__/auth-reset-otp-replay.unit.test.ts',
  'src/__tests__/safe-fetch-url.unit.test.ts',
  'src/__tests__/env-db-isolation.unit.test.ts',
  'src/__tests__/place-review.unit.test.ts',
  'src/__tests__/budget-filter.unit.test.ts',
  'src/__tests__/admin-places-query.unit.test.ts',
  'src/__tests__/admin-grant-subscription.unit.test.ts',
  'src/__tests__/palpoints-earn-message.unit.test.ts',
  'src/__tests__/vendor-itinerary-place.unit.test.ts',
];

export const E2E_TEST_GLOB = 'src/__tests__/**/*.integration.test.ts';

/** Serial DB-backed suites against remote Render TEST.
 *  Vitest 4: keep isolate true so vi.mock (e.g. upload tests) still applies.
 *  One worker avoids opening multiple Prisma pools against Render. */
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
