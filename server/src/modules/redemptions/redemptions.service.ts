import { Role, VendorSubscriptionStatus, type VendorStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../shared/utils/ApiError';
import { generateReceiptNumber } from '../../shared/services/receipt.service';
import { eventBus, AppEvents } from '../../config/events';
import {
  isOfferWithinActiveWindow,
  isPublicVendorOfferEligible,
  isVendorEligibleForPublicOffers,
} from '../rewards/offer-eligibility';
import { redemptionFraudService } from './redemption-fraud.service';

function normalizeVendorCode(code: string): string {
  return code.trim().toUpperCase();
}

export const redemptionsService = {
  /**
   * Offer redemption via vendor code — instant verification, sequential receipt.
   */
  async redeemOffer(userId: string, offerId: string, vendorCode: string) {
    const normalizedCode = normalizeVendorCode(vendorCode);

    try {
      const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { id: true, permission: true, name: true },
        });
        if (!user) throw new ApiError(404, 'User not found');
        if (user.permission === Role.ADMIN) {
          // admins can redeem; no block
        }

        const locked = await tx.$queryRaw<Array<{
          id: string;
          is_active: boolean;
          is_approved: boolean;
          points_required: number;
          discount_value: number;
          discount_type: string;
          title: string;
          vendor_id: string;
          vendor_user_id: string;
          max_redemptions: number | null;
          current_redemptions: number;
          daily_limit: number | null;
          business_name: string | null;
          vendor_status: string;
          vendor_suspended_at: Date | null;
          vendor_code: string | null;
          vendor_subscription_status: string;
          valid_till: string | null;
          start_date: Date | null;
        }>>`
          SELECT o.id, o.is_active, o.is_approved, o.points_required, o.discount_value, o.discount_type,
                 o.title, o.vendor_id, o.max_redemptions, o.current_redemptions, o.daily_limit,
                 o.valid_till, o.start_date,
                 v.business_name as business_name, v.status as vendor_status,
                 v.suspended_at as vendor_suspended_at, v.vendor_code as vendor_code,
                 v.user_id as vendor_user_id, v.subscription_status as vendor_subscription_status
          FROM vendor_offers o
          JOIN vendors v ON v.id = o.vendor_id
          WHERE o.id = ${offerId}
          FOR UPDATE OF o
        `;
        if (!locked.length) throw new ApiError(404, 'Offer not found');
        const row = locked[0]!;
        const offer = {
          id: row.id,
          isActive: row.is_active,
          isApproved: row.is_approved,
          pointsRequired: row.points_required,
          discountValue: row.discount_value,
          discountType: row.discount_type,
          title: row.title,
          vendorId: row.vendor_id,
          vendorUserId: row.vendor_user_id,
          maxRedemptions: row.max_redemptions,
          currentRedemptions: row.current_redemptions,
          dailyLimit: row.daily_limit,
          validTill: row.valid_till,
          startDate: row.start_date,
          businessName: row.business_name,
        };
        const vendor = {
          status: row.vendor_status as VendorStatus,
          suspendedAt: row.vendor_suspended_at,
          vendorCode: row.vendor_code,
          subscriptionStatus: row.vendor_subscription_status as VendorSubscriptionStatus,
        };

        if (offer.vendorUserId === userId) {
          throw new ApiError(400, 'You cannot redeem your own vendor offers');
        }

        if (!vendor.vendorCode) {
          throw new ApiError(400, 'Vendor does not have an active vendor code');
        }
        if (normalizeVendorCode(vendor.vendorCode) !== normalizedCode) {
          throw new ApiError(403, 'Invalid vendor code for this offer');
        }

        if (!isPublicVendorOfferEligible(offer, vendor)) {
          throw new ApiError(400, 'This offer is no longer available');
        }
        if (!isVendorEligibleForPublicOffers(vendor)) {
          throw new ApiError(400, 'Vendor is not eligible for redemptions');
        }
        if (!isOfferWithinActiveWindow(offer)) {
          throw new ApiError(400, 'Offer has expired or is not yet active');
        }

        if (offer.maxRedemptions != null && offer.currentRedemptions >= offer.maxRedemptions) {
          throw new ApiError(400, 'This offer has reached maximum redemptions');
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dailyCap = offer.dailyLimit ?? 1;
        const todayRedemptions = await tx.redemption.count({
          where: {
            userId,
            offerId,
            status: 'VERIFIED',
            createdAt: { gte: today },
          },
        });
        if (todayRedemptions >= dailyCap) {
          throw new ApiError(400, 'You have already redeemed this offer today');
        }

        const walletUpdate = await tx.wallet.updateMany({
          where: { userId, palPoints: { gte: offer.pointsRequired } },
          data: {
            palPoints: { decrement: offer.pointsRequired },
            lifetimeSpent: { increment: offer.pointsRequired },
          },
        });

        if (walletUpdate.count === 0) {
          throw new ApiError(400, `Insufficient Pal Points. Need ${offer.pointsRequired}`);
        }

        const wallet = await tx.wallet.findUnique({ where: { userId } });
        const receiptNumber = await generateReceiptNumber(tx);

        const redemption = await tx.redemption.create({
          data: {
            userId,
            offerId: offer.id,
            vendorId: offer.vendorId,
            pointsSpent: offer.pointsRequired,
            discountValue: offer.discountValue,
            discountType: offer.discountType,
            qrCode: receiptNumber,
            receiptNumber,
            status: 'VERIFIED',
            verifiedAt: new Date(),
            notes: `Redeemed with vendor code ${normalizedCode}`,
          },
        });

        if (wallet) {
          await tx.walletTransaction.create({
            data: {
              walletId: wallet.id,
              userId,
              amount: -offer.pointsRequired,
              type: 'SPEND',
              reason: `redeem:${offer.title}`,
              referenceId: redemption.id,
              referenceType: 'OFFER',
            },
          });
        }

        // Vendor credit (same 1:1 points model as payPoints) — business rule: vendor receives credit.
        await tx.wallet.upsert({
          where: { userId: offer.vendorUserId },
          create: {
            userId: offer.vendorUserId,
            palPoints: offer.pointsRequired,
            lifetimeEarned: offer.pointsRequired,
            lifetimeSpent: 0,
          },
          update: {
            palPoints: { increment: offer.pointsRequired },
            lifetimeEarned: { increment: offer.pointsRequired },
          },
        });
        const vendorWallet = await tx.wallet.findUnique({ where: { userId: offer.vendorUserId } });
        if (vendorWallet) {
          await tx.walletTransaction.create({
            data: {
              walletId: vendorWallet.id,
              userId: offer.vendorUserId,
              amount: offer.pointsRequired,
              type: 'EARN',
              reason: `offer_redeem:${offer.title}`,
              referenceId: redemption.id,
              referenceType: 'OFFER',
            },
          });
        }

        await tx.vendorOffer.update({
          where: { id: offerId },
          data: { currentRedemptions: { increment: 1 } },
        });

        return {
          ...redemption,
          receiptNumber,
          vendorName: offer.businessName,
          offerTitle: offer.title,
          vendorCode: normalizedCode,
          vendorUserId: offer.vendorUserId,
          pointsSpent: offer.pointsRequired,
        };
      });

      eventBus.emit(AppEvents.REDEMPTION_CREATED, {
        userId,
        vendorId: result.vendorId!,
        vendorUserId: result.vendorUserId,
        offerTitle: result.offerTitle,
        receiptNumber: result.receiptNumber,
      });
      eventBus.emit(AppEvents.REDEMPTION_VERIFIED, {
        userId,
        vendorId: result.vendorId!,
        vendorUserId: result.vendorUserId,
        offerTitle: result.offerTitle,
        pointsSpent: result.pointsSpent,
        receiptNumber: result.receiptNumber,
      });
      eventBus.emit(AppEvents.POINTS_SPENT, {
        userId,
        points: result.pointsSpent,
        reason: `redeem:${result.offerTitle}`,
        referenceId: result.id,
      });

      await redemptionFraudService.checkAndFlag({
        userId,
        vendorId: result.vendorId!,
        vendorUserId: result.vendorUserId,
        offerId,
        vendorCode: normalizedCode,
        success: true,
      });

      return result;
    } catch (err: any) {
      // Only count true vendor-code mismatches toward fraud "failed codes" (not expiry / balance / etc.).
      if (
        err instanceof ApiError &&
        (err.statusCode === 403 || err.statusCode === 400) &&
        /invalid vendor code/i.test(err.message)
      ) {
        await redemptionFraudService.logFailedAttempt(
          userId,
          offerId,
          normalizedCode,
          err.message,
        );
        await redemptionFraudService.checkAndFlag({
          userId,
          vendorId: '',
          vendorUserId: '',
          offerId,
          vendorCode: normalizedCode,
          success: false,
          reason: err.message,
        });
      }
      throw err;
    }
  },

  /** @deprecated Use redeemOffer with vendorCode. */
  async generate(userId: string, offerId: string, vendorCode?: string) {
    if (!vendorCode) {
      throw new ApiError(400, 'Vendor code is required to redeem this offer');
    }
    return this.redeemOffer(userId, offerId, vendorCode);
  },

  async payPoints(userId: string, vendorCode: string, points: number) {
    return await prisma.$transaction(async (tx) => {
      const normalizedCode = normalizeVendorCode(vendorCode);
      const vendor = await tx.vendor.findFirst({
        where: { vendorCode: normalizedCode },
      });
      if (!vendor) throw new ApiError(404, 'Invalid vendor code');
      if (vendor.status !== 'APPROVED') throw new ApiError(400, 'Vendor is not approved');
      if (vendor.userId === userId) {
        throw new ApiError(400, 'You cannot send points to your own business');
      }

      const walletUpdate = await tx.wallet.updateMany({
        where: { userId, palPoints: { gte: points } },
        data: {
          palPoints: { decrement: points },
          lifetimeSpent: { increment: points },
        },
      });

      if (walletUpdate.count === 0) {
        throw new ApiError(400, `Insufficient Pal Points. Need ${points}`);
      }

      const senderWallet = await tx.wallet.findUnique({ where: { userId } });
      if (!senderWallet) throw new ApiError(400, 'Wallet not found');

      await tx.wallet.upsert({
        where: { userId: vendor.userId },
        create: { userId: vendor.userId, palPoints: 0, lifetimeEarned: 0, lifetimeSpent: 0 },
        update: {},
      });
      const vendorWallet = await tx.wallet.update({
        where: { userId: vendor.userId },
        data: {
          palPoints: { increment: points },
          lifetimeEarned: { increment: points },
        },
      });

      const receiptNumber = await generateReceiptNumber(tx);
      const pointValue = (points * 0.5).toFixed(0);

      const redemption = await tx.redemption.create({
        data: {
          userId,
          vendorId: vendor.id,
          pointsSpent: points,
          discountValue: parseFloat(pointValue),
          discountType: 'FLAT',
          qrCode: receiptNumber,
          receiptNumber,
          status: 'VERIFIED',
          verifiedAt: new Date(),
          verifiedById: vendor.userId,
          notes: 'Instant points transfer via vendor code',
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: senderWallet.id,
          userId,
          amount: -points,
          type: 'SPEND',
          reason: `Sent to ${vendor.businessName}`,
          referenceId: redemption.id,
          referenceType: 'POINTS_TRANSFER',
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: vendorWallet.id,
          userId: vendor.userId,
          amount: points,
          type: 'EARN',
          reason: 'Received from tourist',
          referenceId: redemption.id,
          referenceType: 'POINTS_TRANSFER',
        },
      });

      return {
        id: redemption.id,
        pointsSpent: points,
        receiptNumber,
        vendorName: vendor.businessName,
        vendorCode: vendor.vendorCode,
        offerTitle: 'Points Transfer',
        rupeeValue: pointValue,
        status: 'VERIFIED',
      };
    });
  },

  async getUserRedemptions(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      prisma.redemption.findMany({
        where: { userId },
        include: {
          offer: { select: { title: true, discountType: true, discountValue: true } },
          vendor: { select: { id: true, businessName: true, vendorCode: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.redemption.count({ where: { userId } }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      data,
      pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    };
  },

  async getVendorRedemptions(vendorId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      prisma.redemption.findMany({
        where: { vendorId },
        include: {
          offer: { select: { title: true } },
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.redemption.count({ where: { vendorId } }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      data,
      pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    };
  },

  async refund(redemptionId: string, adminId: string, notes?: string) {
    const result = await prisma.$transaction(async (tx) => {
      const redemption = await tx.redemption.findUnique({ where: { id: redemptionId } });
      if (!redemption) throw new ApiError(404, 'Redemption not found');
      if (redemption.status !== 'VERIFIED') {
        throw new ApiError(400, 'Only verified redemptions can be refunded');
      }
      if (redemption.refundedAt) {
        throw new ApiError(400, 'Redemption already refunded');
      }

      const refundNote = notes?.trim();
      const nextNotes = refundNote
        ? [redemption.notes, `Refund: ${refundNote}`].filter(Boolean).join('\n')
        : redemption.notes;

      const marked = await tx.redemption.updateMany({
        where: { id: redemptionId, status: 'VERIFIED', refundedAt: null },
        data: {
          status: 'CANCELLED',
          refundedAt: new Date(),
          refundedById: adminId,
          notes: nextNotes,
        },
      });
      if (marked.count === 0) {
        throw new ApiError(400, 'Redemption already refunded');
      }

      // Full vendor clawback required before traveller restore — partial claw + full
      // restore would mint PalPoints and break Wallet ↔ Verified redemptions invariant.
      let vendorUserId: string | null = null;
      if (redemption.vendorId && redemption.pointsSpent > 0) {
        const vendor = await tx.vendor.findUnique({
          where: { id: redemption.vendorId },
          select: { userId: true },
        });
        vendorUserId = vendor?.userId ?? null;
        if (vendorUserId) {
          const vendorWallet = await tx.wallet.findUnique({ where: { userId: vendorUserId } });
          if (!vendorWallet || vendorWallet.palPoints < redemption.pointsSpent) {
            throw new ApiError(
              400,
              'Vendor has insufficient Pal Points to reverse credit. Adjust the vendor wallet before refunding.',
            );
          }
        }
      }

      if (redemption.userId && redemption.pointsSpent > 0) {
        // Restore balance and reverse spend stats (do not inflate lifetimeEarned).
        const userWallet = await tx.wallet.findUnique({ where: { userId: redemption.userId } });
        if (userWallet) {
          await tx.wallet.update({
            where: { userId: redemption.userId },
            data: {
              palPoints: { increment: redemption.pointsSpent },
              lifetimeSpent: Math.max(0, (userWallet.lifetimeSpent || 0) - redemption.pointsSpent),
            },
          });
          await tx.walletTransaction.create({
            data: {
              walletId: userWallet.id,
              userId: redemption.userId,
              amount: redemption.pointsSpent,
              type: 'EARN',
              reason: `refund:${redemption.id}`,
              referenceId: redemption.id,
              referenceType: 'REFUND',
            },
          });
        }
      }

      // Claw back vendor credit (offer redeem + points transfer both credit vendor wallets).
      if (vendorUserId && redemption.pointsSpent > 0) {
        const vendorWallet = await tx.wallet.findUnique({ where: { userId: vendorUserId } });
        if (vendorWallet) {
          await tx.wallet.update({
            where: { userId: vendorUserId },
            data: {
              palPoints: { decrement: redemption.pointsSpent },
              lifetimeEarned: Math.max(0, (vendorWallet.lifetimeEarned || 0) - redemption.pointsSpent),
            },
          });
          await tx.walletTransaction.create({
            data: {
              walletId: vendorWallet.id,
              userId: vendorUserId,
              amount: -redemption.pointsSpent,
              type: 'SPEND',
              reason: `refund_clawback:${redemption.id}`,
              referenceId: redemption.id,
              referenceType: 'REFUND',
            },
          });
        }
      }

      // Restore offer capacity when this was an offer redemption.
      if (redemption.offerId) {
        await tx.vendorOffer.updateMany({
          where: { id: redemption.offerId, currentRedemptions: { gt: 0 } },
          data: { currentRedemptions: { decrement: 1 } },
        });
      }

      return tx.redemption.findUnique({ where: { id: redemptionId } });
    });

    if (result?.userId) {
      eventBus.emit(AppEvents.REDEMPTION_REFUNDED, {
        userId: result.userId,
        redemptionId,
        pointsSpent: result.pointsSpent,
        receiptNumber: result.receiptNumber,
      });
    }

    return result;
  },

  async adminListAll(filters: {
    page?: number;
    limit?: number;
    status?: string;
    userId?: string;
    vendorId?: string;
    offerId?: string;
    receiptNumber?: string;
    vendorSearch?: string;
    userSearch?: string;
  }) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(500, Math.max(1, filters.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.userId) where.userId = filters.userId;
    if (filters.vendorId) where.vendorId = filters.vendorId;
    if (filters.offerId) where.offerId = filters.offerId;
    if (filters.receiptNumber) {
      where.receiptNumber = { contains: filters.receiptNumber, mode: 'insensitive' };
    }
    if (filters.vendorSearch?.trim()) {
      where.vendor = {
        OR: [
          { businessName: { contains: filters.vendorSearch.trim(), mode: 'insensitive' } },
          { vendorCode: { contains: filters.vendorSearch.trim(), mode: 'insensitive' } },
        ],
      };
    }
    if (filters.userSearch?.trim()) {
      where.user = {
        OR: [
          { name: { contains: filters.userSearch.trim(), mode: 'insensitive' } },
          { email: { contains: filters.userSearch.trim(), mode: 'insensitive' } },
        ],
      };
    }

    const [data, total] = await Promise.all([
      prisma.redemption.findMany({
        where,
        include: {
          offer: { select: { title: true } },
          user: { select: { id: true, name: true, email: true } },
          vendor: { select: { id: true, businessName: true, vendorCode: true } },
          refundedBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.redemption.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      data,
      pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    };
  },

  async adminExportCsv(filters: {
    status?: string;
    receiptNumber?: string;
    vendorSearch?: string;
    userSearch?: string;
  }) {
    const result = await this.adminListAll({ ...filters, page: 1, limit: 5000 });
    const header = 'Receipt,Status,Points,Discount,User,Email,Vendor,VendorCode,Offer,CreatedAt,RefundedAt\n';
    const rows = result.data.map((r: any) => [
      r.receiptNumber || '',
      r.status,
      r.pointsSpent,
      r.discountValue,
      `"${(r.user?.name || '').replace(/"/g, '""')}"`,
      r.user?.email || '',
      `"${(r.vendor?.businessName || '').replace(/"/g, '""')}"`,
      r.vendor?.vendorCode || '',
      `"${(r.offer?.title || '').replace(/"/g, '""')}"`,
      r.createdAt ? new Date(r.createdAt).toISOString() : '',
      r.refundedAt ? new Date(r.refundedAt).toISOString() : '',
    ].join(','));
    return header + rows.join('\n');
  },

  async getFraudAlerts(limit = 50) {
    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'RedemptionAttempt' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { actor: { select: { id: true, name: true, email: true } } },
    });

    const notifications = await prisma.inAppNotification.findMany({
      where: { type: 'fraud_alert' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, title: true, body: true, data: true, createdAt: true, userId: true },
    });

    return { auditLogs: logs, notifications };
  },
};
