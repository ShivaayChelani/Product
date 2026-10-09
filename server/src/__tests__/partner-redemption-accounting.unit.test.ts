import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/database', () => ({
  prisma: {
    $transaction: vi.fn(),
    palPointsPartnerConfig: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock('../shared/services/receipt.service', () => ({
  generateReceiptNumber: vi.fn(async () => 'PS-PARTNER-RECEIPT'),
}));

vi.mock('../modules/monetization/plan-enforcement.service', () => ({
  planEnforcementService: {
    isDiamondVendor: vi.fn(async () => true),
  },
}));

import { prisma } from '../config/database';
import { palPointsPartnerService } from '../modules/monetization/pal-points-partner.service';

describe('partner offer redemption accounting', () => {
  const travelerWallet = { id: 'traveler-wallet', userId: 'traveler-1' };
  const vendorWallet = { id: 'vendor-wallet', userId: 'vendor-user-1' };
  const tx = {
    $queryRaw: vi.fn(),
    vendorPalPointsPartnerOffer: {
      findUnique: vi.fn(),
    },
    redemption: {
      count: vi.fn(),
      create: vi.fn(),
    },
    wallet: {
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    walletTransaction: {
      create: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.palPointsPartnerConfig.findUnique as any).mockResolvedValue({
      id: 'default',
      enabled: true,
      defaultPointsRequired: 50,
      defaultMaxDiscountPct: 50,
    });
    tx.$queryRaw.mockResolvedValue([{ id: 'traveler-wallet' }]);
    tx.vendorPalPointsPartnerOffer.findUnique.mockResolvedValue({
      id: 'partner-offer-1',
      title: 'City Museum Pass',
      isActive: true,
      pointsRequired: 120,
      discountPct: 15,
      dailyLimit: null,
      monthlyLimit: null,
      validFrom: null,
      validUntil: null,
      vendorOfferId: 'vendor-offer-1',
      partner: {
        adminEnabled: true,
        vendorEnabled: true,
        vendor: {
          id: 'vendor-1',
          userId: 'vendor-user-1',
          status: 'APPROVED',
          suspendedAt: null,
          vendorCode: 'CITY1234',
        },
      },
    });
    tx.wallet.updateMany.mockResolvedValue({ count: 1 });
    tx.wallet.findUnique
      .mockResolvedValueOnce(travelerWallet)
      .mockResolvedValueOnce(vendorWallet);
    tx.redemption.create.mockResolvedValue({ id: 'redemption-1', receiptNumber: 'PS-PARTNER-RECEIPT' });
    (prisma.$transaction as any).mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it('debits the traveller and credits the vendor 1:1 in the same transaction', async () => {
    const result = await palPointsPartnerService.redeemPartnerOffer('traveler-1', 'partner-offer-1', 'city1234');

    expect(result.pointsSpent).toBe(120);

    expect(tx.wallet.updateMany).toHaveBeenCalledWith({
      where: { userId: 'traveler-1', palPoints: { gte: 120 } },
      data: {
        palPoints: { decrement: 120 },
        lifetimeSpent: { increment: 120 },
      },
    });

    expect(tx.wallet.upsert).toHaveBeenCalledWith({
      where: { userId: 'vendor-user-1' },
      create: {
        userId: 'vendor-user-1',
        palPoints: 120,
        lifetimeEarned: 120,
        lifetimeSpent: 0,
      },
      update: {
        palPoints: { increment: 120 },
        lifetimeEarned: { increment: 120 },
      },
    });

    expect(tx.walletTransaction.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        walletId: 'traveler-wallet',
        userId: 'traveler-1',
        amount: -120,
        type: 'SPEND',
        referenceType: 'PAL_POINTS_PARTNER',
        referenceId: 'redemption-1',
      }),
    });
    expect(tx.walletTransaction.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        walletId: 'vendor-wallet',
        userId: 'vendor-user-1',
        amount: 120,
        type: 'EARN',
        referenceType: 'PAL_POINTS_PARTNER',
        referenceId: 'redemption-1',
      }),
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects an incorrect vendor code before any wallet mutation', async () => {
    await expect(
      palPointsPartnerService.redeemPartnerOffer('traveler-1', 'partner-offer-1', 'WRONG999'),
    ).rejects.toThrow(/invalid vendor code/i);

    expect(tx.wallet.updateMany).not.toHaveBeenCalled();
    expect(tx.wallet.upsert).not.toHaveBeenCalled();
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
  });

  it('fails the whole transaction when the traveller has insufficient points', async () => {
    tx.wallet.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      palPointsPartnerService.redeemPartnerOffer('traveler-1', 'partner-offer-1', 'city1234'),
    ).rejects.toThrow(/insufficient pal points/i);

    expect(tx.wallet.upsert).not.toHaveBeenCalled();
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
  });
});
