import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
if (process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters');
}
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

/**
 * Environment isolation guard (hostname-only comparison — never prints credentials).
 * Prevents a production-configured application from connecting to the known TEST
 * database host, and prevents test/dev runs from connecting to the known
 * PRODUCTION database host. Render production and the Ohio TEST_DATABASE_URL
 * are unaffected.
 */
const KNOWN_TEST_DB_HOSTS = new Set([
  'dpg-d9usgk37uimc73al1gv0-a.ohio-postgres.render.com',
]);
const KNOWN_PROD_DB_HOSTS = new Set([
  'dpg-d9rqpkf10e5c738lgckg-a.singapore-postgres.render.com',
]);

function dbHostname(dbUrl: string): string | null {
  try {
    return new URL(dbUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

{
  const hostname = dbHostname(process.env.DATABASE_URL);
  if (hostname && KNOWN_TEST_DB_HOSTS.has(hostname) && process.env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to start in production mode: DATABASE_URL points at the known TEST database host. ' +
      'Set DATABASE_URL to the production PostgreSQL host.',
    );
  }
  if (hostname && KNOWN_PROD_DB_HOSTS.has(hostname) && process.env.NODE_ENV !== 'production') {
    throw new Error(
      'Refusing to start in non-production mode: DATABASE_URL points at the known PRODUCTION database host. ' +
      'Use the isolated TEST_DATABASE_URL for tests and development.',
    );
  }
}

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const cloudKey = process.env.CLOUDINARY_API_KEY?.trim();
  const cloudSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!cloudName || !cloudKey || !cloudSecret) {
    throw new Error(
      'CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are required in production',
    );
  }

  const smtpHost = process.env.SMTP_HOST?.trim();
  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim() || process.env.SMTP_PASSWORD?.trim();
  const smtpConfigured = Boolean(smtpHost && smtpUser && smtpPass);
  const brevoApiConfigured = Boolean(
    (process.env.BREVO_API_KEY?.trim() || process.env.SENDINBLUE_API_KEY?.trim())
    && process.env.SMTP_FROM_EMAIL?.trim(),
  );
  // Prefer Brevo HTTPS API on Render (SMTP ports are often blocked → connection timeout).
  if (!brevoApiConfigured && !smtpConfigured) {
    throw new Error(
      'Production email requires BREVO_API_KEY + SMTP_FROM_EMAIL (recommended on Render) or SMTP_HOST/USER/PASS',
    );
  }
  if (!process.env.SMTP_FROM_EMAIL?.trim()) {
    throw new Error('SMTP_FROM_EMAIL is required in production (must be a verified Brevo sender)');
  }
  if (!process.env.DIRECT_URL?.trim()) {
    // Soft-fail: Prisma migrate deploy prefers DIRECT_URL when DATABASE_URL is a pooled connection.
    // Logger may not be initialized yet during env load.
    process.stderr.write(
      '[env] DIRECT_URL is unset in production — prisma migrate deploy may fail against a pooled DATABASE_URL\n',
    );
  }
}

function requireClientUrl(): string {
  if (isProduction) {
    // Soft-fail: keeps the API bootable without a client origin configured.
    process.stderr.write('[env] CLIENT_URL is unset in production — email links and client CORS origin will be incomplete\n');
    return '';
  }
  return 'http://localhost:3000';
}

function resolveSmtpFromEmail(): string {
  const from = process.env.SMTP_FROM_EMAIL?.trim();
  if (from) return from;
  if (isProduction) {
    throw new Error('SMTP_FROM_EMAIL is required in production');
  }
  return 'noreply@localhost';
}

export const env = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  directUrl: process.env.DIRECT_URL || '',
  redisUrl: process.env.REDIS_URL,
  jwt: {
    secret: process.env.JWT_SECRET,
    // Short-lived access tokens; clients refresh via /auth/refresh. Override with JWT_EXPIRES_IN if needed.
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
    privateKey: process.env.FIREBASE_PRIVATE_KEY || '',
    privateKeyPath: process.env.FIREBASE_PRIVATE_KEY_PATH || '',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
  },
  sentryDsn: process.env.SENTRY_DSN || '',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD || '',
    fromEmail: resolveSmtpFromEmail(),
    fromName: process.env.SMTP_FROM_NAME || 'PalSafar',
  },
  clientUrl: process.env.CLIENT_URL || (isProduction ? requireClientUrl() : 'http://localhost:3000'),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },
  googlePlay: {
    packageName: process.env.GOOGLE_PLAY_PACKAGE_NAME || 'com.palsasafar',
    serviceAccountJson: process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || '',
  },
  appleIap: {
    issuerId: process.env.APPLE_IAP_ISSUER_ID || '',
    keyId: process.env.APPLE_IAP_KEY_ID || '',
    privateKey: process.env.APPLE_IAP_PRIVATE_KEY || '',
    bundleId: process.env.APPLE_IAP_BUNDLE_ID || '',
    env: process.env.APPLE_IAP_ENV || 'production',
  },
  isProduction,
  /** Tourist APIs return only dataQuality=VERIFIED when true (default false for backward compatibility). */
  placesPublicVerifiedOnly: process.env.PLACES_PUBLIC_VERIFIED_ONLY === 'true',
  /** Licensed GeoJSON directory (states.geojson, districts.geojson) — not bundled. */
  boundaryDataDir: process.env.BOUNDARY_DATA_DIR || '',
  /** Must be true after legal approval to load boundary files. */
  boundaryDataLicenseAcknowledged: process.env.BOUNDARY_DATA_LICENSE_ACKNOWLEDGED === 'true',
  /** Hybrid lexical + vector search (requires OpenAI embedding key + refresh job). */
  hybridSearchEnabled: process.env.HYBRID_SEARCH_ENABLED === 'true',
  embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
  /** Ride booking — deeplink-only; no routing or fare APIs. */
  rides: {
    requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT || '10000', 10),
  },
};
