import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatFromAddress,
  getSmtpConfig,
  isSmtpConfigured,
} from '../shared/email/smtp.config';
import {
  resetEmailTransporter,
  sendTransactionalEmail,
} from '../shared/email/email.service';
import { buildVerificationEmail } from '../shared/email/email.templates';

const sendMail = vi.fn();

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail,
    })),
  },
}));

describe('smtp.config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('isSmtpConfigured returns false when credentials missing', () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.SMTP_PASSWORD;
    delete process.env.BREVO_API_KEY;
    delete process.env.SENDINBLUE_API_KEY;
    expect(isSmtpConfigured()).toBe(false);
  });

  it('isSmtpConfigured returns true when BREVO_API_KEY + SMTP_FROM_EMAIL are set', () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    process.env.BREVO_API_KEY = 'xkeysib-test';
    process.env.SMTP_FROM_EMAIL = 'ops@palsafar.in';
    expect(isSmtpConfigured()).toBe(true);
  });

  it('getSmtpConfig applies Brevo-friendly TLS defaults on port 587', () => {
    process.env.SMTP_HOST = 'smtp-relay.brevo.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'user@example.com';
    process.env.SMTP_PASS = 'secret';
    delete process.env.SMTP_FROM_EMAIL;
    delete process.env.SMTP_FROM_NAME;
    const config = getSmtpConfig();
    expect(config).toMatchObject({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      requireTls: true,
      fromEmail: 'noreply@localhost',
      fromName: 'PalSafar',
    });
    expect(formatFromAddress(config!)).toBe('"PalSafar" <noreply@localhost>');
  });

  it('honours SMTP_FROM_EMAIL and SMTP_FROM_NAME overrides', () => {
    process.env.SMTP_HOST = 'smtp-relay.brevo.com';
    process.env.SMTP_USER = 'user@example.com';
    process.env.SMTP_PASS = 'secret';
    process.env.SMTP_FROM_EMAIL = 'ops@palsafar.in';
    process.env.SMTP_FROM_NAME = 'PalSafar Ops';
    const config = getSmtpConfig();
    expect(formatFromAddress(config!)).toBe('"PalSafar Ops" <ops@palsafar.in>');
  });
});

describe('email.templates', () => {
  it('builds password reset HTML with code and branding', () => {
    const mail = buildVerificationEmail('ABCD2345', 'password_reset');
    expect(mail.subject).toContain('Password reset');
    expect(mail.text).toContain('ABCD2345');
    expect(mail.html).toContain('ABCD2345');
    expect(mail.html).toContain('PalSafar');
  });

  it('builds account deletion HTML with distinct subject', () => {
    const mail = buildVerificationEmail('WXYZ9876', 'account_deletion');
    expect(mail.subject).toContain('Account deletion');
    expect(mail.text).toContain('WXYZ9876');
    expect(mail.html).toContain('delete your PalSafar account');
  });
});

