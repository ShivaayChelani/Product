import { prisma } from '../../config/database';
import { ApiError } from '../../shared/utils/ApiError';
import { logger } from '../../config/logger';
import type { ContributeImageInput } from './userPlaceImages.validation';
import { pointRulesService } from '../point-rules/pointRules.service';
import { walletService } from '../wallet/wallet.service';
import { notificationService } from '../notifications/notification.service';
import { eventBus, AppEvents } from '../../config/events';

const RULE_KEY = 'place_image_approved';
const FALLBACK_POINTS = 5;
const FALLBACK_MAX_DAILY = 10;

function startOfUtcDay(now = new Date()) {
  return new Date(now.toISOString().slice(0, 10));
}

async function resolvePhotoReward() {
  const rule = await pointRulesService.getPointsForAction(RULE_KEY);
  return {
    points: rule?.points && rule.points > 0 ? rule.points : FALLBACK_POINTS,
    maxDaily:
      rule?.maxDaily && rule.maxDaily > 0 ? rule.maxDaily : FALLBACK_MAX_DAILY,
  };
}

async function countTodayAwarded(userId: string, db: any = prisma) {
  return db.userPlaceImage.count({
    where: {
      userId,
      pointsAwarded: true,
      createdAt: { gte: startOfUtcDay() },
    },
  });
}

async function notifyPhotoReview(
  userId: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
) {
  try {
    await notificationService.sendToUser(userId, title, body, data, 'place_image_review');
  } catch (err) {
    logger.warn({ err, userId, title }, 'Failed to send place photo review notification');
  }
}

export const userPlaceImagesService = {
  async contribute(placeId: string, userId: string, input: ContributeImageInput) {
    const place = await prisma.place.findUnique({ where: { id: placeId } });
    if (!place) throw new ApiError(404, 'Place not found');

    if (place.images.length > 0) {
      throw new ApiError(400, 'This place already has images');
    }

    const existing = await prisma.userPlaceImage.findFirst({
      where: { placeId, userId, status: { in: ['pending', 'approved'] } },
    });
    if (existing) {
      throw new ApiError(400, 'You have already submitted an image for this place');
    }

    const alreadyApproved = await prisma.userPlaceImage.findFirst({
      where: { placeId, status: 'approved' },
    });
    if (alreadyApproved) {
      throw new ApiError(400, 'This place already has a community image');
    }

    const userPlaceImage = await prisma.userPlaceImage.create({
      data: {
        placeId,
        userId,
        url: input.url,
        status: 'pending',
      },
    });

    await notifyPhotoReview(
      userId,
      'Photo submitted for review',
      `Your photo of ${place.name} was submitted for review. You will be notified when an admin reviews it.`,
      {
        type: 'place_image_review',
        placeId,
        imageId: userPlaceImage.id,
        amount: 0,
        screen: 'Wallet',
      },
    );

    return {
      ...userPlaceImage,
      pointsAwarded: false,
      points: 0,
    };
  },

  async getContributionStatus(placeId: string, userId: string) {
    const place = await prisma.place.findUnique({ where: { id: placeId }, select: { images: true } });
    if (!place) throw new ApiError(404, 'Place not found');

    const needsImage = place.images.length === 0;
    const { points, maxDaily } = await resolvePhotoReward();

    const todayAwarded = await countTodayAwarded(userId);

    const pendingSubmission = await prisma.userPlaceImage.findFirst({
      where: { placeId, userId, status: 'pending' },
    });

    return {
      needsImage,
      remainingPaidSlots: Math.max(0, maxDaily - todayAwarded),
      hasPendingSubmission: !!pendingSubmission,
      pendingSubmissionId: pendingSubmission?.id || null,
      rewardPoints: points,
    };
  },

  async listAdmin(query: { page: number; limit: number; status?: string }) {
    const { page, limit, status } = query;
    const where: any = {};
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      prisma.userPlaceImage.findMany({
        where,
        include: {
          place: { select: { id: true, name: true, slug: true, city: true, state: true, images: true } },
          user: { select: { id: true, name: true, email: true } },
          reviewer: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.userPlaceImage.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  },

  async approve(id: string, adminId: string) {
    const submission = await prisma.userPlaceImage.findUnique({
      where: { id },
      include: { place: { select: { id: true, name: true, images: true, thumbnail: true } } },
    });
    if (!submission) throw new ApiError(404, 'Submission not found');
    if (submission.status !== 'pending') throw new ApiError(400, 'Submission already reviewed');

    const { points, maxDaily } = await resolvePhotoReward();

    const result = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const todayPaidCount = await countTodayAwarded(submission.userId, tx);
      const shouldAwardPoints = !submission.pointsAwarded && todayPaidCount < maxDaily;

      const updated = await tx.userPlaceImage.update({
        where: { id },
        data: {
          status: 'approved',
          reviewedAt: now,
          reviewedBy: adminId,
          pointsAwarded: submission.pointsAwarded || shouldAwardPoints,
        },
      });

      const imageUrl = submission.url;
      await tx.place.update({
        where: { id: submission.placeId },
        data: {
          images: { push: imageUrl },
          thumbnail: !submission.place.thumbnail ? imageUrl : undefined,
        },
      });

      return { ...updated, shouldAwardPoints, rewardPoints: points };
    });

    eventBus.emit(AppEvents.PLACE_UPDATED, {
      placeId: submission.placeId,
      actorId: adminId,
      data: { images: 'user_image_approved' },
    });

    if (result.shouldAwardPoints) {
      await walletService.earn(
        submission.userId,
        points,
        RULE_KEY,
        result.id,
        'USER_PLACE_IMAGE',
        { notify: false },
      );
    }

    const awardedNow = result.shouldAwardPoints ? points : 0;
    await notifyPhotoReview(
      submission.userId,
      awardedNow > 0 ? `Place photo approved · +${awardedNow} PalPoints` : 'Place photo approved',
      `Your photo of ${submission.place.name} is now live.`,
      {
        type: 'place_image_review',
        placeId: submission.placeId,
        imageId: result.id,
        amount: awardedNow,
        screen: 'Wallet',
      },
    );

    return {
      ...result,
      pointsAwarded: result.pointsAwarded,
      points: awardedNow,
    };
  },

  async reject(id: string, adminId: string, _reason?: string) {
    const submission = await prisma.userPlaceImage.findUnique({
      where: { id },
      include: { place: { select: { id: true, name: true } } },
    });
    if (!submission) throw new ApiError(404, 'Submission not found');
    if (submission.status !== 'pending') throw new ApiError(400, 'Submission already reviewed');

    const updated = await prisma.userPlaceImage.update({
      where: { id },
      data: {
        status: 'rejected',
        reviewedAt: new Date(),
        reviewedBy: adminId,
      },
    });

    await notifyPhotoReview(
      submission.userId,
      'Place photo not approved',
      `Your photo of ${submission.place.name} was not approved.`,
      {
        type: 'place_image_review',
        placeId: submission.placeId,
        imageId: updated.id,
        screen: 'Notifications',
      },
    );

    return updated;
  },
};
