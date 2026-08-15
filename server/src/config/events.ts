import { EventEmitter } from 'events';
import { AuditAction } from '@prisma/client';
import { auditService } from '../modules/audit/audit.service';
import { notificationService } from '../modules/notifications/notification.service';
import { cache, cacheKey } from './cache';
import { logger } from './logger';
import { withRetry } from '../utils/retry';

export const eventBus = new EventEmitter();
eventBus.setMaxListeners(50);

export enum AppEvents {
  PLACE_CREATED = 'PLACE_CREATED',
  PLACE_UPDATED = 'PLACE_UPDATED',
  PLACE_APPROVED = 'PLACE_APPROVED',
  PLACE_REJECTED = 'PLACE_REJECTED',
  PLACE_DELETED = 'PLACE_DELETED',
  USER_LOGIN = 'USER_LOGIN',
  USER_ROLE_CHANGED = 'USER_ROLE_CHANGED',
  STAT_RECORDED = 'STAT_RECORDED',
  OFFER_CREATED = 'OFFER_CREATED',
  OFFER_APPROVED = 'OFFER_APPROVED',
  OFFER_REJECTED = 'OFFER_REJECTED',
  OFFER_DISABLED = 'OFFER_DISABLED',
  POINTS_EARNED = 'POINTS_EARNED',
  POINTS_SPENT = 'POINTS_SPENT',
  REDEMPTION_CREATED = 'REDEMPTION_CREATED',
  REDEMPTION_VERIFIED = 'REDEMPTION_VERIFIED',
  REDEMPTION_REFUNDED = 'REDEMPTION_REFUNDED',
  FRAUD_ALERT = 'FRAUD_ALERT',
  VENDOR_CODE_RESET = 'VENDOR_CODE_RESET',
  HIDDEN_GEM_MERGED = 'HIDDEN_GEM_MERGED',
}

// ── Event Handlers ──────────────────────────────────────────

eventBus.on(AppEvents.PLACE_CREATED, async (payload: {
  placeId: string;
  actorId: string;
  data: Record<string, unknown>;
}) => {
  try {
    await withRetry(() => auditService.log(AuditAction.PLACE_CREATED, 'Place', payload.placeId, payload.actorId, payload.placeId, null, payload.data));
  } catch (err) {
    logger.error({ err, payload }, 'Failed to handle PLACE_CREATED event');
  }
});

eventBus.on(AppEvents.PLACE_APPROVED, async (payload: {
  placeId: string;
  actorId: string;
  submitterId: string;
  placeName?: string;
  previous: Record<string, unknown>;
}) => {
  try {
    const placeName = payload.placeName || 'Your place';
    await withRetry(() => auditService.log(AuditAction.PLACE_APPROVED, 'Place', payload.placeId, payload.actorId, payload.placeId, payload.previous, { status: 'APPROVED' }));
    if (payload.submitterId) {
      await withRetry(() => notificationService.sendToUser(
        payload.submitterId,
        'Hidden Gem Approved!',
        `${placeName} has been approved and is now visible to all travelers.`,
        { placeId: payload.placeId, type: 'hidden_gem_approved' },
        'hidden_gem_approved',
      )).catch((err) => {
        logger.warn({ err, placeId: payload.placeId }, 'Failed to send approval notification');
      });
    }
    cache.delPattern(cacheKey('places', 'trending'));
    cache.delPattern(cacheKey('places', 'hidden-gems'));
  } catch (err) {
    logger.error({ err, payload }, 'Failed to handle PLACE_APPROVED event');
  }
});

eventBus.on(AppEvents.PLACE_REJECTED, async (payload: {
  placeId: string;
  actorId: string;
  submitterId?: string | null;
  placeName?: string;
  reason?: string | null;
  previous: Record<string, unknown>;
}) => {
  try {
    await withRetry(() => auditService.log(
      AuditAction.PLACE_REJECTED,
      'Place',
      payload.placeId,
      payload.actorId,
      payload.placeId,
      payload.previous,
      { status: 'REJECTED', reason: payload.reason || null },
    ));

    if (payload.submitterId) {
      const placeName = payload.placeName || 'Your hidden gem';
      const reasonText = payload.reason?.trim()
        ? ` Reason: ${payload.reason.trim()}`
        : '';
      await withRetry(() => notificationService.sendToUser(
        payload.submitterId!,
        'Hidden Gem Rejected',
        `${placeName} was not approved.${reasonText} You can update details and submit again.`,
        {
          placeId: payload.placeId,
          type: 'hidden_gem_rejected',
          reason: payload.reason || null,
        },
        'hidden_gem_rejected',
      )).catch((err) => {
        logger.warn({ err, placeId: payload.placeId }, 'Failed to send rejection notification');
      });
    }

    cache.delPattern(cacheKey('places', 'trending'));
    cache.delPattern(cacheKey('places', 'hidden-gems'));
  } catch (err) {
    logger.error({ err, payload }, 'Failed to handle PLACE_REJECTED event');
  }
});

