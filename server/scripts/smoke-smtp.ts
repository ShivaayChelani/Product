/**
 * Live SMTP smoke test — sends one message using production env vars.
 *
 * Usage:
 *   cd server && npx ts-node scripts/smoke-smtp.ts recipient@example.com
 *
 * Requires SMTP_HOST, SMTP_USER, SMTP_PASS in environment (or server/.env).
 * Does not print SMTP_PASS.
 */
import dotenv from 'dotenv';
import path from 'path';
import { buildVerificationEmail } from '../src/shared/email/email.templates';
import { isSmtpConfigured, sendTransactionalEmail } from '../src/shared/email/email.service';
import { formatFromAddress, getSmtpConfig } from '../src/shared/email/smtp.config';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function main() {
  const to = process.argv[2]?.trim();
  if (!to) {
    console.error('Usage: npx ts-node scripts/smoke-smtp.ts <recipient-email>');
    process.exit(1);
  }

  if (!isSmtpConfigured()) {
    console.error('FAIL — SMTP_HOST, SMTP_USER, and SMTP_PASS must be set.');
    process.exit(1);
  }

  const config = getSmtpConfig()!;
  const sample = buildVerificationEmail('SMOKETST', 'password_reset');

  console.log('SMTP smoke test');
  console.log(`  host: ${config.host}`);
  console.log(`  port: ${config.port}`);
  console.log(`  user: ${config.user}`);
  console.log(`  from: ${formatFromAddress(config)}`);
  console.log(`  to:   ${to}`);

  const ok = await sendTransactionalEmail({
    to,
    subject: `[SMOKE] ${sample.subject}`,
    text: sample.text,
    html: sample.html,
  });

  if (!ok) {
    console.error('FAIL — sendTransactionalEmail returned false. Check server logs.');
    process.exit(1);
  }

  console.log('PASS — smoke email accepted by SMTP relay.');
}

main().catch((err) => {
  console.error('FAIL —', err instanceof Error ? err.message : err);
  process.exit(1);
});
