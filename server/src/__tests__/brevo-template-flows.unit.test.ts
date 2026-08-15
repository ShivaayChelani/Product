import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authService } from '../modules/auth/auth.service';
import { prisma } from '../config/database';
import { findUserByEmail } from '../shared/utils/userEmailLookup';

const { sendTransactionalEmailMock, buildVerificationEmailMock } = vi.hoisted(() => ({
  sendTransactionalEmailMock: vi.fn(),
  buildVerificationEmailMock: vi.fn(),
}));

vi.mock('../shared/email/email.service', async (importOriginal) => {
  const original = await importOriginal<typeof import('../shared/email/email.service')>();
  return { ...original, sendTransactionalEmail: sendTransactionalEmailMock };
});

vi.mock('../shared/email/email.templates', () => ({
  buildVerificationEmail: buildVerificationEmailMock,
}));

vi.mock('../config/database', () => ({
  prisma: {
    passwordResetToken: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    refreshToken: { updateMany: vi.fn() },
  },
}));

vi.mock('../shared/utils/userEmailLookup', () => ({
  findUserByEmail: vi.fn(),
  normalizeEmail: (e: string) => e.trim().toLowerCase(),
}));

vi.mock('../shared/utils/specialtyRoles', () => ({
  ensureBaseUserRole: vi.fn(),
  healSpecialtyRolesFromDomain: vi.fn(),
  enrichUserWithRoles: vi.fn(async (u) => u),
}));

vi.mock('../config/env', () => ({
  env: {
    jwt: { secret: 'test-jwt-secret-for-vitest-min-32-chars!!', expiresIn: '1h' },
    clientUrl: 'https://app.palsafar.example',
  },
}));

const CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

describe('Brevo template email flows', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.BREVO_API_KEY = 'xkeysib-test';
    process.env.SMTP_FROM_EMAIL = 'rahul@palsafar.in';
    process.env.BREVO_EMAIL_VERIFICATION_TEMPLATE_ID = '2';
    process.env.BREVO_PASSWORD_RESET_TEMPLATE_ID = '4';
    vi.clearAllMocks();
    sendTransactionalEmailMock.mockResolvedValue(true);
    buildVerificationEmailMock.mockImplementation((code: string, purpose: string) => ({
      subject: `Subject-${purpose}`,
      text: `Text ${code}`,
      html: `<p>${code}</p>`,
    }));
    (prisma.passwordResetToken.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('forgotPassword sends password reset via Brevo template #4 with params.code', async () => {
    (findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
    });

    const result = await authService.forgotPassword('user@example.com');

    expect(result).toEqual({ success: true });
    expect(prisma.passwordResetToken.upsert).toHaveBeenCalledTimes(1);
    expect(sendTransactionalEmailMock).toHaveBeenCalledTimes(1);
    const input = sendTransactionalEmailMock.mock.calls[0][0];
    expect(input.templateId).toBe(4);
    expect(input.params.appUrl).toBe('https://app.palsafar.example');
    expect(input.params.code).toMatch(CODE_PATTERN);
    expect(buildVerificationEmailMock).toHaveBeenCalledWith(input.params.code, 'password_reset');
  });

  it('register sends email verification via Brevo template #2 with params.code', async () => {
    process.env.NODE_ENV = 'production';
    (findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
    });
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      name: 'Test User',
      emailVerified: false,
    });
    (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      email: 'user@example.com',
      name: 'Test User',
    });

    const result = await authService.register({
      email: 'user@example.com',
      password: 'Password@123',
      name: 'Test User',
    });

    expect(result.requiresEmailVerification).toBe(true);
    expect(sendTransactionalEmailMock).toHaveBeenCalledTimes(1);
    const input = sendTransactionalEmailMock.mock.calls[0][0];
    expect(input.templateId).toBe(2);
    expect(input.params.appUrl).toBe('https://app.palsafar.example');
    expect(input.params.code).toMatch(CODE_PATTERN);
    expect(buildVerificationEmailMock).toHaveBeenCalledWith(input.params.code, 'register_otp');
  });

  it('account_deletion flow keeps local HTML content (no templateId)', async () => {
    process.env.NODE_ENV = 'production';
    (findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
    });

    const result = await authService.forgotPassword('user@example.com', 'account_deletion');

    expect(result).toEqual({ success: true });
    expect(sendTransactionalEmailMock).toHaveBeenCalledTimes(1);
    const input = sendTransactionalEmailMock.mock.calls[0][0];
    expect(input.templateId).toBeUndefined();
    expect(input.params).toBeUndefined();
    expect(buildVerificationEmailMock).toHaveBeenCalledTimes(1);
    const [code] = buildVerificationEmailMock.mock.calls[0];
    expect(input.html).toBe(`<p>${code}</p>`);
  });

  it('fails safely with a configuration error when the password reset template ID is missing', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.BREVO_PASSWORD_RESET_TEMPLATE_ID;
    (findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
    });

    await expect(authService.forgotPassword('user@example.com')).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(sendTransactionalEmailMock).not.toHaveBeenCalled();
    expect(prisma.passwordResetToken.upsert).not.toHaveBeenCalled();
  });

  it('fails safely with a configuration error when the email verification template ID is missing', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.BREVO_EMAIL_VERIFICATION_TEMPLATE_ID;
    (findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
    });
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      name: 'Test User',
      emailVerified: false,
    });
    (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      email: 'user@example.com',
      name: 'Test User',
    });

    await expect(
      authService.register({
        email: 'user@example.com',
        password: 'Password@123',
        name: 'Test User',
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(sendTransactionalEmailMock).not.toHaveBeenCalled();
  });

  it('keeps local HTML sending when Brevo API is not configured (SMTP fallback)', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.BREVO_API_KEY;
    process.env.SMTP_HOST = 'smtp-relay.brevo.com';
    process.env.SMTP_USER = 'brevo-user';
    process.env.SMTP_PASS = 'brevo-pass';
    (findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
    });

    const result = await authService.forgotPassword('user@example.com');

    expect(result).toEqual({ success: true });
    expect(sendTransactionalEmailMock).toHaveBeenCalledTimes(1);
    const input = sendTransactionalEmailMock.mock.calls[0][0];
    expect(input.templateId).toBeUndefined();
    expect(input.html).toBeDefined();
  });
});