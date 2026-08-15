import { AuditAction } from '@prisma/client';
import { prisma } from '../../config/database';
import { eventBus, AppEvents } from '../../config/events';
import { logger } from '../../config/logger';

export type FraudCheckInput = {
  userId: string;
  vendorId: string;
  vendorUserId: string;
  offerId: string;
  vendorCode: string;
  success: boolean;
  reason?: string;
};

const RAPID_WINDOW_MS = 5 * 60 * 1000;
const RAPID_THRESHOLD = 5;
const FAILED_CODE_WINDOW_MS = 15 * 60 * 1000;
const FAILED_CODE_THRESHOLD = 8;

export const redemptionFraudService = {
  async checkAndFlag(input: FraudCheckInput): Promise<string[]> {
    const flags: string[] = [];
    const now = new Date();
    const rapidSince = new Date(now.getTime() - RAPID_WINDOW_MS);

    if (input.userId === input.vendorUserId) {
      flags.push('vendor_redeeming_own_offer');
    }

    const recentUserRedemptions = await prisma.redemption.count({
      where: {
        userId: input.userId,
        status: 'VERIFIED',
        createdAt: { gte: rapidSince },
      },
    });
    if (recentUserRedemptions >= RAPID_THRESHOLD) {
      flags.push('rapid_user_redemptions');
    }

    const recentOfferRedemptions = await prisma.redemption.count({
      where: {
        offerId: input.offerId,
        status: 'VERIFIED',
        createdAt: { gte: rapidSince },
      },
    });
    if (recentOfferRedemptions >= RAPID_THRESHOLD) {
      flags.push('rapid_offer_redemptions');
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const duplicateToday = await prisma.redemption.count({
      where: {
        userId: input.userId,
        offerId: input.offerId,
        status: 'VERIFIED',
        createdAt: { gte: todayStart },
      },
    });
    if (duplicateToday > 1) {
      flags.push('duplicate_redemption_pattern');
    }

    if (!input.success && input.reason) {
      const failSince = new Date(Date.now() - FAILED_CODE_WINDOW_MS);
      const failedAttempts = await prisma.auditLog.count({
        where: {
          action: 'POINTS_REDEEMED',
          entityType: 'RedemptionAttempt',
          entityId: input.userId,
          createdAt: { gte: failSince },
          AND: [
            { newValues: { path: ['success'], equals: false } },
            { newValues: { path: ['failedVendorCode'], equals: true } },
          ],
        },
      });
      if (failedAttempts >= FAILED_CODE_THRESHOLD) {
        flags.push('repeated_failed_vendor_codes');
      }
    }

    if (flags.length > 0) {
      eventBus.emit(AppEvents.FRAUD_ALERT, {
        userId: input.userId,
        vendorId: input.vendorId,
        offerId: input.offerId,
        flags,
        vendorCode: input.vendorCode,
      });
      logger.warn({ ...input, flags }, 'Suspicious redemption activity flagged');
    }

    return flags;
  },

  async logFailedAttempt(userId: string, offerId: string, vendorCode: string, reason: string) {
    await prisma.auditLog.create({
      data: {
        action: AuditAction.POINTS_REDEEMED,
        entityType: 'RedemptionAttempt',
        entityId: userId,
        actorId: userId,
        newValues: {
          offerId,
          vendorCode,
          success: false,
          failedVendorCode: true,
          reason,
        },
      },
    }).catch((err) => logger.warn({ err }, 'Failed to log redemption attempt'));
  },
};
