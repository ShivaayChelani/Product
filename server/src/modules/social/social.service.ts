import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { CreatorStatus, Prisma, ReelReportStatus, Role, RoleAssignmentStatus, VendorListingStatus } from '@prisma/client';
import { getPaginationParams, paginatedResponse } from '../../shared/utils/pagination';
import { ApiError, ErrorCodes } from '../../shared/utils/ApiError';
import { deriveVideoPosterUrl } from '../../config/upload';
import { mapCreatorStatusToRoleStatus } from '../../shared/utils/specialtyRoles';
import { roleTransitionService } from '../../shared/services/roleTransition.service';
import { notificationService } from '../notifications/notification.service';
import { planEnforcementService } from '../monetization/plan-enforcement.service';
import { getPublicVendorListingWhere } from '../vendors/vendor-public-visibility';
import { publicPrivacyMask, readPrivacy } from '../user-app/user-app.types';
import { notifyVendorOfTaggedReel } from '../vendors/vendor-tagged-reels';
import {
  claimActionSlot,
  REEL_SHARE_DEDUP_MS,
  REEL_VIEW_DEDUP_MS,
} from '../../shared/utils/actionDedup';
import { recordUniqueView } from '../../shared/utils/reelViewDedup';
import {
  awardCreatorDailyReelInTx,
  CREATOR_DAILY_REEL_FALLBACK_POINTS,
  getIndiaRewardDate,
  resolveDailyReelPoints,
} from './creatorDailyReelReward';
import { notifyCreatorDailyReelReward } from './creatorDailyReelNotification';
import { resolveReelEventLink, sanitizeReelEvent, isAdminUser } from './reelEventLink';
import { isPublishableMediaUrl, isReelVisibleToViewer } from './reelVisibility';
import type {
  ApplyCreatorInput,
  UpdateCreatorProfileInput,
  CreateReelInput,
} from './social.validation';

// Simple haversine formula helper in case external import is missing
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Prisma's `cuid()` shape: a leading "c" plus base36. Used to decide whether a
 * public profile path segment is worth sending to the `id` column, since Prisma
 * raises instead of returning zero rows when handed a malformed id. Kept
 * deliberately narrow — a loose length check would also match legacy usernames
 * that happen to be pasted into the same column.
 */
function isCuidLike(value: string): boolean {
  return /^c[a-z0-9]{8,127}$/i.test(value);
}

/**
 * PalSafar usernames are the only valid value for the `username` field. Legacy
 * rows may hold a pasted social URL (e.g. an Instagram profile link, sometimes
 * with its punctuation stripped). Such values must never be returned as a
 * username, so malformed/URL-like stored values are replaced with an empty
 * string at the API boundary. No database migration is required.
 */
function sanitizeStoredUsername(value?: string | null): string {
  const trimmed = String(value ?? '').trim().toLowerCase();
  if (!trimmed) return '';
  if (/instagram|https?|www\./i.test(trimmed)) return '';
  return /^[a-z0-9_.]{3,30}$/.test(trimmed) ? trimmed : '';
}

async function getFollowingUserIdSet(followerId: string): Promise<Set<string>> {
  const rows = await prisma.follow.findMany({
    where: { followerId },
    select: { followingId: true },
  });
  return new Set(rows.map((row) => row.followingId));
}

const reelResponseInclude = {
  creator: {
    select: { id: true, username: true, avatar: true, verified: true, userId: true },
  },
  place: {
    select: { id: true, name: true, city: true, state: true },
  },
  vendor: {
    // latitude/longitude so the client can raise an in-app Direction action on a
    // vendor-attributed reel without a second vendor fetch.
    select: {
      id: true,
      businessName: true,
      city: true,
      state: true,
      latitude: true,
      longitude: true,
    },
  },
  // Keep this shallow. Nested vendor/creator on Collaboration is 1:1 required and
  // 500s the whole reel read when either side is missing.
  collaboration: {
    select: {
      id: true,
      campaignTitle: true,
      status: true,
    },
  },
  // Selected wide enough to run the public-visibility check, then narrowed by
  // `sanitizeReelEvent` in `applyLiveEngagement` — the fields needed for the
  // check must never reach the response.
  event: {
    select: {
      id: true,
      slug: true,
      title: true,
      eventType: true,
      startDate: true,
      endDate: true,
      deletedAt: true,
      coverImage: true,
      city: true,
      state: true,
      status: true,
      createdById: true,
      place: {
        select: {
          status: true,
          mergedIntoId: true,
          dataQuality: true,
          source: true,
          verificationLevel: true,
        },
      },
    },
  },
  _count: {
    select: { comments: true, likesList: true, savesList: true },
  },
};

/** Explicit scalar select so Prisma never SELECTs Unsupported search_vector (or a
 * newly-added column that production has not migrated yet). */
export const creatorReelListSelect = {
  id: true,
  creatorId: true,
  videoUrl: true,
  thumbnail: true,
  title: true,
  description: true,
  likes: true,
  views: true,
  shares: true,
  saves: true,
  featured: true,
  placeId: true,
  vendorId: true,
  eventId: true,
  tags: true,
  createdAt: true,
  updatedAt: true,
  category: true,
  status: true,
  scheduledAt: true,
  collaborationId: true,
  isCollaboration: true,
  creator: {
    select: { id: true, username: true, avatar: true, verified: true, userId: true },
  },
  place: {
    select: { id: true, name: true, city: true, state: true },
  },
  _count: {
    select: { comments: true, likesList: true, savesList: true },
  },
} as const;

type LiveEngagementCounts = {
  likes: number;
  views: number;
  shares: number;
  saves: number;
  _count?: { comments?: number; likesList?: number; savesList?: number } | null;
};

type LiveEngagement<T extends LiveEngagementCounts> = Omit<T, '_count'> & {
  likes: number;
  commentsCount: number;
  saves: number;
  views: number;
  shares: number;
};

function applyLiveEngagement<T extends LiveEngagementCounts>(item: T): LiveEngagement<T> {
  const { _count, ...rest } = item;
  const shaped = {
    ...rest,
    likes: _count?.likesList ?? item.likes ?? 0,
    commentsCount: _count?.comments ?? 0,
    saves: _count?.savesList ?? item.saves ?? 0,
    views: item.views ?? 0,
    shares: item.shares ?? 0,
  } as LiveEngagement<T>;
  // Every reel response funnels through here, so this is the one place a
  // non-public event can be stripped off a reel payload. A reel linked before
  // `resolveReelEventLink` existed must not keep leaking an unapproved event.
  if ('event' in shaped) {
    (shaped as { event?: unknown }).event = sanitizeReelEvent(
      (item as { event?: unknown }).event as Parameters<typeof sanitizeReelEvent>[0],
    );
  }
  return shaped;
}

/**
 * Categories whose membership is defined by a creator relationship. A
 * self-serve vendor reel has no `CreatorProfile`, so it can never satisfy
 * "Following" and must not be injected into a geo-scoped "Nearby" result set
 * (that branch narrows by `reels.id`, which vendor reel ids can never match).
 */
const CREATOR_SCOPED_FEED_CATEGORIES = new Set(['Following', 'Nearby']);

/**
 * Resolve a vendor reel under the same public-listing gate the feed uses.
 * Returns null when the id is not a vendor reel, or the reel is not publicly
 * visible — callers then raise the same 404 a hidden creator reel gets.
 */
async function findPublicVendorReelForEngagement(vendorReelId: string) {
  return prisma.vendorReel.findFirst({
    where: { id: vendorReelId, archivedAt: null, vendor: getPublicVendorListingWhere() },
    select: { id: true, vendorId: true },
  });
}

async function likeVendorReel(userId: string, vendorReelId: string) {
  const row = await findPublicVendorReelForEngagement(vendorReelId);
  if (!row) throw new ApiError(404, 'Moment not found.');

  const existing = await prisma.vendorReelLike.findUnique({
    where: { vendorReelId_userId: { vendorReelId, userId } },
  });
  if (existing) return existing;

  // The unique index is the de-duplication authority: the counter only moves
  // when a row is newly inserted, so a double-tap cannot double-count.
  const [like] = await Promise.all([
    prisma.vendorReelLike.create({ data: { vendorReelId, userId } }),
    prisma.vendorReel.update({
      where: { id: vendorReelId },
      data: { likes: { increment: 1 } },
    }),
  ]);
  return like;
}

