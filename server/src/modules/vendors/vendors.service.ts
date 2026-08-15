import { AuditAction, Role, RoleAssignmentStatus, VendorStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../shared/utils/ApiError';
import { auditService } from '../audit/audit.service';
import { eventBus, AppEvents } from '../../config/events';
import crypto from 'crypto';
import type { RegisterVendorInput, UpdateVendorInput, AdminUpdateVendorInput, CreateOfferInput, UpdateOfferInput, CreateVendorReelInput, ApproveOfferInput, RejectOfferInput, AdminFeatureOfferInput, AdminModerateOfferInput, VendorReviewInput } from './vendors.validation';
import { getPaginationParams, paginatedResponse } from '../../shared/utils/pagination';
import { mapVendorStatusToRoleStatus } from '../../shared/utils/specialtyRoles';
import { roleTransitionService } from '../../shared/services/roleTransition.service';
import { notificationService } from '../notifications/notification.service';
import { planEnforcementService } from '../monetization/plan-enforcement.service';
import { entitlementsService } from '../monetization/entitlements.service';
import {
  getPublicVendorListingWhere,
  getPublicVendorMapWhere,
  isPublicVendorListingVisible,
  deriveVendorListingStatus,
} from './vendor-public-visibility';
import {
  listTaggedCreatorReelsForViewer,
  listPendingTaggedCreatorReels,
  reviewTaggedCreatorReel,
} from './vendor-tagged-reels';
import { walletService } from '../wallet/wallet.service';
import { pointRulesService } from '../point-rules/pointRules.service';
import { logger } from '../../config/logger';
import {
  filterEligiblePublicOffers,
  parseValidTillEnd,
  publicVendorOffersWhere,
  isOfferWithinActiveWindow,
  hasOfferRedemptionsRemaining,
} from '../rewards/offer-eligibility';

function filterLivePublicOffers<
  T extends {
    validTill?: string | null;
    startDate?: Date | string | null;
    isActive?: boolean;
    isApproved?: boolean;
    maxRedemptions?: number | null;
    currentRedemptions?: number | null;
    discountType?: string;
    discountValue?: number;
  },
>(offers: T[]): T[] {
  const now = new Date();
  return offers.filter((o) => {
    if (o.isActive === false || o.isApproved === false) return false;
    if (!isOfferWithinActiveWindow(o as any, now)) return false;
    if (
      o.maxRedemptions != null &&
      o.currentRedemptions != null &&
      !hasOfferRedemptionsRemaining(o as any)
    ) {
      return false;
    }
    return true;
  });
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Public listing select — never expose vendorCode, owner email, or KYC docs. */
const publicVendorSelect = {
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
  status: true,
  services: true,
  showOnMap: true,
  showContact: true,
  showWebsite: true,
  showImages: true,
  showOffers: true,
  showReels: true,
  showNavigation: true,
  rating: true,
  reviewCount: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, name: true } },
} as const;

function formatOfferBadge(offer: { discountType: string; discountValue: number }): string {
  const t = String(offer.discountType || '').toLowerCase();
  const v = Number(offer.discountValue ?? 0);
  if (t === 'percentage' || t === 'percent') return `${Math.round(v)}% OFF`;
  if (t === 'flat' || t === 'fixed') return `₹${Math.round(v)} OFF`;
  return v > 0 ? `${Math.round(v)}% OFF` : 'OFFER';
}

function generateVendorCode(_businessName: string, _vendorId: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars[crypto.randomInt(0, chars.length)];
  }
  return `VND-${suffix}`;
}

