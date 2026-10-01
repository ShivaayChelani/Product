import { logger } from '../../config/logger';
import { notificationService } from '../notifications/notification.service';
import { palPointsEarnMessage } from '../wallet/walletEarnMessages';

/**
 * Reel upload PalPoints are credited inside the reel transaction by
 * `awardCreatorDailyReelInTx`, which has no access to the notification service.
 * This is the single place that turns an awarded reel reward into a
 * `points_earned` notification, so both reel reward call sites (publish and
 * daily-reward retry) stay in sync without duplicating message logic.
 */

export const CREATOR_DAILY_REEL_REASON = 'reel_upload';
export const POINTS_EARNED_NOTIFICATION_TYPE = 'points_earned';

export function creatorDailyReelNotification(points: number): {
  title: string;
  body: string;
  data: Record<string, unknown>;
  type: string;
} {
  return {
    title: `+${points} PalPoints`,
    body: palPointsEarnMessage(CREATOR_DAILY_REEL_REASON),
    data: {
      type: POINTS_EARNED_NOTIFICATION_TYPE,
      amount: points,
      reason: CREATOR_DAILY_REEL_REASON,
    },
    type: POINTS_EARNED_NOTIFICATION_TYPE,
  };
}

/**
 * Fire-and-forget: a slow or failing push must never delay or fail reel
 * publishing. Call this only after the reward transaction has committed.
 * `points <= 0` means the daily reward was already claimed, and a zero-award
 * notification would contradict the "first reel of the day" rule, so it is
 * dropped.
 */
export function notifyCreatorDailyReelReward(input: {
  userId: string;
  reelId: string;
  points: number;
}): void {
  if (!Number.isFinite(input.points) || input.points <= 0) return;

  const { title, body, data, type } = creatorDailyReelNotification(input.points);
  setImmediate(() => {
    notificationService
      .sendToUser(input.userId, title, body, { ...data, reelId: input.reelId }, type)
      .catch((err: unknown) =>
        logger.error(
          { err, userId: input.userId, reelId: input.reelId },
          'Failed to send reel reward notification',
        ),
      );
  });
}