async function unlikeVendorReel(userId: string, vendorReelId: string) {
  const row = await findPublicVendorReelForEngagement(vendorReelId);
  if (!row) throw new ApiError(404, 'Moment not found.');

  const like = await prisma.vendorReelLike.findUnique({
    where: { vendorReelId_userId: { vendorReelId, userId } },
  });
  if (!like) return;

  await prisma.vendorReelLike.delete({ where: { id: like.id } });
  await prisma.vendorReel.update({
    where: { id: vendorReelId },
    data: { likes: { decrement: 1 } },
  });
}

/** Share counter for a `vendor_reels` row, using the same dedup window as `reels`. */
async function incrementVendorReelShares(vendorReelId: string, actorKey: string) {
  const row = await findPublicVendorReelForEngagement(vendorReelId);
  if (!row) throw new ApiError(404, 'Moment not found.');

  const current = await prisma.vendorReel.findUnique({
    where: { id: vendorReelId },
    select: { shares: true },
  });

  const claimed = await claimActionSlot(
    `reel-share:${vendorReelId}:${actorKey}`,
    REEL_SHARE_DEDUP_MS,
  );
  if (!claimed) {
    return { id: vendorReelId, shares: current?.shares ?? 0 };
  }

  return prisma.vendorReel.update({
    where: { id: vendorReelId },
    data: { shares: { increment: 1 } },
    select: { id: true, shares: true },
  });
}

type FeedVendorReelRow = {
  id: string;
  videoUrl: string;
  thumbnail: string | null;
  title: string | null;
  description: string | null;
  views: number;
  likes: number;
  shares: number;
  createdAt: Date;
  updatedAt: Date;
  vendor: {
    id: string;
    businessName: string;
    city: string | null;
    state: string | null;
    latitude: number | null;
    longitude: number | null;
    userId: string;
    imageUrl: string | null;
  };
  likesList?: { userId: string }[];
  /**
   * Authoritative total like count.
   *
   * Required separately from `likesList`, which is filtered to the viewer and is
   * therefore 0 or 1 long. Without this, an anonymous viewer's projection would
   * report `likesList: 0` and `applyLiveEngagement` would treat that as the real
   * total, showing a popular reel with zero likes.
   */
  likeCount: number;
};

/**
 * Project a `vendor_reels` row into the shape `reels` rows already have in the
 * feed response.
 *
 * This is a read-time projection of the SAME record, not a copy: no `reels` row
 * is written, so the vendor's reel stays a single record that can render both
 * here and on the business profile. `source: 'VENDOR'` lets the client tell a
 * self-serve vendor reel from a creator reel that merely carries a vendor tag.
 */
function projectVendorReelToFeedReel(row: FeedVendorReelRow) {
  return {
    id: row.id,
    creatorId: row.vendor.userId,
    videoUrl: row.videoUrl,
    thumbnail: row.thumbnail,
    title: row.title,
    description: row.description,
    likes: row.likes,
    views: row.views,
    shares: row.shares ?? 0,
    saves: 0,
    featured: false,
    placeId: null,
    vendorId: row.vendor.id,
    vendorListingStatus: null,
    eventId: null,
    tags: [] as string[],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    category: 'BUSINESS',
    status: 'APPROVED',
    scheduledAt: null,
    collaborationId: null,
    isCollaboration: false,
    creator: {
      id: row.vendor.id,
      username: row.vendor.businessName,
      avatar: row.vendor.imageUrl,
      verified: true,
      userId: row.vendor.userId,
    },
    place: null,
    vendor: {
      id: row.vendor.id,
      businessName: row.vendor.businessName,
      city: row.vendor.city,
      state: row.vendor.state,
      latitude: row.vendor.latitude,
      longitude: row.vendor.longitude,
    },
    collaboration: null,
    event: null,
    source: 'VENDOR',
    // Carried through so the feed's `isLiked = likesList.length > 0` check works
    // for vendor reels too. Absent for anonymous viewers, which yields false.
    likesList: row.likesList ?? [],
    savesList: [],
    _count: {
      comments: 0,
      // The true total, not the viewer-filtered list length. `applyLiveEngagement`
      // reads `_count.likesList` first, so feeding it `row.likesList.length`
      // would report 0 likes to anonymous viewers.
      likesList: row.likeCount ?? row.likes ?? 0,
      savesList: 0,
    },
  };
}

/**
 * Vendor reels eligible for the global feed.
 *
 * Eligibility reuses the exact public-listing gate the business profile uses
 * (`getPublicVendorListingWhere`: APPROVED, not suspended, live paid/trial
 * subscription), so a feed row can never expose a reel the profile hides. There
 * is no separate vendor-reel moderation column to honour.
 */
async function listEligibleFeedVendorReels(take: number, viewerId?: string) {
  if (take <= 0) return [];
  try {
    return await queryEligibleFeedVendorReels(take, viewerId);
  } catch (err) {
    // Deploy-order safety net. This query selects `likesList`, so it throws
    // P2021 if this code is live before migration
    // 20261006000000_vendor_reel_feed has run. Without this guard the throw
    // would propagate out of `listReels` and 500 the ENTIRE global feed,
    // including every creator reel that has nothing to do with vendor reels.
    // Degrading to creator-only keeps the app working in both orders; the
    // migration then restores vendor rows on the next request.
    if (isMissingVendorReelLikeTable(err)) {
      console.warn('[social] vendor_reel_likes missing; serving creator-only feed', {
        code: (err as { code?: string })?.code ?? null,
      });
      return [];
    }
    throw err;
  }
}

/** Postgres undefined-table / undefined-column, as raised by Prisma P2021. */
function isMissingVendorReelLikeTable(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  if (e?.code !== 'P2021') return false;
  const msg = String(e?.message ?? '');
  return msg.includes('vendor_reel_likes') || msg.includes('shares');
}

async function queryEligibleFeedVendorReels(take: number, viewerId?: string) {
  const rows = await prisma.vendorReel.findMany({
    where: { archivedAt: null, vendor: getPublicVendorListingWhere() },
    orderBy: { createdAt: 'desc' },
    take,
    include: {
      vendor: {
        select: {
          id: true,
          businessName: true,
          city: true,
          state: true,
          latitude: true,
          longitude: true,
          userId: true,
          imageUrl: true,
        },
      },
      ...(viewerId ? { likesList: { where: { userId: viewerId } } } : {}),
      _count: { select: { likesList: true } },
    },
  } as any);
  return (rows as unknown as FeedVendorReelRow[]).map(projectVendorReelToFeedReel);
}

/**
 * Merge creator reels with vendor reels and apply the page window once.
 *
 * Both sources are ordered `createdAt desc`, so over-fetching `skip + limit`
 * rows from each is enough to produce a correct global page — a page can never
 * be starved by one source holding the top N slots.
 */
function mergeFeedPages<T extends { createdAt?: Date | string }>(
  creatorReels: T[],
  vendorReels: any[],
  skip: number,
  limit: number,
  isTrending: boolean,
): T[] {
  if (vendorReels.length === 0) return creatorReels.slice(skip, skip + limit);
  const byRecency = (a: any, b: any) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  if (isTrending) {
    const score = (r: any) => (r.featured ? 1 : 0) * 1e9 + (r.likes ?? 0) * 5 + (r.views ?? 0);
    // Ties broken by recency so Trending is deterministic across pages; without
    // it two reels with equal engagement could swap places between requests and
    // the client would see a duplicate on one page and a gap on the next.
    return [...creatorReels, ...vendorReels]
      .sort((a, b) => score(b) - score(a) || byRecency(a, b))
      .slice(skip, skip + limit);
  }
  return [...creatorReels, ...vendorReels].sort(byRecency).slice(skip, skip + limit);
}

async function loadCreatorReelList(
  creatorId: string,
  opts: { take?: number; skip?: number; orderBy?: 'createdAt' | 'views' } = {},
) {
  try {
    return await prisma.reel.findMany({
      where: { creatorId },
      skip: opts.skip,
      take: opts.take,
      orderBy: opts.orderBy === 'views' ? { views: 'desc' } : { createdAt: 'desc' },
      select: creatorReelListSelect,
    });
  } catch {
    return [];
  }
}

