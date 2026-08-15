import { describe, it, expect, vi, beforeEach } from 'vitest';
import { palPointsPartnerService } from '../modules/monetization/pal-points-partner.service';
import { prisma } from '../config/database';

vi.mock('../config/database', () => ({
  prisma: {
    palPointsPartnerConfig: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

describe('Partner PalPoints redemption (H-05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.palPointsPartnerConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'default',
      enabled: true,
    });
  });

  it('rejects redemption without vendor code', async () => {
    await expect(
      palPointsPartnerService.redeemPartnerOffer('user-1', 'offer-1', ''),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects invalid vendor code inside transaction', async () => {
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn) => {
      const tx = {
        vendorPalPointsPartnerOffer: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'offer-1',
            isActive: true,
            pointsRequired: 100,
            partner: {
              adminEnabled: true,
              vendorEnabled: true,
              vendor: {
                id: 'v1',
                status: 'APPROVED',
                suspendedAt: null,
                vendorCode: 'VND-ABC123',
              },
            },
          }),
        },
      };
      return fn(tx);
    });

    await expect(
      palPointsPartnerService.redeemPartnerOffer('user-1', 'offer-1', 'VND-WRONG1'),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
