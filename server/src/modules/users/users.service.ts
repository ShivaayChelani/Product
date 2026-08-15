import { CreatorStatus, Prisma, Role, RoleAssignmentStatus, VendorStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../shared/utils/ApiError';
import { getPaginationParams, paginatedResponse } from '../../shared/utils/pagination';
import { ListUsersInput, UpdateRoleInput } from './users.validation';
import { eventBus, AppEvents } from '../../config/events';
import { ADMIN_ROLES } from '../../middleware/auth';
import {
  CAPABLE_STATUSES,
  enrichUserWithRoles,
  ensureBaseUserRole,
  listApprovedRoles,
  syncUserPermissionFromRoles,
  upsertRoleStatus,
} from '../../shared/utils/specialtyRoles';
import { roleTransitionService, type ProfessionalRole } from '../../shared/services/roleTransition.service';

/** Vendor/creator statuses that still need admin attention in the users list. */
const ATTENTION_VENDOR_STATUSES: VendorStatus[] = [
  VendorStatus.PENDING,
  VendorStatus.CHANGES_REQUESTED,
];
const ATTENTION_CREATOR_STATUSES: CreatorStatus[] = [
  CreatorStatus.PENDING,
  CreatorStatus.CHANGES_REQUESTED,
];

const roleAttentionFilter: Prisma.UserWhereInput = {
  OR: [
    { vendor: { is: { status: { in: ATTENTION_VENDOR_STATUSES } } } },
    { creatorProfile: { is: { status: { in: ATTENTION_CREATOR_STATUSES } } } },
  ],
};

const vendorListSelect = {
  id: true,
  businessName: true,
  status: true,
} satisfies Prisma.VendorSelect;

const creatorListSelect = {
  id: true,
  fullName: true,
  username: true,
  status: true,
} satisfies Prisma.CreatorProfileSelect;

/** Full application payload for admin user detail / role review. */
const vendorDetailSelect = {
  id: true,
  businessName: true,
  businessType: true,
  phone: true,
  address: true,
  city: true,
  state: true,
  latitude: true,
  longitude: true,
  description: true,
  imageUrl: true,
  website: true,
  operatingHours: true,
  images: true,
  gstNumber: true,
  documents: true,
  status: true,
  rejectionReason: true,
  vendorCode: true,
  linkedSpotIds: true,
  services: true,
  createdAt: true,
  updatedAt: true,
  reviewedAt: true,
} satisfies Prisma.VendorSelect;

const creatorDetailSelect = {
  id: true,
  username: true,
  fullName: true,
  bio: true,
  avatar: true,
  travelCategories: true,
  instagramUrl: true,
  youtubeUrl: true,
  facebookUrl: true,
  languages: true,
  governmentIdUrl: true,
  portfolioLinks: true,
  sampleReelUrl: true,
  applicationReason: true,
  status: true,
  rejectionReason: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CreatorProfileSelect;

const userSelect = {
  id: true,
  email: true,
  name: true,
  permission: true,
  activeMode: true,
  verificationStatus: true,
  createdAt: true,
  updatedAt: true,
  vendor: { select: vendorListSelect },
  creatorProfile: { select: creatorListSelect },
} satisfies Prisma.UserSelect;

const userDetailSelect = {
  ...userSelect,
  wallet: true,
  vendor: { select: vendorDetailSelect },
  creatorProfile: { select: creatorDetailSelect },
} satisfies Prisma.UserSelect;

const adminRoleSet = new Set<Role>(ADMIN_ROLES);

async function userHasAdminDashboardRole(userId: string, permission?: Role): Promise<boolean> {
  if (permission && adminRoleSet.has(permission)) return true;
  const approved = await listApprovedRoles(userId);
  return approved.some((role) => adminRoleSet.has(role));
}

/** Retire all capable admin dashboard roles so demotion to USER is not a no-op. */
async function retireAdminDashboardRoles(userId: string, actorId: string): Promise<number> {
  const assignments = await prisma.userRole.findMany({
    where: {
      userId,
      role: { in: [...ADMIN_ROLES] },
      status: { in: CAPABLE_STATUSES },
    },
    select: { role: true },
  });

  for (const assignment of assignments) {
    await upsertRoleStatus({
      userId,
      role: assignment.role,
      status: RoleAssignmentStatus.RETIRED,
      approvedById: actorId,
      rejectedReason: 'Admin role retired by an admin.',
    });
  }

  if (assignments.length > 0) {
    await syncUserPermissionFromRoles(userId);
  }

  return assignments.length;
}

export const usersService = {
  async list(query: ListUsersInput) {
    const pagination = getPaginationParams(query);
    const where: Prisma.UserWhereInput = {};

    if (query.permission ?? query.role) {
      const role = (query.permission ?? query.role) as Role;
      where.OR = [
        { permission: role },
        {
          userRoles: {
            some: { role, status: { in: [RoleAssignmentStatus.ACTIVE, RoleAssignmentStatus.APPROVED] } },
          },
        },
      ];
    }

    if (query.search) {
      const searchClause = [
        { name: { contains: query.search, mode: 'insensitive' as const } },
        { email: { contains: query.search, mode: 'insensitive' as const } },
      ];
      where.AND = [{ OR: searchClause }, ...(where.OR ? [{ OR: where.OR }] : [])];
      delete where.OR;
    }

    // Pending-only queue: server-side so pagination/totals match the filter.
    if (query.pendingApproval) {
      const pendingWhere: Prisma.UserWhereInput = { AND: [where, roleAttentionFilter] };
      const total = await prisma.user.count({ where: pendingWhere });
      const data = await prisma.user.findMany({
        select: userSelect,
        where: pendingWhere,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
      });
      return paginatedResponse(
        await Promise.all(data.map((u) => enrichUserWithRoles(u))),
        total,
        pagination,
      );
    }

    // Pending / changes-requested role apps first so the queue stays actionable;
    // already-approved (and other settled) users sort below.
    const attentionWhere: Prisma.UserWhereInput = { AND: [where, roleAttentionFilter] };
    const settledWhere: Prisma.UserWhereInput = { AND: [where, { NOT: roleAttentionFilter }] };

    const [attentionTotal, settledTotal] = await Promise.all([
      prisma.user.count({ where: attentionWhere }),
      prisma.user.count({ where: settledWhere }),
    ]);
    const total = attentionTotal + settledTotal;
    const { skip, limit } = pagination;

    let data: Prisma.UserGetPayload<{ select: typeof userSelect }>[];
    if (skip < attentionTotal) {
      const attentionTake = Math.min(limit, attentionTotal - skip);
      const attentionRows = await prisma.user.findMany({
        select: userSelect,
        where: attentionWhere,
        skip,
        take: attentionTake,
        orderBy: { createdAt: 'desc' },
      });
      data = attentionRows;
      const remaining = limit - attentionRows.length;
      if (remaining > 0) {
        const settledRows = await prisma.user.findMany({
          select: userSelect,
          where: settledWhere,
          skip: 0,
          take: remaining,
          orderBy: { createdAt: 'desc' },
        });
        data = [...data, ...settledRows];
      }
    } else {
      data = await prisma.user.findMany({
        select: userSelect,
        where: settledWhere,
        skip: skip - attentionTotal,
        take: limit,
        orderBy: { createdAt: 'desc' },
      });
    }

    return paginatedResponse(
      await Promise.all(data.map((u) => enrichUserWithRoles(u))),
      total,
      pagination,
    );
  },

  async getById(id: string) {
    const user = await prisma.user.findUnique({
      select: userDetailSelect,
      where: { id },
    });
    if (!user) {
      throw new ApiError(404, 'User not found.');
    }
    return enrichUserWithRoles(user);
  },

  async updateRole(id: string, input: UpdateRoleInput, actorId: string) {
    if (actorId === id) {
      throw new ApiError(400, 'You cannot change your own role.');
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        permission: true,
        activeMode: true,
        email: true,
        name: true,
        vendor: { select: { id: true } },
        creatorProfile: { select: { id: true } },
      },
    });
    if (!user) {
      throw new ApiError(404, 'User not found.');
    }

    const previous = { permission: user.permission, activeMode: user.activeMode };
    const newPermission = input.permission as Role;

    if (newPermission === Role.USER) {
      // Demotion to plain USER retires professional roles via the central service.
      await roleTransitionService.demoteToUser(id, actorId);
      // demoteToUser does not retire admin dashboard roles — strip those here.
      await retireAdminDashboardRoles(id, actorId);
      await prisma.user.update({
        where: { id },
        data: { permission: Role.USER, activeMode: Role.USER },
      });
    } else if (newPermission === Role.ADMIN) {
      const actorRoles = await listApprovedRoles(actorId);
      const canGrantAdmin =
        actorRoles.includes(Role.SUPER_ADMIN) || actorRoles.includes(Role.ADMIN);
      if (!canGrantAdmin) {
        throw new ApiError(403, 'Only ADMIN or SUPER_ADMIN can grant admin access.');
      }
      await ensureBaseUserRole(id);
      await upsertRoleStatus({
        userId: id,
        role: Role.ADMIN,
        status: RoleAssignmentStatus.APPROVED,
        approvedById: actorId,
      });
      await prisma.user.update({
        where: { id },
        data: { permission: Role.ADMIN, activeMode: Role.ADMIN },
      });
    } else {
      // Professional roles are exclusive — all grant logic lives in the central transition service.
      await roleTransitionService.adminGrant(
        id,
        newPermission as ProfessionalRole,
        actorId,
        input.confirmSwitch,
      );
    }

    const updated = await prisma.user.findUniqueOrThrow({
      select: userSelect,
      where: { id },
    });

    eventBus.emit(AppEvents.USER_ROLE_CHANGED, {
      userId: id,
      actorId,
      previous,
      newValues: { permission: updated.permission, activeMode: updated.activeMode },
    });

    return enrichUserWithRoles(updated);
  },

  async delete(id: string, actorId: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, permission: true, activeMode: true },
    });
    if (!user) {
      throw new ApiError(404, 'User not found.');
    }

    if (actorId === id) {
      throw new ApiError(400, 'You cannot delete your own account.');
    }

    if (await userHasAdminDashboardRole(id, user.permission)) {
      throw new ApiError(403, 'Admin accounts cannot be deleted from here.');
    }

    const previous = {
      name: user.name,
      email: user.email,
      permission: user.permission,
      activeMode: user.activeMode,
      deleted: false,
    };

    // Clear reviewer FK with no onDelete rule so hard-delete does not fail on Restrict.
    await prisma.$transaction(async (tx) => {
      await tx.userPlaceImage.updateMany({
        where: { reviewedBy: id },
        data: { reviewedBy: null },
      });
      await tx.user.delete({ where: { id } });
    });

    // Reuse USER_ROLE_CHANGED audit channel with an explicit deletion marker
    // (no USER_DELETED AuditAction exists yet — avoid schema/event redesign).
    eventBus.emit(AppEvents.USER_ROLE_CHANGED, {
      userId: id,
      actorId,
      previous,
      newValues: { deleted: true },
    });

    return { message: 'User deleted successfully' };
  },
};
