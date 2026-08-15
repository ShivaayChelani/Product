import { AuditAction, CreatorStatus, Prisma, Role, RoleAssignmentStatus, VendorStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError, ErrorCodes } from '../utils/ApiError';
import { notificationService } from '../../modules/notifications/notification.service';
import {
  CAPABLE_STATUSES,
  ensureBaseUserRole,
  syncUserPermissionFromRoles,
  upsertRoleStatus,
} from '../utils/specialtyRoles';

type TxClient = Prisma.TransactionClient;

/**
 * Single source of truth for professional-role transitions (apply, switch, admin grant, retire).
 *
 * RULE: a User is permanently USER, plus at most ONE of VENDOR / CONTENT_CREATOR at a time.
 * No other module may directly mutate UserRole/Vendor.status/CreatorProfile.status for these two
 * roles outside of this service — vendors.service.ts, social.service.ts, and users.service.ts all
 * delegate here so the exclusivity rule can never be bypassed or duplicated.
 */
export const PROFESSIONAL_ROLES = [Role.VENDOR, Role.CONTENT_CREATOR] as const;
export type ProfessionalRole = (typeof PROFESSIONAL_ROLES)[number];

/** Assignment states that no longer "hold" the role — safe to apply into without a switch. */
const RELINQUISHED_STATUSES: RoleAssignmentStatus[] = [RoleAssignmentStatus.REJECTED, RoleAssignmentStatus.RETIRED];

function db(tx?: TxClient) {
  return tx ?? prisma;
}

function otherProfessionalRole(role: ProfessionalRole): ProfessionalRole {
  return role === Role.VENDOR ? Role.CONTENT_CREATOR : Role.VENDOR;
}

function roleLabel(role: Role): string {
  switch (role) {
    case Role.VENDOR:
      return 'Vendor';
    case Role.CONTENT_CREATOR:
      return 'Content Creator';
    case Role.ADMIN:
      return 'Admin';
    default:
      return 'User';
  }
}

async function getDomainStatus(
  userId: string,
  role: ProfessionalRole,
  tx?: TxClient,
): Promise<VendorStatus | CreatorStatus | null> {
  if (role === Role.VENDOR) {
    const vendor = await db(tx).vendor.findUnique({ where: { userId }, select: { status: true } });
    return vendor?.status ?? null;
  }
  const creatorProfile = await db(tx).creatorProfile.findUnique({ where: { userId }, select: { status: true } });
  return creatorProfile?.status ?? null;
}

