import { prisma } from '../../config/database';
import { ApiError } from '../../shared/utils/ApiError';
import { logger } from '../../config/logger';
import { walletService } from '../wallet/wallet.service';
import { pointRulesService } from '../point-rules/pointRules.service';
import { randomUUID } from 'crypto';

function todayKeyUTC(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

async function upsertStreak(userId: string): Promise<{ current: number; longest: number }> {
  const now = new Date();
  const existing = await prisma.user_streaks.findUnique({ where: { user_id: userId } });
  if (!existing) {
    await prisma.user_streaks.create({
      data: {
        id: randomUUID(),
        user_id: userId,
        current_streak: 1,
        longest_streak: 1,
        last_active_at: now,
        updated_at: now,
      },
    });
    return { current: 1, longest: 1 };
  }

  const last = existing.last_active_at ? new Date(existing.last_active_at) : null;
  let current = 1;
  if (last) {
    const lastDay = Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate());
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const diffDays = Math.round((today - lastDay) / 86400000);
    if (diffDays === 0) {
      current = existing.current_streak || 1;
    } else if (diffDays === 1) {
      current = (existing.current_streak || 0) + 1;
    } else {
      current = 1;
    }
  }
  const longest = Math.max(existing.longest_streak || 0, current);
  await prisma.user_streaks.update({
    where: { user_id: userId },
    data: {
      current_streak: current,
      longest_streak: longest,
      last_active_at: now,
      updated_at: now,
    },
  });
  return { current, longest };
}

export async function getDailyLoginStatus(userId: string) {
  const key = `daily_login:${userId}:${todayKeyUTC()}`;
  const existing = await prisma.walletTransaction.findFirst({
    where: { userId, type: 'EARN', referenceId: key, referenceType: 'LOGIN_REWARD' },
  });
  const streak = await prisma.user_streaks.findUnique({ where: { user_id: userId } });
  const rule = await pointRulesService.getPointsForAction('daily_login');
  return {
    claimedToday: !!existing,
    points: rule?.points ?? 0,
    streak: streak?.current_streak ?? 0,
    longestStreak: streak?.longest_streak ?? 0,
  };
}

/** Idempotent daily login claim (referenceId = daily_login:userId:YYYY-MM-DD). */
export async function claimDailyLoginReward(userId: string): Promise<{
  awarded: boolean;
  points: number;
  streak: number;
  longestStreak: number;
  alreadyClaimed: boolean;
}> {
  const RULE_KEY = 'daily_login';
  const referenceId = `daily_login:${userId}:${todayKeyUTC()}`;

  try {
    const existing = await prisma.walletTransaction.findFirst({
      where: { userId, type: 'EARN', referenceId, referenceType: 'LOGIN_REWARD' },
    });
    if (existing) {
      const streak = await prisma.user_streaks.findUnique({ where: { user_id: userId } });
      return {
        awarded: false,
        points: 0,
        streak: streak?.current_streak ?? 0,
        longestStreak: streak?.longest_streak ?? 0,
        alreadyClaimed: true,
      };
    }

    const rule = await pointRulesService.getPointsForAction(RULE_KEY);
    if (!rule || rule.points <= 0) {
      throw new ApiError(400, 'Daily login reward is not configured');
    }

    await walletService.earn(userId, rule.points, RULE_KEY, referenceId, 'LOGIN_REWARD');
    const streak = await upsertStreak(userId);

    logger.info({ userId, amount: rule.points, streak: streak.current }, 'Daily login reward claimed');
    return {
      awarded: true,
      points: rule.points,
      streak: streak.current,
      longestStreak: streak.longest,
      alreadyClaimed: false,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error({ error, userId }, 'Failed to claim daily login reward');
    throw new ApiError(500, 'Unable to process daily login reward');
  }
}

/** Used on login session create — same idempotent key as claim endpoint. */
export async function awardDailyReward(userId: string): Promise<number> {
  const result = await claimDailyLoginReward(userId).catch((err) => {
    logger.error({ err, userId }, 'Failed to process daily login reward on auth');
    return { awarded: false, points: 0, streak: 0, longestStreak: 0, alreadyClaimed: false };
  });
  return result.awarded ? result.points : 0;
}
