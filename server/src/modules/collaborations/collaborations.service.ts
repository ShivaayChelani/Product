import {
  AuditAction,
  CollaborationStatus,
  Prisma,
  ReelStatus,
  VendorListingStatus,
  VendorStatus,
} from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError, ErrorCodes } from '../../shared/utils/ApiError';
import { getPaginationParams, paginatedResponse } from '../../shared/utils/pagination';
import { auditService } from '../audit/audit.service';
import { notificationService } from '../notifications/notification.service';
import { planEnforcementService } from '../monetization/plan-enforcement.service';
import type {
  CreateCollaborationInput,
  ListCollaborationsQuery,
} from './collaborations.validation';

const CONTACT_UNLOCK_STATUSES = new Set<CollaborationStatus>([
  CollaborationStatus.ACCEPTED,
  CollaborationStatus.IN_PROGRESS,
  CollaborationStatus.REEL_UPLOADED,
  CollaborationStatus.REVISION_REQUESTED,
  CollaborationStatus.APPROVED,
  CollaborationStatus.COMPLETED,
]);

const DUPLICATE_BLOCK_STATUSES: CollaborationStatus[] = [
  CollaborationStatus.PENDING,
  CollaborationStatus.ACCEPTED,
  CollaborationStatus.IN_PROGRESS,
  CollaborationStatus.REEL_UPLOADED,
  CollaborationStatus.REVISION_REQUESTED,
  CollaborationStatus.APPROVED,
];

const REQUEST_EXPIRY_DAYS = 14;

const collaborationInclude = {
  deliverables: true,
  vendor: {
    select: {
      id: true,
      businessName: true,
      businessType: true,
      city: true,
      state: true,
      imageUrl: true,
      status: true,
      userId: true,
    },
  },
  creator: {
    select: {
      id: true,
      username: true,
      fullName: true,
      avatar: true,
      verified: true,
      userId: true,
    },
  },
  reel: {
    select: {
      id: true,
      videoUrl: true,
      thumbnail: true,
      title: true,
      description: true,
      status: true,
      vendorListingStatus: true,
      views: true,
      likes: true,
      isCollaboration: true,
    },
  },
  analytics: true,
  statusHistory: {
    orderBy: { createdAt: 'desc' as const },
    take: 10,
  },
  revisions: {
    orderBy: { createdAt: 'desc' as const },
    take: 5,
  },
} satisfies Prisma.CollaborationInclude;

type CollaborationRow = Prisma.CollaborationGetPayload<{ include: typeof collaborationInclude }>;

function formatBudget(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN')}`;
}

function deliverablesSummary(deliverables: { type: string; quantity: number }[]): string {
  return deliverables.map((d) => `${d.quantity} ${d.type.replace('_', ' ')}`).join(', ');
}

async function recordStatusChange(
  tx: Prisma.TransactionClient,
  collaborationId: string,
  fromStatus: CollaborationStatus | null,
  toStatus: CollaborationStatus,
  changedById: string,
  note?: string,
) {
  await tx.collaborationStatusHistory.create({
    data: {
      collaborationId,
      fromStatus,
      toStatus,
      changedById,
      note,
    },
  });
}

async function expireStalePending() {
  const now = new Date();
  const stale = await prisma.collaboration.findMany({
    where: {
      status: CollaborationStatus.PENDING,
      expiresAt: { lt: now },
      deletedAt: null,
    },
    select: { id: true, vendorUserId: true, creatorUserId: true, campaignTitle: true, businessName: true },
  });

  for (const row of stale) {
    // Conditional update prevents ACCEPTED → EXPIRED race if creator accepts between find and write.
    const expired = await prisma.$transaction(async (tx) => {
      const marked = await tx.collaboration.updateMany({
        where: {
          id: row.id,
          status: CollaborationStatus.PENDING,
          expiresAt: { lt: now },
        },
        data: { status: CollaborationStatus.EXPIRED },
      });
      if (marked.count === 0) return false;
      await recordStatusChange(
        tx,
        row.id,
        CollaborationStatus.PENDING,
        CollaborationStatus.EXPIRED,
        row.vendorUserId,
        'Request expired',
      );
      return true;
    });

    if (!expired) continue;

    await notifyCollaboration(
      row.vendorUserId,
      'collab_expired',
      'Collaboration request expired',
      `Your request for "${row.campaignTitle}" expired without a response.`,
      row.id,
    );
    await notifyCollaboration(
      row.creatorUserId,
      'collab_expired',
      'Collaboration request expired',
      `The request from ${row.businessName} has expired.`,
      row.id,
    );
  }
}

/** True when a PENDING request is past expiresAt (treat as expired before accept/reject). */
function isPendingExpired(row: { status: CollaborationStatus; expiresAt: Date | null }) {
  return (
    row.status === CollaborationStatus.PENDING &&
    !!row.expiresAt &&
    row.expiresAt.getTime() < Date.now()
  );
}

