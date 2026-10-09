import { describe, expect, it, vi } from 'vitest';

vi.mock('../shared/services/authRevalidation', () => ({
  revalidateRequestUser: vi.fn(async (req: Express.Request) => req),
  revalidateVendorCapability: vi.fn(async (req: Express.Request) => req),
  revalidateIfJwtClaimsAdmin: vi.fn(async () => undefined),
}));
import { Role } from '@prisma/client';
import { ApiError } from '../shared/utils/ApiError';
import {
  assertCanGrantAdmin,
  assertCanGrantSuperAdmin,
  assertNotSelfRoleChange,
  defaultJwtRoles,
  expandUserListRoles,
  FOUNDER_ADMIN_EMAIL,
  shouldPreserveSuperAdmin,
} from '../modules/users/roleChangeGuards';
import { updateRoleSchema } from '../modules/users/users.validation';
import { authenticate, hasRole, requireRoles } from '../middleware/auth';

describe('role-change guards', () => {
  it('blocks self-demotion and self-promotion', () => {
    expect(() => assertNotSelfRoleChange('u1', 'u1')).toThrow(ApiError);
    try {
      assertNotSelfRoleChange('u1', 'u1');
    } catch (err) {
      expect((err as ApiError).statusCode).toBe(400);
    }
    expect(() => assertNotSelfRoleChange('admin', 'user')).not.toThrow();
  });

  it('lets ADMIN or SUPER_ADMIN grant ADMIN, but only SUPER_ADMIN grant SUPER_ADMIN', () => {
    expect(() => assertCanGrantAdmin([Role.ADMIN])).not.toThrow();
    expect(() => assertCanGrantAdmin([Role.SUPER_ADMIN])).not.toThrow();
    expect(() => assertCanGrantAdmin([Role.USER])).toThrow(ApiError);
    expect(() => assertCanGrantSuperAdmin([Role.ADMIN])).toThrow(ApiError);
    expect(() => assertCanGrantSuperAdmin([Role.USER])).toThrow(ApiError);
    expect(() => assertCanGrantSuperAdmin([Role.SUPER_ADMIN])).not.toThrow();
    try {
      assertCanGrantSuperAdmin([Role.ADMIN]);
    } catch (err) {
      expect((err as ApiError).statusCode).toBe(403);
    }
  });

  it('preserves an existing SUPER_ADMIN assignment across admin seed', () => {
    expect(shouldPreserveSuperAdmin([Role.ADMIN, Role.SUPER_ADMIN])).toBe(true);
    expect(shouldPreserveSuperAdmin([Role.ADMIN])).toBe(false);
  });

  it('puts SUPER_ADMIN in the JWT role list without treating it as a specialty', () => {
    expect(defaultJwtRoles(Role.SUPER_ADMIN)).toEqual([Role.SUPER_ADMIN]);
    expect(defaultJwtRoles(Role.ADMIN)).toEqual([Role.ADMIN]);
    expect(defaultJwtRoles(Role.VENDOR)).toEqual([Role.USER, Role.VENDOR]);
  });

  it('accepts SUPER_ADMIN on the existing update-role schema', () => {
    expect(updateRoleSchema.parse({ permission: 'SUPER_ADMIN' }).permission).toBe('SUPER_ADMIN');
    expect(() => updateRoleSchema.parse({ permission: 'ANALYTICS_VIEWER' })).toThrow();
  });

  it('identifies the founder email without creating a user', () => {
    expect(FOUNDER_ADMIN_EMAIL).toBe('shivaay.chelani@gmail.com');
  });

  it('includes SUPER_ADMIN when listing the Admins filter', () => {
    expect(expandUserListRoles(Role.ADMIN)).toEqual([Role.ADMIN, Role.SUPER_ADMIN]);
    expect(expandUserListRoles(Role.USER)).toEqual([Role.USER]);
  });
});

describe('server-side SUPER_ADMIN authorization', () => {
  it('lets SUPER_ADMIN through requireRoles for any allowed list', async () => {
    const next = vi.fn();
    const mw = requireRoles([Role.FINANCE_MANAGER]);
    mw(
      { user: { id: 'sa', permission: Role.SUPER_ADMIN, roles: [Role.SUPER_ADMIN] } },
      {},
      next,
    );
    await vi.waitFor(() => expect(next).toHaveBeenCalled());
    expect(next.mock.calls[0].length).toBe(0);
  });

  it('rejects an unauthenticated caller before role checks', () => {
    const next = vi.fn();
    const mw = requireRoles([Role.ADMIN]);
    mw({ user: undefined }, {}, next);
    const err = next.mock.calls[0][0] as ApiError;
    expect(err.statusCode).toBe(403);
  });

  it('rejects a regular USER on platform-admin routes', async () => {
    const next = vi.fn();
    const mw = requireRoles([Role.ADMIN]);
    mw({ user: { id: 'u', permission: Role.USER, roles: [Role.USER] } }, {}, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());
    const err = next.mock.calls[0][0] as ApiError;
    expect(err.statusCode).toBe(403);
  });

  it('hasRole reads SUPER_ADMIN from the roles array', () => {
    expect(hasRole({ roles: [Role.SUPER_ADMIN], permission: Role.ADMIN }, Role.SUPER_ADMIN)).toBe(true);
    expect(hasRole({ roles: [Role.USER], permission: Role.USER }, Role.SUPER_ADMIN)).toBe(false);
  });

  it('authenticate returns 401 when no token is provided', () => {
    const next = vi.fn();
    authenticate({ headers: {}, cookies: {} }, {}, next);
    const err = next.mock.calls[0][0] as ApiError;
    expect(err.statusCode).toBe(401);
  });
});