eventBus.on(AppEvents.PLACE_UPDATED, async (payload: {
  placeId: string;
  actorId: string;
  data: Record<string, unknown>;
}) => {
  try {
    await withRetry(() => auditService.log(AuditAction.PLACE_UPDATED, 'Place', payload.placeId, payload.actorId, payload.placeId, null, payload.data));
    cache.delPattern(cacheKey('places', 'trending'));
    cache.delPattern(cacheKey('places', 'hidden-gems'));
  } catch (err) {
    logger.error({ err, payload }, 'Failed to handle PLACE_UPDATED event');
  }
});

eventBus.on(AppEvents.PLACE_DELETED, async (payload: {
  placeId: string;
  actorId: string;
  previous: Record<string, unknown>;
}) => {
  try {
    await auditService.log(AuditAction.PLACE_DELETED, 'Place', payload.placeId, payload.actorId, null, payload.previous, null);
    cache.delPattern(cacheKey('places', 'trending'));
    cache.delPattern(cacheKey('places', 'hidden-gems'));
  } catch (err) {
    logger.error({ err, payload }, 'Failed to handle PLACE_DELETED event');
  }
});

eventBus.on(AppEvents.USER_LOGIN, async () => {
  // handled directly in auth.service.ts
});

eventBus.on(AppEvents.USER_ROLE_CHANGED, async (payload: {
  userId: string;
  actorId: string;
  previous: Record<string, unknown>;
  newValues: Record<string, unknown>;
}) => {
  try {
    await auditService.log(AuditAction.USER_ROLE_CHANGED, 'User', payload.userId, payload.actorId, null, payload.previous, payload.newValues);
  } catch (err) {
    logger.error({ err, payload }, 'Failed to handle USER_ROLE_CHANGED event');
  }
});

// STAT_RECORDED handled by wallet/points system directly

eventBus.on(AppEvents.REDEMPTION_CREATED, async (payload: {
  userId: string;
  vendorId: string;
  vendorUserId: string;
  offerTitle: string;
  receiptNumber?: string;
}) => {
  try {
    await notificationService.sendToUser(
      payload.vendorUserId,
      'New Redemption!',
      `Someone redeemed "${payload.offerTitle}". Receipt: ${payload.receiptNumber || 'N/A'}`,
      { type: 'redemption_created', vendorId: payload.vendorId, receiptNumber: payload.receiptNumber },
      'redemption_created',
    );
  } catch (error) {
    logger.error({ error, ...payload }, 'Failed to send redemption notification');
  }
});

eventBus.on(AppEvents.REDEMPTION_VERIFIED, async (payload: {
  userId: string;
  vendorId: string;
  vendorUserId: string;
  offerTitle: string;
  pointsSpent: number;
  receiptNumber?: string;
}) => {
  try {
    await notificationService.sendToUser(
      payload.userId,
      'Offer Redeemed!',
      `"${payload.offerTitle}" redeemed successfully. ${payload.pointsSpent} PalPoints deducted. Receipt: ${payload.receiptNumber || 'N/A'}`,
      { type: 'redemption_verified', vendorId: payload.vendorId, receiptNumber: payload.receiptNumber },
      'redemption_verified',
    );
  } catch (error) {
    logger.error({ error, ...payload }, 'Failed to send redemption verified notification');
  }
});

eventBus.on(AppEvents.REDEMPTION_REFUNDED, async (payload: {
  userId: string;
  redemptionId: string;
  pointsSpent: number;
  receiptNumber?: string | null;
}) => {
  try {
    await notificationService.sendToUser(
      payload.userId,
      'Redemption Refunded',
      `${payload.pointsSpent} PalPoints were refunded for receipt ${payload.receiptNumber || payload.redemptionId}.`,
      { type: 'redemption_refunded', redemptionId: payload.redemptionId },
      'redemption_refunded',
    );
  } catch (error) {
    logger.error({ error, ...payload }, 'Failed to send refund notification');
  }
});

eventBus.on(AppEvents.FRAUD_ALERT, async (payload: {
  userId: string;
  vendorId: string;
  offerId: string;
  flags: string[];
  vendorCode?: string;
}) => {
  try {
    await notificationService.sendToRole(
      'ADMIN',
      'Fraud Alert',
      `Suspicious redemption: ${payload.flags.join(', ')} (user ${payload.userId})`,
      {
        type: 'fraud_alert',
        userId: payload.userId,
        vendorId: payload.vendorId,
        offerId: payload.offerId,
        flags: payload.flags,
      },
      'fraud_alert',
    );
  } catch (error) {
    logger.error({ error, userId: payload.userId, vendorId: payload.vendorId }, 'Failed to send fraud alert');
  }
});

eventBus.on(AppEvents.VENDOR_CODE_RESET, async (payload: {
  vendorUserId: string;
  businessName: string;
  newVendorCode: string;
  resetByAdmin?: boolean;
}) => {
  try {
    // Never put the vendor code in push/body — lock screens would expose the redemption secret.
    await notificationService.sendToUser(
      payload.vendorUserId,
      'Vendor Code Reset',
      payload.resetByAdmin
        ? `Your business code for ${payload.businessName} was reset by admin. Open Vendor Settings to view the new code.`
        : `Your vendor code was regenerated. Open Vendor Settings to view the new code.`,
      { type: 'vendor_code_reset', screen: 'VendorSettings' },
      'vendor_code_reset',
    );
  } catch (error) {
    logger.error({ error, vendorUserId: payload.vendorUserId }, 'Failed to send vendor code reset notification');
  }
});

