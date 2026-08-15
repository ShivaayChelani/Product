import { prisma } from '../../config/database';
import { ApiError } from '../../shared/utils/ApiError';
import type { ContributeImageInput } from './userPlaceImages.validation';
import { pointRulesService } from '../point-rules/pointRules.service';
import { walletService } from '../wallet/wallet.service';

const RULE_KEY = 'place_image_approved';
const FALLBACK_POINTS = 5;
const FALLBACK_MAX_DAILY = 10;

async function resolvePhotoReward() {
  const rule = await pointRulesService.getPointsForAction(RULE_KEY);
  return {
    points: rule?.points && rule.points > 0 ? rule.points : FALLBACK_POINTS,
    maxDaily:
      rule?.maxDaily && rule.maxDaily > 0 ? rule.maxDaily : FALLBACK_MAX_DAILY,
  };
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

    return userPlaceImage;
  },

  async getContributionStatus(placeId: string, userId: string) {
    const place = await prisma.place.findUnique({ where: { id: placeId }, select: { images: true } });
    if (!place) throw new ApiError(404, 'Place not found');

    const needsImage = place.images.length === 0;
    const { points, maxDaily } = await resolvePhotoReward();

    const todayApproved = await prisma.userPlaceImage.count({
      where: {
        userId,
        status: 'approved',
        pointsAwarded: true,
        createdAt: { gte: new Date(new Date().toISOString().slice(0, 10)) },
      },
    });

    const pendingSubmission = await prisma.userPlaceImage.findFirst({
      where: { placeId, userId, status: 'pending' },
    });

    return {
      needsImage,
      remainingPaidSlots: Math.max(0, maxDaily - todayApproved),
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
      include: { place: { select: { id: true, name: true, images: true } } },
    });
    if (!submission) throw new ApiError(404, 'Submission not found');
    if (submission.status !== 'pending') throw new ApiError(400, 'Submission already reviewed');

    const { points, maxDaily } = await resolvePhotoReward();

    const result = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const todayStart = new Date(now.toISOString().slice(0, 10));

      const todayPaidCount = await tx.userPlaceImage.count({
        where: {
          userId: submission.userId,
          status: 'approved',
          pointsAwarded: true,
          createdAt: { gte: todayStart },
        },
      });

      const shouldAwardPoints = todayPaidCount < maxDaily;

      const updated = await tx.userPlaceImage.update({
        where: { id },
        data: {
          status: 'approved',
          reviewedAt: now,
          reviewedBy: adminId,
          pointsAwarded: shouldAwardPoints,
        },
      });

      const imageUrl = submission.url;
      await tx.place.update({
        where: { id: submission.placeId },
        data: {
          images: { push: imageUrl },
          thumbnail: !submission.place.images || submission.place.images.length === 0 ? imageUrl : undefined,
        },
      });

      return { ...updated, shouldAwardPoints, rewardPoints: points };
    });

    if (result.shouldAwardPoints) {
      // Server-authoritative ledger: atomic balance + WalletTransaction via walletService.earn
      await walletService.earn(
        submission.userId,
        points,
        RULE_KEY,
        result.id,
        'USER_PLACE_IMAGE',
      );
    }

    return {
      ...result,
      pointsAwarded: result.shouldAwardPoints,
      points: result.shouldAwardPoints ? points : 0,
    };
  },

  async reject(id: string, adminId: string, _reason?: string) {
    const submission = await prisma.userPlaceImage.findUnique({ where: { id } });
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

    return updated;
  },
};