function maskCollaboration(
  row: CollaborationRow,
  viewerUserId: string,
  viewerRole: 'vendor' | 'creator' | 'admin' | 'other',
): Record<string, unknown> {
  const isVendor = viewerUserId === row.vendorUserId;
  const isCreator = viewerUserId === row.creatorUserId;
  const isAdmin = viewerRole === 'admin';
  const isParty = isVendor || isCreator || isAdmin;
  const contactsUnlocked = isParty && CONTACT_UNLOCK_STATUSES.has(row.status);

  const base: Record<string, unknown> = {
    id: row.id,
    campaignTitle: row.campaignTitle,
    campaignCategory: row.campaignCategory,
    businessName: row.businessName,
    businessLocation: row.businessLocation,
    budgetPaise: row.budgetPaise,
    budgetFormatted: formatBudget(row.budgetPaise),
    campaignBrief: row.campaignBrief,
    expectedShootDate: row.expectedShootDate,
    expectedUploadDate: row.expectedUploadDate,
    campaignDurationDays: row.campaignDurationDays,
    status: row.status,
    expiresAt: row.expiresAt,
    acceptedAt: row.acceptedAt,
    rejectedAt: row.rejectedAt,
    cancelledAt: row.cancelledAt,
    completedAt: row.completedAt,
    rejectionReason: row.rejectionReason,
    cancellationReason: row.cancellationReason,
    revisionFeedback: row.revisionFeedback,
    notes: row.notes,
    attachments: row.attachments,
    deliverables: row.deliverables,
    deliverablesSummary: deliverablesSummary(row.deliverables),
    vendor: row.vendor,
    creator: row.creator,
    reel: row.reel,
    analytics: row.analytics,
    statusHistory: isParty || isAdmin ? row.statusHistory : undefined,
    revisions: isParty || isAdmin ? row.revisions : undefined,
    reelId: row.reelId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    contactsUnlocked,
    viewerRole: isVendor ? 'vendor' : isCreator ? 'creator' : isAdmin ? 'admin' : 'other',
  };

  // Privacy: phone / WhatsApp / email / contact person stay hidden from the creator until ACCEPTED+.
  // Vendor and admin may always see contact fields they own or moderate.
  if (contactsUnlocked || isVendor || isAdmin) {
    base.contactPerson = row.contactPerson;
    base.contactPhone = row.contactPhone;
    base.contactWhatsApp = row.contactWhatsApp;
    base.contactEmail = row.contactEmail;
  } else {
    base.contactPerson = null;
    base.contactPhone = null;
    base.contactWhatsApp = null;
    base.contactEmail = null;
    // Attachments / free-text notes can embed contact details — withhold until unlock.
    if (isCreator) {
      base.attachments = [];
      base.notes = null;
    }
  }

  return base;
}

async function getVendorForUser(userId: string) {
  const vendor = await prisma.vendor.findUnique({ where: { userId } });
  if (!vendor) throw new ApiError(404, 'Vendor profile not found.');
  if (vendor.status !== VendorStatus.APPROVED) {
    throw new ApiError(403, 'Your vendor account must be approved to send collaboration requests.');
  }
  if (vendor.suspendedAt) throw new ApiError(403, 'Your vendor account is suspended.');
  return vendor;
}

async function getCreatorProfileById(creatorProfileId: string) {
  const creator = await prisma.creatorProfile.findUnique({
    where: { id: creatorProfileId },
    include: { user: { select: { id: true, name: true } } },
  });
  if (!creator) throw new ApiError(404, 'Creator not found.');
  if (creator.status !== 'APPROVED') {
    throw new ApiError(400, 'Collaboration requests can only be sent to approved creators.');
  }
  return creator;
}

async function getCreatorForUser(userId: string) {
  const creator = await prisma.creatorProfile.findUnique({ where: { userId } });
  if (!creator) throw new ApiError(404, 'Creator profile not found.');
  if (creator.status !== 'APPROVED') throw new ApiError(403, 'Creator account must be approved.');
  return creator;
}

async function getCollaborationOrThrow(id: string) {
  const row = await prisma.collaboration.findFirst({
    where: { id, deletedAt: null },
    include: collaborationInclude,
  });
  if (!row) throw new ApiError(404, 'Collaboration not found.');
  return row;
}

function assertPartyAccess(row: CollaborationRow, userId: string, admin = false) {
  if (admin) return;
  if (row.vendorUserId !== userId && row.creatorUserId !== userId) {
    throw new ApiError(403, 'You do not have access to this collaboration.');
  }
}

function buildBucketFilter(
  bucket: string | undefined,
  role: 'vendor' | 'creator',
): Prisma.CollaborationWhereInput {
  switch (bucket) {
    case 'incoming':
      return role === 'creator'
        ? { status: CollaborationStatus.PENDING }
        : { status: { in: [CollaborationStatus.REEL_UPLOADED, CollaborationStatus.REVISION_REQUESTED] } };
    case 'accepted':
      return { status: { in: [CollaborationStatus.ACCEPTED, CollaborationStatus.IN_PROGRESS] } };
    case 'active':
      return {
        status: {
          in: [
            CollaborationStatus.ACCEPTED,
            CollaborationStatus.IN_PROGRESS,
            CollaborationStatus.REEL_UPLOADED,
            CollaborationStatus.REVISION_REQUESTED,
            CollaborationStatus.APPROVED,
          ],
        },
      };
    case 'completed':
      return { status: { in: [CollaborationStatus.APPROVED, CollaborationStatus.COMPLETED] } };
    case 'cancelled':
      return {
        status: {
          in: [CollaborationStatus.REJECTED, CollaborationStatus.CANCELLED, CollaborationStatus.EXPIRED],
        },
      };
    case 'history':
      return {
        status: {
          in: [
            CollaborationStatus.REJECTED,
            CollaborationStatus.CANCELLED,
            CollaborationStatus.EXPIRED,
            CollaborationStatus.COMPLETED,
            CollaborationStatus.APPROVED,
          ],
        },
      };
    default:
      return {};
  }
}