eventBus.on(AppEvents.HIDDEN_GEM_MERGED, async (payload: {
  submitterId?: string | null;
  placeName: string;
  mergedIntoPlaceName: string;
  pointsReward: number;
  placeId?: string;
  mergedIntoPlaceId?: string;
  actorId?: string;
}) => {
  try {
    if (payload.placeId && payload.actorId) {
      await withRetry(() =>
        auditService.log(
          AuditAction.PLACE_UPDATED,
          'Place',
          payload.placeId!,
          payload.actorId!,
          payload.placeId!,
          { status: 'PENDING' },
          {
            status: 'MERGED',
            mergedIntoPlaceId: payload.mergedIntoPlaceId || null,
            pointsReward: payload.pointsReward,
          },
        ),
      );
    }
    if (!payload.submitterId) return;
    const pointsNote =
      payload.pointsReward > 0
        ? ` You earned ${payload.pointsReward} PalPoints.`
        : '';
    await notificationService.sendToUser(
      payload.submitterId,
      'Hidden Gem Merged',
      `Your submission "${payload.placeName}" was merged into ${payload.mergedIntoPlaceName}.${pointsNote}`,
      {
        type: 'hidden_gem_merged',
        placeId: payload.mergedIntoPlaceId || payload.placeId || null,
        mergedIntoPlaceId: payload.mergedIntoPlaceId || null,
        contributionPlaceId: payload.placeId || null,
      },
      'hidden_gem_merged',
    );
  } catch (error) {
    logger.error({ error, ...payload }, 'Failed to handle hidden gem merged event');
  }
});

eventBus.on(AppEvents.OFFER_APPROVED, async (payload: {
  offerId: string;
  offerTitle: string;
  vendorId: string;
}) => {
  try {
    const { prisma } = await import('../config/database');
    const vendor = await prisma.vendor.findUnique({
      where: { id: payload.vendorId },
      select: { userId: true, businessName: true },
    });
    if (vendor) {
      await notificationService.sendToUser(
        vendor.userId,
        'Offer Approved!',
        `"${payload.offerTitle}" has been approved and is now live for users to redeem.`,
        { offerId: payload.offerId, type: 'offer_approved' },
        'offer_approved',
      );
    }
  } catch (error) {
    logger.error({ error, ...payload }, 'Failed to send offer approved notification');
  }
});

eventBus.on(AppEvents.OFFER_REJECTED, async (payload: {
  offerId: string;
  offerTitle: string;
  vendorId: string;
  reason: string;
}) => {
  try {
    const { prisma } = await import('../config/database');
    const vendor = await prisma.vendor.findUnique({
      where: { id: payload.vendorId },
      select: { userId: true, businessName: true },
    });
    if (vendor) {
      await notificationService.sendToUser(
        vendor.userId,
        'Offer Rejected',
        `"${payload.offerTitle}" was rejected. Reason: ${payload.reason}`,
        { offerId: payload.offerId, type: 'offer_rejected' },
        'offer_rejected',
      );
    }
  } catch (error) {
    logger.error({ error, ...payload }, 'Failed to send offer rejected notification');
  }
});

eventBus.on(AppEvents.OFFER_DISABLED, async (payload: {
  offerId: string;
  offerTitle: string;
  vendorId: string;
  reason?: string;
}) => {
  try {
    const { prisma } = await import('../config/database');
    const vendor = await prisma.vendor.findUnique({
      where: { id: payload.vendorId },
      select: { userId: true },
    });
    if (vendor) {
      const reasonText = payload.reason?.trim() ? ` Reason: ${payload.reason.trim()}` : '';
      await notificationService.sendToUser(
        vendor.userId,
        'Offer Disabled',
        `"${payload.offerTitle}" was disabled by admin.${reasonText}`,
        { offerId: payload.offerId, type: 'offer_disabled' },
        'offer_disabled',
      );
    }
  } catch (error) {
    logger.error({ error, offerId: payload.offerId }, 'Failed to send offer disabled notification');
  }
});

eventBus.on(AppEvents.OFFER_CREATED, async (payload: {
  offerId: string;
  vendorUserId: string;
  vendorName: string;
  offerTitle: string;
}) => {
  try {
    const { prisma } = await import('../config/database');
    const followers = await prisma.follow.findMany({
      where: { followingId: payload.vendorUserId },
      select: { followerId: true },
    });

    const followerIds = followers.map((f) => f.followerId);

    if (followerIds.length > 0) {
      await notificationService.sendToMultipleUsers(
        followerIds,
        `New Offer from ${payload.vendorName}`,
        payload.offerTitle,
        { offerId: payload.offerId, type: 'vendor_offer' },
        'vendor_offer',
      );
    }
  } catch (error) {
    const logger = (await import('../config/logger')).logger;
    logger.error({ error, ...payload }, 'Failed to send offer notification');
  }
});


