import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/database', () => ({
  prisma: {
    $transaction: vi.fn(),
    dailyOpenReward: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../../src/modules/wallet/wallet.service', () => ({
  walletService: {
    earn: vi.fn(async () => ({ palPoints: 5 })),
  },
}));

import { prisma } from '../../src/config/database';
import { walletService } from '../../src/modules/wallet/wallet.service';
import {
  claimDailyOpenReward,
  getDailyOpenRewardStatus,
  DAILY_OPEN_REWARD_POINTS,
  DAILY_OPEN_REWARD_TYPE,
  DAILY_OPEN_EARN_REASON,
} from '../../src/modules/wallet/dailyOpenReward.service';
import { getIndiaRewardDate } from '../../src/modules/social/creatorDailyReelReward';

describe('daily open reward', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.$transaction as any).mockImplementation(async (fn: any) => fn({
      dailyOpenReward: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
    }));
  });

  it('is exactly 5 PalPoints with a DAILY_OPEN reward type', () => {
    expect(DAILY_OPEN_REWARD_POINTS).toBe(5);
    expect(DAILY_OPEN_REWARD_TYPE).toBe('DAILY_OPEN');
    expect(DAILY_OPEN_EARN_REASON).toBe('daily_open');
  });

  it('uses the India calendar day so the day rolls over at IST midnight', () => {
    const justBeforeIstMidnight = new Date('2026-09-12T18:29:00.000Z');
    const justAfterIstMidnight = new Date('2026-09-12T18:31:00.000Z');
    expect(getIndiaRewardDate(justBeforeIstMidnight)).toBe('2026-09-12');
    expect(getIndiaRewardDate(justAfterIstMidnight)).toBe('2026-09-13');
  });

  it('credits 5 PalPoints via walletService.earn with a signed referenceId when unclaimed', async () => {
    const result = await claimDailyOpenReward('user1');

    expect(result.awarded).toBe(true);
    expect(result.alreadyClaimed).toBe(false);
    expect(result.points).toBe(5);
    expect(walletService.earn).toHaveBeenCalledTimes(1);
    const [userId, amount, reason, referenceId, referenceType] = (walletService.earn as any).mock.calls[0];
    expect(userId).toBe('user1');
    expect(amount).toBe(5);
    expect(reason).toBe('daily_open');
    expect(referenceId).toMatch(/^daily_open:user1:\d{4}-\d{2}-\d{2}$/);
    expect(referenceType).toBe('DAILY_OPEN');
  });

  it('is idempotent — an existing claim row never credits again', async () => {
    const tx = {
      dailyOpenReward: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'reward1',
          points: 5,
        }),
        create: vi.fn(),
      },
    };
    (prisma.$transaction as any).mockImplementation(async (fn: any) => fn(tx));

    const result = await claimDailyOpenReward('user1');

    expect(result.awarded).toBe(false);
    expect(result.alreadyClaimed).toBe(true);
    expect(result.points).toBe(5);
    expect(tx.dailyOpenReward.create).not.toHaveBeenCalled();
    expect(walletService.earn).not.toHaveBeenCalled();
  });

  it('never credits on a concurrent duplicate claim (P2002 unique violation)', async () => {
    const tx = {
      dailyOpenReward: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue({ code: 'P2002' }),
      },
    };
    (prisma.$transaction as any).mockImplementation(async (fn: any) => fn(tx));

    const result = await claimDailyOpenReward('user1');

    expect(result.awarded).toBe(false);
    expect(result.alreadyClaimed).toBe(true);
    expect(result.points).toBe(0);
    expect(walletService.earn).not.toHaveBeenCalled();
  });

  it('reports status without mutating anything', async () => {
    (prisma.dailyOpenReward.findUnique as any).mockResolvedValueOnce(null);
    let status = await getDailyOpenRewardStatus('user1');
    expect(status.claimedToday).toBe(false);
    expect(status.points).toBe(5);

    (prisma.dailyOpenReward.findUnique as any).mockResolvedValueOnce({
      id: 'reward1',
      points: 5,
    });
    status = await getDailyOpenRewardStatus('user1');
    expect(status.claimedToday).toBe(true);
    expect(walletService.earn).not.toHaveBeenCalled();
  });
});