export const socialService = {
  // ── Creator Profile Operations ──

  async applyCreator(userId: string, input: ApplyCreatorInput) {
    const retireReason = 'Your Vendor role was retired because you switched to Content Creator.';

    const { profile, retiredOther, otherRole } = await prisma.$transaction(async (tx) => {
      const { isSwitch, otherRole } = await roleTransitionService.assertCanApply(
        userId,
        Role.CONTENT_CREATOR,
        input.confirmSwitch,
        tx,
      );

      // Normalise username here as defence-in-depth (Zod also normalises at the
      // controller boundary, but we do it again in case the service is ever called
      // directly, e.g. from admin tooling or tests).
      const normalizedUsername = input.username.trim().replace(/^@+/, '').toLowerCase();

      const [existingForUser, existingForUsername] = await Promise.all([
        tx.creatorProfile.findUnique({ where: { userId } }),
        tx.creatorProfile.findFirst({
          where: {
            username: { equals: normalizedUsername, mode: 'insensitive' },
          },
        }),
      ]);

      if (existingForUsername && existingForUsername.userId !== userId) {
        throw new ApiError(400, 'Username is already taken.', true, 'USERNAME_ALREADY_TAKEN');
      }

      if (existingForUser) {
        const resubmittable =
          existingForUser.status === 'REJECTED'
          || existingForUser.status === 'CHANGES_REQUESTED'
          || existingForUser.status === 'RETIRED';
        if (!resubmittable) {
          throw new ApiError(
            400,
            'You have already applied for or created a creator profile.',
            true,
            ErrorCodes.APPLICATION_PENDING,
            { role: Role.CONTENT_CREATOR, status: existingForUser.status },
          );
        }
      }

      if (isSwitch) {
        await roleTransitionService.retireRole(userId, otherRole, userId, retireReason, tx);
      }

      const profileData = {
        username: normalizedUsername,
        fullName: input.fullName,
        bio: input.bio,
        avatar: input.avatar,
        travelCategories: input.travelCategories,
        instagramUrl: input.instagramUrl || null,
        youtubeUrl: input.youtubeUrl || null,
        facebookUrl: input.facebookUrl || null,
        languages: input.languages ?? [],
        governmentIdUrl: input.governmentIdUrl || null,
        portfolioLinks: input.portfolioLinks ?? [],
        sampleReelUrl: input.sampleReelUrl || null,
        applicationReason: input.applicationReason,
      };

      const profile = existingForUser
        ? await tx.creatorProfile.update({
            where: { id: existingForUser.id },
            data: {
              ...profileData,
              status: 'PENDING',
              verified: false,
              rejectionReason: null,
            },
          }).catch((err: unknown) => {
            const e = err as { code?: string };
            if (e?.code === 'P2002') throw new ApiError(400, 'Username is already taken.', true, 'USERNAME_ALREADY_TAKEN');
            throw err;
          })
        : await tx.creatorProfile.create({
            data: {
              userId,
              ...profileData,
              status: 'PENDING',
            },
          }).catch((err: unknown) => {
            const e = err as { code?: string };
            if (e?.code === 'P2002') throw new ApiError(400, 'Username is already taken.', true, 'USERNAME_ALREADY_TAKEN');
            throw err;
          });

      await roleTransitionService.finalizeApplication(userId, Role.CONTENT_CREATOR, tx);
      return { profile, retiredOther: isSwitch, otherRole };
    }, { maxWait: 10_000, timeout: 20_000 });

    if (retiredOther) {
      roleTransitionService.notifyRetirement(userId, otherRole, retireReason);
    }
    return profile;
  },

  async verifyCreator(
    id: string,
    status: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'SUSPENDED' | 'PAUSED',
    rejectionReason?: string,
    adminId?: string,
  ) {
    const profile = await prisma.creatorProfile.findUnique({
      where: { id },
    });
    if (!profile) throw new ApiError(404, 'Creator profile application not found.');

    const creatorStatus = status as CreatorStatus;
    const roleStatus = mapCreatorStatusToRoleStatus(creatorStatus);

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.creatorProfile.update({
        where: { id },
        data: {
          status: creatorStatus,
          verified: status === 'APPROVED',
          rejectionReason: status === 'APPROVED' ? null : rejectionReason,
        },
      });

      await roleTransitionService.applyVerificationOutcome({
        userId: profile.userId,
        role: Role.CONTENT_CREATOR,
        status: roleStatus,
        approvedById: adminId ?? null,
        rejectedReason: status === 'APPROVED' ? null : (rejectionReason ?? null),
        tx,
      });
      return row;
    });

    if (status === 'APPROVED') {
      notificationService
        .sendToUser(
          profile.userId,
          'Creator Approved',
          'Your creator application was approved. Switch profile to Creator mode anytime.',
          { creatorId: id, status },
          'creator_approved',
        )
        .catch(() => undefined);
    } else {
      const titles: Record<string, string> = {
        REJECTED: 'Creator Rejected',
        CHANGES_REQUESTED: 'Creator Changes Requested',
        SUSPENDED: 'Creator Suspended',
        PAUSED: 'Creator Paused',
      };
      notificationService
        .sendToUser(
          profile.userId,
          titles[status] || 'Creator Update',
          rejectionReason || `Your creator application status is now ${status}.`,
          { creatorId: id, status },
          `creator_${status.toLowerCase()}`,
        )
        .catch(() => undefined);
    }

    return updated;
  },

  async getCreatorProfile(rawUsername: string, currentUserId?: string) {
    const trimmed = rawUsername.trim();
    const cleaned = trimmed.toLowerCase().replace(/^@+/, '');
    // Shared profile links carry the stable CreatorProfile.id rather than the
    // username, because legacy rows can hold a pasted Instagram URL in
    // `username`. Resolve both, but only query `id` when the value can actually
    // be one — Prisma rejects a malformed cuid instead of matching nothing.
    const profile = await prisma.creatorProfile.findFirst({
      where: {
        status: 'APPROVED',
        OR: [
          { username: { equals: cleaned, mode: 'insensitive' } },
          ...(isCuidLike(trimmed) ? [{ id: trimmed }] : []),
        ],
      },
      include: {
        reels: {
          where: { status: 'APPROVED' },
          orderBy: { createdAt: 'desc' },
          include: {
            creator: {
              select: { username: true, avatar: true, verified: true },
            },
          },
        },
      },
    });
    if (!profile) throw new ApiError(404, 'Creator profile not found.');

    const viewerIsOwner = !!currentUserId && currentUserId === profile.userId;
    const prefRow = await prisma.userAppPreference.findUnique({
      where: { userId: profile.userId },
      select: { privacy: true },
    });
    const privacyMask = publicPrivacyMask(readPrivacy(prefRow?.privacy), viewerIsOwner);
    const visibleReels = privacyMask.hideReels ? [] : profile.reels;

    let isFollowing = false;
    if (currentUserId) {
      const follow = await prisma.follow.findFirst({
        where: {
          followerId: currentUserId,
          followingId: profile.userId,
        },
      });
      isFollowing = !!follow;
    }

    // Determine travel badges based on total views and milestone criteria
    const badges = [];
    if (profile.totalViews >= 1000000) badges.push('Top Creator', 'PalSafar Ambassador');
    else if (profile.totalViews >= 100000) badges.push('Top Creator', 'Adventure Creator');
    else if (profile.totalViews >= 10000) badges.push('Traveler', 'Hidden Gem Hunter');
    else if (profile.totalViews >= 1000) badges.push('Traveler');

    if (profile.verified) badges.push('Verified Creator');

    // Fetch following count for the creator's underlying user
    const [followingCount, followerCount, reelTotals, distinctCities] = await Promise.all([
      prisma.follow.count({ where: { followerId: profile.userId } }),
      prisma.follow.count({ where: { followingId: profile.userId } }),
      prisma.reel.aggregate({
        where: { creatorId: profile.id, status: 'APPROVED' },
        _sum: { likes: true },
        _count: { id: true },
      }),
      prisma.reel.findMany({
        where: { creatorId: profile.id, status: 'APPROVED', placeId: { not: null } },
        select: { place: { select: { city: true } } },
        distinct: ['placeId'],
      }),
    ]);

    const citiesCount = new Set(
      distinctCities.map(r => r.place?.city?.trim()).filter(Boolean),
    ).size;

    return {
      ...profile,
      username: sanitizeStoredUsername(profile.username),
      bio: privacyMask.hideProfile ? null : profile.bio,
      reels: visibleReels,
      followerCount,
      followingCount,
      isFollowing,
      badges: privacyMask.hideProfile ? [] : badges,
      totalLikes: privacyMask.hideReels ? 0 : (reelTotals._sum.likes ?? 0),
      reelCount: privacyMask.hideReels ? 0 : (reelTotals._count.id ?? profile.reels?.length ?? 0),
      citiesCount: privacyMask.hideReels ? 0 : citiesCount,
    };
  },

  async checkUsernameAvailability(rawUsername: string, currentUserId?: string) {
    const cleaned = rawUsername.trim().toLowerCase().replace(/^@+/, '');
    if (!cleaned || cleaned.length < 3) {
      return { available: false, message: '3–30 characters (letters, numbers, _ or . allowed)' };
    }
    if (cleaned.length > 30) {
      return { available: false, message: '3–30 characters (letters, numbers, _ or . allowed)' };
    }
    if (!/^[a-z0-9_.]+$/.test(cleaned)) {
      return { available: false, message: '3–30 characters (letters, numbers, _ or . allowed)' };
    }

    const existing = await prisma.creatorProfile.findFirst({
      where: {
        username: { equals: cleaned, mode: 'insensitive' },
        ...(currentUserId ? { NOT: { userId: currentUserId } } : {}),
      },
    });

    if (existing) {
      return { available: false, message: 'This username is not available' };
    }

    return { available: true };
  },

  async updateProfile(userId: string, input: UpdateCreatorProfileInput) {
    const profile = await prisma.creatorProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new ApiError(
        403,
        'Apply to become a creator before updating your profile.',
        true,
        ErrorCodes.APPLICATION_REQUIRED,
        { role: Role.CONTENT_CREATOR },
      );
    }

    if (profile.status !== 'APPROVED') {
      throw new ApiError(
        403,
        'Your creator application is not approved yet.',
        true,
        ErrorCodes.ROLE_NOT_APPROVED,
        { role: Role.CONTENT_CREATOR, status: profile.status },
      );
    }

    const safeInput: UpdateCreatorProfileInput = { ...input };
    delete (safeInput as Record<string, unknown>).status;
    delete (safeInput as Record<string, unknown>).verified;
    delete (safeInput as Record<string, unknown>).role;
    delete (safeInput as Record<string, unknown>).roles;
    delete (safeInput as Record<string, unknown>).permission;
    delete (safeInput as Record<string, unknown>).permissions;
    delete (safeInput as Record<string, unknown>).approved;

    if (safeInput.username && safeInput.username.toLowerCase() !== profile.username.toLowerCase()) {
      const cleaned = safeInput.username.trim().toLowerCase().replace(/^@+/, '');
      const existing = await prisma.creatorProfile.findFirst({
        where: { username: { equals: cleaned, mode: 'insensitive' }, NOT: { userId } },
      });
      if (existing) {
        throw new ApiError(400, 'Username already used', true, 'USERNAME_ALREADY_TAKEN');
      }
      safeInput.username = cleaned;
    }

    try {
      return await prisma.creatorProfile.update({
        where: { userId },
        data: safeInput,
      });
    } catch (err: unknown) {
      const prismaErr = err as { code?: string };
      if (prismaErr?.code === 'P2002') {
        throw new ApiError(400, 'Username already used', true, 'USERNAME_ALREADY_TAKEN');
      }
      throw err;
    }
  },

  async getCreatorDashboard(userId: string) {
    const profile = await this.getApprovedCreatorProfile(userId);
    const rewardDate = getIndiaRewardDate();
    const [followingCount, reelCount, totals, totalComments, recentReels, reward] = await Promise.all([
      prisma.follow.count({ where: { followerId: userId } }),
      prisma.reel.count({ where: { creatorId: profile.id } }),
      prisma.reel.aggregate({
        where: { creatorId: profile.id },
        _sum: { likes: true, shares: true, views: true, saves: true },
      }),
      prisma.reelComment.count({ where: { reel: { creatorId: profile.id } } }),
      loadCreatorReelList(profile.id, { take: 5 }),
      prisma.creatorDailyReward.findUnique({
        where: { creatorId_rewardDate: { creatorId: profile.id, rewardDate } },
      }).catch(() => null),
    ]);

    return {
      profile: {
        id: profile.id,
        username: profile.username,
        fullName: profile.fullName,
        avatar: profile.avatar,
        verified: profile.verified,
        followerCount: profile.followerCount,
        followingCount,
        totalViews: profile.totalViews,
        ...this.creatorProfileFields(profile),
      },
      reelCount,
      totalLikes: totals._sum.likes ?? 0,
      totalComments,
      dailyReward: {
        claimedToday: Boolean(reward),
        pointsIfClaimed: reward?.points ?? CREATOR_DAILY_REEL_FALLBACK_POINTS,
      },
      recentReels: recentReels.map((item) => applyLiveEngagement(item)),
      totalShares: totals._sum.shares ?? 0,
      totalSaves: totals._sum.saves ?? 0,
    };
  },

  async getCreatorAnalytics(userId: string, period = '7d') {
    if (!['7d', '30d', 'all'].includes(period)) {
      throw new ApiError(400, 'Period must be one of 7d, 30d, or all.');
    }
    const profile = await this.getApprovedCreatorProfile(userId);
    const [totals, comments, topReels] = await Promise.all([
      prisma.reel.aggregate({
        where: { creatorId: profile.id },
        _sum: { views: true, likes: true, saves: true, shares: true },
      }),
      prisma.reelComment.count({ where: { reel: { creatorId: profile.id } } }),
      loadCreatorReelList(profile.id, { take: 5, orderBy: 'views' }),
    ]);
    const views = totals._sum.views ?? 0;
    const likes = totals._sum.likes ?? 0;
    const saves = totals._sum.saves ?? 0;
    const shares = totals._sum.shares ?? 0;
    return {
      period,
      kpis: {
        views,
        likes,
        comments,
        shares,
        saves,
        engagementRate: views ? Number((((likes + comments + saves) / views) * 100).toFixed(2)) : 0,
      },
      topReels,
      note: period === 'all'
        ? 'Totals are calculated from current Moment aggregates.'
        : 'Historical view events are not recorded, so this period uses current Moment aggregates.',
    };
  },

  async listMyReels(userId: string, pageInput?: string, limitInput?: string) {
    const profile = await this.getApprovedCreatorProfile(userId);
    const page = Math.max(1, parseInt(pageInput || '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(limitInput || '20', 10) || 20));
    const where = { creatorId: profile.id };
    const [items, total] = await Promise.all([
      loadCreatorReelList(profile.id, { skip: (page - 1) * limit, take: limit }),
      prisma.reel.count({ where }),
    ]);
    return {
      items: items.map((item) => applyLiveEngagement(item)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  async updateOwnReel(
    userId: string,
    reelId: string,
    input: {
      title?: string;
      description?: string;
      thumbnail?: string;
      videoUrl?: string;
      placeId?: string | null;
      vendorId?: string | null;
      eventId?: string | null;
      tags?: string[];
      status?: unknown;
    },
  ) {
    const profile = await this.getApprovedCreatorProfile(userId);
    const reel = await prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) throw new ApiError(404, 'Moment not found.');
    if (reel.creatorId !== profile.id) throw new ApiError(403, 'You can only edit your own Moments.');

    const dataToUpdate: any = {};
    // Client-supplied status is ignored. Published/approved reels stay visible
    // unless a dedicated archive/publish endpoint is used.
    void input.status;
    if (input.title !== undefined) dataToUpdate.title = input.title;
    if (input.description !== undefined) dataToUpdate.description = input.description;
    if (input.thumbnail !== undefined) dataToUpdate.thumbnail = input.thumbnail;
    if (input.videoUrl !== undefined) dataToUpdate.videoUrl = input.videoUrl;
    if (input.placeId !== undefined) {
      if (input.placeId) {
        const foundPlace = await prisma.place.findFirst({
          where: {
            OR: [
              { id: input.placeId },
              { slug: input.placeId },
              { name: { equals: input.placeId, mode: 'insensitive' } },
              { name: { contains: input.placeId, mode: 'insensitive' } },
            ],
          },
          select: { id: true },
        });
        dataToUpdate.placeId = foundPlace?.id ?? null;
      } else {
        dataToUpdate.placeId = null;
      }
    }
    if (input.vendorId !== undefined) {
      dataToUpdate.vendorId = input.vendorId;
      if (input.vendorId) {
        const taggedVendor = await prisma.vendor.findFirst({
          where: { id: input.vendorId, status: 'APPROVED' },
          select: { id: true },
        });
        if (!taggedVendor) throw new ApiError(400, 'Business not found or not approved.');
        dataToUpdate.vendorListingStatus = VendorListingStatus.PENDING;
      } else {
        dataToUpdate.vendorListingStatus = null;
      }
    }
    if (input.eventId !== undefined) {
      dataToUpdate.eventId = await resolveReelEventLink(input.eventId, {
        viewerUserId: userId,
        isAdmin: await isAdminUser(userId),
      });
    }
    if (input.tags !== undefined) dataToUpdate.tags = input.tags || [];

    const updated = await prisma.reel.update({
      where: { id: reelId },
      data: dataToUpdate,
      include: reelResponseInclude,
    });

    if (input.vendorId && input.vendorId !== reel.vendorId) {
      await notifyVendorOfTaggedReel({
        vendorId: input.vendorId,
        reelId: updated.id,
        thumbnail: updated.thumbnail,
        creatorUserId: userId,
        creatorName: profile.fullName || profile.username,
      }).catch(() => undefined);
    }

    return updated;
  },

  async deleteOwnReel(userId: string, reelId: string) {
    const profile = await this.getApprovedCreatorProfile(userId);
    const reel = await prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) throw new ApiError(404, 'Moment not found.');
    if (reel.creatorId !== profile.id) throw new ApiError(403, 'You can only delete your own Moments.');

    return prisma.$transaction(async (tx) => {
      if (reel.collaborationId) {
        const collab = await tx.collaboration.findFirst({
          where: { id: reel.collaborationId, deletedAt: null },
        });
        if (collab) {
          const needsReset =
            collab.status === 'REEL_UPLOADED' || collab.status === 'REVISION_REQUESTED';
          if (needsReset || collab.reelId === reel.id) {
            await tx.collaboration.update({
              where: { id: collab.id },
              data: {
                reelId: null,
                ...(needsReset
                  ? { status: 'IN_PROGRESS', revisionFeedback: 'Moment deleted by creator' }
                  : {}),
              },
            });
          }
        }
      }
      return tx.reel.delete({ where: { id: reelId } });
    });
  },

  async getCreatorLeaderboard(limitInput?: string) {
    const limit = Math.min(50, Math.max(1, parseInt(limitInput || '20', 10) || 20));
    return prisma.creatorProfile.findMany({
      where: { status: 'APPROVED' },
      orderBy: [{ totalViews: 'desc' }, { followerCount: 'desc' }],
      take: limit,
      select: {
        id: true, username: true, fullName: true, avatar: true, verified: true,
        followerCount: true, totalViews: true, travelCategories: true,
      },
    });
  },

  async getApprovedCreatorProfile(userId: string) {
    const profile = await prisma.creatorProfile.findFirst({ where: { userId } });
    if (!profile || profile.status !== 'APPROVED') {
      throw new ApiError(
        403,
        'An approved creator profile is required.',
        true,
        ErrorCodes.ROLE_NOT_APPROVED,
        { role: Role.CONTENT_CREATOR, status: profile?.status ?? 'NONE' },
      );
    }
    return profile;
  },

  creatorProfileFields(profile: any) {
    return {
      bio: profile.bio,
      travelCategories: profile.travelCategories,
      instagramUrl: profile.instagramUrl,
      youtubeUrl: profile.youtubeUrl,
      facebookUrl: profile.facebookUrl,
      languages: profile.languages,
      portfolioLinks: profile.portfolioLinks,
      status: profile.status,
    };
  },

  async followCreator(followerId: string, creatorProfileId: string) {
    const creatorProfile = await prisma.creatorProfile.findFirst({
      where: {
        OR: [
          { id: creatorProfileId },
          { username: creatorProfileId },
          { userId: creatorProfileId },
        ],
      },
    });
    if (!creatorProfile) return { id: creatorProfileId, followerId };
    if (creatorProfile.userId === followerId) {
      throw new ApiError(400, 'You cannot follow yourself.');
    }

    const existing = await prisma.follow.findFirst({
      where: {
        followerId,
        followingId: creatorProfile.userId,
      },
    });
    if (existing) return existing;

    const follow = await prisma.follow.create({
      data: {
        followerId,
        followingId: creatorProfile.userId,
      },
    });

    // Update creator's follower count
    await prisma.creatorProfile.update({
      where: { id: creatorProfile.id },
      data: { followerCount: { increment: 1 } },
    });

    return follow;
  },

  async unfollowCreator(followerId: string, creatorProfileId: string) {
    const creatorProfile = await prisma.creatorProfile.findFirst({
      where: {
        OR: [
          { id: creatorProfileId },
          { username: creatorProfileId },
          { userId: creatorProfileId },
        ],
      },
    });
    if (!creatorProfile) return;

    const follow = await prisma.follow.findFirst({
      where: {
        followerId,
        followingId: creatorProfile.userId,
      },
    });
    if (!follow) return;

    await prisma.follow.delete({
      where: { id: follow.id },
    });

    // Decrement follower count
    await prisma.creatorProfile.update({
      where: { id: creatorProfile.id },
      data: { followerCount: { decrement: 1 } },
    });
  },

  // ── Reel Operations ──

  async createReel(userId: string, input: CreateReelInput) {
    const capable = await prisma.userRole.findFirst({
      where: {
        userId,
        role: Role.CONTENT_CREATOR,
        status: { in: [RoleAssignmentStatus.APPROVED, RoleAssignmentStatus.ACTIVE] },
      },
    });
    const profile = await prisma.creatorProfile.findFirst({
      where: { userId, status: 'APPROVED' },
    });
    if (!capable || !profile) {
      throw new ApiError(403, 'Only approved travel creators can publish Moments.');
    }

    await planEnforcementService.assertCreatorCanUploadReel(userId);

    const rewardDate = getIndiaRewardDate();
    const dailyReelPoints = await resolveDailyReelPoints();

    let resolvedPlaceId: string | null = null;
    if (input.placeId?.trim()) {
      const placeKey = input.placeId.trim();
      const foundPlace = await prisma.place.findFirst({
        where: {
          OR: [
            { id: placeKey },
            { slug: placeKey },
            { name: { equals: placeKey, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      });
      resolvedPlaceId = foundPlace?.id ?? null;
    }

    let taggedVendor: { id: string; userId: string; businessName: string } | null = null;
    if (input.vendorId?.trim()) {
      taggedVendor = await prisma.vendor.findFirst({
        where: { id: input.vendorId, status: 'APPROVED' },
        select: { id: true, userId: true, businessName: true },
      });
      if (!taggedVendor) {
        throw new ApiError(400, 'Business not found or not approved.');
      }
    }

    // Validated, not written through: an eventId that does not exist, or that
    // the creator is not allowed to tag, must fail the upload rather than
    // create a dangling or unauthorised link.
    const resolvedEventId = await resolveReelEventLink(input.eventId, {
      viewerUserId: userId,
      isAdmin: await isAdminUser(userId),
    });

    if (!isPublishableMediaUrl(input.videoUrl)) {
      throw new ApiError(400, 'Upload the Moment video before publishing.');
    }

    // Idempotency: retry with the same uploaded video must not create duplicate reels.
    const recentDuplicate = await prisma.reel.findFirst({
      where: {
        creatorId: profile.id,
        videoUrl: input.videoUrl,
        status: { not: 'DRAFT' },
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
      include: reelResponseInclude,
      orderBy: { createdAt: 'desc' },
    });
    if (recentDuplicate) {
      return {
        ...recentDuplicate,
        rewardPoints: 0,
        dailyRewardClaimed: false,
        dailyRewardDate: rewardDate,
      };
    }

    const result = await prisma.$transaction(async (tx) => {
      const reel = await tx.reel.create({
        data: {
          creatorId: profile.id,
          videoUrl: input.videoUrl,
          thumbnail: input.thumbnail ?? deriveVideoPosterUrl(input.videoUrl),
          title: input.title || input.description?.slice(0, 200) || null,
          description: input.description,
          tags: input.tags || [],
          placeId: resolvedPlaceId,
          vendorId: taggedVendor?.id || null,
          vendorListingStatus: taggedVendor ? VendorListingStatus.PENDING : null,
          eventId: resolvedEventId,
          status: 'APPROVED',
        },
        include: reelResponseInclude,
      });

      const rewardPoints = await awardCreatorDailyReelInTx(tx, {
        creatorId: profile.id,
        userId,
        reelId: reel.id,
        rewardDate,
        points: dailyReelPoints,
      });

      return { reel, rewardPoints };
    });

    if (taggedVendor) {
      await notifyVendorOfTaggedReel({
        vendorId: taggedVendor.id,
        reelId: result.reel.id,
        thumbnail: result.reel.thumbnail,
        creatorUserId: userId,
        creatorName: profile.fullName || profile.username,
      }).catch(() => undefined);
    }

    // Posted after the transaction committed: only a real award notifies, so the
    // "first reel of the day" limit also limits this to one notification.
    notifyCreatorDailyReelReward({
      userId,
      reelId: result.reel.id,
      points: result.rewardPoints,
    });

    return {
      ...result.reel,
      rewardPoints: result.rewardPoints,
      dailyRewardClaimed: result.rewardPoints > 0,
      dailyRewardDate: rewardDate,
    };
  },

  async awardDailyReelUploadReward(userId: string, profileId: string, reelId: string) {
    const rewardDate = getIndiaRewardDate();
    const dailyReelPoints = await resolveDailyReelPoints();

    const rewardPoints = await prisma.$transaction(async (tx) =>
      awardCreatorDailyReelInTx(tx, {
        creatorId: profileId,
        userId,
        reelId,
        rewardDate,
        points: dailyReelPoints,
      }),
    );

    notifyCreatorDailyReelReward({ userId, reelId, points: rewardPoints });

    return {
      rewardPoints,
      dailyRewardClaimed: rewardPoints > 0,
      dailyRewardDate: rewardDate,
    };
  },

  async listReels(
    userId?: string,
    query: {
      category?: string;
      tag?: string;
      lat?: string;
      lng?: string;
      radius?: string;
      page?: string;
      limit?: string;
      q?: string;
    } = {}
  ) {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(query.limit || '10', 10)));
    const skip = (page - 1) * limit;
    const followingUserIds = userId ? await getFollowingUserIdSet(userId) : new Set<string>();

    const where: any = {
      status: 'APPROVED',
      creator: { status: 'APPROVED' },
    };

    // Search Query (q)
    if (query.q) {
      const sq = query.q;
      where.OR = [
        { title: { contains: sq, mode: 'insensitive' } },
        { description: { contains: sq, mode: 'insensitive' } },
        { category: { contains: sq, mode: 'insensitive' } },
        { tags: { has: sq } },
        { creator: { username: { contains: sq, mode: 'insensitive' } } },
        { place: { name: { contains: sq, mode: 'insensitive' } } },
        { place: { city: { contains: sq, mode: 'insensitive' } } },
        { vendor: { businessName: { contains: sq, mode: 'insensitive' } } },
        { vendor: { city: { contains: sq, mode: 'insensitive' } } },
      ];
    } else if (query.tag) {
      where.tags = { has: query.tag };
    } else if (query.category === 'BUSINESS') {
      where.vendor = getPublicVendorListingWhere();
      where.vendorListingStatus = VendorListingStatus.APPROVED;
    } else if (query.category === 'TRAVEL') {
      where.vendorId = null;
    } else if (query.category && query.category !== 'For You' && query.category !== 'Trending' && query.category !== 'Following') {
      // Category / Tag filtering
      const c = query.category.toLowerCase();
      if (c === 'hidden gems') {
        where.place = { source: 'HIDDEN_GEM' };
      } else {
        where.OR = [
          { category: { equals: query.category, mode: 'insensitive' } },
          { title: { contains: c, mode: 'insensitive' } },
          { description: { contains: c, mode: 'insensitive' } },
          { place: { category: { contains: c, mode: 'insensitive' } } },
          { vendor: { businessType: { contains: c, mode: 'insensitive' } } },
        ];
      }
    }

    // Following category filter
    if (query.category === 'Following' && userId) {
      const following = await prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
      });
      const followingCreatorUserIds = following.map((f) => f.followingId);
      where.creator = {
        userId: { in: followingCreatorUserIds },
        status: 'APPROVED',
      };
    }

    // Nearby filter within server logic
    if (query.category === 'Nearby' && query.lat && query.lng) {
      const uLat = parseFloat(query.lat);
      const uLng = parseFloat(query.lng);
      const parsedRadius = parseFloat(query.radius || '100'); // Default 100km
      // Clamp server-side: NaN/negative/absurd client radii must not widen or break the feed.
      const rad = Math.min(Math.max(Number.isFinite(parsedRadius) ? parsedRadius : 100, 1), 200);

      // Fetch all reels that link to locations
      const allLinkedReels = await prisma.reel.findMany({
        where: {
          status: 'APPROVED',
          creator: { status: 'APPROVED' },
          OR: [
            { placeId: { not: null } },
            { vendorId: { not: null }, vendorListingStatus: VendorListingStatus.APPROVED },
            { eventId: { not: null } },
          ],
        },
        include: {
          place: { select: { latitude: true, longitude: true } },
          vendor: { select: { latitude: true, longitude: true } },
          event: { select: { place: { select: { latitude: true, longitude: true } } } },
        },
      });

      // Filter by coordinates distance
      const nearbyIds = allLinkedReels
        .filter((r) => {
          let lat = 0;
          let lng = 0;
          if (r.place) {
            lat = r.place.latitude || 0;
            lng = r.place.longitude || 0;
          } else if (r.vendor) {
            lat = r.vendor.latitude || 0;
            lng = r.vendor.longitude || 0;
          } else if (r.event?.place) {
            lat = r.event.place.latitude || 0;
            lng = r.event.place.longitude || 0;
          }
          if (lat === 0 && lng === 0) return false;
          return calculateDistance(uLat, uLng, lat, lng) <= rad;
        })
        .map((r) => r.id);

      where.id = { in: nearbyIds };
    }

    // Order calculation
    let orderBy: any = { createdAt: 'desc' };
    if (query.category === 'Trending') {
      // Sort by engagement metric: views + likes * 5 + saves * 10
      // Prisma doesn't support complex sorting easily in SQLite/Postgres without raw SQL,
      // so we can order by likes/views combination or fetch and sort in memory if the list is small.
      orderBy = [
        { featured: 'desc' },
        { likes: 'desc' },
        { views: 'desc' },
      ];
    }

    const include: any = {
      ...reelResponseInclude,
    };

    if (userId) {
      include.likesList = { where: { userId } };
      include.savesList = { where: { userId } };
    }

    // Self-serve vendor reels live in `vendor_reels`, a table this query used to
    // ignore entirely, so a vendor's Reel could render on the business profile
    // and never in the normal feed. Union them in on every creator-independent
    // tab so one record satisfies both surfaces.
    const includeVendorReels = !CREATOR_SCOPED_FEED_CATEGORIES.has(query.category || '');
    const vendorReels = includeVendorReels
      ? await listEligibleFeedVendorReels(skip + limit, userId)
      : [];
    const isTrending = query.category === 'Trending';

    let items: any[];
    if ((query.category === 'For You' || !query.category) && query.lat && query.lng) {
      const uLat = parseFloat(query.lat);
      const uLng = parseFloat(query.lng);

      const allReels = await prisma.reel.findMany({
        where,
        include: {
          ...include,
          place: { select: { latitude: true, longitude: true, name: true, city: true, state: true } },
          vendor: { select: { latitude: true, longitude: true, businessName: true, city: true, state: true } },
          event: { select: { place: { select: { latitude: true, longitude: true } } } },
        },
      });

      const sorted = allReels.map((r: any) => {
        let lat = 0;
        let lng = 0;
        if (r.place) {
          lat = r.place.latitude || 0;
          lng = r.place.longitude || 0;
        } else if (r.vendor) {
          lat = r.vendor.latitude || 0;
          lng = r.vendor.longitude || 0;
        } else if (r.event?.place) {
          lat = r.event.place.latitude || 0;
          lng = r.event.place.longitude || 0;
        }

        const distance = (lat !== 0 && lng !== 0) ? calculateDistance(uLat, uLng, lat, lng) : Infinity;
        const isNearby = distance <= 100;
        return { reel: r, distance, isNearby };
      }).sort((a, b) => {
        if (a.isNearby && !b.isNearby) return -1;
        if (!a.isNearby && b.isNearby) return 1;
        if (a.isNearby && b.isNearby) {
          return a.distance - b.distance;
        }
        if (a.reel.featured !== b.reel.featured) {
          return b.reel.featured ? 1 : -1;
        }
        if (a.reel.likes !== b.reel.likes) {
          return b.reel.likes - a.reel.likes;
        }
        return b.reel.views - a.reel.views;
      });

// Rank every reel on one scale instead of appending vendor reels wholesale.
      // Sorting by engagement alone discarded For You's distance-first rule, which
      // would have let a far-away vendor reel outrank nearby creator reels.
      const vendorRanked = vendorReels.map((r: any) => ({
        reel: r,
        distance: r.vendor?.latitude != null && r.vendor?.longitude != null
          ? calculateDistance(uLat, uLng, r.vendor.latitude, r.vendor.longitude)
          : Infinity,
      }));
      const merged = [
        ...sorted,
        ...vendorRanked.map((x: any) => ({
          ...x,
          isNearby: x.distance <= 100,
        })),
      ].sort((a, b) => {
        if (a.isNearby && !b.isNearby) return -1;
        if (!a.isNearby && b.isNearby) return 1;
        if (a.isNearby && b.isNearby) return a.distance - b.distance;
        if (a.reel.featured !== b.reel.featured) return b.reel.featured ? 1 : -1;
        if (a.reel.likes !== b.reel.likes) return b.reel.likes - a.reel.likes;
        if (a.reel.views !== b.reel.views) return b.reel.views - a.reel.views;
        // Deterministic tie-break so paging cannot duplicate or drop a row.
        return new Date(b.reel.createdAt).getTime() - new Date(a.reel.createdAt).getTime();
      });
      items = merged.slice(skip, skip + limit).map((x: any) => x.reel);
    } else {
      // Over-fetch when merging so page N is not starved by one source owning the
      // first N rows; mergeFeedPages applies the real offset/limit window.
      const creatorReels = await prisma.reel.findMany({
        where,
        skip: vendorReels.length > 0 ? 0 : skip,
        take: vendorReels.length > 0 ? skip + limit : limit,
        orderBy,
        include,
      });
      items = mergeFeedPages(creatorReels, vendorReels, skip, limit, isTrending);
    }

    // Map item outputs
    return items.map((item: any) => {
      const isLiked = userId && item.likesList ? item.likesList.length > 0 : false;
      const isSaved = userId && item.savesList ? item.savesList.length > 0 : false;
      const live = applyLiveEngagement(item);
      return {
        ...live,
        isLiked,
        isSaved,
        isFollowingCreator: userId && item.creator?.userId
          ? followingUserIds.has(item.creator.userId)
          : false,
        likesList: undefined,
        savesList: undefined,
        _count: undefined,
      };
    });
  },

  async likeReel(userId: string, reelId: string) {
    const reel = await prisma.reel.findUnique({
      where: { id: reelId },
      include: {
        creator: { select: { userId: true } },
        vendor: { select: { userId: true } },
      },
    });
    // Self-serve vendor reels are a separate table but must behave identically
    // in the feed, so Like has to resolve both ids. The public-visibility gate is
    // the same one the feed itself applied.
    if (!reel) return likeVendorReel(userId, reelId);
    const isOwner = reel.creator?.userId === userId;
    const isCollabVendor = reel.vendor?.userId === userId;
    if (reel.status !== 'APPROVED' && !isOwner && !isCollabVendor) {
      throw new ApiError(404, 'Moment not found.');
    }

    const existing = await prisma.reelLike.findUnique({
      where: { reelId_userId: { reelId, userId } },
    });
    if (existing) return existing;

    const [like] = await Promise.all([
      prisma.reelLike.create({ data: { reelId, userId } }),
      prisma.reel.update({
        where: { id: reelId },
        data: { likes: { increment: 1 } },
      }),
    ]);

    return like;
  },

  async unlikeReel(userId: string, reelId: string) {
    const reel = await prisma.reel.findUnique({
      where: { id: reelId },
      include: {
        creator: { select: { userId: true } },
        vendor: { select: { userId: true } },
      },
    });
    if (!reel) return unlikeVendorReel(userId, reelId);
    const isOwner = reel.creator?.userId === userId;
    const isCollabVendor = reel.vendor?.userId === userId;
    if (reel.status !== 'APPROVED' && !isOwner && !isCollabVendor) {
      throw new ApiError(404, 'Moment not found.');
    }

    const like = await prisma.reelLike.findUnique({
      where: {
        reelId_userId: { reelId, userId },
      },
    });
    if (!like) return;

    await prisma.reelLike.delete({
      where: { id: like.id },
    });

    await prisma.reel.update({
      where: { id: reelId },
      data: { likes: { decrement: 1 } },
    });
  },

  async saveReel(userId: string, reelId: string) {
    const reel = await prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) throw new ApiError(404, 'Moment not found.');

    const existing = await prisma.reelSave.findUnique({
      where: { reelId_userId: { reelId, userId } },
    });
    if (existing) return existing;

    const [save] = await Promise.all([
      prisma.reelSave.create({ data: { reelId, userId } }),
      prisma.reel.update({
        where: { id: reelId },
        data: { saves: { increment: 1 } },
      }),
    ]);

    return save;
  },

  async unsaveReel(userId: string, reelId: string) {
    const save = await prisma.reelSave.findUnique({
      where: {
        reelId_userId: { reelId, userId },
      },
    });
    if (!save) return;

    await prisma.reelSave.delete({
      where: { id: save.id },
    });

    await prisma.reel.update({
      where: { id: reelId },
      data: { saves: { decrement: 1 } },
    });
  },

  async addComment(userId: string, reelId: string, text: string) {
    const reel = await prisma.reel.findUnique({
      where: { id: reelId },
      select: {
        id: true,
        status: true,
        creator: { select: { userId: true } },
        vendor: { select: { userId: true } },
      },
    });
    if (!reel) throw new ApiError(404, 'Moment not found.');
    if (
      !isReelVisibleToViewer(reel.status, {
        isOwner: reel.creator?.userId === userId,
        isCollabVendor: reel.vendor?.userId === userId,
      })
    ) {
      throw new ApiError(404, 'Moment not found.');
    }

    return prisma.reelComment.create({
      data: {
        reelId,
        userId,
        text,
      },
      include: {
        user: {
          select: { id: true, name: true },
        },
      },
    });
  },

  async getReelById(id: string, userId?: string) {
    const item = await prisma.reel.findUnique({
      where: { id },
      include: {
        ...reelResponseInclude,
        vendor: {
          select: { id: true, businessName: true, city: true, state: true, userId: true },
        },
        likesList: userId ? { where: { userId } } : undefined,
        savesList: userId ? { where: { userId } } : undefined,
      },
    });
    if (!item) throw new ApiError(404, 'Moment not found.');

    const isOwner = !!userId && item.creator?.userId === userId;
    const isCollabVendor = !!userId && item.vendor?.userId === userId;
    if (item.status !== 'APPROVED' && !isOwner && !isCollabVendor) {
      throw new ApiError(404, 'Moment not found.');
    }

    let isFollowingCreator = false;
    if (userId && item.creator?.userId) {
      const followingUserIds = await getFollowingUserIdSet(userId);
      isFollowingCreator = followingUserIds.has(item.creator.userId);
    }

    const isLiked = userId ? item.likesList.length > 0 : false;
    const isSaved = userId ? item.savesList.length > 0 : false;
    const live = applyLiveEngagement(item);
    return {
      ...live,
      isLiked,
      isSaved,
      isFollowingCreator,
      likesList: undefined,
      savesList: undefined,
      vendor: item.vendor
        ? {
            id: item.vendor.id,
            businessName: item.vendor.businessName,
            city: item.vendor.city,
            state: item.vendor.state,
          }
        : null,
    };
  },

  async listComments(reelId: string, userId?: string) {
    const reel = await prisma.reel.findUnique({
      where: { id: reelId },
      select: {
        status: true,
        creator: { select: { userId: true } },
        vendor: { select: { userId: true } },
      },
    });
    if (!reel) throw new ApiError(404, 'Moment not found.');
    if (
      !isReelVisibleToViewer(reel.status, {
        isOwner: !!userId && reel.creator?.userId === userId,
        isCollabVendor: !!userId && reel.vendor?.userId === userId,
      })
    ) {
      throw new ApiError(404, 'Moment not found.');
    }
    return prisma.reelComment.findMany({
      where: { reelId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        user: {
          select: { id: true, name: true },
        },
      },
    });
  },

  async reportReel(userId: string, reelId: string, reason: string) {
    const reel = await prisma.reel.findUnique({
      where: { id: reelId },
      select: {
        id: true,
        status: true,
        creator: { select: { userId: true } },
        vendor: { select: { userId: true } },
      },
    });
    if (!reel) throw new ApiError(404, 'Moment not found.');
    if (
      !isReelVisibleToViewer(reel.status, {
        isOwner: reel.creator?.userId === userId,
        isCollabVendor: reel.vendor?.userId === userId,
      })
    ) {
      throw new ApiError(404, 'Moment not found.');
    }
    return prisma.reelReport.create({
      data: { reelId, userId, reason },
    });
  },

  async listReelReports(query: { status?: ReelReportStatus; page?: string; limit?: string }) {
    const pagination = getPaginationParams({ page: query.page, limit: query.limit });
    const where: Prisma.ReelReportWhereInput | undefined = query.status ? { status: query.status } : undefined;
    const [reports, total] = await Promise.all([
      prisma.reelReport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
        include: {
          reel: { select: { id: true, title: true, creatorId: true } },
          user: { select: { id: true, email: true, name: true } },
        },
      }),
      prisma.reelReport.count({ where }),
    ]);
    return paginatedResponse(reports, total, pagination);
  },

  /**
   * Record a reel view.
   *
   * Authenticated viewers are de-duplicated by the `reel_views` unique index on
   * (reel_id, user_id), which is permanent and enforced by Postgres — the
   * public counter moves exactly once no matter how often the reel is opened,
   * replayed, or requested concurrently. Anonymous callers have no durable
   * identity, so they keep the existing best-effort IP/session slot; see
   * `claimActionSlot`.
   */
  async incrementViews(reelId: string, actorKey: string, viewerUserId?: string | null) {
    const reel = await prisma.reel.findUnique({
      where: { id: reelId },
      select: { id: true, views: true, status: true, creatorId: true, creator: { select: { userId: true } } },
    });
    if (!reel) throw new ApiError(404, 'Moment not found.');
    const isOwner = reel.creator.userId === viewerUserId;
    if (!isReelVisibleToViewer(reel.status, { isOwner })) {
      throw new ApiError(404, 'Moment not found.');
    }

    const readCurrent = async () => {
      // Re-read rather than reuse the value fetched at the start of the request:
      // a duplicate usually means a competing transaction just committed.
      const current = await prisma.reel.findUnique({
        where: { id: reelId },
        select: { id: true, views: true },
      });
      return { id: reelId, views: current?.views ?? reel.views };
    };

    if (!viewerUserId) {
      // Anonymous: no durable identity exists without inventing one, so fall
      // back to the pre-existing short-lived per-actor slot.
      const claimed = await claimActionSlot(`reel-view:${reelId}:${actorKey}`, REEL_VIEW_DEDUP_MS);
      if (!claimed) {
        return { ...(await readCurrent()), counted: false, outcome: 'anonymous-duplicate' as const };
      }
      // Still transactional, so the public counter and the creator's lifetime
      // total can never drift apart.
      const updated = await prisma.$transaction(async (tx) => {
        const bumped = await tx.reel.update({
          where: { id: reelId },
          data: { views: { increment: 1 } },
          select: { id: true, views: true },
        });
        await tx.creatorProfile.update({
          where: { id: reel.creatorId },
          data: { totalViews: { increment: 1 } },
        });
        return bumped;
      });
      return { ...updated, counted: true, outcome: 'anonymous' as const };
    }

    // The insert and the increment share one transaction: if the insert loses
    // the unique-index race, the increment is rolled back with it.
    const bumpInsideTx = async (tx: Prisma.TransactionClient) => {
      await tx.reelView.create({ data: { reelId, userId: viewerUserId } });
      const updated = await tx.reel.update({
        where: { id: reelId },
        data: { views: { increment: 1 } },
        select: { id: true, views: true },
      });
      await tx.creatorProfile.update({
        where: { id: reel.creatorId },
        data: { totalViews: { increment: 1 } },
      });
      return updated;
    };

    let decision: Awaited<ReturnType<typeof recordUniqueView<{ id: string; views: number }>>>;
    try {
      decision = await recordUniqueView({
        isOwner,
        claimUniqueViewer: () => prisma.$transaction((tx) => bumpInsideTx(tx)),
        readCurrent,
      });
    } catch (err) {
      // A transient write failure must not break playback, but it must be
      // visible — otherwise view counts silently under-report.
      logger.warn(
        { err, reelId, viewerUserId },
        '[REEL-VIEW] failed to record view; returning current count uncounted',
      );
      return { ...(await readCurrent()), counted: false, outcome: 'error' as const };
    }

    return { ...decision.result, counted: decision.counted, outcome: decision.outcome };
  },

  async incrementShares(reelId: string, actorKey: string, viewerUserId?: string | null) {
    const reel = await prisma.reel.findUnique({
      where: { id: reelId },
      select: {
        id: true,
        shares: true,
        status: true,
        creator: { select: { userId: true } },
        vendor: { select: { userId: true } },
      },
    });
    // Same dual-table resolution as Like, so sharing a vendor reel from the feed
    // records a share instead of 404-ing behind a swallowed client catch.
    if (!reel) return incrementVendorReelShares(reelId, actorKey);
    if (
      !isReelVisibleToViewer(reel.status, {
        isOwner: !!viewerUserId && reel.creator?.userId === viewerUserId,
        isCollabVendor: !!viewerUserId && reel.vendor?.userId === viewerUserId,
      })
    ) {
      throw new ApiError(404, 'Moment not found.');
    }

    const claimed = await claimActionSlot(`reel-share:${reelId}:${actorKey}`, REEL_SHARE_DEDUP_MS);
    if (!claimed) {
      return { id: reel.id, shares: reel.shares };
    }

    return prisma.reel.update({
      where: { id: reelId },
      data: { shares: { increment: 1 } },
      select: { id: true, shares: true },
    });
  },

  // ── Admin Operations ──

  async listCreatorApplications(status?: string) {
    const validStatuses = new Set(Object.values(CreatorStatus));
    if (status && !validStatuses.has(status as CreatorStatus)) {
      throw new ApiError(400, 'Invalid creator application status.');
    }

    return prisma.creatorProfile.findMany({
      where: status ? { status: status as CreatorStatus } : undefined,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async deleteReel(id: string) {
    return prisma.reel.delete({ where: { id } });
  },

  async toggleFeatureReel(id: string, featured: boolean) {
    return prisma.reel.update({
      where: { id },
      data: { featured },
    });
  },

  async createCollection(userId: string, input: any) {
    return prisma.collection.create({
      data: {
        userId,
        name: input.name,
        description: input.description || null,
        isPublic: input.isPublic !== undefined ? input.isPublic : true,
      },
    });
  },

  async listCollections(userId: string) {
    return prisma.collection.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  },

  async getCollection(id: string, userId: string) {
    const collection = await prisma.collection.findUnique({
      where: { id },
      include: {
        places: {
          include: {
            place: true,
          },
        },
      },
    });
    if (!collection) throw new ApiError(404, 'Collection not found.');
    if (collection.userId !== userId && !collection.isPublic) {
      throw new ApiError(403, 'You do not have access to this private collection.');
    }
    return collection;
  },

  async updateCollection(id: string, userId: string, input: { name?: string; description?: string; isPublic?: boolean }) {
    const collection = await prisma.collection.findUnique({
      where: { id },
    });
    if (!collection) throw new ApiError(404, 'Collection not found.');
    if (collection.userId !== userId) throw new ApiError(403, 'Not your collection.');

    return prisma.collection.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.isPublic !== undefined && { isPublic: input.isPublic }),
      },
    });
  },

  async deleteCollection(id: string, userId: string) {
    const collection = await prisma.collection.findUnique({
      where: { id },
    });
    if (!collection) throw new ApiError(404, 'Collection not found.');
    if (collection.userId !== userId) throw new ApiError(403, 'Not your collection.');

    await prisma.collection.delete({
      where: { id },
    });
  },

  async addPlaceToCollection(collectionId: string, userId: string, input: any) {
    const collection = await prisma.collection.findUnique({
      where: { id: collectionId },
    });
    if (!collection) throw new ApiError(404, 'Collection not found.');
    if (collection.userId !== userId) throw new ApiError(403, 'Not your collection.');

    const place = await prisma.place.findUnique({
      where: { id: input.placeId },
    });
    if (!place) throw new ApiError(404, 'Place not found.');

    return prisma.collectionPlace.upsert({
      where: {
        collectionId_placeId: {
          collectionId,
          placeId: input.placeId,
        },
      },
      update: {
        note: input.note || null,
      },
      create: {
        collectionId,
        placeId: input.placeId,
        note: input.note || null,
      },
    });
  },

  async removePlaceFromCollection(collectionId: string, placeId: string, userId: string) {
    const collection = await prisma.collection.findUnique({
      where: { id: collectionId },
    });
    if (!collection) throw new ApiError(404, 'Collection not found.');
    if (collection.userId !== userId) throw new ApiError(403, 'Not your collection.');

    await prisma.collectionPlace.deleteMany({
      where: {
        collectionId,
        placeId,
      },
    });
  },
};
