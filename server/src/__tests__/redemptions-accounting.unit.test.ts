import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/database', () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

vi.mock('../shared/services/receipt.service', () => ({
  generateReceiptNumber: vi.fn(async () => 'PS-TEST-RECEIPT'),
}));

vi.mock('../modules/rewards/offer-eligibility', () => ({
  isOfferWithinActiveWindow: vi.fn(() => true),
  isPublicVendorOfferEligible: vi.fn(() => true),
  isVendorEligibleForPublicOffers: vi.fn(() => true),
}));

vi.mock('../modules/redemptions/redemption-fraud.service', () => ({
  redemptionFraudService: {
    checkAndFlag: vi.fn(async () => undefined),
    logFailedAttempt: vi.fn(async () => undefined),
  },
}));

vi.mock('../config/events', () => ({
  eventBus: { emit: vi.fn() },
  AppEvents: {
    REDEMPTION_CREATED: 'REDEMPTION_CREATED',
    REDEMPTION_VERIFIED: 'REDEMPTION_VERIFIED',
    POINTS_SPENT: 'POINTS_SPENT',
  },
}));

import { prisma } from '../config/database';
import { redemptionsService } from '../modules/redemptions/redemptions.service';

describe('offer redemption accounting', () => {
  const userWallet = { id: 'user-wallet', userId: 'traveler-1' };
  const vendorWallet = { id: 'vendor-wallet', userId: 'vendor-user-1' };
  const tx = {
    user: {
      findUnique: vi.fn(),
    },
    $queryRaw: vi.fn(),
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
    vendorOffer: {
      update: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    tx.user.findUnique.mockResolvedValue({ id: 'traveler-1', permission: 'USER', name: 'Traveler' });
    tx.$queryRaw.mockResolvedValue([{
      id: 'offer-1',
      is_active: true,
      is_approved: true,
      points_required: 300,
      discount_value: 20,
      discount_type: 'PERCENTAGE',
      title: 'Cafe discount',
      vendor_id: 'vendor-1',
      vendor_user_id: 'vendor-user-1',
      max_redemptions: null,
      current_redemptions: 0,
      daily_limit: 1,
      business_name: 'Cafe',
      vendor_status: 'APPROVED',
      vendor_suspended_at: null,
      vendor_code: 'CAFE-1',
      vendor_subscription_status: 'ACTIVE',
      valid_till: null,
      start_date: null,
    }]);
    tx.redemption.count.mockResolvedValue(0);
    tx.redemption.create.mockResolvedValue({ id: 'redemption-1', vendorId: 'vendor-1' });
    tx.wallet.updateMany.mockResolvedValue({ count: 1 });
    tx.wallet.findUnique
      .mockResolvedValueOnce(userWallet)
      .mockResolvedValueOnce(vendorWallet);
    (prisma.$transaction as any).mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it('debits the traveler and credits the vendor 1:1 in the same transaction', async () => {
    await redemptionsService.redeemOffer('traveler-1', 'offer-1', 'cafe-1');

    expect(tx.wallet.updateMany).toHaveBeenCalledWith({
      where: { userId: 'traveler-1', palPoints: { gte: 300 } },
      data: {
        palPoints: { decrement: 300 },
        lifetimeSpent: { increment: 300 },
      },
    });
    expect(tx.wallet.upsert).toHaveBeenCalledWith({
      where: { userId: 'vendor-user-1' },
      create: {
        userId: 'vendor-user-1',
        palPoints: 300,
        lifetimeEarned: 300,
        lifetimeSpent: 0,
      },
      update: {
        palPoints: { increment: 300 },
        lifetimeEarned: { increment: 300 },
      },
    });
    expect(tx.walletTransaction.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        walletId: 'user-wallet',
        userId: 'traveler-1',
        amount: -300,
        type: 'SPEND',
        referenceId: 'redemption-1',
      }),
    });
    expect(tx.walletTransaction.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        walletId: 'vendor-wallet',
        userId: 'vendor-user-1',
        amount: 300,
        type: 'EARN',
        referenceId: 'redemption-1',
      }),
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
