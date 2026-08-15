import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const TEST_DB_HOST = 'dpg-d9usgk37uimc73al1gv0-a.ohio-postgres.render.com';
const PROD_DB_HOST = 'dpg-d9rqpkf10e5c738lgckg-a.singapore-postgres.render.com';

const TOUCHED_KEYS = [
  'NODE_ENV',
  'DATABASE_URL',
  'JWT_SECRET',
  'DIRECT_URL',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'SMTP_FROM_EMAIL',
  'BREVO_API_KEY',
  'SENDINBLUE_API_KEY',
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_PASSWORD',
];

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const key of TOUCHED_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of TOUCHED_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
});

async function loadEnvFreshly() {
  vi.resetModules();
  await import('../config/env');
}

function dbUrl(host: string): string {
  return `postgresql://user:password@${host}:5432/db?sslmode=require`;
}

function setProductionExtras() {
  process.env.CLOUDINARY_CLOUD_NAME = 'cloud';
  process.env.CLOUDINARY_API_KEY = 'key';
  process.env.CLOUDINARY_API_SECRET = 'secret';
  process.env.SMTP_FROM_EMAIL = 'noreply@example.com';
  process.env.BREVO_API_KEY = 'brevo-key';
  process.env.DIRECT_URL = dbUrl(PROD_DB_HOST);
}

describe('env database isolation guard', () => {
  it('refuses production mode pointing at the known TEST database host', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = dbUrl(TEST_DB_HOST);
    process.env.JWT_SECRET = 'x'.repeat(40);

    await expect(loadEnvFreshly()).rejects.toThrow(/TEST database host/);
  });

  it('refuses development mode pointing at the known PRODUCTION database host', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = dbUrl(PROD_DB_HOST);
    process.env.JWT_SECRET = 'x'.repeat(40);

    await expect(loadEnvFreshly()).rejects.toThrow(/PRODUCTION database host/);
  });

  it('refuses test mode pointing at the known PRODUCTION database host', async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = dbUrl(PROD_DB_HOST);
    process.env.JWT_SECRET = 'x'.repeat(40);

    await expect(loadEnvFreshly()).rejects.toThrow(/PRODUCTION database host/);
  });

  it('allows production mode with the known PRODUCTION database host', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = dbUrl(PROD_DB_HOST);
    process.env.JWT_SECRET = 'x'.repeat(40);
    setProductionExtras();

    await expect(loadEnvFreshly()).resolves.toBeUndefined();
  });

  it('allows test mode with the known TEST database host', async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = dbUrl(TEST_DB_HOST);
    process.env.JWT_SECRET = 'x'.repeat(40);

    await expect(loadEnvFreshly()).resolves.toBeUndefined();
  });

  it('allows production mode with an unrelated (e.g. local CI) database host', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://postgres:password@localhost:5432/ci_build';
    process.env.JWT_SECRET = 'x'.repeat(40);
    setProductionExtras();

    await expect(loadEnvFreshly()).resolves.toBeUndefined();
  });

  it('does not crash on an unparseable DATABASE_URL', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'not-a-url';
    process.env.JWT_SECRET = 'x'.repeat(40);
    setProductionExtras();

    await expect(loadEnvFreshly()).resolves.toBeUndefined();
  });
});