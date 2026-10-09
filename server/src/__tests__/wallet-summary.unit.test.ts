import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/database', () => ({
  prisma: {
    wallet: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    walletTransaction: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
    },
  },
}));

import { prisma } from '../config/database';
import { walletService } from '../modules/wallet/wallet.service';

describe('wallet lifetime spend summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.wallet.findUnique as any).mockResolvedValue({
      id: 'wallet-1',
      userId: 'user-1',
      palPoints: 530,
      lifetimeEarned: 830,
      lifetimeSpent: 0,
    });
    (prisma.walletTransaction.findMany as any).mockResolvedValue([]);
    (prisma.walletTransaction.aggregate as any).mockImplementation(({ where }: any) => {
      if (where.type === 'EARN') return Promise.resolve({ _sum: { amount: 0 } });
      if (where.createdAt) return Promise.resolve({ _sum: { amount: -300 } });
      return Promise.resolve({ _sum: { amount: -300 } });
    });
  });

  it('includes signed historical SPEND rows when the stored counter is behind', async () => {
    const profile = await walletService.getProfile('user-1');

    expect(profile.lifetimeSpent).toBe(300);
    expect(prisma.walletTransaction.aggregate).toHaveBeenCalledWith({
      where: { walletId: 'wallet-1', type: 'SPEND' },
      _sum: { amount: true },
    });
  });

  it('does not reduce a higher stored lifetime-spent counter', async () => {
    (prisma.wallet.findUnique as any).mockResolvedValue({
      id: 'wallet-1',
      userId: 'user-1',
      palPoints: 530,
      lifetimeEarned: 830,
      lifetimeSpent: 450,
    });

    const profile = await walletService.getProfile('user-1');

    expect(profile.lifetimeSpent).toBe(450);
  });

  it('includes signed historical EARN rows when the stored earned counter is behind', async () => {
    (prisma.wallet.findUnique as any).mockResolvedValue({
      id: 'wallet-1',
      userId: 'user-1',
      palPoints: 530,
      lifetimeEarned: 0,
      lifetimeSpent: 0,
    });
    (prisma.walletTransaction.aggregate as any).mockImplementation(({ where }: any) => {
      if (where.type === 'EARN' && !where.createdAt) return Promise.resolve({ _sum: { amount: 530 } });
      if (where.type === 'EARN') return Promise.resolve({ _sum: { amount: 50 } });
      if (where.type === 'SPEND' && !where.createdAt) return Promise.resolve({ _sum: { amount: 0 } });
      return Promise.resolve({ _sum: { amount: 0 } });
    });

    const profile = await walletService.getProfile('user-1');

    expect(profile.lifetimeEarned).toBe(530);
    expect(profile.lifetimeSpent).toBe(0);
    expect(profile.palPoints).toBe(530);
    expect(prisma.walletTransaction.aggregate).toHaveBeenCalledWith({
      where: { walletId: 'wallet-1', type: 'EARN' },
      _sum: { amount: true },
    });
  });
});
