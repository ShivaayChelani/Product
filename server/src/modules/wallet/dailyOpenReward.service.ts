import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { getIndiaRewardDate } from '../social/creatorDailyReelReward';
import { walletService } from './wallet.service';

export const DAILY_OPEN_REWARD_POINTS = 5;
export const DAILY_OPEN_REWARD_TYPE = 'DAILY_OPEN';
export const DAILY_OPEN_EARN_REASON = 'daily_open';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

export interface DailyOpenRewardResult {
  awarded: boolean;
  alreadyClaimed: boolean;
  points: number;
  rewardDate: string;
}

export async function getDailyOpenRewardStatus(userId: string) {
  const rewardDate = getIndiaRewardDate();
  const existing = await prisma.dailyOpenReward.findUnique({
    where: {
      userId_rewardDate_rewardType: {
        userId,
        rewardDate,
        rewardType: DAILY_OPEN_REWARD_TYPE,
      },
    },
  });
  return {
    claimedToday: !!existing,
    points: existing?.points ?? DAILY_OPEN_REWARD_POINTS,
    rewardDate,
  };
}

/**
 * Idempotent daily app-open reward (exactly 5 PalPoints, once per India calendar day).
 * The claim row's unique index (userId + rewardDate + rewardType) is the race-safe
 * arbiter: a concurrent second claim aborts on P2002 and is reported as already
 * claimed without minting any PalPoints.
 */
export async function claimDailyOpenReward(userId: string): Promise<DailyOpenRewardResult> {
  const rewardDate = getIndiaRewardDate();

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.dailyOpenReward.findUnique({
        where: {
          userId_rewardDate_rewardType: {
            userId,
            rewardDate,
            rewardType: DAILY_OPEN_REWARD_TYPE,
          },
        },
      });
      if (existing) {
        return {
          awarded: false,
          alreadyClaimed: true,
          points: existing.points,
          rewardDate,
        };
      }

      await tx.dailyOpenReward.create({
        data: {
          userId,
          rewardDate,
          rewardType: DAILY_OPEN_REWARD_TYPE,
          points: DAILY_OPEN_REWARD_POINTS,
        },
      });

      await walletService.earn(
        userId,
        DAILY_OPEN_REWARD_POINTS,
        DAILY_OPEN_EARN_REASON,
        `daily_open:${userId}:${rewardDate}`,
        DAILY_OPEN_REWARD_TYPE,
        undefined,
        tx,
      );

      return {
        awarded: true,
        alreadyClaimed: false,
        points: DAILY_OPEN_REWARD_POINTS,
        rewardDate,
      };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        awarded: false,
        alreadyClaimed: true,
        points: 0,
        rewardDate,
      };
    }
    logger.error({ error, userId }, 'Failed to claim daily open reward');
    throw error;
  }
}