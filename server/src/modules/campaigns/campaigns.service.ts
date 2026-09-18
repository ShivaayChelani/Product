import { prisma } from '../../config/database';
import { ApiError } from '../../shared/utils/ApiError';
import crypto from 'crypto';
import type { ClaimStatus } from '@prisma/client';
import type { CreateCampaignInput, UpdateCampaignInput, CampaignQueryInput } from './campaigns.validation';
import { publicActiveCampaignsWhere } from './campaign-eligibility';

const ALLOWED_CLAIM_TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  PENDING: ['APPROVED', 'REJECTED'],
  APPROVED: ['SHIPPED', 'REJECTED'],
  SHIPPED: ['DELIVERED', 'REJECTED'],
  REJECTED: [],
  DELIVERED: [],
};

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
    if (!input.totalWinnerSlots || input.totalWinnerSlots < 1) {
      throw new ApiError(400, 'Total winner slots must be at least 1');
    }
    const slots = input.totalWinnerSlots;
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

    if (input.totalWinnerSlots !== undefined && input.totalWinnerSlots < 1) {
      throw new ApiError(400, 'Total winner slots must be at least 1');
    }

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

    return prisma.rewardCampaign.update({
      where: { id },
      data: dataToUpdate,
    });
  },

  async deleteCampaign(id: string) {
    const existing = await prisma.rewardCampaign.findUnique({
      where: { id },
      select: { id: true, status: true, _count: { select: { claims: true } } },
    });
    if (!existing) throw new ApiError(404, 'Campaign not found');

    if (existing._count.claims > 0) {
      throw new ApiError(
        409,
        'Campaign has claims and cannot be deleted. Reject or settle claims first, or deactivate the campaign instead.',
      );
    }

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
      take: 100,
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
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  },

  async updateClaimStatus(claimId: string, status: ClaimStatus) {
    return prisma.$transaction(async (tx) => {
      // Lock the claim row so concurrent admin actions serialize (blocks double refunds).
      const locked = await tx.$queryRaw<Array<{
        id: string;
        status: ClaimStatus;
        points_spent: number;
        campaign_id: string;
        user_id: string;
      }>>`
        SELECT id, status, points_spent, campaign_id, user_id
        FROM "reward_claims"
        WHERE id = ${claimId}
        FOR UPDATE
      `;

      if (!locked.length) throw new ApiError(404, 'Claim not found');
      const claimRow = locked[0];

      const allowed = ALLOWED_CLAIM_TRANSITIONS[claimRow.status] ?? [];
      if (!allowed.includes(status)) {
        throw new ApiError(400, `Invalid status transition from ${claimRow.status} to ${status}`);
      }

      if (status === 'REJECTED') {
        // Atomic financial reversal matching the redemption refund pattern:
        // refund points, reverse lifetimeSpent, restore the winner slot, and record
        // an EARN entry so the ledger stays balanced. REJECTED is terminal.
        const points = claimRow.points_spent;
        const userWallet = await tx.wallet.findUnique({ where: { userId: claimRow.user_id } });
        if (userWallet) {
          await tx.wallet.update({
            where: { userId: claimRow.user_id },
            data: {
              palPoints: { increment: points },
              lifetimeSpent: Math.max(0, (userWallet.lifetimeSpent || 0) - points),
            },
          });
          await tx.walletTransaction.create({
            data: {
              walletId: userWallet.id,
              userId: claimRow.user_id,
              amount: points,
              type: 'EARN',
              reason: `campaign_claim_refund:${claimId}`,
              referenceId: claimRow.campaign_id,
              referenceType: 'CAMPAIGN',
            },
          });
        }

        await tx.rewardCampaign.updateMany({
          where: { id: claimRow.campaign_id },
          data: { remainingWinnerSlots: { increment: 1 } },
        });
      }

      return tx.rewardClaim.update({
        where: { id: claimId },
        data: { status },
        include: {
          user: { select: { id: true, name: true, email: true } },
          campaign: { select: { id: true, name: true, imageUrl: true } },
        },
      });
    });
  }
};
