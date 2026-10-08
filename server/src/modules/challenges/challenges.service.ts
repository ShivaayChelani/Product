import { prisma } from '../../config/database';
import { ApiError } from '../../shared/utils/ApiError';
import { getPaginationParams } from '../../shared/utils/pagination';
import { assertValidCoordinatePair } from '../../shared/utils/coordinates';
import { walletService } from '../wallet/wallet.service';
import { ChallengeDifficulty, ChallengeProofType, ChallengeStatus } from '@prisma/client';

export interface CreateChallengeInput {
  title: string;
  description: string;
  difficulty: ChallengeDifficulty;
  category: string;
  proofRequired: ChallengeProofType;
}

export interface ChallengeProofMeta {
  qrCode?: string;
  latitude?: number;
  longitude?: number;
  /** Reported horizontal accuracy in metres, when the client has one. */
  accuracyM?: number;
  /** True when the OS flagged the fix as a mock/simulated provider. */
  isFromMockProvider?: boolean;
}

/**
 * A GPS fix worse than this is a coarse network/Cell-ID position, not a
 * handset GPS reading, and cannot evidence "you were standing here".
 */
export const MAX_GPS_ACCURACY_METERS = 200;

/**
 * Server-authoritative reward table. The amount is derived only from the
 * challenge row read back from the database, never from the request body, so a
 * client cannot influence how many points a completion is worth.
 */
const COMPLETION_POINTS: Record<ChallengeDifficulty, number> = {
  [ChallengeDifficulty.EASY]: 20,
  [ChallengeDifficulty.MEDIUM]: 40,
  [ChallengeDifficulty.HARD]: 75,
};

export const challengesService = {
  async listApproved(query: { category?: string; difficulty?: ChallengeDifficulty; search?: string; page?: number | string; limit?: number | string }) {
    const { page, limit, skip } = getPaginationParams(
      { page: query.page, limit: query.limit },
      100,
    );

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
            select: { id: true, name: true },
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

  /**
   * Public detail read. Creator emails are never part of the projection, and
   * challenges that are not yet APPROVED are hidden (404) from everyone except
   * their own creator or a platform admin — anonymous callers must not be able
   * to read unmoderated content or use the endpoint as an existence oracle.
   */
  async getById(
    id: string,
    viewer?: { id: string; isAdmin: boolean } | null,
  ) {
    const challenge = await prisma.challenge.findUnique({
      where: { id },
      include: {
        creator: {
          select: { id: true, name: true, badges: true },
        },
      },
    });

    if (!challenge) {
      throw new ApiError(404, 'Challenge not found');
    }

    const isOwner = Boolean(viewer?.id && viewer.id === challenge.creatorId);
    if (challenge.status !== ChallengeStatus.APPROVED && !isOwner && !viewer?.isAdmin) {
      throw new ApiError(404, 'Challenge not found');
    }

    return challenge;
  },

  async listMyCreated(userId: string) {
    return prisma.challenge.findMany({
      where: { creatorId: userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
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

  async complete(challengeId: string, userId: string, proofUrl?: string, proofMeta?: ChallengeProofMeta) {
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
      // Server-authoritative position validation. `assertValidCoordinatePair`
      // is the canonical PalSafar write-path guard: it rejects a missing or
      // blank value, NaN/Infinity, out-of-range values, Null Island (0, 0),
      // a swapped axis pair, and anything outside India. The client cannot talk
      // its way past any of these with a raw number.
      assertValidCoordinatePair(proofMeta?.latitude, proofMeta?.longitude, {
        label: 'GPS proof',
      });

      if (proofMeta?.isFromMockProvider === true) {
        throw new ApiError(400, 'GPS proof rejected: simulated locations are not accepted.');
      }

      const accuracy = proofMeta?.accuracyM;
      if (accuracy !== undefined) {
        if (typeof accuracy !== 'number' || !Number.isFinite(accuracy) || accuracy < 0) {
          throw new ApiError(400, 'GPS proof: accuracyM must be a finite, non-negative number.');
        }
        if (accuracy > MAX_GPS_ACCURACY_METERS) {
          throw new ApiError(
            400,
            `GPS proof: reported accuracy ${Math.round(accuracy)}m is too coarse to confirm this challenge (max ${MAX_GPS_ACCURACY_METERS}m).`,
          );
        }
      }
    }

    // Fast, friendly duplicate rejection. This is only an optimisation: the
    // authoritative idempotency guard is the unique (challenge_id, user_id)
    // index enforced inside the transaction below.
    const existing = await prisma.challengeCompletion.findUnique({
      where: {
        challengeId_userId: { challengeId, userId },
      },
    });

    if (existing) {
      throw new ApiError(400, 'You have already completed this challenge.');
    }

    // Reward value comes from the difficulty stored on the challenge row, never
    // from the request, so it cannot be inflated by the caller.
    const completerPoints = COMPLETION_POINTS[challenge.difficulty];
    if (typeof completerPoints !== 'number' || completerPoints <= 0) {
      throw new ApiError(500, 'Challenge reward is not configured for this difficulty.');
    }

    // Recording the completion, bumping the counter and paying the reward all
    // happen in one transaction, so a partial failure can never leave a
    // completion without its points (or the reverse). The unique index makes a
    // duplicate or concurrent request lose here instead of double-paying.
    let completion;
    let updatedChallenge;
    try {
      ({ completion, updatedChallenge } = await prisma.$transaction(
        async (tx) => {
          const created = await tx.challengeCompletion.create({
            data: {
              challengeId,
              userId,
              proofUrl,
            },
          });

          const updated = await tx.challenge.update({
            where: { id: challengeId },
            data: {
              completionsCount: { increment: 1 },
            },
          });

          await walletService.earn(
            userId,
            completerPoints,
            `Completed challenge: ${challenge.title}`,
            challenge.id,
            'challenge_completed',
            undefined,
            tx,
          );

          return { completion: created, updatedChallenge: updated };
        },
        { timeout: 25000, maxWait: 20000 },
      ));
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ApiError(400, 'You have already completed this challenge.');
      }
      throw err;
    }

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

  async getLeaderboard(page?: number | string, limit?: number | string) {
    const { page: safePage, limit: safeLimit, skip } = getPaginationParams(
      { page, limit },
      100,
      50,
    );

    // Fetch all users with approved challenge creations
    const users = await prisma.user.findMany({
      where: {
        createdChallenges: { some: { status: ChallengeStatus.APPROVED } },
      },
      select: {
        id: true,
        name: true,
        avatar: true,
        badges: true,
        createdChallenges: {
          where: { status: ChallengeStatus.APPROVED },
          select: { id: true },
        },
      },
      take: 200,
    });

    // Map and count
    const creators = users
      .map((u) => ({
        id: u.id,
        name: u.name || 'Anonymous',
        avatar: u.avatar,
        badges: u.badges,
        approvedChallengesCount: u.createdChallenges.length,
      }))
      .filter((c) => c.approvedChallengesCount > 0)
      .sort((a, b) => b.approvedChallengesCount - a.approvedChallengesCount);

    const paginatedData = creators.slice(skip, skip + safeLimit);
    const total = creators.length;
    const totalPages = Math.ceil(total / safeLimit);

    return {
      data: paginatedData,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages,
        hasNext: safePage < totalPages,
        hasPrev: safePage > 1,
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