async function syncAnalytics(collaborationId: string) {
  const row = await prisma.collaboration.findUnique({
    where: { id: collaborationId },
    include: { reel: true },
  });
  if (!row?.reel) return null;

  const reel = row.reel;
  const comments = await prisma.reelComment.count({ where: { reelId: reel.id } });
  const engagement = reel.views
    ? Number((((reel.likes + comments + reel.saves) / reel.views) * 100).toFixed(2))
    : 0;
  const vendorSpend = row.budgetPaise;
  const creatorEarnings = row.budgetPaise;
  const roi = vendorSpend > 0 ? Number(((reel.views / (vendorSpend / 100)) * 100).toFixed(2)) : 0;

  return prisma.collaborationAnalytics.upsert({
    where: { collaborationId },
    create: {
      collaborationId,
      views: reel.views,
      likes: reel.likes,
      comments,
      shares: reel.shares,
      saves: reel.saves,
      reach: reel.views,
      engagement,
      vendorSpendPaise: vendorSpend,
      creatorEarningsPaise: creatorEarnings,
      roi,
      lastSyncedAt: new Date(),
    },
    update: {
      views: reel.views,
      likes: reel.likes,
      comments,
      shares: reel.shares,
      saves: reel.saves,
      reach: reel.views,
      engagement,
      vendorSpendPaise: vendorSpend,
      creatorEarningsPaise: creatorEarnings,
      roi,
      lastSyncedAt: new Date(),
    },
  });
}

async function notifyCollaboration(
  userId: string,
  type: string,
  title: string,
  body: string,
  collaborationId: string,
  extra?: Record<string, unknown>,
) {
  const screenByType: Record<string, string> = {
    collab_reel_uploaded: 'CollaborationReview',
    collab_reel_approved: 'CollaborationDetail',
    collab_reel_published: 'ReelDetail',
  };
  await notificationService.sendToUser(userId, title, body, {
    type,
    entityId: collaborationId,
    collaborationId,
    screen: screenByType[type] || 'CollaborationDetail',
    params: JSON.stringify({ collaborationId }),
    ...extra,
  });
}

