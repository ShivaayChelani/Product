import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import { prisma } from '../config/database';

vi.mock('../config/database', () => ({
  prisma: {
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../shared/utils/specialtyRoles', () => ({
  ensureBaseUserRole: vi.fn(),
  healSpecialtyRolesFromDomain: vi.fn(),
  enrichUserWithRoles: vi.fn(async (user) => ({
    ...user,
    roles: ['USER'],
    roleAssignments: [],
    approvedRoles: ['USER'],
    activeRole: user.activeMode,
    role: user.permission,
  })),
}));

vi.mock('../config/env', () => ({
  env: {
    jwt: { secret: 'test-jwt-secret-for-vitest-min-32-chars!!', expiresIn: '1h' },
  },
}));

import { authService } from '../modules/auth/auth.service';

describe('Refresh token storage (H-07)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refresh looks up token by SHA-256 hash, not plaintext', async () => {
    const plain = '00000000-0000-4000-8000-000000000000';
    const hash = crypto.createHash('sha256').update(plain).digest('hex');
    const future = new Date(Date.now() + 86400000);

    (prisma.refreshToken.findUnique as ReturnType<typeof vi.fn>).mockImplementation(({ where }) => {
      expect(where.token).toBe(hash);
      return { id: 'rt1', userId: 'user-1', expiresAt: future, revokedAt: null };
    });
    (prisma.refreshToken.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      name: 'A',
      permission: 'USER',
      activeMode: 'USER',
    });

    const result = await authService.refresh(plain);
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.refreshToken).not.toBe(plain);
  });
});