async function generateUniqueVendorCode(businessName: string, vendorId: string): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateVendorCode(businessName, vendorId);
    const clash = await prisma.vendor.findUnique({ where: { vendorCode: code }, select: { id: true } });
    if (!clash) return code;
  }
  return `VND-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

const vendorSelect = {
  id: true,
  userId: true,
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
  vendorCodeResetCount: true,
  lastVendorCodeResetAt: true,
  linkedSpotIds: true,
  services: true,
  showOnMap: true,
  showContact: true,
  showWebsite: true,
  showImages: true,
  showOffers: true,
  showReels: true,
  showNavigation: true,
  rating: true,
  reviewCount: true,
  subscriptionStatus: true,
  suspendedAt: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, name: true, email: true } },
};

function bucketRedemptions(
  rows: Array<{ createdAt: Date; pointsSpent?: number; discountValue?: number }>,
  granularity: 'daily' | 'weekly' | 'monthly',
) {
  const buckets = new Map<string, { count: number; points: number; revenue: number }>();
  for (const row of rows) {
    const d = row.createdAt;
    let key: string;
    if (granularity === 'weekly') {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d);
      monday.setDate(diff);
      key = monday.toISOString().slice(0, 10);
    } else if (granularity === 'monthly') {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    } else {
      key = d.toISOString().slice(0, 10);
    }
    const cur = buckets.get(key) || { count: 0, points: 0, revenue: 0 };
    cur.count += 1;
    cur.points += row.pointsSpent || 0;
    cur.revenue += row.discountValue || 0;
    buckets.set(key, cur);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, count: v.count, points: v.points, revenue: v.revenue }));
}

export const vendorsService = {
  async register(input: RegisterVendorInput, userId: string) {
    const retireReason = 'Your Content Creator role was retired because you switched to Vendor.';
    const RESUBMITTABLE_STATUSES: VendorStatus[] = [
      VendorStatus.REJECTED,
      VendorStatus.CHANGES_REQUESTED,
      VendorStatus.RETIRED,
    ];

    const resolvedType = input.businessType || (input.category as typeof input.businessType | undefined);
    if (!resolvedType) {
      throw new ApiError(400, 'businessType or category is required');
    }

    const vendorData = {
      businessName: input.businessName,
      businessType: resolvedType,
      phone: input.phone,
      address: input.address,
      city: input.city,
      state: input.state,
      latitude: input.latitude,
      longitude: input.longitude,
      description: input.description,
      imageUrl: input.imageUrl,
      website: input.website,
      operatingHours: input.operatingHours || (input as any).openingHours,
      images: input.images,
      gstNumber: input.gstNumber,
      documents: input.documents,
      linkedSpotIds: input.linkedSpotIds,
      services: input.services || undefined,
      showOnMap: input.showOnMap,
      showContact: input.showContact,
      showWebsite: input.showWebsite,
      showImages: input.showImages,
      showOffers: input.showOffers,
      showReels: input.showReels,
      showNavigation: input.showNavigation,
    };

    const result = await prisma.$transaction(async (tx) => {
      const { isSwitch, otherRole } = await roleTransitionService.assertCanApply(
        userId,
        Role.VENDOR,
        input.confirmSwitch,
        tx,
      );

      const existing = await tx.vendor.findUnique({ where: { userId } });
      if (existing && !RESUBMITTABLE_STATUSES.includes(existing.status)) {
        // Vendor row exists in a live state (e.g. PAUSED) that isn't ours to resubmit — no-op
        // BEFORE retiring anything, so a blocked application never costs the user their other role.
        return { vendor: existing, created: false, resubmitted: false, retiredOther: false, otherRole };
      }

      if (isSwitch) {
        await roleTransitionService.retireRole(userId, otherRole, userId, retireReason, tx);
      }

      let vendor;
      let created = false;
      let resubmitted = false;

      if (existing) {
        const vendorCode = existing.vendorCode || await generateUniqueVendorCode(input.businessName, existing.id);
        vendor = await tx.vendor.update({
          select: vendorSelect,
          where: { userId },
          data: {
            ...vendorData,
            businessType: (input.businessType || (input as any).category || existing.businessType) as any,
            status: VendorStatus.PENDING,
            rejectionReason: null,
            reviewedById: null,
            reviewedAt: null,
            vendorCode: existing.vendorCode ? undefined : vendorCode,
          },
        });
        resubmitted = true;
      } else {
        const vendorCode = await generateUniqueVendorCode(input.businessName, 'new');
        vendor = await tx.vendor.create({
          select: vendorSelect,
          data: { userId, ...vendorData, vendorCode },
        });
        created = true;
      }

      // Same transaction client so the audit trail commits (or rolls back) with the application.
      await tx.auditLog.create({
        data: {
          action: AuditAction.VENDOR_REGISTERED,
          entityType: 'Vendor',
          entityId: vendor.id,
          actorId: userId,
          previous: existing ? { status: existing.status } : undefined,
          newValues: input as any,
        },
      });

      await roleTransitionService.finalizeApplication(userId, Role.VENDOR, tx);

      return { vendor, created, resubmitted, retiredOther: isSwitch, otherRole };
    }, { maxWait: 10_000, timeout: 20_000 });

    if (result.retiredOther) {
      roleTransitionService.notifyRetirement(userId, result.otherRole, retireReason);
    }

    return { vendor: result.vendor, created: result.created, resubmitted: result.resubmitted };
  },

  async getMyVendor(userId: string) {
    let vendor = await prisma.vendor.findUnique({
      where: { userId },
      select: {
        ...vendorSelect,
        offers: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    // Backfill business code for vendors approved before codes existed.
    if (vendor && vendor.status === 'APPROVED' && !vendor.vendorCode) {
      const vendorCode = await generateUniqueVendorCode(vendor.businessName, vendor.id);
      vendor = await prisma.vendor.update({
        where: { id: vendor.id },
        data: { vendorCode },
        select: {
          ...vendorSelect,
          offers: {
            where: { isActive: true },
            orderBy: { createdAt: 'desc' },
          },
        },
      });
    }

    return vendor;
  },

  async getListingPreview(userId: string) {
    const vendor = await this.getMyVendor(userId);
    if (!vendor) throw new ApiError(404, 'Vendor not found');

    const entitlements = await entitlementsService.getForUser(userId);
    const listing = entitlements.vendorListing;
    const live = Boolean(entitlements.vendorListing?.visible);
    const reels = await prisma.vendorReel.findMany({
      where: { vendorId: vendor.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const offers = (vendor.offers || []).filter((o: { isActive?: boolean }) => o.isActive);

    return {
      preview: true,
      isLive: live,
      listingStatus: listing?.status ?? deriveVendorListingStatus({
        vendorStatus: vendor.status,
        subscriptionStatus: vendor.subscriptionStatus,
      }),
      mapPointer: live ? 'Live' : 'Preview',
      banner: live
        ? null
        : {
            title: 'Your listing is not live yet.',
            body: 'Subscribe to a vendor plan to appear on the PalSafar map.',
          },
      vendor: {
        id: vendor.id,
        businessName: vendor.businessName,
        businessType: vendor.businessType,
        description: vendor.description,
        address: vendor.address,
        city: vendor.city,
        state: vendor.state,
        latitude: vendor.latitude,
        longitude: vendor.longitude,
        imageUrl: vendor.imageUrl,
        website: vendor.showWebsite ? vendor.website : null,
        operatingHours: vendor.operatingHours,
        images: vendor.showImages ? vendor.images : [],
        phone: vendor.showContact ? vendor.phone : null,
        rating: vendor.rating,
        reviewCount: vendor.reviewCount,
        showOffers: vendor.showOffers,
        showReels: vendor.showReels,
        showOnMap: vendor.showOnMap,
      },
      offers: vendor.showOffers ? offers : [],
      reels: vendor.showReels ? reels : [],
    };
  },

  async updateMyVendor(userId: string, input: UpdateVendorInput) {
    const vendor = await prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) throw new ApiError(404, 'Vendor not found');

    // Security: if approved vendor changes coordinates, reset to PENDING
    const coordsChanged =
      vendor.status === 'APPROVED' &&
      ((input.latitude !== undefined && input.latitude !== vendor.latitude) ||
       (input.longitude !== undefined && input.longitude !== vendor.longitude));

    const data: any = { ...input };
    if (coordsChanged) {
      data.status = 'PENDING';
      data.reviewedAt = null;
      data.reviewedById = null;
    }

    if (coordsChanged) {
      return prisma.$transaction(async (tx) => {
        const updated = await tx.vendor.update({
          select: vendorSelect,
          where: { userId },
          data,
        });
        await roleTransitionService.applyVerificationOutcome({
          userId,
          role: Role.VENDOR,
          status: RoleAssignmentStatus.PENDING,
          tx,
        });
        return updated;
      });
    }

    return prisma.vendor.update({
      select: vendorSelect,
      where: { userId },
      data,
    });
  },

  async listByType(businessType: string, query: { city?: string; state?: string; page?: string; limit?: string; search?: string }) {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
    const skip = (page - 1) * limit;
    const where: any = { businessType, ...getPublicVendorListingWhere() };

    if (query.city) where.city = { contains: query.city, mode: 'insensitive' };
    if (query.state) where.state = { contains: query.state, mode: 'insensitive' };
    if (query.search) {
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { businessName: { contains: query.search, mode: 'insensitive' } },
            { description: { contains: query.search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.vendor.findMany({
        select: publicVendorSelect,
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.vendor.count({ where }),
    ]);

    // Honor showContact: strip phone when vendor hides contact on public type lists.
    const sanitized = data.map((v) => ({
      ...v,
      phone: v.showContact ? v.phone : null,
      website: v.showWebsite ? v.website : null,
      images: v.showImages ? v.images : [],
    }));

    return {
      data: sanitized,
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  },

  async list(query: { status?: string; page?: string; limit?: string; search?: string }) {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
    const skip = (page - 1) * limit;
    const where: any = {};

    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { businessName: { contains: query.search, mode: 'insensitive' } },
        { city: { contains: query.search, mode: 'insensitive' } },
        { state: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.vendor.findMany({
        select: vendorSelect,
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.vendor.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  },

  async getById(id: string) {
    const vendor = await prisma.vendor.findUnique({
      where: { id },
      select: {
        ...vendorSelect,
        offers: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
        },
        reels: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!vendor) throw new ApiError(404, 'Vendor not found');
    return vendor;
  },

  async adminGetVendorDetail(id: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const now = Date.now();

    const vendor = await prisma.vendor.findUnique({
      where: { id },
      select: {
        ...vendorSelect,
        documents: true,
        vendorDocuments: { orderBy: { createdAt: 'desc' } },
        offers: { orderBy: { createdAt: 'desc' } },
        vendorReviews: {
          take: 20,
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { id: true, name: true } } },
        },
        user: { select: { id: true, name: true, email: true, createdAt: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
    });
    if (!vendor) throw new ApiError(404, 'Vendor not found');

    const [redemptions, todayRedemptions, auditLogs, subscription, verifiedAgg] = await Promise.all([
      prisma.redemption.findMany({
        where: { vendorId: id },
        include: {
          offer: { select: { title: true } },
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.redemption.findMany({
        where: { vendorId: id, status: 'VERIFIED', createdAt: { gte: today } },
        select: { pointsSpent: true, discountValue: true, discountType: true },
      }),
      prisma.auditLog.findMany({
        where: { entityType: 'Vendor', entityId: id },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { actor: { select: { id: true, name: true } } },
      }),
      prisma.userSubscription.findFirst({
        where: { userId: vendor.user.id, audience: 'VENDOR' },
        include: { plan: { select: { id: true, name: true, slug: true, audience: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.redemption.aggregate({
        where: { vendorId: id, status: 'VERIFIED' },
        _sum: { pointsSpent: true, discountValue: true },
        _count: { id: true },
      }),
    ]);

    const uniqueCustomers = await prisma.redemption.groupBy({
      by: ['userId'],
      where: { vendorId: id, status: 'VERIFIED', userId: { not: null } },
    });

    const offers = vendor.offers || [];
    const activeOffers = offers.filter((o) => o.isActive && o.isApproved);
    const pausedOffers = offers.filter((o) => !o.isActive && o.isApproved);
    const expiredOffers = offers.filter((o) => {
      if (!o.validTill) return false;
      const end = new Date(o.validTill);
      return !Number.isNaN(end.getTime()) && end.getTime() < now;
    });

    const todayRevenue = todayRedemptions.reduce((sum, r) => sum + (r.discountValue || 0), 0);
    const totalRevenue = verifiedAgg._sum.discountValue || 0;
    const totalPoints = verifiedAgg._sum.pointsSpent || 0;

    const analytics30d = await this.getAnalytics(id, '30d');
    const listing = await entitlementsService.getForUser(vendor.user.id).then((e) => e.vendorListing);

    return {
      vendor,
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            plan: subscription.plan,
            currentPeriodEnd: subscription.currentPeriodEnd,
          }
        : { status: vendor.subscriptionStatus, plan: null },
      listing: listing ?? {
        status: deriveVendorListingStatus({
          vendorStatus: vendor.status,
          subscriptionStatus: vendor.subscriptionStatus,
          suspendedAt: vendor.suspendedAt,
        }),
        visible: isPublicVendorListingVisible(vendor),
        mapListing: isPublicVendorListingVisible(vendor) ? 'Active' : 'Hidden',
      },
      stats: {
        totalOffers: offers.length,
        activeOffers: activeOffers.length,
        pausedOffers: pausedOffers.length,
        expiredOffers: expiredOffers.length,
        totalRedemptions: verifiedAgg._count.id,
        todayRedemptions: todayRedemptions.length,
        todayRevenue,
        totalRevenue,
        totalPalPointsUsed: totalPoints,
        uniqueCustomers: uniqueCustomers.length,
      },
      analytics: analytics30d,
      redemptions,
      auditLogs,
    };
  },

  // ── Public endpoints for mobile app ──

  async listNearbyApproved(query?: { lat?: number; lng?: number; radiusKm?: number }) {
    const vendors = await prisma.vendor.findMany({
      where: getPublicVendorMapWhere(),
      select: {
        id: true,
        businessName: true,
        businessType: true,
        latitude: true,
        longitude: true,
        city: true,
        state: true,
        imageUrl: true,
        description: true,
        showContact: true,
        showWebsite: true,
        showImages: true,
        showOffers: true,
        showReels: true,
        showNavigation: true,
      },
    });

    const lat = query?.lat;
    const lng = query?.lng;
    const radiusKm = query?.radiusKm && query.radiusKm > 0 ? query.radiusKm : 50;
    if (
      typeof lat !== 'number' ||
      !Number.isFinite(lat) ||
      typeof lng !== 'number' ||
      !Number.isFinite(lng)
    ) {
      // Nearby must not dump the statewide vendor list when GPS is missing.
      return [];
    }

    return vendors
      .map((v) => ({
        ...v,
        distanceKm: haversineKm(lat, lng, v.latitude!, v.longitude!),
      }))
      .filter((v) => v.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  },

  async listApprovedForMap(search?: string) {
    const q = String(search || '').trim();
    const vendors = await prisma.vendor.findMany({
      where: {
        ...getPublicVendorMapWhere(),
        ...(q
          ? {
              AND: [
                {
                  OR: [
                    { businessName: { contains: q, mode: 'insensitive' } },
                    { city: { contains: q, mode: 'insensitive' } },
                    { address: { contains: q, mode: 'insensitive' } },
                    { state: { contains: q, mode: 'insensitive' } },
                  ],
                },
              ],
            }
          : {}),
      },
      take: q ? 10 : undefined,
      select: {
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
        showOnMap: true,
        showContact: true,
        showWebsite: true,
        showImages: true,
        showOffers: true,
        showReels: true,
        showNavigation: true,
        linkedSpotIds: true,
        rating: true,
        reviewCount: true,
        user: { select: { id: true, name: true } },
        offers: {
          where: {
            isActive: true,
            isApproved: true,
            pausedAt: null,
          },
          orderBy: { discountValue: 'desc' },
          take: 5,
          select: {
            id: true,
            title: true,
            discountType: true,
            discountValue: true,
            validTill: true,
            startDate: true,
            maxRedemptions: true,
            currentRedemptions: true,
            imageUrl: true,
            banner: true,
          },
        },
      },
    });
    return vendors.map(v => {
      const liveOffers = filterLivePublicOffers((v as any).offers || []);
      const top = liveOffers[0];
      return {
        ...v,
        offers: liveOffers,
        topOfferBadge:
          top && top.discountType != null && top.discountValue != null
            ? formatOfferBadge({ discountType: top.discountType, discountValue: top.discountValue })
            : null,
      };
    });
  },

  /**
   * Creator reel location picker: approved vendors with a live subscription.
   * Coordinates are optional. Name matching is case-insensitive.
   */
  async searchSubscribedVendorsForLocation(search: string, limit = 12) {
    const q = String(search || '').trim();
    if (!q) return [];
    const take = Math.min(Math.max(limit, 1), 25);
    const vendors = await prisma.vendor.findMany({
      where: {
        ...getPublicVendorListingWhere(),
        AND: [
          {
            OR: [
              { businessName: { contains: q, mode: 'insensitive' } },
              { city: { contains: q, mode: 'insensitive' } },
              { address: { contains: q, mode: 'insensitive' } },
              { state: { contains: q, mode: 'insensitive' } },
              { businessType: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
            ],
          },
        ],
      },
      take,
      select: {
        id: true,
        businessName: true,
        businessType: true,
        address: true,
        city: true,
        state: true,
        latitude: true,
        longitude: true,
        imageUrl: true,
        description: true,
      },
    });
    const needle = q.toLowerCase();
    const score = (name: string) => {
      const n = name.toLowerCase();
      if (n === needle) return 3;
      if (n.startsWith(needle)) return 2;
      if (n.includes(needle)) return 1;
      return 0;
    };
    return [...vendors].sort(
      (a, b) => score(b.businessName) - score(a.businessName) || a.businessName.localeCompare(b.businessName),
    );
  },

  async listForMapViewport(query: {
    north: number;
    south: number;
    east: number;
    west: number;
    category?: string;
    limit?: number;
  }) {
    const limit = Math.min(Math.max(query.limit ?? 200, 1), 300);
    const vendors = await prisma.vendor.findMany({
      where: {
        ...getPublicVendorMapWhere(),
        latitude: { not: null, gte: query.south, lte: query.north },
        longitude: { not: null, gte: query.west, lte: query.east },
        ...(query.category ? { businessType: query.category } : {}),
      },
      take: limit,
      select: {
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
        showOnMap: true,
        showContact: true,
        showWebsite: true,
        showImages: true,
        showOffers: true,
        showReels: true,
        showNavigation: true,
        linkedSpotIds: true,
        rating: true,
        reviewCount: true,
        user: { select: { id: true, name: true } },
        offers: {
          where: { isActive: true, isApproved: true, pausedAt: null },
          orderBy: { discountValue: 'desc' },
          take: 5,
          select: {
            id: true,
            title: true,
            discountType: true,
            discountValue: true,
            validTill: true,
            startDate: true,
            maxRedemptions: true,
            currentRedemptions: true,
            imageUrl: true,
            banner: true,
          },
        },
      },
    });
    return vendors.map((v) => {
      const liveOffers = filterLivePublicOffers((v as any).offers || []);
      const top = liveOffers[0];
      return {
        ...v,
        offers: liveOffers,
        topOfferBadge:
          top && top.discountType != null && top.discountValue != null
            ? formatOfferBadge({ discountType: top.discountType, discountValue: top.discountValue })
            : null,
      };
    });
  },

  async getPublicDetails(id: string) {
    const vendor = await prisma.vendor.findFirst({
      where: { id, ...getPublicVendorListingWhere() },
      select: {
        id: true,
        businessName: true,
        businessType: true,
        description: true,
        address: true,
        city: true,
        state: true,
        latitude: true,
        longitude: true,
        imageUrl: true,
        website: true,
        operatingHours: true,
        images: true,
        phone: true,
        showContact: true,
        showWebsite: true,
        showImages: true,
        showOffers: true,
        showReels: true,
        showNavigation: true,
        rating: true,
        reviewCount: true,
        offers: {
          where: {
            isActive: true,
            isApproved: true,
            pausedAt: null,
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            description: true,
            discountType: true,
            discountValue: true,
            pointsRequired: true,
            validTill: true,
            startDate: true,
            maxRedemptions: true,
            currentRedemptions: true,
            imageUrl: true,
            banner: true,
          },
        },
      },
    });
    if (!vendor) throw new ApiError(404, 'Vendor not found');

    // Redact fields the vendor chose to hide
    const result: any = { ...vendor };
    if (!vendor.showContact) { result.phone = null; }
    if (!vendor.showWebsite) { result.website = null; }
    if (!vendor.showImages) { result.images = []; }
    if (!vendor.showOffers) {
      result.offers = [];
    } else {
      result.offers = filterLivePublicOffers(vendor.offers as any[]);
    }

    return result;
  },

  async recalculateVendorRating(vendorId: string) {
    const result = await prisma.vendorReview.aggregate({
      where: { vendorId },
      _avg: { rating: true },
      _count: true,
    });
    await prisma.vendor.update({
      where: { id: vendorId },
      data: {
        rating: result._avg.rating ? Number(result._avg.rating.toFixed(1)) : null,
        reviewCount: result._count,
      },
    });
  },

  async addReview(vendorId: string, userId: string, input: VendorReviewInput) {
    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, ...getPublicVendorListingWhere() },
      select: { id: true, status: true, userId: true, businessName: true },
    });
    if (!vendor) {
      throw new ApiError(404, 'Vendor not found');
    }
    if (vendor.userId === userId) {
      throw new ApiError(400, 'You cannot review your own shop.');
    }

    const reviewUserSelect = { id: true, name: true, avatarStyle: true, avatar: true } as const;
    const existing = await prisma.vendorReview.findUnique({
      where: { vendorId_userId: { vendorId, userId } },
    });

    if (existing) {
      const review = await prisma.vendorReview.update({
        where: { id: existing.id },
        data: { rating: input.rating, content: input.content, photos: input.photos },
        include: { user: { select: reviewUserSelect } },
      });
      await this.recalculateVendorRating(vendorId);
      return { ...review, pointsAwarded: 0, updated: true };
    }

    const review = await prisma.vendorReview.create({
      data: {
        vendorId,
        userId,
        rating: input.rating,
        content: input.content,
        photos: input.photos,
      },
      include: { user: { select: reviewUserSelect } },
    });
    await this.recalculateVendorRating(vendorId);

    let pointsAwarded = 0;
    try {
      const rule = await pointRulesService.getPointsForAction('review_write');
      const points = rule?.points ?? 10;
      if (points > 0) {
        const limitReached = await pointRulesService.checkDailyLimit(userId, 'review_write');
        if (!limitReached) {
          await walletService.earn(userId, points, 'review_write', review.id, 'VENDOR_REVIEW', {
            notify: false,
          });
          pointsAwarded = points;
        }
      }
    } catch (error) {
      logger.warn({ error, reviewId: review.id, vendorId, userId }, 'Failed to award vendor review PalPoints');
    }

    const shopName = vendor.businessName || 'this shop';
    try {
      await notificationService.sendToUser(
        userId,
        pointsAwarded > 0 ? `+${pointsAwarded} PalPoints` : 'Review posted',
        pointsAwarded > 0
          ? `Thanks for reviewing ${shopName}.`
          : `Your review of ${shopName} was posted.`,
        {
          type: 'review_write',
          vendorId,
          reviewId: review.id,
          amount: pointsAwarded,
          screen: 'Wallet',
        },
        'review_write',
      );
    } catch (error) {
      logger.warn({ error, reviewId: review.id, userId }, 'Failed to send review PalPoints notification');
    }

    notificationService
      .sendToUser(
        vendor.userId,
        'New review',
        `Someone rated ${shopName} ${input.rating} stars.`,
        { type: 'vendor_review', vendorId, reviewId: review.id },
        'vendor_review',
      )
      .catch((error) => {
        logger.warn({ error, reviewId: review.id, vendorId }, 'Failed to notify vendor of new review');
      });

    return { ...review, pointsAwarded, updated: false };
  },

  async getReviews(vendorId: string, query: { page?: string; limit?: string }) {
    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, ...getPublicVendorListingWhere() },
      select: { id: true },
    });
    if (!vendor) throw new ApiError(404, 'Vendor not found');

    const pagination = getPaginationParams(query);
    const [data, total] = await Promise.all([
      prisma.vendorReview.findMany({
        where: { vendorId },
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: [{ helpfulVotes: 'desc' }, { createdAt: 'desc' }],
        include: {
          user: { select: { id: true, name: true, avatarStyle: true, avatar: true } },
        },
      }),
      prisma.vendorReview.count({ where: { vendorId } }),
    ]);

    return paginatedResponse(data, total, pagination);
  },

  async markReviewHelpful(vendorId: string, reviewId: string) {
    const review = await prisma.vendorReview.findUnique({ where: { id: reviewId, vendorId } });
    if (!review) throw new ApiError(404, 'Review not found.');
    return prisma.vendorReview.update({
      where: { id: reviewId },
      data: { helpfulVotes: { increment: 1 } },
    });
  },

  // ── Vendor Reels ──

  async listVendorReels(vendorId: string, viewerUserId?: string) {
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true, userId: true, status: true, subscriptionStatus: true, suspendedAt: true },
    });
    if (!vendor) throw new ApiError(404, 'Vendor not found');
    const isOwner = Boolean(viewerUserId && vendor.userId === viewerUserId);
    if (!isOwner) {
      const visible = await prisma.vendor.findFirst({
        where: { id: vendorId, ...getPublicVendorListingWhere() },
        select: { id: true },
      });
      if (!visible) throw new ApiError(404, 'Vendor not found');
    }
    return prisma.vendorReel.findMany({
      where: { vendorId },
      orderBy: { createdAt: 'desc' },
    });
  },

  async createVendorReel(vendorId: string, input: CreateVendorReelInput) {
    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) throw new ApiError(404, 'Vendor not found');
    if (vendor.status !== 'APPROVED') throw new ApiError(403, 'Vendor must be approved to create reels');

    const capable = await prisma.userRole.findFirst({
      where: {
        userId: vendor.userId,
        role: Role.VENDOR,
        status: { in: [RoleAssignmentStatus.APPROVED, RoleAssignmentStatus.ACTIVE] },
      },
    });
    if (!capable) {
      throw new ApiError(403, 'Vendor role is not active on this account.');
    }

    await planEnforcementService.assertVendorCanCreateReel(vendor.userId);

    return prisma.vendorReel.create({
      data: {
        vendorId,
        videoUrl: input.videoUrl,
        thumbnail: input.thumbnail,
        title: input.title,
        description: input.description,
      },
    });
  },

  async deleteVendorReel(vendorId: string, reelId: string) {
    const reel = await prisma.vendorReel.findUnique({ where: { id: reelId } });
    if (!reel) throw new ApiError(404, 'Reel not found');
    if (reel.vendorId !== vendorId) throw new ApiError(403, 'Not your reel');
    await prisma.vendorReel.delete({ where: { id: reelId } });
  },

  async listTaggedCreatorReels(vendorId: string, viewerUserId?: string) {
    return listTaggedCreatorReelsForViewer(vendorId, viewerUserId);
  },

  async listMyPendingTaggedReels(userId: string) {
    const vendor = await prisma.vendor.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!vendor) throw new ApiError(404, 'Vendor not found');
    return listPendingTaggedCreatorReels(vendor.id);
  },

  async reviewTaggedCreatorReel(userId: string, reelId: string, action: 'allow' | 'reject') {
    return reviewTaggedCreatorReel(userId, reelId, action);
  },

  async updateVendorReel(
    vendorId: string,
    reelId: string,
    input: { title?: string; description?: string; thumbnail?: string },
  ) {
    const reel = await prisma.vendorReel.findUnique({ where: { id: reelId } });
    if (!reel) throw new ApiError(404, 'Reel not found');
    if (reel.vendorId !== vendorId) throw new ApiError(403, 'Not your reel');
    return prisma.vendorReel.update({
      where: { id: reelId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.thumbnail !== undefined ? { thumbnail: input.thumbnail } : {}),
      },
    });
  },

  // ── Admin ──

  async adminUpdate(id: string, input: AdminUpdateVendorInput, adminId: string) {
    const vendor = await prisma.vendor.findUnique({ where: { id } });
    if (!vendor) throw new ApiError(404, 'Vendor not found');

    const updated = await prisma.vendor.update({
      select: vendorSelect,
      where: { id },
      data: input,
    });

    await auditService.log(
      AuditAction.VENDOR_VERIFIED,
      'Vendor',
      id,
      adminId,
      null,
      null,
      { ...input, action: 'admin_location_update' } as any,
    );
    return updated;
  },

  async verify(
    id: string,
    status: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'SUSPENDED' | 'PAUSED',
    adminId: string,
    rejectionReason?: string,
  ) {
    const vendor = await prisma.vendor.findUnique({ where: { id } });
    if (!vendor) throw new ApiError(404, 'Vendor not found');

    const vendorStatus = status as VendorStatus;
    const roleStatus = mapVendorStatusToRoleStatus(vendorStatus);

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.vendor.update({
        select: vendorSelect,
        where: { id },
        data: {
          status: vendorStatus,
          rejectionReason: status === 'APPROVED' ? null : (rejectionReason ?? vendor.rejectionReason),
          reviewedById: adminId,
          reviewedAt: new Date(),
        },
      });

      await roleTransitionService.applyVerificationOutcome({
        userId: vendor.userId,
        role: Role.VENDOR,
        status: roleStatus,
        approvedById: adminId,
        rejectedReason: status === 'APPROVED' ? null : (rejectionReason ?? null),
        tx,
      });
      return row;
    });

    if (status === 'APPROVED') {
      const vendorCode = vendor.vendorCode || await generateUniqueVendorCode(vendor.businessName, vendor.id);
      if (!vendor.vendorCode) {
        await prisma.vendor.update({
          where: { id },
          data: { vendorCode },
        });
      }
      await auditService.log(
        AuditAction.VENDOR_VERIFIED,
        'Vendor',
        id,
        adminId,
        null,
        { status: vendor.status },
        { status, vendorCode },
      );
      notificationService
        .sendToUser(
          vendor.userId,
          'Vendor Approved',
          'Your business account was approved. Switch profile to Vendor mode anytime.',
          { vendorId: id, status },
          'vendor_approved',
        )
        .catch(() => undefined);
      return { ...updated, vendorCode, status: vendorStatus };
    }

    await auditService.log(
      AuditAction.VENDOR_REJECTED,
      'Vendor',
      id,
      adminId,
      null,
      { status: vendor.status },
      { status, rejectionReason },
    );

    const titles: Record<string, string> = {
      REJECTED: 'Vendor Rejected',
      CHANGES_REQUESTED: 'Vendor Changes Requested',
      SUSPENDED: 'Vendor Suspended',
      PAUSED: 'Vendor Paused',
    };
    notificationService
      .sendToUser(
        vendor.userId,
        titles[status] || 'Vendor Update',
        rejectionReason || `Your vendor application status is now ${status}.`,
        { vendorId: id, status },
        `vendor_${status.toLowerCase()}`,
      )
      .catch(() => undefined);

    return updated;
  },

  async deleteVendor(id: string, adminId: string) {
    const vendor = await prisma.vendor.findUnique({ where: { id } });
    if (!vendor) throw new ApiError(404, 'Vendor not found');

    await prisma.$transaction(async (tx) => {
      await tx.vendor.delete({ where: { id } });
      await roleTransitionService.applyVerificationOutcome({
        userId: vendor.userId,
        role: Role.VENDOR,
        status: RoleAssignmentStatus.REJECTED,
        approvedById: adminId,
        rejectedReason: 'Deleted by admin',
        tx,
      });
      await tx.auditLog.create({
        data: {
          action: AuditAction.VENDOR_REJECTED,
          entityType: 'Vendor',
          entityId: id,
          actorId: adminId,
          previous: { status: vendor.status },
          newValues: { deleted: true },
        },
      });
    });
    return { message: 'Vendor deleted' };
  },

  async createOffer(vendorId: string, input: CreateOfferInput) {
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      include: { user: { select: { id: true, name: true } } },
    });
    if (!vendor) throw new ApiError(404, 'Vendor not found');
    if (vendor.status !== 'APPROVED') throw new ApiError(403, 'Vendor must be approved to create offers');

    await planEnforcementService.assertVendorCanCreateOffer(vendor.userId);

    const offer = await prisma.vendorOffer.create({
      data: {
        vendorId,
        title: input.title,
        description: input.description,
        banner: input.banner,
        discountType: input.discountType,
        discountValue: input.discountValue,
        pointsRequired: input.pointsRequired,
        minBillAmount: input.minBillAmount,
        couponCode: input.couponCode,
        dailyLimit: input.dailyLimit,
        validTill: input.validTill,
        startDate: input.startDate ? new Date(input.startDate) : null,
        category: input.category,
        imageUrl: input.imageUrl,
        maxRedemptions: input.maxRedemptions,
        isApproved: true,
        isActive: true,
        approvedAt: new Date(),
      },
    });

    eventBus.emit(AppEvents.OFFER_CREATED, {
      offerId: offer.id,
      vendorUserId: vendor.userId,
      vendorName: vendor.user.name || vendor.businessName,
      offerTitle: input.title,
    });

    return offer;
  },

  async updateOffer(offerId: string, vendorId: string, input: UpdateOfferInput) {
    const offer = await prisma.vendorOffer.findUnique({ where: { id: offerId } });
    if (!offer) throw new ApiError(404, 'Offer not found');
    if (offer.vendorId !== vendorId) throw new ApiError(403, 'Not your offer');

    // Vendor must not undo admin disable/moderate, flip approval, or self-feature.
    if (input.isActive === true && offer.rejectedById) {
      throw new ApiError(403, 'This offer was disabled by admin and cannot be reactivated.');
    }

    const data: Record<string, unknown> = { ...input };
    if (input.startDate !== undefined) {
      data.startDate = input.startDate ? new Date(input.startDate) : null;
    }
    if (input.isActive === true) {
      data.pausedAt = null;
    } else if (input.isActive === false && !offer.rejectedById) {
      data.pausedAt = offer.pausedAt || new Date();
    }

    return prisma.vendorOffer.update({
      where: { id: offerId },
      data,
    });
  },

  async listOffers(vendorId: string) {
    return prisma.vendorOffer.findMany({
      where: { vendorId },
      orderBy: { createdAt: 'desc' },
    });
  },

  async deleteOffer(offerId: string, vendorId: string) {
    const offer = await prisma.vendorOffer.findUnique({ where: { id: offerId } });
    if (!offer) throw new ApiError(404, 'Offer not found');
    if (offer.vendorId !== vendorId) throw new ApiError(403, 'Not your offer');
    await prisma.vendorOffer.delete({ where: { id: offerId } });
  },

  async getPublicOffers(query: { city?: string; vendorId?: string }) {
    const where: any = {
      ...publicVendorOffersWhere(),
      pausedAt: null,
    };
    if (query.vendorId) where.vendorId = query.vendorId;
    if (query.city?.trim()) {
      where.vendor = {
        ...(where.vendor || {}),
        city: { contains: query.city.trim(), mode: 'insensitive' },
      };
    }

    const rows = await prisma.vendorOffer.findMany({
      where,
      include: {
        vendor: {
          select: {
            id: true,
            businessName: true,
            city: true,
            state: true,
            imageUrl: true,
            status: true,
            subscriptionStatus: true,
            suspendedAt: true,
            latitude: true,
            longitude: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      // Over-fetch then eligibility-filter so expired/maxed newest rows do not empty the feed.
      take: 400,
    });

    return filterEligiblePublicOffers(rows).slice(0, 100);
  },

  async getOfferById(offerId: string) {
    const offer = await prisma.vendorOffer.findUnique({
      where: { id: offerId },
      include: {
        vendor: {
          select: {
            id: true,
            businessName: true,
            businessType: true,
            city: true,
            state: true,
            imageUrl: true,
            latitude: true,
            longitude: true,
            status: true,
            subscriptionStatus: true,
            suspendedAt: true,
          },
        },
      },
    });
    if (!offer) throw new ApiError(404, 'Offer not found');
    if (!filterEligiblePublicOffers([offer as any]).length) {
      throw new ApiError(404, 'Offer not found');
    }
    return offer;
  },

  async approveOffer(offerId: string, adminId: string, input: ApproveOfferInput = {}) {
    const offer = await prisma.vendorOffer.findUnique({ where: { id: offerId } });
    if (!offer) throw new ApiError(404, 'Offer not found');
    if (offer.isApproved) throw new ApiError(409, 'Offer already approved');

    const updated = await prisma.vendorOffer.update({
      where: { id: offerId },
      data: {
        isApproved: true,
        approvedById: adminId,
        approvedAt: new Date(),
        rejectionReason: null,
        rejectedById: null,
        rejectedAt: null,
        isFeatured: input.isFeatured ?? offer.isFeatured,
      },
    });

    eventBus.emit(AppEvents.OFFER_APPROVED, {
      offerId: updated.id,
      offerTitle: updated.title,
      vendorId: offer.vendorId,
    });

    return updated;
  },

  async rejectOffer(offerId: string, adminId: string, input: RejectOfferInput) {
    const offer = await prisma.vendorOffer.findUnique({ where: { id: offerId } });
    if (!offer) throw new ApiError(404, 'Offer not found');
    if (offer.isApproved) throw new ApiError(409, 'Offer already approved, cannot reject');

    const updated = await prisma.vendorOffer.update({
      where: { id: offerId },
      data: {
        isApproved: false,
        isActive: false,
        rejectionReason: input.rejectionReason,
        rejectedById: adminId,
        rejectedAt: new Date(),
        approvedById: null,
        approvedAt: null,
      },
    });

    eventBus.emit(AppEvents.OFFER_REJECTED, {
      offerId: updated.id,
      offerTitle: updated.title,
      vendorId: offer.vendorId,
      reason: input.rejectionReason,
    });

    return updated;
  },

  async adminFeatureOffer(offerId: string, adminId: string, input: AdminFeatureOfferInput) {
    const offer = await prisma.vendorOffer.findUnique({ where: { id: offerId } });
    if (!offer) throw new ApiError(404, 'Offer not found');

    return prisma.vendorOffer.update({
      where: { id: offerId },
      data: { isFeatured: input.isFeatured },
    });
  },

  async adminDisableOffer(offerId: string, adminId: string, reason?: string) {
    const offer = await prisma.vendorOffer.findUnique({ where: { id: offerId } });
    if (!offer) throw new ApiError(404, 'Offer not found');
    if (!offer.isActive) throw new ApiError(409, 'Offer is already disabled');

    const updated = await prisma.vendorOffer.update({
      where: { id: offerId },
      data: {
        isActive: false,
        pausedAt: new Date(),
        rejectionReason: reason || 'Disabled by admin',
        rejectedById: adminId,
        rejectedAt: new Date(),
      },
    });

    eventBus.emit(AppEvents.OFFER_DISABLED, {
      offerId: updated.id,
      offerTitle: updated.title,
      vendorId: offer.vendorId,
      reason: reason || 'Disabled by admin',
    });

    return updated;
  },

  async adminEnableOffer(offerId: string) {
    const offer = await prisma.vendorOffer.findUnique({ where: { id: offerId } });
    if (!offer) throw new ApiError(404, 'Offer not found');
    if (offer.isActive) throw new ApiError(409, 'Offer is already active');

    return prisma.vendorOffer.update({
      where: { id: offerId },
      data: {
        isActive: true,
        isApproved: true,
        pausedAt: null,
        rejectionReason: null,
        rejectedById: null,
        rejectedAt: null,
        approvedAt: offer.approvedAt || new Date(),
      },
    });
  },

  async adminRemoveOffer(offerId: string, _adminId: string) {
    const offer = await prisma.vendorOffer.findUnique({ where: { id: offerId } });
    if (!offer) throw new ApiError(404, 'Offer not found');

    await prisma.vendorOffer.delete({ where: { id: offerId } });
    return { id: offerId, removed: true };
  },

  async adminModerateOffer(offerId: string, adminId: string, input: AdminModerateOfferInput) {
    const offer = await prisma.vendorOffer.findUnique({ where: { id: offerId } });
    if (!offer) throw new ApiError(404, 'Offer not found');

    if (input.action === 'remove') {
      await prisma.vendorOffer.delete({ where: { id: offerId } });
      return { id: offerId, removed: true, reason: input.reason };
    }

    return prisma.vendorOffer.update({
      where: { id: offerId },
      data: {
        isActive: false,
        pausedAt: new Date(),
        rejectionReason: input.reason,
        rejectedById: adminId,
        rejectedAt: new Date(),
      },
    });
  },

  async adminListAllOffers(query: { page?: string; limit?: string; status?: string; search?: string }) {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
    const status = query.status?.toLowerCase();
    const search = query.search;

    const where: any = {};
    if (status === 'active') {
      where.isActive = true;
      where.rejectionReason = null;
    } else if (status === 'inactive' || status === 'disabled') {
      where.isActive = false;
    } else if (status === 'featured') {
      where.isFeatured = true;
      where.isActive = true;
    } else if (status === 'moderated') {
      where.rejectionReason = { not: null };
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { vendor: { businessName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.vendorOffer.findMany({
        where,
        include: {
          vendor: { select: { id: true, businessName: true, businessType: true, city: true, state: true, imageUrl: true } },
          approvedBy: { select: { id: true, name: true } },
          rejectedBy: { select: { id: true, name: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.vendorOffer.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  },

  async adminResetVendorCode(vendorId: string, adminId: string) {
    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) throw new ApiError(404, 'Vendor not found');

    const vendorCode = await generateUniqueVendorCode(vendor.businessName, vendor.id);
    const updated = await prisma.vendor.update({
      where: { id: vendorId },
      data: {
        vendorCode,
        vendorCodeResetCount: { increment: 1 },
        lastVendorCodeResetAt: new Date(),
      },
      select: vendorSelect,
    });

    await auditService.log(
      AuditAction.VENDOR_VERIFIED,
      'Vendor',
      vendorId,
      adminId,
      null,
      { vendorCode: vendor.vendorCode },
      { vendorCode, action: 'reset_vendor_code' },
    );

    eventBus.emit(AppEvents.VENDOR_CODE_RESET, {
      vendorUserId: vendor.userId,
      businessName: vendor.businessName,
      newVendorCode: vendorCode,
      resetByAdmin: true,
    });

    return updated;
  },

  async pauseOffer(offerId: string, vendorId: string) {
    const offer = await prisma.vendorOffer.findUnique({ where: { id: offerId } });
    if (!offer) throw new ApiError(404, 'Offer not found');
    if (offer.vendorId !== vendorId) throw new ApiError(403, 'Not your offer');
    if (!offer.isActive) throw new ApiError(409, 'Offer is already paused');

    return prisma.vendorOffer.update({
      where: { id: offerId },
      data: { isActive: false, pausedAt: new Date() },
    });
  },

  async resumeOffer(offerId: string, vendorId: string) {
    const offer = await prisma.vendorOffer.findUnique({ where: { id: offerId } });
    if (!offer) throw new ApiError(404, 'Offer not found');
    if (offer.vendorId !== vendorId) throw new ApiError(403, 'Not your offer');
    if (offer.isActive) throw new ApiError(409, 'Offer is already active');
    // Admin disable/moderate sets rejectedById — vendor must not undo that via resume.
    if (offer.rejectedById) {
      throw new ApiError(403, 'This offer was disabled by admin and cannot be resumed.');
    }
    const owner = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { userId: true } });
    if (!owner) throw new ApiError(404, 'Vendor not found');
    await planEnforcementService.assertVendorCanCreateOffer(owner.userId);
    return prisma.vendorOffer.update({
      where: { id: offerId },
      data: { isActive: true, pausedAt: null },
    });
  },

  async duplicateOffer(offerId: string, vendorId: string) {
    const offer = await prisma.vendorOffer.findUnique({ where: { id: offerId } });
    if (!offer) throw new ApiError(404, 'Offer not found');
    if (offer.vendorId !== vendorId) throw new ApiError(403, 'Not your offer');

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { userId: true, status: true },
    });
    if (!vendor) throw new ApiError(404, 'Vendor not found');
    if (vendor.status !== 'APPROVED') throw new ApiError(403, 'Vendor must be approved to create offers');

    await planEnforcementService.assertVendorCanCreateOffer(vendor.userId);

    return prisma.vendorOffer.create({
      data: {
        vendorId,
        title: `${offer.title} (Copy)`,
        description: offer.description,
        banner: offer.banner,
        discountType: offer.discountType,
        discountValue: offer.discountValue,
        pointsRequired: offer.pointsRequired,
        minBillAmount: offer.minBillAmount,
        couponCode: null,
        dailyLimit: offer.dailyLimit,
        validTill: offer.validTill,
        category: offer.category,
        imageUrl: offer.imageUrl,
        maxRedemptions: offer.maxRedemptions,
        isFeatured: false,
        isApproved: true,
        isActive: true,
        approvedAt: new Date(),
      },
    });
  },

  async recordOfferView(offerId: string) {
    await prisma.vendorOffer.update({
      where: { id: offerId },
      data: { viewCount: { increment: 1 } },
    }).catch(() => {});
  },

  async recordOfferClick(offerId: string) {
    await prisma.vendorOffer.update({
      where: { id: offerId },
      data: { clickCount: { increment: 1 } },
    }).catch(() => {});
  },

  // ── Dashboard & Analytics ──

  async getDashboardStats(vendorId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [vendor, offers, recentRedemptions, todayRedemptions, redemptionTotals] = await Promise.all([
      prisma.vendor.findUnique({
        where: { id: vendorId },
        select: {
          id: true, businessName: true, businessType: true, status: true, imageUrl: true,
          city: true, state: true, vendorCode: true, createdAt: true,
          rating: true, reviewCount: true, subscriptionStatus: true, suspendedAt: true, showOnMap: true, userId: true,
        },
      }),
      prisma.vendorOffer.findMany({
        where: { vendorId },
        select: {
          id: true, title: true, discountType: true, discountValue: true, pointsRequired: true,
          isApproved: true, isActive: true, rejectionReason: true, currentRedemptions: true, maxRedemptions: true,
          viewCount: true, clickCount: true, createdAt: true, validTill: true, pausedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.redemption.findMany({
        where: { vendorId },
        select: { id: true, status: true, pointsSpent: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.redemption.count({
        where: { vendorId, createdAt: { gte: today }, status: 'VERIFIED' },
      }),
      prisma.redemption.groupBy({
        by: ['status'],
        where: { vendorId },
        _count: { id: true },
        _sum: { pointsSpent: true },
      }),
    ]);

    if (!vendor) throw new ApiError(404, 'Vendor not found');

    const totalRedemptions = redemptionTotals.reduce((sum, row) => sum + row._count.id, 0);
    const verifiedAgg = redemptionTotals.find((r) => r.status === 'VERIFIED');
    const verifiedRedemptionsCount = verifiedAgg?._count.id || 0;
    const totalPointsRedeemed = verifiedAgg?._sum.pointsSpent || 0;
    const totalOffers = offers.length;
    const activeOffers = offers.filter(o => o.isActive && o.isApproved);
    const pausedOffers = offers.filter(o => !o.isActive && o.isApproved && !o.rejectionReason);
    const now = Date.now();
    const expiredOffers = offers.filter(o => {
      if (!o.validTill) return false;
      const end = parseValidTillEnd(o.validTill);
      return end != null && end.getTime() < now;
    });
    const pendingOffers = offers.filter(o => !o.isApproved && !o.rejectionReason);
    const totalViews = offers.reduce((sum, o) => sum + o.viewCount, 0);
    const totalClicks = offers.reduce((sum, o) => sum + o.clickCount, 0);

    const todayRedemptionRows = await prisma.redemption.findMany({
      where: { vendorId, createdAt: { gte: today }, status: 'VERIFIED' },
      select: { discountValue: true, pointsSpent: true },
    });
    const todayRevenue = todayRedemptionRows.reduce((sum, r) => sum + (r.discountValue || 0), 0);
    const todayPalPoints = todayRedemptionRows.reduce((sum, r) => sum + r.pointsSpent, 0);

    const listing = vendor.userId
      ? await entitlementsService.getForUser(vendor.userId).then((e) => e.vendorListing).catch(() => null)
      : null;
    const reelCount = await prisma.vendorReel.count({ where: { vendorId } }).catch(() => 0);
    const pendingTaggedReels = await listPendingTaggedCreatorReels(vendorId);

    return {
      vendor,
      listing: listing ?? {
        status: deriveVendorListingStatus({
          vendorStatus: vendor.status,
          subscriptionStatus: vendor.subscriptionStatus,
          suspendedAt: vendor.suspendedAt,
        }),
        visible: isPublicVendorListingVisible(vendor),
        mapListing: isPublicVendorListingVisible(vendor) ? 'Active' : 'Hidden',
      },
      stats: {
        totalOffers,
        activeOffers: activeOffers.length,
        pausedOffers: pausedOffers.length,
        expiredOffers: expiredOffers.length,
        pendingApproval: pendingOffers.length,
        totalRedemptions,
        verifiedRedemptions: verifiedRedemptionsCount,
        todayRedemptions,
        todayRevenue,
        todayPalPoints,
        totalPointsRedeemed,
        totalViews,
        totalClicks,
        conversionRate: totalViews > 0 ? Math.round((totalClicks / totalViews) * 100) : 0,
        reelCount,
        pendingTaggedReelCount: pendingTaggedReels.length,
      },
      offers,
      recentRedemptions: recentRedemptions.slice(0, 10),
      pendingTaggedReels,
    };
  },

  async getOfferAnalytics(offerId: string, vendorId: string, period: '7d' | '30d' | '90d' = '30d', granularity: 'daily' | 'weekly' | 'monthly' = 'daily') {
    const offer = await prisma.vendorOffer.findUnique({ where: { id: offerId } });
    if (!offer) throw new ApiError(404, 'Offer not found');
    if (offer.vendorId !== vendorId) throw new ApiError(403, 'Not your offer');
    return this.buildOfferAnalytics(offer, period, granularity);
  },

  async adminGetOfferAnalytics(offerId: string, period: '7d' | '30d' | '90d' = '30d', granularity: 'daily' | 'weekly' | 'monthly' = 'daily') {
    const offer = await prisma.vendorOffer.findUnique({ where: { id: offerId } });
    if (!offer) throw new ApiError(404, 'Offer not found');
    return this.buildOfferAnalytics(offer, period, granularity);
  },

  async buildOfferAnalytics(
    offer: {
      id: string; title: string; discountType: string; discountValue: number; pointsRequired: number;
      isApproved: boolean; isActive: boolean; currentRedemptions: number; maxRedemptions: number | null;
      viewCount: number; clickCount: number; validTill: string | null; startDate: Date | null; createdAt: Date;
      rejectedById?: string | null; rejectionReason?: string | null;
    },
    period: '7d' | '30d' | '90d',
    granularity: 'daily' | 'weekly' | 'monthly',
  ) {
    const days = period === '90d' ? 90 : period === '30d' ? 30 : 7;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const redemptions = await prisma.redemption.findMany({
      where: { offerId: offer.id, createdAt: { gte: since } },
      select: { status: true, pointsSpent: true, discountValue: true, createdAt: true, userId: true },
      orderBy: { createdAt: 'desc' },
    });

    const verified = redemptions.filter((r) => r.status === 'VERIFIED');
    const uniqueCustomers = new Set(verified.map((r) => r.userId).filter(Boolean)).size;
    const palPointsUsed = verified.reduce((s, r) => s + r.pointsSpent, 0);
    const revenue = verified.reduce((s, r) => s + r.discountValue, 0);
    const conversionRate = offer.viewCount > 0
      ? Math.round((verified.length / offer.viewCount) * 10000) / 100
      : 0;
    const clickConversionRate = offer.clickCount > 0
      ? Math.round((verified.length / offer.clickCount) * 10000) / 100
      : 0;

    let status = 'ACTIVE';
    if (offer.rejectedById || (offer.rejectionReason && !offer.isActive)) status = 'DISABLED';
    else if (!offer.isActive) status = 'PAUSED';
    else if (offer.validTill) {
      const end = parseValidTillEnd(offer.validTill);
      if (end && end.getTime() < Date.now()) status = 'EXPIRED';
    }

    return {
      period,
      granularity,
      offer: {
        id: offer.id,
        title: offer.title,
        discountType: offer.discountType,
        discountValue: offer.discountValue,
        pointsRequired: offer.pointsRequired,
        isApproved: offer.isApproved,
        isActive: offer.isActive,
        status,
        expiry: offer.validTill,
        startDate: offer.startDate,
        currentRedemptions: offer.currentRedemptions,
        maxRedemptions: offer.maxRedemptions,
        viewCount: offer.viewCount,
        clickCount: offer.clickCount,
        createdAt: offer.createdAt,
      },
      metrics: {
        views: offer.viewCount,
        clicks: offer.clickCount,
        redemptions: verified.length,
        conversionRate,
        clickConversionRate,
        uniqueCustomers,
        palPointsUsed,
        revenue,
      },
      trend: bucketRedemptions(verified, granularity),
    };
  },

  async getAnalytics(vendorId: string, period: '7d' | '30d' | '90d' = '7d') {
    const days = period === '90d' ? 90 : period === '30d' ? 30 : 7;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const empty = {
      period,
      overview: {
        totalViews: 0,
        totalClicks: 0,
        totalRedemptions: 0,
        verifiedRedemptions: 0,
        totalPointsRedeemed: 0,
        revenueImpact: 0,
        uniqueCustomers: 0,
      },
      popularOffers: [] as Array<{ id: string; title: string; views: number; clicks: number; redemptions: number }>,
      dailyTrend: [] as Array<{ date: string; count: number; points: number }>,
    };

    try {
      const [offers, redemptions] = await Promise.all([
        prisma.vendorOffer.findMany({
          where: { vendorId },
          select: { id: true, title: true, viewCount: true, clickCount: true, currentRedemptions: true, discountValue: true },
        }),
        prisma.redemption.findMany({
          where: { vendorId, createdAt: { gte: since } },
          select: { id: true, status: true, pointsSpent: true, discountValue: true, createdAt: true, userId: true },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      const verified = redemptions.filter(r => r.status === 'VERIFIED');
      const totalViews = offers.reduce((s, o) => s + o.viewCount, 0);
      const totalClicks = offers.reduce((s, o) => s + o.clickCount, 0);
      const popularOffers = [...offers].sort((a, b) => b.currentRedemptions - a.currentRedemptions).slice(0, 5);

      return {
        period,
        overview: {
          totalViews,
          totalClicks,
          totalRedemptions: redemptions.length,
          verifiedRedemptions: verified.length,
          totalPointsRedeemed: verified.reduce((s, r) => s + r.pointsSpent, 0),
          revenueImpact: verified.reduce((s, r) => s + r.discountValue, 0),
          uniqueCustomers: new Set(redemptions.map(r => r.userId).filter(Boolean)).size,
        },
        popularOffers: popularOffers.map(o => ({
          id: o.id, title: o.title, views: o.viewCount, clicks: o.clickCount, redemptions: o.currentRedemptions,
        })),
        dailyTrend: bucketRedemptions(redemptions, 'daily').map((d) => ({
          date: d.date,
          count: d.count,
          points: d.points,
        })),
      };
    } catch {
      return empty;
    }
  },
};