export const roleTransitionService = {
  PROFESSIONAL_ROLES,

  /**
   * The single gate every apply/grant path must call before creating or approving a professional
   * role assignment. Throws a structured ApiError (never rely on message text) when the request
   * cannot proceed as-is, and tells the caller whether this is a role switch (the other
   * professional role must be retired first).
   */
  async assertCanApply(
    userId: string,
    targetRole: ProfessionalRole,
    confirmSwitch: boolean | undefined,
    tx?: TxClient,
  ): Promise<{ isSwitch: boolean; otherRole: ProfessionalRole }> {
    const otherRole = otherProfessionalRole(targetRole);

    const [targetAssignment, otherAssignment, targetDomainStatus] = await Promise.all([
      db(tx).userRole.findUnique({ where: { userId_role: { userId, role: targetRole } } }),
      db(tx).userRole.findUnique({ where: { userId_role: { userId, role: otherRole } } }),
      getDomainStatus(userId, targetRole, tx),
    ]);

    // A pending application that is really an admin "changes requested" request is resubmittable —
    // it must not be blocked as "already pending" (the domain service performs the actual resubmit).
    const isResubmittableChangesRequested = targetDomainStatus === 'CHANGES_REQUESTED';

    if (targetAssignment) {
      if (CAPABLE_STATUSES.includes(targetAssignment.status)) {
        throw new ApiError(
          409,
          `This account is already an approved ${roleLabel(targetRole)}.`,
          true,
          ErrorCodes.ROLE_ALREADY_EXISTS,
          { role: targetRole },
        );
      }
      if (targetAssignment.status === RoleAssignmentStatus.PENDING && !isResubmittableChangesRequested) {
        throw new ApiError(
          409,
          `You already have a ${roleLabel(targetRole)} application pending review.`,
          true,
          ErrorCodes.APPLICATION_PENDING,
          { role: targetRole },
        );
      }
      if (targetAssignment.status === RoleAssignmentStatus.SUSPENDED) {
        throw new ApiError(
          403,
          `Your ${roleLabel(targetRole)} role is suspended. Contact support.`,
          true,
          ErrorCodes.ROLE_SUSPENDED,
          { role: targetRole },
        );
      }
    }

    // Does the OTHER professional role still "belong" to this account? If so, applying for
    // targetRole is a switch: the other role must be explicitly retired (with confirmation).
    const otherStillHeld = !!otherAssignment && !RELINQUISHED_STATUSES.includes(otherAssignment.status);

    if (otherStillHeld && !confirmSwitch) {
      throw new ApiError(
        409,
        `You currently have an active ${roleLabel(otherRole)} role. Switching to ${roleLabel(targetRole)} will retire it — confirm to continue.`,
        true,
        ErrorCodes.SWITCH_CONFIRMATION_REQUIRED,
        { currentRole: otherRole, currentStatus: otherAssignment?.status, targetRole },
      );
    }

    return { isSwitch: otherStillHeld, otherRole };
  },

  /**
   * Retires a professional role: UserRole -> RETIRED, the owning domain row (Vendor/CreatorProfile)
   * -> RETIRED, and an audit entry — all through the caller's transaction client so everything
   * commits or rolls back together. Callers MUST invoke notifyRetirement() after the transaction
   * commits (never inside it, or a rollback would leave a false notification behind).
   */
  async retireRole(
    userId: string,
    role: ProfessionalRole,
    actorId: string,
    reason: string,
    tx?: TxClient,
  ): Promise<void> {
    const client = db(tx);
    const previous = await client.userRole.findUnique({ where: { userId_role: { userId, role } } });

    await client.userRole.upsert({
      where: { userId_role: { userId, role } },
      update: { status: RoleAssignmentStatus.RETIRED, retiredAt: new Date(), rejectedReason: null },
      create: { userId, role, status: RoleAssignmentStatus.RETIRED, retiredAt: new Date() },
    });

    if (role === Role.VENDOR) {
      await client.vendor.updateMany({
        where: { userId },
        data: { status: VendorStatus.RETIRED, rejectionReason: null },
      });
    } else {
      await client.creatorProfile.updateMany({
        where: { userId },
        data: { status: CreatorStatus.RETIRED, verified: false, rejectionReason: null },
      });
    }

    // Written through the same client so the audit entry commits (or rolls back) with the transition.
    await client.auditLog.create({
      data: {
        action: AuditAction.ROLE_RETIRED,
        entityType: 'User',
        entityId: userId,
        actorId,
        previous: { role, status: previous?.status ?? null },
        newValues: { role, status: RoleAssignmentStatus.RETIRED, reason },
      },
    });
  },

  /** Fire-and-forget retirement notification. Call AFTER the retiring transaction has committed. */
  notifyRetirement(userId: string, role: ProfessionalRole, reason: string): void {
    notificationService
      .sendToUser(
        userId,
        `${roleLabel(role)} Role Retired`,
        reason,
        { role, status: 'RETIRED' },
        'role_retired',
      )
      .catch(() => undefined);
  },

  /**
   * Common tail of every self-service application: ensure base USER role exists, mark the target
   * professional role PENDING, and re-sync the denormalized User.permission/activeMode.
   */
  async finalizeApplication(userId: string, targetRole: ProfessionalRole, tx?: TxClient): Promise<void> {
    await ensureBaseUserRole(userId, tx);
    await upsertRoleStatus({ userId, role: targetRole, status: RoleAssignmentStatus.PENDING, rejectedReason: null, tx });
    await syncUserPermissionFromRoles(userId, tx);
  },

  /**
   * Applies an admin verification outcome (approve / reject / suspend / pause / changes requested)
   * to the professional role assignment. This is the ONLY path domain services (vendors.verify,
   * social.verifyCreator, vendors.deleteVendor, auth.setupVendor) may use to mutate a professional
   * UserRole — approval re-checks exclusivity so legacy dual-role accounts can never be re-approved
   * into a violating state.
   */
  async applyVerificationOutcome(params: {
    userId: string;
    role: ProfessionalRole;
    status: RoleAssignmentStatus;
    approvedById?: string | null;
    rejectedReason?: string | null;
    tx?: TxClient;
  }): Promise<void> {
    const { userId, role, status, approvedById, rejectedReason, tx } = params;

    if (CAPABLE_STATUSES.includes(status)) {
      await this.assertExclusiveOnApproval(userId, role, tx);
    }

    await ensureBaseUserRole(userId, tx);
    await upsertRoleStatus({
      userId,
      role,
      status,
      approvedById: approvedById ?? null,
      rejectedReason: rejectedReason ?? null,
      tx,
    });
    await syncUserPermissionFromRoles(userId, tx);
  },

  /**
   * Defensive exclusivity gate for admin approval paths (vendors.verify / social.verifyCreator).
   * The conflict is normally resolved at apply-time, but legacy dual-role accounts may still exist:
   * block approval until the other role is explicitly retired so the invariant is never re-violated.
   */
  async assertExclusiveOnApproval(userId: string, targetRole: ProfessionalRole, tx?: TxClient): Promise<void> {
    const otherRole = otherProfessionalRole(targetRole);
    const otherAssignment = await db(tx).userRole.findUnique({
      where: { userId_role: { userId, role: otherRole } },
    });
    if (otherAssignment && !RELINQUISHED_STATUSES.includes(otherAssignment.status)) {
      throw new ApiError(
        409,
        `This account still holds the ${roleLabel(otherRole)} role (${otherAssignment.status}). Retire it before approving ${roleLabel(targetRole)}.`,
        true,
        ErrorCodes.ROLE_ALREADY_EXISTS,
        { conflictingRole: otherRole, conflictingStatus: otherAssignment.status, targetRole },
      );
    }
  },

  /**
   * Admin grant path (users.service.ts `PATCH /users/:id/role`). Enforces exclusivity (with
   * confirmation when it means retiring the other role), activates the professional profile
   * attached to the SAME user id (never creates a new user), approves the role assignment, and
   * re-syncs permission/activeMode — all in ONE transaction.
   */
  async adminGrant(
    userId: string,
    targetRole: ProfessionalRole,
    approvedById: string,
    confirmSwitch: boolean | undefined,
  ): Promise<{ isSwitch: boolean; otherRole: ProfessionalRole }> {
    const otherRole = otherProfessionalRole(targetRole);
    const retireReason = `Your ${roleLabel(otherRole)} role was retired by an admin while switching your account to ${roleLabel(targetRole)}.`;

    const result = await prisma.$transaction(async (tx) => {
      const otherAssignment = await tx.userRole.findUnique({
        where: { userId_role: { userId, role: otherRole } },
      });
      const isSwitch = !!otherAssignment && !RELINQUISHED_STATUSES.includes(otherAssignment.status);

      if (isSwitch && !confirmSwitch) {
        throw new ApiError(
          409,
          `This account currently holds the ${roleLabel(otherRole)} role. Granting ${roleLabel(targetRole)} will retire it — confirm to continue.`,
          true,
          ErrorCodes.SWITCH_CONFIRMATION_REQUIRED,
          { currentRole: otherRole, currentStatus: otherAssignment?.status, targetRole },
        );
      }

      if (isSwitch) {
        await this.retireRole(userId, otherRole, approvedById, retireReason, tx);
      }

      // Activate the professional profile on the same user id.
      if (targetRole === Role.VENDOR) {
        const vendor = await tx.vendor.findUnique({ where: { userId }, select: { id: true } });
        if (!vendor) {
          throw new ApiError(
            400,
            'This account has no vendor business to activate. The user must submit a vendor application first.',
            true,
            ErrorCodes.APPLICATION_REQUIRED,
            { role: Role.VENDOR },
          );
        }
        await tx.vendor.update({
          where: { userId },
          data: { status: VendorStatus.APPROVED, rejectionReason: null, reviewedById: approvedById, reviewedAt: new Date() },
        });
      } else {
        const creatorProfile = await tx.creatorProfile.findUnique({ where: { userId }, select: { id: true } });
        if (creatorProfile) {
          await tx.creatorProfile.update({
            where: { userId },
            data: { status: CreatorStatus.APPROVED, verified: true, rejectionReason: null },
          });
        } else {
          const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true } });
          const username = (user.name || user.email.split('@')[0]).replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
            + '_' + Date.now().toString(36);
          await tx.creatorProfile.create({
            data: { userId, username, fullName: user.name, status: CreatorStatus.APPROVED, verified: true },
          });
        }
      }

      await ensureBaseUserRole(userId, tx);
      await upsertRoleStatus({
        userId,
        role: targetRole,
        status: RoleAssignmentStatus.APPROVED,
        approvedById,
        rejectedReason: null,
        tx,
      });
      await syncUserPermissionFromRoles(userId, tx);
      await tx.user.update({ where: { id: userId }, data: { activeMode: targetRole } });

      return { isSwitch, otherRole };
    });

    if (result.isSwitch) {
      this.notifyRetirement(userId, otherRole, retireReason);
    }
    return result;
  },

  /**
   * Admin demotion to plain USER (users.service.ts): retires every professional role the account
   * still holds, re-activates the base USER role, and re-syncs permission/activeMode — one transaction.
   */
  async demoteToUser(userId: string, actorId: string): Promise<void> {
    const retired = await prisma.$transaction(async (tx) => {
      const retiredRoles: ProfessionalRole[] = [];
      for (const role of PROFESSIONAL_ROLES) {
        const assignment = await tx.userRole.findUnique({
          where: { userId_role: { userId, role } },
        });
        if (assignment && !RELINQUISHED_STATUSES.includes(assignment.status)) {
          await this.retireRole(
            userId,
            role,
            actorId,
            `Your ${roleLabel(role)} role was retired by an admin.`,
            tx,
          );
          retiredRoles.push(role);
        }
      }
      await ensureBaseUserRole(userId, tx);
      await syncUserPermissionFromRoles(userId, tx);
      return retiredRoles;
    });

    for (const role of retired) {
      this.notifyRetirement(userId, role, `Your ${roleLabel(role)} role was retired by an admin.`);
    }
  },
};