describe('email.service', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      SMTP_HOST: 'smtp-relay.brevo.com',
      SMTP_PORT: '587',
      SMTP_USER: 'brevo-user',
      SMTP_PASS: 'brevo-pass',
    };
    delete process.env.SMTP_FROM_EMAIL;
    delete process.env.SMTP_FROM_NAME;
    delete process.env.BREVO_API_KEY;
    delete process.env.SENDINBLUE_API_KEY;
    resetEmailTransporter();
    sendMail.mockReset();
    sendMail.mockResolvedValue({ messageId: 'test-message-id' });
  });

  afterEach(() => {
    process.env = originalEnv;
    resetEmailTransporter();
  });

  it('sendTransactionalEmail uses configured From header', async () => {
    const ok = await sendTransactionalEmail({
      to: 'traveler@example.com',
      subject: 'Test',
      text: 'Hello',
      html: '<p>Hello</p>',
    });
    expect(ok).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const payload = sendMail.mock.calls[0][0];
    expect(payload.from).toBe('"PalSafar" <noreply@localhost>');
    expect(payload.to).toBe('traveler@example.com');
    expect(payload.html).toBe('<p>Hello</p>');
  });

  it('returns false without calling sendMail when SMTP is not configured', async () => {
    delete process.env.SMTP_PASS;
    delete process.env.BREVO_API_KEY;
    delete process.env.SENDINBLUE_API_KEY;
    resetEmailTransporter();
    const ok = await sendTransactionalEmail({
      to: 'traveler@example.com',
      subject: 'Test',
      text: 'Hello',
    });
    expect(ok).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('prefers Brevo HTTPS API over SMTP when BREVO_API_KEY is set', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-test';
    process.env.SMTP_FROM_EMAIL = 'rahul@palsafar.in';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: 'brevo-msg-1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const ok = await sendTransactionalEmail({
      to: 'traveler@example.com',
      subject: 'API Test',
      text: 'Hello',
      html: '<p>Hello</p>',
    });

    expect(ok).toBe(true);
    expect(sendMail).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.method).toBe('POST');
    expect(init.headers['api-key']).toBe('xkeysib-test');
    const body = JSON.parse(init.body);
    expect(body.sender).toEqual({ name: 'PalSafar', email: 'rahul@palsafar.in' });
    expect(body.to).toEqual([{ email: 'traveler@example.com' }]);
    vi.unstubAllGlobals();
  });

  it('retries once before failing', async () => {
    process.env.SMTP_MAX_RETRIES = '1';
    resetEmailTransporter();
    sendMail
      .mockRejectedValueOnce(new Error('temporary SMTP failure'))
      .mockResolvedValueOnce({ messageId: 'retry-ok' });

    const ok = await sendTransactionalEmail({
      to: 'traveler@example.com',
      subject: 'Retry test',
      text: 'Hello',
    });
    expect(ok).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(2);
  });
});

describe('email.service Brevo template payload', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.BREVO_API_KEY = 'xkeysib-test';
    process.env.SMTP_FROM_EMAIL = 'rahul@palsafar.in';
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.SMTP_PASSWORD;
    resetEmailTransporter();
    sendMail.mockReset();
    sendMail.mockResolvedValue({ messageId: 'test-message-id' });
  });

  afterEach(() => {
    process.env = originalEnv;
    resetEmailTransporter();
  });

  it('sends templateId + params and omits locally generated content for template-based emails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: 'brevo-tpl-1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const ok = await sendTransactionalEmail({
      to: 'traveler@example.com',
      subject: 'Local subject (should not be sent)',
      text: 'Local text (should not be sent)',
      html: '<p>Local html (should not be sent)</p>',
      templateId: 4,
      params: { code: 'ABCD2345', appUrl: 'https://app.example.com' },
    });

    expect(ok).toBe(true);
    expect(sendMail).not.toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    const body = JSON.parse(init.body);
    expect(body.sender).toEqual({ name: 'PalSafar', email: 'rahul@palsafar.in' });
    expect(body.to).toEqual([{ email: 'traveler@example.com' }]);
    expect(body.templateId).toBe(4);
    expect(body.params).toEqual({ code: 'ABCD2345', appUrl: 'https://app.example.com' });
    expect(body.subject).toBeUndefined();
    expect(body.htmlContent).toBeUndefined();
    expect(body.textContent).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it('omits templateId from the payload when not provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: 'brevo-plain-1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const ok = await sendTransactionalEmail({
      to: 'traveler@example.com',
      subject: 'Plain',
      text: 'Plain text',
      html: '<p>Plain html</p>',
    });

    expect(ok).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.templateId).toBeUndefined();
    expect(body.subject).toBe('Plain');
    expect(body.htmlContent).toBe('<p>Plain html</p>');
    expect(body.textContent).toBe('Plain text');
    vi.unstubAllGlobals();
  });

  it('falls back to SMTP with locally generated content when template mode is requested but Brevo is not configured', async () => {
    delete process.env.BREVO_API_KEY;
    process.env.SMTP_HOST = 'smtp-relay.brevo.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'brevo-user';
    process.env.SMTP_PASS = 'brevo-pass';
    delete process.env.SMTP_FROM_EMAIL;
    resetEmailTransporter();

    const ok = await sendTransactionalEmail({
      to: 'traveler@example.com',
      subject: 'SMTP fallback',
      text: 'Plain text',
      html: '<p>Local html</p>',
      templateId: 4,
      params: { code: 'ABCD2345', appUrl: 'https://app.example.com' },
    });

    expect(ok).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const payload = sendMail.mock.calls[0][0];
    expect(payload.html).toBe('<p>Local html</p>');
  });
});
