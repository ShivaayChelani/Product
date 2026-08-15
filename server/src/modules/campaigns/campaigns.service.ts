import { prisma } from '../../config/database';
import { ApiError } from '../../shared/utils/ApiError';
import crypto from 'crypto';
import type { CreateCampaignInput, UpdateCampaignInput, CampaignQueryInput } from './campaigns.validation';
import { publicActiveCampaignsWhere } from './campaign-eligibility';

export const campaignsService = {
  async listCampaigns(query: CampaignQueryInput) {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
    const skip = (page - 1) * limit;
    const now = new Date();

    const where: any = {};
    if (query.status === 'ACTIVE') {
      Object.assign(where, publicActiveCampaignsWhere(now));
    } else if (query.status) {
      where.status = query.status;
    }
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    const orderBy: any = query.sort === 'points_asc'
      ? { pointsRequired: 'asc' }
      : query.sort === 'points_desc'
        ? { pointsRequired: 'desc' }
        : { createdAt: 'desc' };

    const [data, total] = await Promise.all([
      prisma.rewardCampaign.findMany({
        where,
        skip,
        take: limit,
        orderBy,
      }),
      prisma.rewardCampaign.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  },

  async getCampaignById(id: string) {
    const campaign = await prisma.rewardCampaign.findUnique({
      where: { id },
    });
    if (!campaign) throw new ApiError(404, 'Campaign not found');
    return campaign;
  },

  async createCampaign(input: CreateCampaignInput) {
    const slots = input.totalWinnerSlots && input.totalWinnerSlots > 0 ? input.totalWinnerSlots : 1;
    return prisma.rewardCampaign.create({
      data: {
        ...input,
        totalWinnerSlots: slots,
        remainingWinnerSlots: slots,
        status: input.status || 'ACTIVE',
      },
    });
  },

  async updateCampaign(id: string, input: UpdateCampaignInput) {
    const existing = await prisma.rewardCampaign.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, 'Campaign not found');

    const dataToUpdate: Record<string, unknown> = { ...input };

    const nextTotal = input.totalWinnerSlots ?? existing.totalWinnerSlots;

    if (input.remainingWinnerSlots !== undefined) {
      // Admin set remaining explicitly (repair path for negative / wrong values)
      dataToUpdate.remainingWinnerSlots = Math.min(
        Math.max(0, input.remainingWinnerSlots),
        nextTotal,
      );
    } else if (input.totalWinnerSlots !== undefined) {
      // Only total changed — keep claimed count, clamp remaining into [0, newTotal]
      const claimed = Math.max(0, existing.totalWinnerSlots - existing.remainingWinnerSlots);
      dataToUpdate.remainingWinnerSlots = Math.max(0, nextTotal - claimed);
    }

    if (input.totalWinnerSlots !== undefined && input.totalWinnerSlots < 1) {
      throw new ApiError(400, 'Total winner slots must be at least 1');
    }

    return prisma.rewardCampaign.update({
      where: { id },
      data: dataToUpdate,
    });
  },

  async deleteCampaign(id: string) {
    const existing = await prisma.rewardCampaign.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, 'Campaign not found');
    
    await prisma.rewardCampaign.delete({ where: { id } });
  },

  async claimReward(userId: string, campaignId: string, notes?: string) {
    // 1. Fetch Campaign & Wallet
    const [campaign, wallet, userClaims] = await Promise.all([
      prisma.rewardCampaign.findUnique({ where: { id: campaignId } }),
      prisma.wallet.findUnique({ where: { userId } }),
      prisma.rewardClaim.count({ where: { userId, campaignId } }),
    ]);

    if (!campaign) throw new ApiError(404, 'Campaign not found');
    if (!wallet) throw new ApiError(404, 'Wallet not found');

    // 2. Validate Campaign status, dates, and slots
    if (campaign.status !== 'ACTIVE') throw new ApiError(400, 'Campaign is not active');
    const now = new Date();
    if (now < campaign.startDate || now > campaign.endDate) {
      throw new ApiError(400, 'Campaign is not currently running');
    }
    if (campaign.remainingWinnerSlots <= 0) {
      throw new ApiError(400, 'All rewards for this campaign have been claimed');
    }

    // 3. Validate user limits
    if (userClaims >= campaign.maxClaimsPerUser) {
      throw new ApiError(400, `You have reached the maximum claim limit for this campaign`);
    }

    // 4. Validate points
    if (wallet.palPoints < campaign.pointsRequired) {
      throw new ApiError(400, 'Insufficient Pal Points');
    }

    // 5. Execute Atomic Transaction
    const redemptionId = 'CLAIM-' + crypto.randomBytes(4).toString('hex').toUpperCase();

    const result = await prisma.$transaction(async (tx) => {
      // Lock campaign for update to prevent race conditions on remaining slots
      const currentCampaign = await tx.$queryRaw<any[]>`
        SELECT "remaining_winner_slots", "status" FROM "reward_campaigns" 
        WHERE "id" = ${campaignId} FOR UPDATE
      `;
      
      if (!currentCampaign.length || currentCampaign[0].status !== 'ACTIVE') {
         throw new ApiError(400, 'Campaign is no longer active');
      }
      
      if (currentCampaign[0].remaining_winner_slots <= 0) {
         throw new ApiError(400, 'All rewards have been claimed by others');
      }

      // Re-check per-user limit inside the lock (prevents concurrent over-claim)
      const lockedUserClaims = await tx.rewardClaim.count({ where: { userId, campaignId } });
      if (lockedUserClaims >= campaign.maxClaimsPerUser) {
        throw new ApiError(400, `You have reached the maximum claim limit for this campaign`);
      }

      // Deduct points only if balance is still sufficient (atomic)
      const walletUpdate = await tx.wallet.updateMany({
        where: { userId, palPoints: { gte: campaign.pointsRequired } },
        data: {
          palPoints: { decrement: campaign.pointsRequired },
          lifetimeSpent: { increment: campaign.pointsRequired },
        },
      });
      if (walletUpdate.count === 0) {
        throw new ApiError(400, 'Insufficient Pal Points');
      }

      // Log Transaction (SPEND amounts are negative so ledger Σ matches balance)
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          userId,
          amount: -campaign.pointsRequired,
          type: 'SPEND',
          reason: `Claimed reward: ${campaign.name}`,
          referenceId: campaignId,
          referenceType: 'CAMPAIGN',
        },
      });

      // Decrement Slots
      await tx.rewardCampaign.update({
        where: { id: campaignId },
        data: {
          remainingWinnerSlots: { decrement: 1 },
        },
      });

      // Create Claim
      const claim = await tx.rewardClaim.create({
        data: {
          userId,
          campaignId,
          redemptionId,
          pointsSpent: campaign.pointsRequired,
          notes,
          status: 'PENDING',
        },
        include: {
          campaign: true,
        }
      });

      return claim;
    });

    return result;
  },

  async getUserClaims(userId: string) {
    return prisma.rewardClaim.findMany({
      where: { userId },
      include: {
        campaign: true,
      },
      orderBy: { claimedAt: 'desc' },
    });
  },

  async listAllClaims(query: { status?: string; campaignId?: string; page?: string; limit?: string }) {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.campaignId) where.campaignId = query.campaignId;

    const [data, total] = await Promise.all([
      prisma.rewardClaim.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
          campaign: { select: { id: true, name: true, imageUrl: true } },
        },
        skip,
        take: limit,
        orderBy: { claimedAt: 'desc' },
      }),
      prisma.rewardClaim.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async updateClaimStatus(claimId: string, status: any) {
    const existing = await prisma.rewardClaim.findUnique({ where: { id: claimId } });
    if (!existing) throw new ApiError(404, 'Claim not found');

    return prisma.rewardClaim.update({
      where: { id: claimId },
      data: { status },
    });
  }
};
