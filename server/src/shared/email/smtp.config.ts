/** Email delivery config — SMTP and/or Brevo HTTPS API (preferred on Render). */

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromEmail: string;
  fromName: string;
  secure: boolean;
  requireTls: boolean;
  connectionTimeoutMs: number;
  greetingTimeoutMs: number;
  socketTimeoutMs: number;
  maxRetries: number;
}

export function getBrevoApiKey(): string | null {
  const key =
    process.env.BREVO_API_KEY?.trim()
    || process.env.SENDINBLUE_API_KEY?.trim()
    || null;
  return key || null;
}

/** True when Brevo transactional HTTP API can send (port 443 — works on Render). */
export function isBrevoApiConfigured(): boolean {
  return Boolean(getBrevoApiKey() && resolveFromEmail());
}

function resolveFromEmail(): string | null {
  return process.env.SMTP_FROM_EMAIL?.trim() || null;
}

export function getFromIdentity(): { email: string; name: string } | null {
  const email = resolveFromEmail();
  if (!email && process.env.NODE_ENV === 'production') return null;
  return {
    email: email || 'noreply@localhost',
    name: process.env.SMTP_FROM_NAME?.trim() || 'PalSafar',
  };
}

/** True when any delivery path is available (Brevo API or SMTP). */
export function isSmtpConfigured(): boolean {
  if (isBrevoApiConfigured()) return true;
  return Boolean(
    process.env.SMTP_HOST?.trim()
    && process.env.SMTP_USER?.trim()
    && (process.env.SMTP_PASS?.trim() || process.env.SMTP_PASSWORD?.trim()),
  );
}

function resolveBrevoTemplateId(envVar: string): number | null {
  const raw = process.env[envVar]?.trim();
  if (!raw) return null;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

/** Brevo transactional template used for the registration/email-verification OTP. */
export function getBrevoEmailVerificationTemplateId(): number | null {
  return resolveBrevoTemplateId('BREVO_EMAIL_VERIFICATION_TEMPLATE_ID');
}

/** Brevo transactional template used for the password-reset OTP. */
export function getBrevoPasswordResetTemplateId(): number | null {
  return resolveBrevoTemplateId('BREVO_PASSWORD_RESET_TEMPLATE_ID');
}

export function getSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim() || process.env.SMTP_PASSWORD?.trim();
  if (!host || !user || !pass) return null;

  const port = parseInt(process.env.SMTP_PORT || '587', 10);

  const fromEmail = process.env.SMTP_FROM_EMAIL?.trim();
  if (!fromEmail && process.env.NODE_ENV === 'production') {
    return null;
  }

  return {
    host,
    port,
    user,
    pass,
    fromEmail: fromEmail || 'noreply@localhost',
    fromName: process.env.SMTP_FROM_NAME?.trim() || 'PalSafar',
    // Port 587: STARTTLS (secure=false, requireTLS=true). Port 465: implicit TLS.
    secure: port === 465,
    requireTls: port === 587,
    // Generous defaults: Brevo relay accepts TCP connections and greets slowly
    // from cloud hosts. 8s was hitting "Connection timeout" under load.
    connectionTimeoutMs: parseInt(process.env.SMTP_CONNECTION_TIMEOUT_MS || '30000', 10),
    greetingTimeoutMs: parseInt(process.env.SMTP_GREETING_TIMEOUT_MS || '30000', 10),
    socketTimeoutMs: parseInt(process.env.SMTP_SOCKET_TIMEOUT_MS || '60000', 10),
    maxRetries: parseInt(process.env.SMTP_MAX_RETRIES || '1', 10),
  };
}

export function formatFromAddress(config: SmtpConfig): string {
  const name = config.fromName.replace(/"/g, '\\"');
  return `"${name}" <${config.fromEmail}>`;
}
