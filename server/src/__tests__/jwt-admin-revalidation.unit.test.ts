import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';

vi.mock('../config/database', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    vendor: { findUnique: vi.fn() },
  },
}));

vi.mock('../shared/utils/specialtyRoles', () => ({
  enrichUserWithRoles: vi.fn(async (user: { id: string; email: string; name: string; permission: Role; activeMode: Role }) => ({
    ...user,
    roles: [user.permission],
  })),
}));

import { prisma } from '../config/database';
import { revalidateIfJwtClaimsAdmin } from '../shared/services/authRevalidation';

describe('revalidateIfJwtClaimsAdmin', () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockReset();
  });

  it('skips the database for normal user JWTs', async () => {
    const req = { user: { id: 'u1', permission: Role.USER, roles: [Role.USER] } };
    await revalidateIfJwtClaimsAdmin(req);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('replaces stale admin JWT claims with current DB roles', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'a1',
      email: 'a@example.com',
      name: 'Former Admin',
      permission: Role.USER,
      activeMode: Role.USER,
    } as any);
    const req: any = {
      user: { id: 'a1', permission: Role.ADMIN, roles: [Role.ADMIN] },
    };
    await revalidateIfJwtClaimsAdmin(req);
    expect(prisma.user.findUnique).toHaveBeenCalledOnce();
    expect(req.user.permission).toBe(Role.USER);
    expect(req.user.roles).toEqual([Role.USER]);
  });
});
