import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { assertSafeTestDatabase, resolveTestDatabaseUrls } from '../config/test-database';

/**
 * Guards that the automated-test database target can never equal production.
 * Covers the exact production incident: server/.env silently set
 * TEST_DATABASE_URL identical to the production DATABASE_URL (Neon).
 */

const PROD_POOLER_HOST = 'ep-sweet-morning-az9jhg9t-pooler.c-3.ap-southeast-1.aws.neon.tech';
const PROD_DIRECT_HOST = 'ep-sweet-morning-az9jhg9t.c-3.ap-southeast-1.aws.neon.tech';
const LOCAL_HOST = 'localhost';
const ISOLATED_TEST_HOST = 'ep-isolated-test-db-abc123.us-east-2.aws.neon.tech';

function dbUrl(host: string, db: string, extra = ''): string {
  return `postgresql://u:pw@${host}:5432/${db}?sslmode=require${extra}`;
}

const KEYS = ['TEST_DATABASE_URL', 'TEST_DIRECT_URL', 'DATABASE_URL', 'DIRECT_URL', 'PRODUCTION_DATABASE_URL', 'ALLOW_PRODUCTION_DATABASE_FOR_TESTS'] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('resolveTestDatabaseUrls — never resolves to production', () => {
  it('resolves an explicitly-set isolated test URL', () => {
    process.env.TEST_DATABASE_URL = dbUrl(ISOLATED_TEST_HOST, 'palsafar_test');
    const { databaseUrl } = resolveTestDatabaseUrls();
    expect(databaseUrl).toContain(ISOLATED_TEST_HOST);
  });
});

describe('assertSafeTestDatabase — refuses production test targets', () => {
  it('refuses TEST_DATABASE_URL that equals the production DATABASE_URL (the .env incident)', () => {
    process.env.DATABASE_URL = dbUrl(PROD_POOLER_HOST, 'neondb', '&pgbouncer=true');
    process.env.TEST_DATABASE_URL = dbUrl(PROD_POOLER_HOST, 'neondb', '&pgbouncer=true');
    expect(() => assertSafeTestDatabase()).toThrow(/PRODUCTION database host|production DATABASE_URL/);
  });

  it('refuses TEST_DATABASE_URL on a known production pooler host even with local DATABASE_URL', () => {
    process.env.DATABASE_URL = dbUrl(LOCAL_HOST, 'palsafar_test');
    process.env.TEST_DATABASE_URL = dbUrl(PROD_POOLER_HOST, 'neondb');
    expect(() => assertSafeTestDatabase()).toThrow(/PRODUCTION database host/);
  });

  it('refuses TEST_DATABASE_URL on a known production direct host', () => {
    process.env.DATABASE_URL = dbUrl(LOCAL_HOST, 'palsafar_test');
    process.env.TEST_DATABASE_URL = dbUrl(PROD_DIRECT_HOST, 'neondb');
    expect(() => assertSafeTestDatabase()).toThrow(/PRODUCTION database host/);
  });

  it('refuses TEST_DATABASE_URL that equals an explicit PRODUCTION_DATABASE_URL override', () => {
    // known-host branch is avoided so the PRODUCTION_DATABASE_URL equality branch is exercised
    process.env.PRODUCTION_DATABASE_URL = dbUrl(ISOLATED_TEST_HOST, 'neondb');
    process.env.TEST_DATABASE_URL = dbUrl(ISOLATED_TEST_HOST, 'neondb');
    expect(() => assertSafeTestDatabase()).toThrow(/PRODUCTION_DATABASE_URL/);
  });

  it('refuses the local fallback when it would equal DATABASE_URL and no TEST_DATABASE_URL is set', () => {
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5433/palsafar_test?connection_limit=3&pool_timeout=20&connect_timeout=15&keepalives=1&keepalives_idle=30';
    delete process.env.TEST_DATABASE_URL;
    expect(() => assertSafeTestDatabase()).toThrow(/equals DATABASE_URL/);
  });
});

describe('assertSafeTestDatabase — allows safe test targets', () => {
  it('allows TEST_DATABASE_URL == DATABASE_URL on localhost (the .env.test pattern)', () => {
    process.env.DATABASE_URL = dbUrl(LOCAL_HOST, 'palsafar_test');
    process.env.TEST_DATABASE_URL = dbUrl(LOCAL_HOST, 'palsafar_test');
    process.env.TEST_DIRECT_URL = dbUrl(LOCAL_HOST, 'palsafar_test');
    expect(() => assertSafeTestDatabase()).not.toThrow();
  });

  it('allows an explicitly-set dedicated isolated test database', () => {
    process.env.DATABASE_URL = dbUrl(PROD_POOLER_HOST, 'neondb');
    process.env.TEST_DATABASE_URL = dbUrl(ISOLATED_TEST_HOST, 'palsafar_test');
    expect(() => assertSafeTestDatabase()).not.toThrow();
  });
});