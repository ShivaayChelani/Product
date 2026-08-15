import { describe, expect, it, vi } from 'vitest';
import {
  awardCreatorDailyReelInTx,
  CREATOR_DAILY_REEL_FALLBACK_POINTS,
  getIndiaRewardDate,
} from '../modules/social/creatorDailyReelReward';

describe('creator daily reel PalPoints', () => {
  it('defaults to 50 PalPoints', () => {
    expect(CREATOR_DAILY_REEL_FALLBACK_POINTS).toBe(50);
  });

  it('uses the India calendar day so midnight IST starts a new reward', () => {
    const justBeforeIstMidnight = new Date('2026-08-15T18:29:00.000Z');
    const justAfterIstMidnight = new Date('2026-08-15T18:31:00.000Z');
    expect(getIndiaRewardDate(justBeforeIstMidnight)).toBe('2026-08-15');
    expect(getIndiaRewardDate(justAfterIstMidnight)).toBe('2026-08-16');
  });

  it('awards points only when the daily row is inserted', async () => {
    const tx = {
      creatorDailyReward: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      wallet: {
        upsert: vi.fn().mockResolvedValue({ id: 'w1' }),
      },
      walletTransaction: {
        create: vi.fn().mockResolvedValue({ id: 't1' }),
      },
    };

    const awarded = await awardCreatorDailyReelInTx(tx as any, {
      creatorId: 'c1',
      userId: 'u1',
      reelId: 'r1',
      rewardDate: '2026-08-15',
      points: 50,
    });
    expect(awarded).toBe(50);
    expect(tx.wallet.upsert).toHaveBeenCalled();
  });

  it('gives nothing for the second reel the same day', async () => {
    const tx = {
      creatorDailyReward: {
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      wallet: { upsert: vi.fn() },
      walletTransaction: { create: vi.fn() },
    };

    const awarded = await awardCreatorDailyReelInTx(tx as any, {
      creatorId: 'c1',
      userId: 'u1',
      reelId: 'r2',
      rewardDate: '2026-08-15',
      points: 50,
    });
    expect(awarded).toBe(0);
    expect(tx.wallet.upsert).not.toHaveBeenCalled();
  });
});
