import {
  Role,
  RoleAssignmentStatus,
  VendorStatus,
  CreatorStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError, ErrorCodes } from './ApiError';

export const CAPABLE_STATUSES: RoleAssignmentStatus[] = [
  RoleAssignmentStatus.ACTIVE,
  RoleAssignmentStatus.APPROVED,
];

export type RoleAssignmentView = {
  role: Role;
  status: RoleAssignmentStatus;
  rejectedReason?: string | null;
};

type TxClient = Prisma.TransactionClient;

function db(tx?: TxClient) {
  return tx ?? prisma;
}

/** Admin roles that should win denormalized User.permission (highest privilege first). */
const ADMIN_PERMISSION_PRIORITY: Role[] = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.OPS_ADMIN,
  Role.VENDOR_MANAGER,
  Role.CONTENT_MODERATOR,
  Role.FINANCE_MANAGER,
  Role.SUPPORT_AGENT,
  Role.MARKETING_ADMIN,
  Role.ANALYTICS_VIEWER,
];

/** Derive denormalized User.permission from approved/active roles (admin > specialty > USER). */
export function derivePermission(approvedRoles: Role[]): Role {
  for (const role of ADMIN_PERMISSION_PRIORITY) {
    if (approvedRoles.includes(role)) return role;
  }
  // Exclusivity is enforced by roleTransitionService, so at most one specialty can be approved
  // for new transitions. The VENDOR-first ordering below is a defensive fallback for legacy
  // dual-role accounts that predate the rule and are flagged for manual admin cleanup.
  if (approvedRoles.includes(Role.VENDOR)) return Role.VENDOR;
  if (approvedRoles.includes(Role.CONTENT_CREATOR)) return Role.CONTENT_CREATOR;
  return Role.USER;
}

export async function listUserRoleAssignments(userId: string, tx?: TxClient): Promise<RoleAssignmentView[]> {
  const rows = await db(tx).userRole.findMany({
    where: { userId },
    select: { role: true, status: true, rejectedReason: true },
    orderBy: { role: 'asc' },
  });
  return rows;
}

export async function listApprovedRoles(userId: string, tx?: TxClient): Promise<Role[]> {
  const rows = await db(tx).userRole.findMany({
    where: { userId, status: { in: CAPABLE_STATUSES } },
    select: { role: true },
  });
  return rows.map((r) => r.role);
}

export async function ensureBaseUserRole(userId: string, tx?: TxClient): Promise<void> {
  await db(tx).userRole.upsert({
    where: { userId_role: { userId, role: Role.USER } },
    create: { userId, role: Role.USER, status: RoleAssignmentStatus.ACTIVE },
    update: { status: RoleAssignmentStatus.ACTIVE },
  });
}

export async function upsertRoleStatus(params: {
  userId: string;
  role: Role;
  status: RoleAssignmentStatus;
  approvedById?: string | null;
  rejectedReason?: string | null;
  tx?: TxClient;
}): Promise<void> {
  const { userId, role, status, approvedById, rejectedReason, tx } = params;
  const approvedAt =
    status === RoleAssignmentStatus.APPROVED || status === RoleAssignmentStatus.ACTIVE
      ? new Date()
      : null;

  await db(tx).userRole.upsert({
    where: { userId_role: { userId, role } },
    create: {
      userId,
      role,
      status,
      approvedById: approvedById ?? null,
      approvedAt,
      rejectedReason: rejectedReason ?? null,
    },
    update: {
      status,
      approvedById: approvedById === undefined ? undefined : approvedById,
      approvedAt: status === RoleAssignmentStatus.APPROVED || status === RoleAssignmentStatus.ACTIVE
        ? new Date()
        : status === RoleAssignmentStatus.PENDING
          ? null
          : undefined,
      rejectedReason: rejectedReason === undefined ? undefined : rejectedReason,
    },
  });
}

/** Sync User.permission + reset activeMode if current specialty lost. */
export async function syncUserPermissionFromRoles(userId: string, tx?: TxClient): Promise<Role[]> {
  const approved = await listApprovedRoles(userId, tx);
  const permission = derivePermission(approved);

  const user = await db(tx).user.findUnique({
    where: { id: userId },
    select: { activeMode: true },
  });

  let activeMode = user?.activeMode ?? Role.USER;
  if (!approved.includes(activeMode)) {
    activeMode = Role.USER;
  }

  await db(tx).user.update({
    where: { id: userId },
    data: { permission, activeMode },
  });

  return approved;
}

/**
 * Heal accounts where Vendor / CreatorProfile is APPROVED but UserRole was never
 * promoted (or permission drifted). Safe to call on every /auth/me — no-ops when synced.
 * Prefer VENDOR when both domain rows are approved (legacy dual-role cleanup).
 */
