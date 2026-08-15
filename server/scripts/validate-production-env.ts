/**
 * Validate Render/production environment variables before RC-1 deploy.
 *
 * Usage:
 *   cd server && npx ts-node scripts/validate-production-env.ts
 *   cd server && npx ts-node scripts/validate-production-env.ts --profile=closed-beta
 *
 * Does not print secret values. Exit 0 = pass, 1 = blocker(s) found.
 */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

type Severity = 'blocker' | 'warn' | 'info';

interface Finding {
  severity: Severity;
  variable: string;
  message: string;
}

const profile = process.argv.includes('--profile=closed-beta') ? 'closed-beta' : 'production';

function isSet(name: string): boolean {
  const v = process.env[name]?.trim();
  return Boolean(v && v.length > 0);
}

function isTruthy(name: string): boolean {
  return process.env[name]?.trim().toLowerCase() === 'true';
}

function push(findings: Finding[], severity: Severity, variable: string, message: string): void {
  findings.push({ severity, variable, message });
}

function validate(): Finding[] {
  const findings: Finding[] = [];
  const nodeEnv = process.env.NODE_ENV?.trim() || 'development';
  const isProd = nodeEnv === 'production';

  // ── Boot-required (server throws without these) ──
  if (!isSet('DATABASE_URL')) {
    push(findings, 'blocker', 'DATABASE_URL', 'Missing — API cannot start.');
  }
  if (!isSet('JWT_SECRET')) {
    push(findings, 'blocker', 'JWT_SECRET', 'Missing — API cannot start.');
  } else if ((process.env.JWT_SECRET?.trim().length ?? 0) < 32) {
    push(findings, 'blocker', 'JWT_SECRET', 'Must be at least 32 characters.');
  }

  if (isProd && !isSet('CLIENT_URL')) {
    push(findings, 'blocker', 'CLIENT_URL', 'Required when NODE_ENV=production.');
  }

  // ── Forbidden on production ──
  if (isProd && isTruthy('SYNC_CANONICAL_CREDENTIALS')) {
    push(
      findings,
      'blocker',
      'SYNC_CANONICAL_CREDENTIALS',
      'Must NOT be true on production — overwrites canonical test passwords.',
    );
  }
  if (isProd && isTruthy('PRUNE_EXTRA_USERS')) {
    push(
      findings,
      'blocker',
      'PRUNE_EXTRA_USERS',
      'Must NOT be true on production — deletes all users except four seed accounts.',
    );
  }
  if (isProd && isTruthy('SYNC_CURATED_PLACES')) {
    push(findings, 'warn', 'SYNC_CURATED_PLACES', 'Should be false on production unless running a one-off ingest.');
  }

  // ── Migrations ──
  if (isProd && !isSet('DIRECT_URL')) {
    push(findings, 'blocker', 'DIRECT_URL', 'Required for prisma migrate deploy when DATABASE_URL is pooled.');
  }

  // ── RC-1 closed-beta blockers ──
  if (profile === 'closed-beta' || isProd) {
    if (!isSet('SENTRY_DSN')) {
      push(findings, 'blocker', 'SENTRY_DSN', 'Required for RC-1 — production errors will be invisible.');
    }
    if (!isSet('CLOUDINARY_CLOUD_NAME') || !isSet('CLOUDINARY_API_KEY') || !isSet('CLOUDINARY_API_SECRET')) {
      push(findings, 'blocker', 'CLOUDINARY_*', 'All three Cloudinary vars required for image uploads.');
    }
  }

  // ── Strongly recommended for closed beta ──
  const smtpOk = isSet('SMTP_HOST') && isSet('SMTP_USER') && isSet('SMTP_PASS');
  if (!smtpOk) {
    push(
      findings,
      'warn',
      'SMTP_*',
      'Not configured — forgot-password and account-deletion emails will return 503.',
    );
  } else if (profile === 'closed-beta' || isProd) {
    if (!isSet('SMTP_FROM_EMAIL')) {
      push(findings, 'info', 'SMTP_FROM_EMAIL', 'Unset — defaults to rahul@palsafar.in in code.');
    }
    if (!isSet('SMTP_FROM_NAME')) {
      push(findings, 'info', 'SMTP_FROM_NAME', 'Unset — defaults to PalSafar in code.');
    }
  }

  const hasPrivateKey = isSet('FIREBASE_PRIVATE_KEY') || isSet('FIREBASE_PRIVATE_KEY_PATH');
  const explicitFirebaseOk =
    isSet('FIREBASE_PROJECT_ID') && isSet('FIREBASE_CLIENT_EMAIL') && hasPrivateKey;
  const hasPartialExplicit =
    (isSet('FIREBASE_CLIENT_EMAIL') || hasPrivateKey) && !explicitFirebaseOk;

  if (hasPartialExplicit) {
    push(
      findings,
      'warn',
      'FIREBASE_*',
      'Incomplete explicit credentials — set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY (or FIREBASE_PRIVATE_KEY_PATH), or remove client email/key vars to use ADC.',
    );
  } else if (!explicitFirebaseOk) {
    push(
      findings,
      'info',
      'FIREBASE_*',
      'ADC mode — Firebase credentials resolved at runtime (GCP Workload Identity, metadata, gcloud auth, or GOOGLE_APPLICATION_CREDENTIALS).',
    );
  }

  const razorpayOk =
    isSet('RAZORPAY_KEY_ID') && isSet('RAZORPAY_KEY_SECRET') && isSet('RAZORPAY_WEBHOOK_SECRET');
  if (!razorpayOk) {
    push(findings, 'warn', 'RAZORPAY_*', 'Incomplete — wallet/subscription payments will fail.');
  }

  // ── Package ID alignment ──
  const playPackage = process.env.GOOGLE_PLAY_PACKAGE_NAME?.trim() || 'com.palsasafar';
  if (playPackage !== 'com.palsasafar') {
    push(
      findings,
      'warn',
      'GOOGLE_PLAY_PACKAGE_NAME',
      `Expected com.palsasafar (mobile bundle); got "${playPackage}".`,
    );
  }

  // ── Test DB must not equal production ──
  const testDb = process.env.TEST_DATABASE_URL?.trim();
  const prodDb = process.env.DATABASE_URL?.trim();
  if (testDb && prodDb && testDb.replace(/\/+$/, '') === prodDb.replace(/\/+$/, '')) {
    push(
      findings,
      'blocker',
      'TEST_DATABASE_URL',
      'Must not equal DATABASE_URL — automated tests must not hit production.',
    );
  }

  // ── Optional / post-RC ──
  if (!isSet('REDIS_URL')) {
    push(findings, 'info', 'REDIS_URL', 'Optional — single-instance deploy does not require Redis.');
  }
  if (isTruthy('HYBRID_SEARCH_ENABLED') && !isSet('OPENAI_API_KEY')) {
    push(findings, 'warn', 'OPENAI_API_KEY', 'Required when HYBRID_SEARCH_ENABLED=true.');
  }

  return findings;
}

