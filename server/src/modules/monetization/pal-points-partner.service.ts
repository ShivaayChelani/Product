import { prisma } from '../../config/database';
import { ApiError } from '../../shared/utils/ApiError';
import { planEnforcementService } from './plan-enforcement.service';

import { generateReceiptNumber } from '../../shared/services/receipt.service';

function normalizeVendorCode(code: string): string {
  return code.trim().toUpperCase();
}

export const palPointsPartnerService = {
  async getGlobalConfig() {
    let config = await prisma.palPointsPartnerConfig.findUnique({ where: { id: 'default' } });
    if (!config) {
      config = await prisma.palPointsPartnerConfig.create({
        data: { id: 'default' },
      });
    }
    return config;
  },

  async updateGlobalConfig(input: {
    enabled?: boolean;
    defaultPointsRequired?: number;
    defaultMaxDiscountPct?: number;
    diamondPlanSlug?: string;
  }) {
    return prisma.palPointsPartnerConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...input },
      update: input,
    });
  },

  async getVendorPartner(vendorId: string) {
    const config = await this.getGlobalConfig();
    const partner = await prisma.vendorPalPointsPartner.findUnique({
      where: { vendorId },
      include: { offers: { where: { isActive: true }, orderBy: { createdAt: 'desc' } } },
    });
    return { config, partner };
  },

  async adminEnableVendor(vendorId: string, enabled: boolean) {
    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) throw new ApiError(404, 'Vendor not found');

    const isDiamond = await planEnforcementService.isDiamondVendor(vendor.userId);
    if (enabled && !isDiamond) {
      throw new ApiError(403, 'Only Diamond plan vendors can join the Pal Points Partner program.');
    }

    return prisma.vendorPalPointsPartner.upsert({
      where: { vendorId },
      create: { vendorId, adminEnabled: enabled, vendorEnabled: enabled },
      update: { adminEnabled: enabled },
      include: { offers: true },
    });
  },

  async vendorUpdatePartner(
    userId: string,
    input: {
      vendorEnabled?: boolean;
      pointsRequired?: number;
      maxDiscountPct?: number;
      terms?: string;
    },
  ) {
    const vendor = await prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) throw new ApiError(404, 'Vendor not found');

    const existing = await prisma.vendorPalPointsPartner.findUnique({ where: { vendorId: vendor.id } });
    if (!existing?.adminEnabled) {
      throw new ApiError(403, 'Pal Points Partner is not enabled for your business. Contact admin.');
    }

    return prisma.vendorPalPointsPartner.update({
      where: { vendorId: vendor.id },
      data: {
        vendorEnabled: input.vendorEnabled,
        points_required: input.pointsRequired,
        maxDiscountPct: input.maxDiscountPct,
        terms: input.terms,
      },
      include: { offers: true },
    });
  },

  async vendorUpsertOffer(
    userId: string,
    input: {
      id?: string;
      title: string;
      discountPct: number;
      minSpend?: number;
      maxRedemption?: number;
      pointsRequired: number;
      dailyLimit?: number;
      monthlyLimit?: number;
      validFrom?: Date;
      validUntil?: Date;
      terms?: string;
      vendorOfferId?: string;
    },
  ) {
    const vendor = await prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) throw new ApiError(404, 'Vendor not found');

    const partner = await prisma.vendorPalPointsPartner.findUnique({ where: { vendorId: vendor.id } });
    if (!partner?.adminEnabled || !partner.vendorEnabled) {
      throw new ApiError(403, 'Pal Points Partner program is not active for your business.');
    }

    const config = await this.getGlobalConfig();
    if (input.pointsRequired < config.defaultPointsRequired) {
      throw new ApiError(400, `Minimum ${config.defaultPointsRequired} Pal Points required.`);
    }
    if (input.discountPct > config.defaultMaxDiscountPct) {
      throw new ApiError(400, `Maximum discount is ${config.defaultMaxDiscountPct}%.`);
    }

    if (input.id) {
      return prisma.vendorPalPointsPartnerOffer.update({
        where: { id: input.id },
        data: {
          title: input.title,
          discountPct: input.discountPct,
          minSpend: input.minSpend,
          maxRedemption: input.maxRedemption,
          pointsRequired: input.pointsRequired,
          dailyLimit: input.dailyLimit,
          monthlyLimit: input.monthlyLimit,
          validFrom: input.validFrom,
          validUntil: input.validUntil,
          terms: input.terms,
          vendorOfferId: input.vendorOfferId,
        },
      });
    }

    return prisma.vendorPalPointsPartnerOffer.create({
      data: {
        partnerId: partner.id,
        title: input.title,
        discountPct: input.discountPct,
        minSpend: input.minSpend,
        maxRedemption: input.maxRedemption,
        pointsRequired: input.pointsRequired,
        dailyLimit: input.dailyLimit,
        monthlyLimit: input.monthlyLimit,
        validFrom: input.validFrom,
        validUntil: input.validUntil,
        terms: input.terms,
        vendorOfferId: input.vendorOfferId,
      },
    });
  },

  async listPublicOffers() {
    const config = await this.getGlobalConfig();
    if (!config.enabled) return [];

    return prisma.vendorPalPointsPartnerOffer.findMany({
      where: {
        isActive: true,
        partner: { adminEnabled: true, vendorEnabled: true },
        OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
      },
      include: {
        partner: {
          include: {
            vendor: { select: { id: true, businessName: true, city: true, imageUrl: true, vendorCode: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  },

  async redeemPartnerOffer(userId: string, partnerOfferId: string, vendorCode: string) {
    const normalizedCode = normalizeVendorCode(vendorCode);
    if (!normalizedCode || normalizedCode.length < 4) {
      throw new ApiError(400, 'Vendor code is required.');
    }

    const config = await this.getGlobalConfig();
    if (!config.enabled) throw new ApiError(403, 'Pal Points Partner program is currently disabled.');

    return prisma.$transaction(async (tx) => {
      const offer = await tx.vendorPalPointsPartnerOffer.findUnique({
        where: { id: partnerOfferId },
        include: {
          partner: {
            include: {
              vendor: {
                select: {
                  id: true,
                  userId: true,
                  status: true,
                  suspendedAt: true,
                  vendorCode: true,
                },
              },
            },
          },
        },
      });

      if (!offer?.isActive || !offer.partner.adminEnabled || !offer.partner.vendorEnabled) {
        throw new ApiError(400, 'This partner offer is not available.');
      }

      const now = new Date();
      if (offer.validFrom && offer.validFrom > now) throw new ApiError(400, 'Offer is not yet active.');
      if (offer.validUntil && offer.validUntil <= now) throw new ApiError(400, 'Offer has expired.');

      const vendor = offer.partner.vendor;
      if (!vendor || vendor.status !== 'APPROVED' || vendor.suspendedAt) {
        throw new ApiError(400, 'Vendor is not eligible for redemptions.');
      }
      if (!vendor.vendorCode || normalizeVendorCode(vendor.vendorCode) !== normalizedCode) {
        throw new ApiError(403, 'Invalid vendor code.');
      }

      if (offer.dailyLimit) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayCount = await tx.redemption.count({
          where: {
            userId,
            vendorId: vendor.id,
            createdAt: { gte: today },
            notes: { contains: partnerOfferId },
          },
        });
        if (todayCount >= offer.dailyLimit) {
          throw new ApiError(400, 'Daily redemption limit reached for this offer.');
        }
      }

      if (offer.monthlyLimit) {
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const monthCount = await tx.redemption.count({
          where: {
            userId,
            vendorId: vendor.id,
            createdAt: { gte: monthStart },
            notes: { contains: partnerOfferId },
          },
        });
        if (monthCount >= offer.monthlyLimit) {
          throw new ApiError(400, 'Monthly redemption limit reached for this offer.');
        }
      }

      const pointsRequired = offer.pointsRequired;
      const walletUpdate = await tx.wallet.updateMany({
        where: { userId, palPoints: { gte: pointsRequired } },
        data: {
          palPoints: { decrement: pointsRequired },
          lifetimeSpent: { increment: pointsRequired },
        },
      });
      if (walletUpdate.count === 0) {
        throw new ApiError(400, `Insufficient Pal Points. Need ${pointsRequired}.`);
      }

      const wallet = await tx.wallet.findUnique({ where: { userId } });
      const receiptNumber = await generateReceiptNumber(tx);

      const redemption = await tx.redemption.create({
        data: {
          userId,
          offerId: offer.vendorOfferId,
          vendorId: vendor.id,
          pointsSpent: pointsRequired,
          discountValue: offer.discountPct,
          discountType: 'PERCENTAGE',
          qrCode: receiptNumber,
          receiptNumber,
          status: 'VERIFIED',
          verifiedAt: new Date(),
          notes: `pal_points_partner:${partnerOfferId}; vendor_code:${normalizedCode}`,
        },
      });

      if (wallet) {
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            userId,
            amount: -pointsRequired,
            type: 'SPEND',
            reason: `partner_redeem:${offer.title}`,
            referenceId: redemption.id,
            referenceType: 'PAL_POINTS_PARTNER',
          },
        });
      }

      return {
        redemptionId: redemption.id,
        receiptNumber: redemption.receiptNumber,
        pointsSpent: pointsRequired,
        discountPct: offer.discountPct,
        offerTitle: offer.title,
        vendorId: vendor.id,
        status: 'VERIFIED',
      };
    });
  },
};
