import { Role } from '@prisma/client';
import { prisma } from '../../config/database';
import { ADMIN_ROLES } from '../../middleware/auth';
import { ApiError } from '../utils/ApiError';
import { enrichUserWithRoles } from '../utils/specialtyRoles';

/**
 * Replace JWT-derived roles with current DB state for privileged authorization.
 * Called from role-gating middleware only (not every authenticated request).
 */
export async function revalidateRequestUser(req: Express.Request): Promise<void> {
  if (!req.user?.id) {
    throw new ApiError(401, 'Authentication required. Please provide a valid token.');
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, email: true, name: true, permission: true, activeMode: true },
  });
  if (!user) {
    throw new ApiError(401, 'Invalid or expired token.');
  }

  const enriched = await enrichUserWithRoles(user);
  const activeMode = enriched.roles.includes(enriched.activeMode) ? enriched.activeMode : Role.USER;

  req.user = {
    id: enriched.id,
    email: enriched.email,
    name: enriched.name,
    permission: enriched.permission,
    activeMode,
    roles: enriched.roles,
  };
}

export async function revalidateVendorCapability(req: Express.Request): Promise<void> {
  await revalidateRequestUser(req);
  if (hasDbAdminCapability(req.user)) return;

  const vendor = await prisma.vendor.findUnique({
    where: { userId: req.user!.id },
    select: { status: true, suspendedAt: true },
  });
  if (!vendor || vendor.status !== 'APPROVED' || vendor.suspendedAt) {
    throw new ApiError(403, 'Vendor access required.', true, 'ROLE_REQUIRED', { requiredRole: Role.VENDOR });
  }
}

function hasDbAdminCapability(user: Express.Request['user'] | undefined): boolean {
  if (!user) return false;
  return ADMIN_ROLES.some((role) => user.roles?.includes(role));
}
