import { Role } from '@prisma/client';
import { ApiError } from '../../shared/utils/ApiError';

export const FOUNDER_ADMIN_EMAIL = 'shivaay.chelani@gmail.com';

export function assertNotSelfRoleChange(actorId: string, targetId: string): void {
  if (actorId === targetId) {
    throw new ApiError(400, 'You cannot change your own role.');
  }
}

export function assertCanGrantAdmin(actorRoles: Role[]): void {
  if (!actorRoles.includes(Role.SUPER_ADMIN) && !actorRoles.includes(Role.ADMIN)) {
    throw new ApiError(403, 'Only ADMIN or SUPER_ADMIN can grant admin access.');
  }
}

export function assertCanGrantSuperAdmin(actorRoles: Role[]): void {
  if (!actorRoles.includes(Role.SUPER_ADMIN)) {
    throw new ApiError(403, 'Only SUPER_ADMIN can grant Super Admin access.');
  }
}

/** Startup seeding must not overwrite an already-persisted SUPER_ADMIN assignment. */
export function shouldPreserveSuperAdmin(approvedRoles: Role[]): boolean {
  return approvedRoles.includes(Role.SUPER_ADMIN);
}

/** The Users "Admins" filter includes SUPER_ADMIN so founder accounts stay visible. */
export function expandUserListRoles(role: Role): Role[] {
  return role === Role.ADMIN ? [Role.ADMIN, Role.SUPER_ADMIN] : [role];
}

export function defaultJwtRoles(permission: Role): Role[] {
  const adminDashboard: Role[] = [
    Role.ADMIN,
    Role.SUPER_ADMIN,
    Role.OPS_ADMIN,
    Role.VENDOR_MANAGER,
    Role.CONTENT_MODERATOR,
    Role.FINANCE_MANAGER,
    Role.SUPPORT_AGENT,
    Role.MARKETING_ADMIN,
    Role.ANALYTICS_VIEWER,
  ];
  if (adminDashboard.includes(permission)) return [permission];
  if (permission === Role.USER) return [Role.USER];
  return [Role.USER, permission];
}