export async function healSpecialtyRolesFromDomain(userId: string, tx?: TxClient): Promise<boolean> {
  const approved = await listApprovedRoles(userId, tx);
  const hasVendorRole = approved.includes(Role.VENDOR);
  const hasCreatorRole = approved.includes(Role.CONTENT_CREATOR);

  const [vendor, creator] = await Promise.all([
    db(tx).vendor.findFirst({
      where: { userId, status: VendorStatus.APPROVED },
      select: { id: true },
    }),
    db(tx).creatorProfile.findFirst({
      where: { userId, status: CreatorStatus.APPROVED },
      select: { id: true },
    }),
  ]);

  let healed = false;

  if (vendor && !hasVendorRole) {
    // Do not invent a dual capable specialty if creator is already capable.
    if (!hasCreatorRole) {
      await upsertRoleStatus({
        userId,
        role: Role.VENDOR,
        status: RoleAssignmentStatus.APPROVED,
        tx,
      });
      healed = true;
    }
  } else if (creator && !hasCreatorRole && !hasVendorRole) {
    await upsertRoleStatus({
      userId,
      role: Role.CONTENT_CREATOR,
      status: RoleAssignmentStatus.APPROVED,
      tx,
    });
    healed = true;
  }

  if (healed) {
    await syncUserPermissionFromRoles(userId, tx);
  }
  return healed;
}

export async function assertCanActivate(userId: string, mode: Role, tx?: TxClient): Promise<void> {
  if (mode === Role.USER) return;

  const approved = await listApprovedRoles(userId, tx);
  if (approved.includes(mode)) return;

  // Heal accounts where specialty profile is approved but UserRole row was never written.
  await healSpecialtyRolesFromDomain(userId, tx);
  const afterHeal = await listApprovedRoles(userId, tx);
  if (afterHeal.includes(mode)) return;

  const user = await db(tx).user.findUnique({
    where: { id: userId },
    select: { permission: true },
  });
  if (user?.permission === mode) {
    await upsertRoleStatus({
      userId,
      role: mode,
      status: RoleAssignmentStatus.APPROVED,
      tx,
    });
    await syncUserPermissionFromRoles(userId, tx);
    return;
  }

  throw new ApiError(400, 'You do not have access to this mode.', true, ErrorCodes.ROLE_NOT_APPROVED, { mode });
}

// NOTE: apply/grant eligibility checks live in shared/services/roleTransition.service.ts —
// the single source of truth for professional-role transitions. Do not add them back here.

export function mapVendorStatusToRoleStatus(status: VendorStatus): RoleAssignmentStatus {
  switch (status) {
    case VendorStatus.APPROVED:
      return RoleAssignmentStatus.APPROVED;
    case VendorStatus.REJECTED:
      return RoleAssignmentStatus.REJECTED;
    case VendorStatus.SUSPENDED:
      return RoleAssignmentStatus.SUSPENDED;
    case VendorStatus.PAUSED:
      return RoleAssignmentStatus.PAUSED;
    case VendorStatus.RETIRED:
      return RoleAssignmentStatus.RETIRED;
    case VendorStatus.CHANGES_REQUESTED:
    case VendorStatus.PENDING:
    default:
      return RoleAssignmentStatus.PENDING;
  }
}

export function mapCreatorStatusToRoleStatus(status: CreatorStatus): RoleAssignmentStatus {
  switch (status) {
    case CreatorStatus.APPROVED:
      return RoleAssignmentStatus.APPROVED;
    case CreatorStatus.REJECTED:
      return RoleAssignmentStatus.REJECTED;
    case CreatorStatus.SUSPENDED:
      return RoleAssignmentStatus.SUSPENDED;
    case CreatorStatus.PAUSED:
      return RoleAssignmentStatus.PAUSED;
    case CreatorStatus.RETIRED:
      return RoleAssignmentStatus.RETIRED;
    case CreatorStatus.CHANGES_REQUESTED:
    case CreatorStatus.PENDING:
    default:
      return RoleAssignmentStatus.PENDING;
  }
}

export async function enrichUserWithRoles<T extends { id: string; permission: Role; activeMode: Role }>(
  user: T,
  tx?: TxClient,
): Promise<
  T & {
    roleAssignments: RoleAssignmentView[];
    approvedRoles: Role[];
    roles: Role[];
    activeRole: Role;
    role: Role;
  }
> {
  const roleAssignments = await listUserRoleAssignments(user.id, tx);
  const approvedRoles = roleAssignments
    .filter((r) => CAPABLE_STATUSES.includes(r.status))
    .map((r) => r.role);

  // Ensure USER always present in response
  if (!approvedRoles.includes(Role.USER)) {
    approvedRoles.unshift(Role.USER);
  }

  return {
    ...user,
    roleAssignments,
    approvedRoles,
    roles: approvedRoles,
    activeRole: user.activeMode,
    role: user.permission,
  };
}
