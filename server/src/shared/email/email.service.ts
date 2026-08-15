import nodemailer from 'nodemailer';
import { logger } from '../../config/logger';
import {
  formatFromAddress,
  getBrevoApiKey,
  getFromIdentity,
  getSmtpConfig,
  isBrevoApiConfigured,
  isSmtpConfigured,
  type SmtpConfig,
} from './smtp.config';

const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_ACCOUNT_URL = 'https://api.brevo.com/v3/account';

let transporter: nodemailer.Transporter | null = null;
let transporterKey: string | null = null;

function transporterCacheKey(config: SmtpConfig): string {
  return `${config.host}:${config.port}:${config.user}:${config.secure}`;
}

/** Test seam — reset cached transporter between unit tests. */
export function resetEmailTransporter(): void {
  transporter = null;
  transporterKey = null;
}

function getTransporter(): nodemailer.Transporter | null {
  const config = getSmtpConfig();
  if (!config) {
    return null;
  }

  const key = transporterCacheKey(config);
  if (transporter && transporterKey === key) return transporter;

  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTls,
    auth: { user: config.user, pass: config.pass },
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    connectionTimeout: config.connectionTimeoutMs,
    greetingTimeout: config.greetingTimeoutMs,
    socketTimeout: config.socketTimeoutMs,
  });
  transporterKey = key;
  return transporter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeSmtpError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { message: String(error) };
  return {
    name: error.name,
    message: error.message.replace(/pass(?:word)?[=:\s][^\s,]+/gi, '[REDACTED]'),
    code: (error as NodeJS.ErrnoException).code,
  };
}

function isConnectionTimeoutError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const code = error && typeof error === 'object' ? (error as NodeJS.ErrnoException).code : undefined;
  return (
    code === 'ETIMEDOUT'
    || code === 'ECONNREFUSED'
    || code === 'ESOCKET'
    || /connection timeout/i.test(msg)
    || /greeting never received/i.test(msg)
  );
}

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /**
   * Brevo transactional template ID. When set, the email is rendered from the
   * Brevo dashboard template (templateId + params) and the locally generated
   * subject/htmlContent/textContent are NOT sent. Only supported on the Brevo
   * HTTPS API path; SMTP fallback ignores it and sends the local content.
   */
  templateId?: number;
  /** Values substituted into Brevo template placeholders ({{params.<key>}}). */
  params?: Record<string, string>;
}

async function sendViaBrevoApi(input: SendEmailInput): Promise<boolean> {
  const apiKey = getBrevoApiKey();
  const from = getFromIdentity();
  if (!apiKey || !from) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const body: Record<string, unknown> = {
      sender: { name: from.name, email: from.email },
      to: [{ email: input.to }],
    };

    if (input.templateId) {
      // Template-based send: Brevo dashboard renders the body from templateId + params.
      body.templateId = input.templateId;
      body.params = input.params ?? {};
    } else {
      body.subject = input.subject;
      body.textContent = input.text;
      body.htmlContent = input.html || input.text;
    }

    const res = await fetch(BREVO_SEND_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.error(
        { status: res.status, body: body.slice(0, 500), to: input.to, subject: input.subject },
        'Brevo API email send failed',
      );
      return false;
    }

    const payload = (await res.json().catch(() => ({}))) as { messageId?: string };
    logger.info(
      { messageId: payload.messageId, to: input.to, subject: input.subject, transport: 'brevo-api' },
      'Email sent successfully',
    );
    return true;
  } catch (error) {
    logger.error(
      { ...sanitizeSmtpError(error), to: input.to, subject: input.subject, transport: 'brevo-api' },
      'Brevo API email send failed',
    );
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendViaSmtp(input: SendEmailInput, config: SmtpConfig): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;

  const mail = {
    from: formatFromAddress(config),
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html || input.text,
  };

  const attempts = Math.max(1, config.maxRetries + 1);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const info = await t.sendMail(mail);
      logger.info(
        {
          messageId: info.messageId,
          to: input.to,
          subject: input.subject,
          attempt,
          transport: 'smtp',
        },
        'Email sent successfully',
      );
      return true;
    } catch (error) {
      const isLast = attempt === attempts;
      logger.error(
        {
          ...sanitizeSmtpError(error),
          to: input.to,
          subject: input.subject,
          attempt,
          isLast,
          transport: 'smtp',
        },
        isLast ? 'Failed to send email via SMTP' : 'Email send failed — retrying',
      );
      if (isLast) {
        if (isConnectionTimeoutError(error) && isBrevoApiConfigured()) {
          logger.warn(
            { to: input.to },
            'SMTP timed out (common on Render) — falling back to Brevo HTTPS API',
          );
          return sendViaBrevoApi(input);
        }
        return false;
      }
      await sleep(400 * attempt);
    }
  }

  return false;
}

export async function sendTransactionalEmail(input: SendEmailInput): Promise<boolean> {
  // Prefer Brevo HTTPS API on cloud hosts — Render often blocks outbound SMTP :587/:465.
  if (isBrevoApiConfigured()) {
    return sendViaBrevoApi(input);
  }

  const config = getSmtpConfig();
  if (!config) {
    logger.warn(
      { to: input.to, subject: input.subject },
      'Email not sent — set BREVO_API_KEY (+ SMTP_FROM_EMAIL) or SMTP_HOST/USER/PASS',
    );
    return false;
  }

  if (input.templateId) {
    logger.warn(
      { to: input.to },
      'templateId is only supported on the Brevo HTTPS API — falling back to locally generated content via SMTP',
    );
  }

  return sendViaSmtp(input, config);
}

async function verifyBrevoApi(): Promise<boolean> {
  const apiKey = getBrevoApiKey();
  if (!apiKey) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(BREVO_ACCOUNT_URL, {
      method: 'GET',
      headers: { accept: 'application/json', 'api-key': apiKey },
      signal: controller.signal,
    });
    if (!res.ok) {
      logger.error(
        { status: res.status },
        'Brevo API verification failed — check BREVO_API_KEY',
      );
      return false;
    }
    const from = getFromIdentity();
    logger.info(
      { transport: 'brevo-api', from: from ? `"${from.name}" <${from.email}>` : undefined },
      'Brevo API connection verified',
    );
    return true;
  } catch (error) {
    logger.error(
      { ...sanitizeSmtpError(error), transport: 'brevo-api' },
      'Brevo API verification failed — check BREVO_API_KEY and outbound HTTPS',
    );
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/** Verify email delivery path — logs result, never throws. */
export async function verifySmtpConnection(): Promise<boolean> {
  if (isBrevoApiConfigured()) {
    return verifyBrevoApi();
  }

  const config = getSmtpConfig();
  const t = getTransporter();
  if (!config || !t) return false;

  try {
    await t.verify();
    logger.info(
      { host: config.host, port: config.port, from: formatFromAddress(config), transport: 'smtp' },
      'SMTP connection verified',
    );
    return true;
  } catch (error) {
    const hint = isConnectionTimeoutError(error)
      ? 'SMTP connection timed out (Render often blocks ports 587/465). Set BREVO_API_KEY to send via HTTPS instead.'
      : 'SMTP verification failed — check SMTP_PASS (use SMTP key, not API key) and verify SMTP_FROM_EMAIL in Brevo';
    logger.error(
      { ...sanitizeSmtpError(error), host: config.host, from: formatFromAddress(config), transport: 'smtp' },
      hint,
    );
    return false;
  }
}

/** Backward-compatible plain-text sender. */
export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  return sendTransactionalEmail({ to, subject, text });
}

export { isSmtpConfigured, isBrevoApiConfigured };
