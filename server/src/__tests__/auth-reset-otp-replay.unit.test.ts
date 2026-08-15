import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authService } from '../modules/auth/auth.service';
import { prisma } from '../config/database';
import crypto from 'crypto';

vi.mock('../config/database', () => ({
  prisma: {
    passwordResetToken: {
      findUnique: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
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
  env: { jwt: { secret: 'test-jwt-secret-for-vitest-min-32-chars!!', expiresIn: '1h' } },
}));

import { findUserByEmail } from '../shared/utils/userEmailLookup';

describe('Password reset OTP replay prevention (M-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('verifyResetOtp consumes OTP and returns reset session token', async () => {
    const otp = 'ABCD1234';
    const otpHash = crypto.createHash('sha256').update(otp.toUpperCase()).digest('hex');
    (findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1', email: 'user@example.com' });
    (prisma.passwordResetToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      email: 'user@example.com',
      token: otpHash,
      expiresAt: new Date(Date.now() + 60000),
    });
    (prisma.passwordResetToken.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await authService.verifyResetOtp('user@example.com', otp);
    expect(result.valid).toBe(true);
    expect(result.resetSessionToken).toBeTruthy();
    expect(prisma.passwordResetToken.update).toHaveBeenCalled();
  });

  it('resetPassword rejects replayed session token', async () => {
    (findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1', email: 'user@example.com' });
    (prisma.passwordResetToken.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 1 });
    (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.refreshToken.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 });

    await authService.resetPassword('user@example.com', 'session-token-1', 'NewPass@123');

    (prisma.passwordResetToken.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 0 });
    await expect(
      authService.resetPassword('user@example.com', 'session-token-1', 'NewPass@456'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
