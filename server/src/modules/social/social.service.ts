import { prisma } from '../../config/database';
import { CreatorStatus, Role, RoleAssignmentStatus } from '@prisma/client';
import { ApiError, ErrorCodes } from '../../shared/utils/ApiError';
import { mapCreatorStatusToRoleStatus } from '../../shared/utils/specialtyRoles';
import { roleTransitionService } from '../../shared/services/roleTransition.service';
import { notificationService } from '../notifications/notification.service';
import { pointRulesService } from '../point-rules/pointRules.service';
import { planEnforcementService } from '../monetization/plan-enforcement.service';
import { publicVendorListingWhere } from '../vendors/vendor-public-visibility';
import type {
  ApplyCreatorInput,
  UpdateCreatorProfileInput,
  CreateReelInput,
} from './social.validation';

const CREATOR_DAILY_REEL_FALLBACK_POINTS = 50;
const IST_OFFSET_MS = 330 * 60 * 1000;

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

async function getFollowingUserIdSet(followerId: string): Promise<Set<string>> {
  const rows = await prisma.follow.findMany({
    where: { followerId },
    select: { followingId: true },
  });
  return new Set(rows.map((row) => row.followingId));
}

function getIndiaRewardDate(now = new Date()): string {
  const istDate = new Date(now.getTime() + IST_OFFSET_MS);
  return istDate.toISOString().slice(0, 10);
}