export const collaborationsService = {
  async createRequest(vendorUserId: string, input: CreateCollaborationInput) {
    const vendor = await getVendorForUser(vendorUserId);
    await planEnforcementService.assertVendorCanCollaborate(vendorUserId);
    const creator = await getCreatorProfileById(input.creatorProfileId);

    if (creator.userId === vendorUserId) {
      throw new ApiError(400, 'You cannot collaborate with your own creator account.');
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REQUEST_EXPIRY_DAYS);

    const businessLocation = [vendor.address, vendor.city, vendor.state].filter(Boolean).join(', ');

    // Duplicate check inside the transaction to shrink concurrent double-request window.
    const collaboration = await prisma.$transaction(async (tx) => {
      const duplicate = await tx.collaboration.findFirst({
        where: {
          vendorId: vendor.id,
          creatorId: creator.id,
          status: { in: DUPLICATE_BLOCK_STATUSES },
          deletedAt: null,
        },
      });
      if (duplicate) {
        throw new ApiError(409, 'An active collaboration request already exists with this creator.');
      }

      const created = await tx.collaboration.create({
        data: {
          vendorId: vendor.id,
          creatorId: creator.id,
          vendorUserId,
          creatorUserId: creator.userId,
          campaignTitle: input.campaignTitle,
          campaignCategory: input.campaignCategory,
          businessName: vendor.businessName,
          businessLocation,
          budgetPaise: input.budgetPaise,
          campaignBrief: input.campaignBrief,
          expectedShootDate: input.expectedShootDate ? new Date(input.expectedShootDate) : null,
          expectedUploadDate: input.expectedUploadDate ? new Date(input.expectedUploadDate) : null,
          campaignDurationDays: input.campaignDurationDays,
          contactPerson: input.contactPerson,
          contactPhone: input.contactPhone,
          contactWhatsApp: input.contactWhatsApp,
          contactEmail: input.contactEmail,
          notes: input.notes,
          attachments: input.attachments ?? [],
          expiresAt,
          deliverables: {
            create: input.deliverables.map((d) => ({ type: d.type, quantity: d.quantity })),
          },
        },
        include: collaborationInclude,
      });

      await recordStatusChange(tx, created.id, null, CollaborationStatus.PENDING, vendorUserId, 'Request sent');
      await tx.collaborationAnalytics.create({
        data: { collaborationId: created.id, vendorSpendPaise: input.budgetPaise },
      });

      return created;
    }, { timeout: 15000 });

    await auditService.log(
      AuditAction.COLLABORATION_CREATED,
      'Collaboration',
      collaboration.id,
      vendorUserId,
      null,
      { campaignTitle: input.campaignTitle, creatorId: creator.id },
    );

    const summary = deliverablesSummary(collaboration.deliverables);
    await notifyCollaboration(
      creator.userId,
      'collab_request_new',
      '🏪 New collaboration request',
      `${vendor.businessName} wants to collaborate. Budget ${formatBudget(input.budgetPaise)}. Deliverables: ${summary}`,
      collaboration.id,
      { vendorId: vendor.id, budgetPaise: input.budgetPaise },
    );

    await notifyCollaboration(
      vendorUserId,
      'collab_request_sent',
      'Collaboration request sent',
      `Your request to ${creator.fullName || creator.username} is pending review.`,
      collaboration.id,
    );

    return maskCollaboration(collaboration, vendorUserId, 'vendor');
  },

  async listForVendor(vendorUserId: string, query: ListCollaborationsQuery) {
    await expireStalePending();
    const vendor = await getVendorForUser(vendorUserId);
    const pagination = getPaginationParams(query);
    const bucketFilter = buildBucketFilter(query.bucket, 'vendor');

    const where: Prisma.CollaborationWhereInput = {
      vendorId: vendor.id,
      deletedAt: null,
      ...bucketFilter,
    };

    if (query.status) where.status = query.status as CollaborationStatus;
    if (query.search) {
      where.OR = [
        { campaignTitle: { contains: query.search, mode: 'insensitive' } },
        { businessName: { contains: query.search, mode: 'insensitive' } },
        { creator: { username: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const orderBy: Prisma.CollaborationOrderByWithRelationInput = {
      [query.sortBy || 'createdAt']: query.sortOrder || 'desc',
    };

    const [rows, total] = await Promise.all([
      prisma.collaboration.findMany({
        where,
        include: collaborationInclude,
        orderBy,
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.collaboration.count({ where }),
    ]);

    return paginatedResponse(
      rows.map((r) => maskCollaboration(r, vendorUserId, 'vendor')),
      total,
      pagination,
    );
  },

  async listForCreator(creatorUserId: string, query: ListCollaborationsQuery) {
    await expireStalePending();
    const creator = await getCreatorForUser(creatorUserId);
    const pagination = getPaginationParams(query);
    const bucketFilter = buildBucketFilter(query.bucket, 'creator');

    const where: Prisma.CollaborationWhereInput = {
      creatorId: creator.id,
      deletedAt: null,
      ...bucketFilter,
    };

    if (query.status) where.status = query.status as CollaborationStatus;
    if (query.search) {
      where.OR = [
        { campaignTitle: { contains: query.search, mode: 'insensitive' } },
        { businessName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.CollaborationOrderByWithRelationInput = {
      [query.sortBy || 'createdAt']: query.sortOrder || 'desc',
    };

    const [rows, total] = await Promise.all([
      prisma.collaboration.findMany({
        where,
        include: collaborationInclude,
        orderBy,
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.collaboration.count({ where }),
    ]);

    return paginatedResponse(
      rows.map((r) => maskCollaboration(r, creatorUserId, 'creator')),
      total,
      pagination,
    );
  },

  async getById(id: string, userId: string, isAdmin = false) {
    await expireStalePending();
    const row = await getCollaborationOrThrow(id);
    assertPartyAccess(row, userId, isAdmin);
    const role = isAdmin
      ? 'admin'
      : row.vendorUserId === userId
        ? 'vendor'
        : 'creator';
    if (row.reelId) await syncAnalytics(id);
    const refreshed = await getCollaborationOrThrow(id);
    return maskCollaboration(refreshed, userId, role);
  },

  async accept(id: string, creatorUserId: string) {
    await expireStalePending();
    const row = await getCollaborationOrThrow(id);
    if (row.creatorUserId !== creatorUserId) throw new ApiError(403, 'Only the creator can accept this request.');
    if (row.status !== CollaborationStatus.PENDING) {
      throw new ApiError(400, `Cannot accept collaboration in ${row.status} status.`);
    }
    if (isPendingExpired(row)) {
      throw new ApiError(400, 'This collaboration request has expired.');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const marked = await tx.collaboration.updateMany({
        where: { id, status: CollaborationStatus.PENDING },
        data: {
          status: CollaborationStatus.ACCEPTED,
          acceptedAt: new Date(),
        },
      });
      if (marked.count === 0) {
        throw new ApiError(400, 'Cannot accept collaboration — status changed. Refresh and try again.');
      }
      await recordStatusChange(tx, id, CollaborationStatus.PENDING, CollaborationStatus.ACCEPTED, creatorUserId);
      return tx.collaboration.findUniqueOrThrow({
        where: { id },
        include: collaborationInclude,
      });
    }, { timeout: 15000 });

    await auditService.log(AuditAction.COLLABORATION_ACCEPTED, 'Collaboration', id, creatorUserId);

    await notifyCollaboration(
      row.vendorUserId,
      'collab_accepted',
      'Creator is ready to collaborate',
      `${updated.creator.fullName || updated.creator.username} accepted your request and is ready to collaborate.`,
      id,
    );
    await notifyCollaboration(
      creatorUserId,
      'collab_accepted',
      'You accepted the collaboration',
      `Contact details for ${row.businessName} are now unlocked.`,
      id,
    );

    return maskCollaboration(updated, creatorUserId, 'creator');
  },

  async reject(id: string, creatorUserId: string, reason: string) {
    await expireStalePending();
    const row = await getCollaborationOrThrow(id);
    if (row.creatorUserId !== creatorUserId) throw new ApiError(403, 'Only the creator can reject this request.');
    if (row.status !== CollaborationStatus.PENDING) {
      throw new ApiError(400, `Cannot reject collaboration in ${row.status} status.`);
    }
    if (isPendingExpired(row)) {
      throw new ApiError(400, 'This collaboration request has expired.');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const marked = await tx.collaboration.updateMany({
        where: { id, status: CollaborationStatus.PENDING },
        data: {
          status: CollaborationStatus.REJECTED,
          rejectedAt: new Date(),
          rejectionReason: reason,
        },
      });
      if (marked.count === 0) {
        throw new ApiError(400, 'Cannot reject collaboration — status changed. Refresh and try again.');
      }
      await recordStatusChange(tx, id, CollaborationStatus.PENDING, CollaborationStatus.REJECTED, creatorUserId, reason);
      return tx.collaboration.findUniqueOrThrow({
        where: { id },
        include: collaborationInclude,
      });
    }, { timeout: 15000 });

    await auditService.log(AuditAction.COLLABORATION_REJECTED, 'Collaboration', id, creatorUserId, null, { reason });

    await notifyCollaboration(
      row.vendorUserId,
      'collab_rejected',
      'Collaboration declined',
      `${updated.creator.fullName || updated.creator.username} declined your request.`,
      id,
      { reason },
    );

    return maskCollaboration(updated, creatorUserId, 'creator');
  },

  async cancel(id: string, vendorUserId: string, reason?: string) {
    const row = await getCollaborationOrThrow(id);
    if (row.vendorUserId !== vendorUserId) throw new ApiError(403, 'Only the vendor can cancel this request.');
    const cancellable = new Set<CollaborationStatus>([
      CollaborationStatus.PENDING,
      CollaborationStatus.ACCEPTED,
      CollaborationStatus.IN_PROGRESS,
    ]);
    if (!cancellable.has(row.status)) {
      throw new ApiError(400, `Cannot cancel collaboration in ${row.status} status.`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const marked = await tx.collaboration.updateMany({
        where: {
          id,
          status: { in: [...cancellable] },
        },
        data: {
          status: CollaborationStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: reason,
        },
      });
      if (marked.count === 0) {
        throw new ApiError(400, `Cannot cancel collaboration in ${row.status} status.`);
      }
      await recordStatusChange(tx, id, row.status, CollaborationStatus.CANCELLED, vendorUserId, reason);
      return tx.collaboration.findUniqueOrThrow({
        where: { id },
        include: collaborationInclude,
      });
    }, { timeout: 15000 });

    await notifyCollaboration(
      row.creatorUserId,
      'collab_cancelled',
      'Collaboration cancelled',
      `${row.businessName} cancelled the collaboration.`,
      id,
    );

    return maskCollaboration(updated, vendorUserId, 'vendor');
  },

  async markInProgress(id: string, userId: string) {
    const row = await getCollaborationOrThrow(id);
    assertPartyAccess(row, userId);
    if (row.status !== CollaborationStatus.ACCEPTED) {
      throw new ApiError(400, 'Collaboration must be accepted first.');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const marked = await tx.collaboration.updateMany({
        where: { id, status: CollaborationStatus.ACCEPTED },
        data: { status: CollaborationStatus.IN_PROGRESS },
      });
      if (marked.count === 0) {
        throw new ApiError(400, 'Collaboration must be accepted first.');
      }
      await recordStatusChange(tx, id, CollaborationStatus.ACCEPTED, CollaborationStatus.IN_PROGRESS, userId);
      return tx.collaboration.findUniqueOrThrow({
        where: { id },
        include: collaborationInclude,
      });
    }, { timeout: 15000 });

    const role = row.vendorUserId === userId ? 'vendor' : 'creator';
    return maskCollaboration(updated, userId, role);
  },

  async submitReel(
    id: string,
    creatorUserId: string,
    input: { videoUrl: string; thumbnail?: string; title?: string; description?: string; placeId?: string },
  ) {
    const row = await getCollaborationOrThrow(id);
    if (row.creatorUserId !== creatorUserId) throw new ApiError(403, 'Only the creator can upload the collaboration reel.');
    const uploadable = new Set<CollaborationStatus>([
      CollaborationStatus.ACCEPTED,
      CollaborationStatus.IN_PROGRESS,
      CollaborationStatus.REVISION_REQUESTED,
    ]);
    if (!uploadable.has(row.status)) {
      throw new ApiError(400, `Cannot upload reel in ${row.status} status.`);
    }

    const creator = await getCreatorForUser(creatorUserId);

    const result = await prisma.$transaction(async (tx) => {
      // Free unique collaborationId slot (covers rejectReel orphans + prior uploads).
      await tx.reel.updateMany({
        where: { collaborationId: id },
        data: {
          status: ReelStatus.ARCHIVED,
          collaborationId: null,
          isCollaboration: false,
        },
      });

      const reel = await tx.reel.create({
        data: {
          creatorId: creator.id,
          vendorId: row.vendorId,
          videoUrl: input.videoUrl,
          thumbnail: input.thumbnail,
          title: input.title || row.campaignTitle,
          description: input.description,
          placeId: input.placeId || null,
          status: ReelStatus.PENDING,
          vendorListingStatus: VendorListingStatus.PENDING,
          isCollaboration: true,
          collaborationId: id,
          category: 'BUSINESS',
        },
      });

      const marked = await tx.collaboration.updateMany({
        where: {
          id,
          status: {
            in: [
              CollaborationStatus.ACCEPTED,
              CollaborationStatus.IN_PROGRESS,
              CollaborationStatus.REVISION_REQUESTED,
            ],
          },
        },
        data: {
          reelId: reel.id,
          status: CollaborationStatus.REEL_UPLOADED,
          revisionFeedback: null,
        },
      });
      if (marked.count === 0) {
        throw new ApiError(400, `Cannot upload reel in ${row.status} status.`);
      }

      const collab = await tx.collaboration.findUniqueOrThrow({
        where: { id },
        include: collaborationInclude,
      });

      if (row.status === CollaborationStatus.REVISION_REQUESTED) {
        await tx.collaborationRevision.updateMany({
          where: { collaborationId: id, resolvedAt: null },
          data: { resolvedAt: new Date(), reelId: reel.id },
        });
      }

      await recordStatusChange(
        tx,
        id,
        row.status,
        CollaborationStatus.REEL_UPLOADED,
        creatorUserId,
        'Collaboration reel uploaded',
      );

      return { collab, reel };
    }, { timeout: 15000 });

    await notifyCollaboration(
      row.vendorUserId,
      'collab_reel_uploaded',
      'Collaboration reel uploaded',
      `${result.collab.creator.fullName || result.collab.creator.username} uploaded your collaboration reel.`,
      id,
      { reelId: result.reel.id },
    );

    return maskCollaboration(result.collab, creatorUserId, 'creator');
  },

  async approveReel(id: string, vendorUserId: string) {
    const row = await getCollaborationOrThrow(id);
    if (row.vendorUserId !== vendorUserId) throw new ApiError(403, 'Only the vendor can approve the reel.');
    if (row.status !== CollaborationStatus.REEL_UPLOADED) {
      throw new ApiError(400, 'No reel pending approval.');
    }
    if (!row.reelId) throw new ApiError(400, 'Collaboration has no uploaded reel.');

    const updated = await prisma.$transaction(async (tx) => {
      const marked = await tx.collaboration.updateMany({
        where: { id, status: CollaborationStatus.REEL_UPLOADED },
        data: { status: CollaborationStatus.APPROVED },
      });
      if (marked.count === 0) {
        throw new ApiError(400, 'No reel pending approval.');
      }

      await recordStatusChange(tx, id, CollaborationStatus.REEL_UPLOADED, CollaborationStatus.APPROVED, vendorUserId);

      return tx.collaboration.findUniqueOrThrow({
        where: { id },
        include: collaborationInclude,
      });
    }, { timeout: 15000 });

    await notifyCollaboration(
      row.creatorUserId,
      'collab_reel_approved',
      'Reel approved — publish to go live',
      `${row.businessName} approved your reel. Publish it to go live on PalSafar and their map profile.`,
      id,
      { reelId: row.reelId },
    );

    return maskCollaboration(updated, vendorUserId, 'vendor');
  },

  async publishReel(id: string, creatorUserId: string) {
    const row = await getCollaborationOrThrow(id);
    if (row.creatorUserId !== creatorUserId) {
      throw new ApiError(403, 'Only the creator can publish the collaboration reel.');
    }
    if (row.status !== CollaborationStatus.APPROVED) {
      throw new ApiError(400, 'The vendor must approve this reel before you can publish it.');
    }
    if (!row.reelId) throw new ApiError(400, 'Collaboration has no approved reel.');

    const updated = await prisma.$transaction(async (tx) => {
      const marked = await tx.collaboration.updateMany({
        where: { id, status: CollaborationStatus.APPROVED },
        data: {
          status: CollaborationStatus.COMPLETED,
          completedAt: new Date(),
        },
      });
      if (marked.count === 0) {
        throw new ApiError(400, 'The vendor must approve this reel before you can publish it.');
      }

      await tx.reel.update({
        where: { id: row.reelId! },
        data: { status: ReelStatus.APPROVED, vendorListingStatus: VendorListingStatus.APPROVED },
      });

      await recordStatusChange(tx, id, CollaborationStatus.APPROVED, CollaborationStatus.COMPLETED, creatorUserId);

      return tx.collaboration.findUniqueOrThrow({
        where: { id },
        include: collaborationInclude,
      });
    }, { timeout: 15000 });

    await auditService.log(AuditAction.COLLABORATION_COMPLETED, 'Collaboration', id, creatorUserId);
    await syncAnalytics(id);

    await notifyCollaboration(
      creatorUserId,
      'collab_reel_published',
      'Collaboration reel published',
      `Your reel for ${row.businessName} is live on PalSafar and their map profile.`,
      id,
      { reelId: row.reelId },
    );
    await notifyCollaboration(
      row.vendorUserId,
      'collab_completed',
      'Campaign completed',
      `${updated.creator.fullName || updated.creator.username} published the collaboration reel. It is now on your map profile.`,
      id,
      { reelId: row.reelId },
    );

    return maskCollaboration(updated, creatorUserId, 'creator');
  },

  async requestRevision(id: string, vendorUserId: string, feedback: string) {
    const row = await getCollaborationOrThrow(id);
    if (row.vendorUserId !== vendorUserId) throw new ApiError(403, 'Only the vendor can request changes.');
    if (row.status !== CollaborationStatus.REEL_UPLOADED) {
      throw new ApiError(400, 'No reel available for revision.');
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.collaborationRevision.create({
        data: {
          collaborationId: id,
          reelId: row.reelId,
          feedback,
          requestedById: vendorUserId,
        },
      });

      const collab = await tx.collaboration.update({
        where: { id },
        data: {
          status: CollaborationStatus.REVISION_REQUESTED,
          revisionFeedback: feedback,
        },
        include: collaborationInclude,
      });

      await recordStatusChange(
        tx,
        id,
        CollaborationStatus.REEL_UPLOADED,
        CollaborationStatus.REVISION_REQUESTED,
        vendorUserId,
        feedback,
      );

      return collab;
    }, { timeout: 15000 });

    await notifyCollaboration(
      row.creatorUserId,
      'collab_revision_requested',
      'Revision requested',
      `${row.businessName} requested changes to your collaboration reel.`,
      id,
      { feedback },
    );

    return maskCollaboration(updated, vendorUserId, 'vendor');
  },

  async rejectReel(id: string, vendorUserId: string, reason: string) {
    const row = await getCollaborationOrThrow(id);
    if (row.vendorUserId !== vendorUserId) throw new ApiError(403, 'Only the vendor can reject the reel.');
    if (row.status !== CollaborationStatus.REEL_UPLOADED) {
      throw new ApiError(400, 'No reel pending review.');
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Clear unique collaborationId so a new submission can link again.
      if (row.reelId) {
        await tx.reel.update({
          where: { id: row.reelId },
          data: {
            status: ReelStatus.REJECTED,
            vendorListingStatus: VendorListingStatus.REJECTED,
            collaborationId: null,
            isCollaboration: false,
          },
        });
      } else {
        await tx.reel.updateMany({
          where: { collaborationId: id },
          data: {
            status: ReelStatus.REJECTED,
            vendorListingStatus: VendorListingStatus.REJECTED,
            collaborationId: null,
            isCollaboration: false,
          },
        });
      }

      const marked = await tx.collaboration.updateMany({
        where: { id, status: CollaborationStatus.REEL_UPLOADED },
        data: {
          status: CollaborationStatus.IN_PROGRESS,
          revisionFeedback: reason,
          reelId: null,
        },
      });
      if (marked.count === 0) {
        throw new ApiError(400, 'No reel pending review.');
      }

      await recordStatusChange(
        tx,
        id,
        CollaborationStatus.REEL_UPLOADED,
        CollaborationStatus.IN_PROGRESS,
        vendorUserId,
        reason,
      );

      return tx.collaboration.findUniqueOrThrow({
        where: { id },
        include: collaborationInclude,
      });
    });

    await notifyCollaboration(
      row.creatorUserId,
      'collab_reel_rejected',
      'Reel rejected',
      `${row.businessName} rejected the uploaded reel. Please upload a new version.`,
      id,
      { reason },
    );

    return maskCollaboration(updated, vendorUserId, 'vendor');
  },

  async listActiveForCreatorUpload(creatorUserId: string) {
    const creator = await getCreatorForUser(creatorUserId);
    const rows = await prisma.collaboration.findMany({
      where: {
        creatorId: creator.id,
        deletedAt: null,
        status: {
          in: [
            CollaborationStatus.ACCEPTED,
            CollaborationStatus.IN_PROGRESS,
            CollaborationStatus.REVISION_REQUESTED,
          ],
        },
      },
      include: collaborationInclude,
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((r) => maskCollaboration(r, creatorUserId, 'creator'));
  },

  async adminList(query: ListCollaborationsQuery & { vendorId?: string; creatorId?: string }) {
    await expireStalePending();
    const pagination = getPaginationParams(query, 50);

    const where: Prisma.CollaborationWhereInput = { deletedAt: null };
    if (query.status) where.status = query.status as CollaborationStatus;
    if (query.vendorId) where.vendorId = query.vendorId;
    if (query.creatorId) where.creatorId = query.creatorId;
    if (query.search) {
      where.OR = [
        { campaignTitle: { contains: query.search, mode: 'insensitive' } },
        { businessName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.CollaborationOrderByWithRelationInput = {
      [query.sortBy || 'createdAt']: query.sortOrder || 'desc',
    };

    const [rows, total] = await Promise.all([
      prisma.collaboration.findMany({
        where,
        include: collaborationInclude,
        orderBy,
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.collaboration.count({ where }),
    ]);

    return paginatedResponse(
      rows.map((r) => maskCollaboration(r, '', 'admin')),
      total,
      pagination,
    );
  },

  async adminSuspend(id: string, adminId: string, reason: string, disputeNotes?: string) {
    const row = await getCollaborationOrThrow(id);
    const updated = await prisma.$transaction(async (tx) => {
      const collab = await tx.collaboration.update({
        where: { id },
        data: {
          status: CollaborationStatus.SUSPENDED,
          suspendedAt: new Date(),
          suspendedById: adminId,
          suspendReason: reason,
          disputeNotes,
        },
        include: collaborationInclude,
      });
      await recordStatusChange(tx, id, row.status, CollaborationStatus.SUSPENDED, adminId, reason);
      return collab;
    }, { timeout: 15000 });

    await auditService.log(AuditAction.COLLABORATION_SUSPENDED, 'Collaboration', id, adminId, null, { reason });

    await notifyCollaboration(row.vendorUserId, 'collab_suspended', 'Collaboration suspended', reason, id);
    await notifyCollaboration(row.creatorUserId, 'collab_suspended', 'Collaboration suspended', reason, id);

    return maskCollaboration(updated, adminId, 'admin');
  },

  async adminResolveDispute(id: string, adminId: string, disputeNotes: string, status?: CollaborationStatus) {
    const row = await getCollaborationOrThrow(id);
    const nextStatus = status || CollaborationStatus.COMPLETED;

    const updated = await prisma.$transaction(async (tx) => {
      const collab = await tx.collaboration.update({
        where: { id },
        data: {
          status: nextStatus,
          disputeNotes,
          completedAt: nextStatus === CollaborationStatus.COMPLETED ? new Date() : undefined,
          suspendedAt: null,
        },
        include: collaborationInclude,
      });
      await recordStatusChange(tx, id, row.status, nextStatus, adminId, disputeNotes);
      return collab;
    }, { timeout: 15000 });

    return maskCollaboration(updated, adminId, 'admin');
  },

  async adminAnalyticsSummary() {
    const [total, active, completed, totalBudget, topCreators, topVendors] = await Promise.all([
      prisma.collaboration.count({ where: { deletedAt: null } }),
      prisma.collaboration.count({
        where: {
          deletedAt: null,
          status: {
            in: [
              CollaborationStatus.ACCEPTED,
              CollaborationStatus.IN_PROGRESS,
              CollaborationStatus.REEL_UPLOADED,
              CollaborationStatus.REVISION_REQUESTED,
            ],
          },
        },
      }),
      prisma.collaboration.count({
        where: { deletedAt: null, status: CollaborationStatus.COMPLETED },
      }),
      prisma.collaboration.aggregate({
        where: { deletedAt: null },
        _sum: { budgetPaise: true },
      }),
      prisma.collaboration.groupBy({
        by: ['creatorId'],
        where: { deletedAt: null, status: CollaborationStatus.COMPLETED },
        _count: { id: true },
        _sum: { budgetPaise: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      prisma.collaboration.groupBy({
        by: ['vendorId'],
        where: { deletedAt: null },
        _count: { id: true },
        _sum: { budgetPaise: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
    ]);

    return {
      total,
      active,
      completed,
      totalBudgetPaise: totalBudget._sum.budgetPaise ?? 0,
      topCreators,
      topVendors,
    };
  },

  async canVendorCollaborate(vendorUserId: string, creatorProfileId: string) {
    try {
      const vendor = await getVendorForUser(vendorUserId);
      try {
        await planEnforcementService.assertVendorCanCollaborate(vendorUserId);
      } catch (err) {
        if (err instanceof ApiError && err.code === ErrorCodes.PLAN_LIMIT_REACHED) {
          return { allowed: false, reason: err.message, needsSubscription: true };
        }
        throw err;
      }
      const creator = await getCreatorProfileById(creatorProfileId);
      if (creator.userId === vendorUserId) {
        return { allowed: false, reason: 'Cannot collaborate with your own account.' };
      }
      const duplicate = await prisma.collaboration.findFirst({
        where: {
          vendorId: vendor.id,
          creatorId: creator.id,
          status: { in: DUPLICATE_BLOCK_STATUSES },
          deletedAt: null,
        },
      });
      if (duplicate) {
        return { allowed: false, reason: 'Active collaboration already exists.', collaborationId: duplicate.id };
      }
      return { allowed: true, vendorActive: true };
    } catch (err) {
      if (err instanceof ApiError) {
        return {
          allowed: false,
          reason: err.message,
          needsSubscription: err.code === ErrorCodes.PLAN_LIMIT_REACHED,
        };
      }
      throw err;
    }
  },
};
