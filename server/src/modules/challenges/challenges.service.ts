import { prisma } from '../../config/database';
import { ApiError } from '../../shared/utils/ApiError';
import { walletService } from '../wallet/wallet.service';
import { ChallengeDifficulty, ChallengeProofType, ChallengeStatus } from '@prisma/client';

export interface CreateChallengeInput {
  title: string;
  description: string;
  difficulty: ChallengeDifficulty;
  category: string;
  proofRequired: ChallengeProofType;
}

export const challengesService = {
  async listApproved(query: { category?: string; difficulty?: ChallengeDifficulty; search?: string; page?: number; limit?: number }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = { status: ChallengeStatus.APPROVED };

    if (query.category) {
      where.category = { equals: query.category, mode: 'insensitive' };
    }

    if (query.difficulty) {
      where.difficulty = query.difficulty;
    }

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.challenge.findMany({
        where,
        orderBy: [{ isFeatured: 'desc' }, { isTrending: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
        include: {
          creator: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      prisma.challenge.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  },

  async getById(id: string) {
    const challenge = await prisma.challenge.findUnique({
      where: { id },
      include: {
        creator: {
          select: { id: true, name: true, email: true, badges: true },
        },
      },
    });

    if (!challenge) {
      throw new ApiError(404, 'Challenge not found');
    }

    return challenge;
  },

  async listMyCreated(userId: string) {
    return prisma.challenge.findMany({
      where: { creatorId: userId },
      orderBy: { createdAt: 'desc' },
    });
  },

  async create(userId: string, data: CreateChallengeInput) {
    return prisma.challenge.create({
      data: {
        title: data.title,
        description: data.description,
        difficulty: data.difficulty,
        category: data.category,
        proofRequired: data.proofRequired,
        creatorId: userId,
        status: ChallengeStatus.PENDING,
      },
    });
  },

  async updateStatus(id: string, status: ChallengeStatus, actorId: string, rejectionReason?: string) {
    const challenge = await prisma.challenge.findUnique({ where: { id } });
    if (!challenge) {
      throw new ApiError(404, 'Challenge not found');
    }

    const wasPending = challenge.status === ChallengeStatus.PENDING;

    const updated = await prisma.challenge.update({
      where: { id },
      data: {
        status,
        rejectionReason: status === ChallengeStatus.REJECTED ? rejectionReason : null,
      },
    });

    // Award rewards only when transitioning to APPROVED from PENDING
    if (status === ChallengeStatus.APPROVED && wasPending && challenge.creatorId) {
      const creatorId = challenge.creatorId;
      
      // Award base challenge approval points
      await walletService.earn(creatorId, 50, `Challenge "${challenge.title}" approved`);

      // Check and award creator badges
      await this.checkAndAwardCreatorBadges(creatorId);
    }

    return updated;
  },

  async toggleFeatured(id: string) {
    const challenge = await prisma.challenge.findUnique({ where: { id } });
    if (!challenge) {
      throw new ApiError(404, 'Challenge not found');
    }

    const isFeatured = !challenge.isFeatured;
    const updated = await prisma.challenge.update({
      where: { id },
      data: { isFeatured },
    });

    if (isFeatured && challenge.creatorId) {
      // Award reward for featured challenge (+100 PalPoints)
      await walletService.earn(
        challenge.creatorId,
        100,
        `Challenge "${challenge.title}" featured!`,
        challenge.id,
        'challenge_featured'
      );
    }

    return updated;
  },

  async toggleTrending(id: string) {
    const challenge = await prisma.challenge.findUnique({ where: { id } });
    if (!challenge) {
      throw new ApiError(404, 'Challenge not found');
    }

    const isTrending = !challenge.isTrending;
    const updated = await prisma.challenge.update({
      where: { id },
      data: { isTrending },
    });

    if (isTrending && challenge.creatorId) {
      // Award reward for trending challenge (+200 PalPoints)
      await walletService.earn(
        challenge.creatorId,
        200,
        `Challenge "${challenge.title}" trending!`,
        challenge.id,
        'challenge_trending'
      );
    }

    return updated;
  },

  async complete(challengeId: string, userId: string, proofUrl?: string, proofMeta?: { qrCode?: string; latitude?: number; longitude?: number }) {
    const challenge = await prisma.challenge.findUnique({ where: { id: challengeId } });
    if (!challenge) {
      throw new ApiError(404, 'Challenge not found');
    }

    if (challenge.status !== ChallengeStatus.APPROVED) {
      throw new ApiError(400, 'This challenge is not approved yet.');
    }

    if (challenge.proofRequired === 'PHOTO' || challenge.proofRequired === 'VIDEO') {
      if (!proofUrl?.trim()) {
        throw new ApiError(400, 'Proof upload is required to complete this challenge.');
      }
    }
    if (challenge.proofRequired === 'QR') {
      if (!proofMeta?.qrCode?.trim()) {
        throw new ApiError(400, 'QR proof is required to complete this challenge.');
      }
    }
    if (challenge.proofRequired === 'GPS') {
      const lat = proofMeta?.latitude;
      const lng = proofMeta?.longitude;
      if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
        throw new ApiError(400, 'GPS proof is required to complete this challenge.');
      }
    }

    const existing = await prisma.challengeCompletion.findUnique({
      where: {
        challengeId_userId: { challengeId, userId },
      },
    });

    if (existing) {
      throw new ApiError(400, 'You have already completed this challenge.');
    }

    const completion = await prisma.challengeCompletion.create({
      data: {
        challengeId,
        userId,
        proofUrl,
      },
    });

    // Increment completionsCount on challenge
    const updatedChallenge = await prisma.challenge.update({
      where: { id: challengeId },
      data: {
        completionsCount: { increment: 1 },
      },
    });

    // Award completer reward points
    // Easy -> 20, Medium -> 40, Hard -> 75
    const completerPoints =
      challenge.difficulty === ChallengeDifficulty.EASY
        ? 20
        : challenge.difficulty === ChallengeDifficulty.MEDIUM
        ? 40
        : 75;

    await walletService.earn(
      userId,
      completerPoints,
      `Completed challenge: ${challenge.title}`,
      challenge.id,
      'challenge_completed'
    );

    // If there is a creator, process milestone rewards
    if (challenge.creatorId) {
      const creatorId = challenge.creatorId;

      // Check achievement badges for this specific challenge completions count
      // Trending Creator (100 completions)
      if (updatedChallenge.completionsCount === 100) {
        await this.unlockBadge(creatorId, 'trending_creator', 1000, `Your challenge "${challenge.title}" reached 100 completions!`);
      }
      // Viral Creator (1000 completions)
      if (updatedChallenge.completionsCount === 1000) {
        await this.unlockBadge(creatorId, 'viral_creator', 5000, `Your challenge "${challenge.title}" went viral with 1,000 completions!`);
      }

      // Re-evaluate Creator Badges count
      await this.checkAndAwardCreatorBadges(creatorId);
    }

    return { completion, pointsAwarded: completerPoints };
  },

  async getLeaderboard(page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    // Fetch all users with approved challenge creations
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        badges: true,
        createdChallenges: {
          where: { status: ChallengeStatus.APPROVED },
          select: { id: true },
        },
      },
    });

    // Map and count
    const creators = users
      .map((u) => ({
        id: u.id,
        name: u.name || 'Anonymous',
        email: u.email,
        avatar: u.avatar,
        badges: u.badges,
        approvedChallengesCount: u.createdChallenges.length,
      }))
      .filter((c) => c.approvedChallengesCount > 0)
      .sort((a, b) => b.approvedChallengesCount - a.approvedChallengesCount);

    const paginatedData = creators.slice(skip, skip + limit);
    const total = creators.length;
    const totalPages = Math.ceil(total / limit);

    return {
      data: paginatedData,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  },

  // Helper function to evaluate and award badges based on counts
  async checkAndAwardCreatorBadges(creatorId: string) {
    // 1. Approved challenges count
    const approvedCount = await prisma.challenge.count({
      where: { creatorId, status: ChallengeStatus.APPROVED },
    });

    // 2. Total completions on challenges created by this user
    const totalCompletions = await prisma.challengeCompletion.count({
      where: {
        challenge: {
          creatorId,
        },
      },
    });

    // Check Bronze Creator: 10 Approved Challenges (500 Coins)
    if (approvedCount >= 10) {
      await this.unlockBadge(creatorId, 'bronze_creator', 500, 'Unlocked Bronze Creator badge (10 Approved Challenges)');
    }

    // Check Silver Creator: 50 Approved Challenges (2,500 Coins)
    if (approvedCount >= 50) {
      await this.unlockBadge(creatorId, 'silver_creator', 2500, 'Unlocked Silver Creator badge (50 Approved Challenges)');
    }

    // Check Gold Creator: 100 Approved Challenges (7,500 Coins)
    if (approvedCount >= 100) {
      await this.unlockBadge(creatorId, 'gold_creator', 7500, 'Unlocked Gold Creator badge (100 Approved Challenges)');
    }

    // Check Legendary Creator: 500 completions OR 500 approved challenges (25,000 Coins)
    if (approvedCount >= 500 || totalCompletions >= 500) {
      await this.unlockBadge(creatorId, 'legendary_creator', 25000, 'Unlocked Legendary Creator badge (500 challenge completions or approved challenges)');
    }
  },

  // Helper function to unlock a badge and award points if not already unlocked
  async unlockBadge(userId: string, badgeId: string, pointsAwarded: number, reason: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { badges: true },
    });

    if (!user) return;

    if (!user.badges.includes(badgeId)) {
      const updatedBadges = [...user.badges, badgeId];
      await prisma.user.update({
        where: { id: userId },
        data: {
          badges: updatedBadges,
        },
      });

      // Award bonus coins (PalPoints)
      await walletService.earn(userId, pointsAwarded, reason, badgeId, 'badge_unlocked');
    }
  },
};