const reelResponseInclude = {
  creator: {
    select: { id: true, username: true, avatar: true, verified: true, userId: true },
  },
  place: {
    select: { id: true, name: true, city: true, state: true },
  },
  vendor: {
    select: { id: true, businessName: true, city: true, state: true },
  },
  collaboration: {
    select: {
      id: true,
      campaignTitle: true,
      status: true,
      vendor: { select: { id: true, businessName: true, city: true, state: true } },
      creator: { select: { id: true, username: true, fullName: true, avatar: true, verified: true } },
    },
  },
  event: {
    select: { id: true, title: true },
  },
};

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

      const [existingForUser, existingForUsername] = await Promise.all([
        tx.creatorProfile.findUnique({ where: { userId } }),
        tx.creatorProfile.findUnique({ where: { username: input.username } }),
      ]);

      if (existingForUsername && existingForUsername.userId !== userId) {
        throw new ApiError(400, 'Username is already taken.');
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
        username: input.username,
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
          })
        : await tx.creatorProfile.create({
            data: {
              userId,
              ...profileData,
              status: 'PENDING',
            },
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
    const cleaned = rawUsername.trim().toLowerCase().replace(/^@+/, '');
    const profile = await prisma.creatorProfile.findFirst({
      where: { username: { equals: cleaned, mode: 'insensitive' }, status: 'APPROVED' },
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
      followerCount,
      followingCount,
      isFollowing,
      badges,
      totalLikes: reelTotals._sum.likes ?? 0,
      reelCount: reelTotals._count.id ?? profile.reels?.length ?? 0,
      citiesCount,
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
        _sum: { likes: true },
      }),
      prisma.reelComment.count({ where: { reel: { creatorId: profile.id } } }),
      prisma.reel.findMany({
        where: { creatorId: profile.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: reelResponseInclude,
      }),
      prisma.creatorDailyReward.findUnique({
        where: { creatorId_rewardDate: { creatorId: profile.id, rewardDate } },
      }),
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
      recentReels,
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
        _sum: { views: true, likes: true, saves: true },
      }),
      prisma.reelComment.count({ where: { reel: { creatorId: profile.id } } }),
      prisma.reel.findMany({
        where: { creatorId: profile.id },
        orderBy: { views: 'desc' },
        take: 5,
        include: reelResponseInclude,
      }),
    ]);
    const views = totals._sum.views ?? 0;
    const likes = totals._sum.likes ?? 0;
    const saves = totals._sum.saves ?? 0;
    return {
      period,
      kpis: {
        views,
        likes,
        comments,
        saves,
        engagementRate: views ? Number((((likes + comments + saves) / views) * 100).toFixed(2)) : 0,
      },
      topReels,
      note: period === 'all'
        ? 'Totals are calculated from current reel aggregates.'
        : 'Historical view events are not recorded, so this period uses current reel aggregates.',
    };
  },

  async listMyReels(userId: string, pageInput?: string, limitInput?: string) {
    const profile = await this.getApprovedCreatorProfile(userId);
    const page = Math.max(1, parseInt(pageInput || '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(limitInput || '20', 10) || 20));
    const where = { creatorId: profile.id };
    const [items, total] = await Promise.all([
      prisma.reel.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: reelResponseInclude,
      }),
      prisma.reel.count({ where }),
    ]);
    const commentCounts = await prisma.reelComment.groupBy({
      by: ['reelId'],
      where: { reelId: { in: items.map((item) => item.id) } },
      _count: { _all: true },
    });
    const commentsByReel = new Map(commentCounts.map((item) => [item.reelId, item._count._all]));
    return {
      items: items.map((item) => ({ ...item, commentsCount: commentsByReel.get(item.id) ?? 0 })),
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
      placeId?: string | null;
      vendorId?: string | null;
      eventId?: string | null;
    },
  ) {
    const profile = await this.getApprovedCreatorProfile(userId);
    const reel = await prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) throw new ApiError(404, 'Reel not found.');
    if (reel.creatorId !== profile.id) throw new ApiError(403, 'You can only edit your own reels.');

    const dataToUpdate: any = {};
    if (input.title !== undefined) dataToUpdate.title = input.title;
    if (input.description !== undefined) dataToUpdate.description = input.description;
    if (input.thumbnail !== undefined) dataToUpdate.thumbnail = input.thumbnail;
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
    if (input.vendorId !== undefined) dataToUpdate.vendorId = input.vendorId;
    if (input.eventId !== undefined) dataToUpdate.eventId = input.eventId;

    return prisma.reel.update({ where: { id: reelId }, data: dataToUpdate, include: reelResponseInclude });
  },

  async deleteOwnReel(userId: string, reelId: string) {
    const profile = await this.getApprovedCreatorProfile(userId);
    const reel = await prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) throw new ApiError(404, 'Reel not found.');
    if (reel.creatorId !== profile.id) throw new ApiError(403, 'You can only delete your own reels.');

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
                  ? { status: 'IN_PROGRESS', revisionFeedback: 'Reel deleted by creator' }
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
      throw new ApiError(403, 'Only approved travel creators can publish reels.');
    }

    await planEnforcementService.assertCreatorCanUploadReel(userId);

    const rewardDate = getIndiaRewardDate();
    const reelRule = await pointRulesService.getPointsForAction('reel_upload');
    const dailyReelPoints = reelRule?.points ?? CREATOR_DAILY_REEL_FALLBACK_POINTS;

    let resolvedPlaceId: string | null = null;
    if (input.placeId?.trim()) {
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
      resolvedPlaceId = foundPlace?.id ?? null;
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
          thumbnail: input.thumbnail,
          title: input.title || input.description?.slice(0, 200) || null,
          description: input.description,
          placeId: resolvedPlaceId,
          vendorId: input.vendorId || null,
          eventId: input.eventId || null,
        },
        include: reelResponseInclude,
      });

      const reward = await tx.creatorDailyReward.createMany({
        data: [{
          creatorId: profile.id,
          userId,
          reelId: reel.id,
          rewardDate,
          points: dailyReelPoints,
        }],
        skipDuplicates: true,
      });

      const rewardPoints = reward.count > 0 ? dailyReelPoints : 0;
      if (rewardPoints > 0) {
        const wallet = await tx.wallet.upsert({
          where: { userId },
          update: {
            palPoints: { increment: rewardPoints },
            lifetimeEarned: { increment: rewardPoints },
          },
          create: {
            userId,
            palPoints: rewardPoints,
            lifetimeEarned: rewardPoints,
          },
        });

        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            userId,
            amount: rewardPoints,
            type: 'EARN',
            reason: 'reel_upload',
            referenceId: reel.id,
            referenceType: 'CREATOR_DAILY_REEL',
          },
        });
      }

      return { reel, rewardPoints };
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
    const reelRule = await pointRulesService.getPointsForAction('reel_upload');
    const dailyReelPoints = reelRule?.points ?? CREATOR_DAILY_REEL_FALLBACK_POINTS;

    const rewardPoints = await prisma.$transaction(async (tx) => {
      const reward = await tx.creatorDailyReward.createMany({
        data: [{
          creatorId: profileId,
          userId,
          reelId,
          rewardDate,
          points: dailyReelPoints,
        }],
        skipDuplicates: true,
      });

      const points = reward.count > 0 ? dailyReelPoints : 0;
      if (points > 0) {
        const wallet = await tx.wallet.upsert({
          where: { userId },
          update: {
            palPoints: { increment: points },
            lifetimeEarned: { increment: points },
          },
          create: {
            userId,
            palPoints: points,
            lifetimeEarned: points,
          },
        });

        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            userId,
            amount: points,
            type: 'EARN',
            reason: 'reel_upload',
            referenceId: reelId,
            referenceType: 'CREATOR_DAILY_REEL',
          },
        });
      }

      return points;
    });

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
        { creator: { username: { contains: sq, mode: 'insensitive' } } },
        { place: { name: { contains: sq, mode: 'insensitive' } } },
        { place: { city: { contains: sq, mode: 'insensitive' } } },
        { vendor: { businessName: { contains: sq, mode: 'insensitive' } } },
        { vendor: { city: { contains: sq, mode: 'insensitive' } } },
      ];
    } else if (query.category === 'BUSINESS') {
      where.vendor = publicVendorListingWhere;
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
      const rad = parseFloat(query.radius || '100'); // Default 100km

      // Fetch all reels that link to locations
      const allLinkedReels = await prisma.reel.findMany({
        where: {
          status: 'APPROVED',
          creator: { status: 'APPROVED' },
          OR: [
            { placeId: { not: null } },
            { vendorId: { not: null } },
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
      creator: {
        select: { id: true, username: true, avatar: true, verified: true, userId: true },
      },
      place: {
        select: { id: true, name: true, city: true, state: true },
      },
      vendor: {
        select: { id: true, businessName: true, city: true, state: true },
      },
      collaboration: {
        select: {
          id: true,
          campaignTitle: true,
          status: true,
          vendor: { select: { id: true, businessName: true, city: true, state: true } },
          creator: { select: { id: true, username: true, fullName: true, avatar: true, verified: true } },
        },
      },
      event: {
        select: { id: true, title: true },
      },
      _count: {
        select: { comments: true },
      },
    };

    if (userId) {
      include.likesList = { where: { userId } };
      include.savesList = { where: { userId } };
    }

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

      items = sorted.slice(skip, skip + limit).map((x) => x.reel);
    } else {
      items = await prisma.reel.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include,
      });
    }

    // Map item outputs
    return items.map((item: any) => {
      const isLiked = userId && item.likesList ? item.likesList.length > 0 : false;
      const isSaved = userId && item.savesList ? item.savesList.length > 0 : false;
      const commentsCount = item._count?.comments ?? 0;
      return {
        ...item,
        commentsCount,
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
    if (!reel) throw new ApiError(404, 'Reel not found.');
    const isOwner = reel.creator?.userId === userId;
    const isCollabVendor = reel.vendor?.userId === userId;
    if (reel.status !== 'APPROVED' && !isOwner && !isCollabVendor) {
      throw new ApiError(404, 'Reel not found.');
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
    if (!reel) throw new ApiError(404, 'Reel not found.');
    const isOwner = reel.creator?.userId === userId;
    const isCollabVendor = reel.vendor?.userId === userId;
    if (reel.status !== 'APPROVED' && !isOwner && !isCollabVendor) {
      throw new ApiError(404, 'Reel not found.');
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
    if (!reel) throw new ApiError(404, 'Reel not found.');

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
    const reel = await prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) throw new ApiError(404, 'Reel not found.');

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
        creator: {
          select: { id: true, username: true, avatar: true, verified: true, userId: true },
        },
        place: {
          select: { id: true, name: true, city: true, state: true },
        },
        vendor: {
          select: { id: true, businessName: true, city: true, state: true, userId: true },
        },
        collaboration: {
          select: {
            id: true,
            campaignTitle: true,
            status: true,
            vendor: { select: { id: true, businessName: true, city: true, state: true } },
            creator: { select: { id: true, username: true, fullName: true, avatar: true, verified: true } },
          },
        },
        event: {
          select: { id: true, title: true },
        },
        likesList: userId ? { where: { userId } } : undefined,
        savesList: userId ? { where: { userId } } : undefined,
      },
    });
    if (!item) throw new ApiError(404, 'Reel not found.');

    const isOwner = !!userId && item.creator?.userId === userId;
    const isCollabVendor = !!userId && item.vendor?.userId === userId;
    if (item.status !== 'APPROVED' && !isOwner && !isCollabVendor) {
      throw new ApiError(404, 'Reel not found.');
    }

    let isFollowingCreator = false;
    if (userId && item.creator?.userId) {
      const followingUserIds = await getFollowingUserIdSet(userId);
      isFollowingCreator = followingUserIds.has(item.creator.userId);
    }

    const isLiked = userId ? item.likesList.length > 0 : false;
    const isSaved = userId ? item.savesList.length > 0 : false;
    return {
      ...item,
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

  async listComments(reelId: string) {
    return prisma.reelComment.findMany({
      where: { reelId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, name: true },
        },
      },
    });
  },

  async reportReel(userId: string, reelId: string, reason: string) {
    const reel = await prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) throw new ApiError(404, 'Reel not found.');
    return prisma.reelReport.create({
      data: { reelId, userId, reason },
    });
  },

  async listReelReports(status?: string) {
    return prisma.reelReport.findMany({
      where: status ? { status: status as any } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        reel: { select: { id: true, title: true, creatorId: true } },
        user: { select: { id: true, email: true, name: true } },
      },
    });
  },

  async incrementViews(reelId: string) {
    const reel = await prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) throw new ApiError(404, 'Reel not found.');

    await prisma.reel.update({
      where: { id: reelId },
      data: { views: { increment: 1 } },
    });

    // Increment creator total views
    await prisma.creatorProfile.update({
      where: { id: reel.creatorId },
      data: { totalViews: { increment: 1 } },
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