function printReport(findings: Finding[]): void {
  const nodeEnv = process.env.NODE_ENV?.trim() || 'development';
  console.log(`\nPalSafar environment validation`);
  console.log(`Profile: ${profile} | NODE_ENV: ${nodeEnv}\n`);

  const order: Severity[] = ['blocker', 'warn', 'info'];
  for (const severity of order) {
    const group = findings.filter((f) => f.severity === severity);
    if (group.length === 0) continue;
    const label = severity.toUpperCase();
    console.log(`── ${label} (${group.length}) ──`);
    for (const f of group) {
      console.log(`  [${f.variable}] ${f.message}`);
    }
    console.log('');
  }

  const blockers = findings.filter((f) => f.severity === 'blocker').length;
  const warns = findings.filter((f) => f.severity === 'warn').length;
  if (blockers === 0 && warns === 0) {
    console.log('PASS — no blockers or warnings.\n');
  } else if (blockers === 0) {
    console.log(`PASS (with warnings) — ${warns} warning(s). Review before closed beta.\n`);
  } else {
    console.log(`FAIL — ${blockers} blocker(s), ${warns} warning(s).\n`);
  }
}

const findings = validate();
printReport(findings);
const exitCode = findings.some((f) => f.severity === 'blocker') ? 1 : 0;
process.exit(exitCode);
