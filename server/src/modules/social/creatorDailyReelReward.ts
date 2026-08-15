import type { Prisma } from '@prisma/client';
import { pointRulesService } from '../point-rules/pointRules.service';

export const CREATOR_DAILY_REEL_FALLBACK_POINTS = 50;
const IST_OFFSET_MS = 330 * 60 * 1000;

export function getIndiaRewardDate(now = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export async function resolveDailyReelPoints(): Promise<number> {
  const rule = await pointRulesService.getPointsForAction('reel_upload');
  const points = rule?.points ?? CREATOR_DAILY_REEL_FALLBACK_POINTS;
  return points > 0 ? points : 0;
}

export async function awardCreatorDailyReelInTx(
  tx: Prisma.TransactionClient,
  input: {
    creatorId: string;
    userId: string;
    reelId: string;
    rewardDate: string;
    points: number;
  },
): Promise<number> {
  if (input.points <= 0) return 0;

  const reward = await tx.creatorDailyReward.createMany({
    data: [{
      creatorId: input.creatorId,
      userId: input.userId,
      reelId: input.reelId,
      rewardDate: input.rewardDate,
      points: input.points,
    }],
    skipDuplicates: true,
  });

  const awarded = reward.count > 0 ? input.points : 0;
  if (awarded <= 0) return 0;

  const wallet = await tx.wallet.upsert({
    where: { userId: input.userId },
    update: {
      palPoints: { increment: awarded },
      lifetimeEarned: { increment: awarded },
    },
    create: {
      userId: input.userId,
      palPoints: awarded,
      lifetimeEarned: awarded,
    },
  });

  await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      userId: input.userId,
      amount: awarded,
      type: 'EARN',
      reason: 'reel_upload',
      referenceId: input.reelId,
      referenceType: 'CREATOR_DAILY_REEL',
    },
  });

  return awarded;
}
