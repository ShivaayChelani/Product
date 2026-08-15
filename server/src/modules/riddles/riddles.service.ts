import { prisma } from '../../config/database';
import { ApiError } from '../../shared/utils/ApiError';
import { walletService } from '../wallet/wallet.service';
import { notificationService } from '../notifications/notification.service';
import { logger } from '../../config/logger';
import type { CreateRiddleInput, UpdateRiddleInput, RejectRiddleInput } from './riddles.validation';

export const riddlesService = {
  // ─── Admin: CRUD ─────────────────────────────────────────────────────────────

  async listAll(query: {
    page?: string;
    limit?: string;
    isActive?: string;
    city?: string;
    search?: string;
  }) {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    const skip = (page - 1) * limit;
    const where: any = {};

    if (query.isActive !== undefined) where.isActive = query.isActive === 'true';
    if (query.city) where.city = { contains: query.city, mode: 'insensitive' };
    if (query.search) where.title = { contains: query.search, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      prisma.riddle.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { submissions: true } },
        },
      }),
      prisma.riddle.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  },

  async getById(id: string) {
    const riddle = await prisma.riddle.findUnique({
      where: { id },
      include: { _count: { select: { submissions: true } } },
    });
    if (!riddle) throw new ApiError(404, 'Riddle not found');
    return riddle;
  },

  async create(data: CreateRiddleInput) {
    return prisma.riddle.create({
      data: {
        title: data.title,
        clue: data.clue,
        hintImage: data.hintImage,
        correctPlaceName: data.correctPlaceName,
        correctLat: data.correctLat,
        correctLng: data.correctLng,
        city: data.city,
        rewardPoints: data.rewardPoints ?? 100,
        startsAt: new Date(data.startsAt),
        endsAt: data.endsAt ? new Date(data.endsAt) : null,
      },
    });
  },

  async update(id: string, data: UpdateRiddleInput) {
    const existing = await prisma.riddle.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, 'Riddle not found');

    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.clue !== undefined) updateData.clue = data.clue;
    if (data.hintImage !== undefined) updateData.hintImage = data.hintImage;
    if (data.correctPlaceName !== undefined) updateData.correctPlaceName = data.correctPlaceName;
    if (data.correctLat !== undefined) updateData.correctLat = data.correctLat;
    if (data.correctLng !== undefined) updateData.correctLng = data.correctLng;
    if (data.city !== undefined) updateData.city = data.city;
    if (data.rewardPoints !== undefined) updateData.rewardPoints = data.rewardPoints;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.startsAt !== undefined) updateData.startsAt = new Date(data.startsAt);
    if (data.endsAt !== undefined) updateData.endsAt = data.endsAt ? new Date(data.endsAt) : null;

    return prisma.riddle.update({ where: { id }, data: updateData });
  },

  async delete(id: string) {
    const existing = await prisma.riddle.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, 'Riddle not found');
    await prisma.riddle.delete({ where: { id } });
  },

  // ─── Admin: Submission Review ─────────────────────────────────────────────────

  async getSubmissions(riddleId: string, query: { page?: string; limit?: string; status?: string }) {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    const skip = (page - 1) * limit;
    const where: any = { riddleId };
    if (query.status) where.status = query.status;

    const [data, total] = await Promise.all([
      prisma.riddleSubmission.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, avatar: true, avatarStyle: true } },
          riddle: { select: { id: true, title: true, city: true } },
        },
      }),
      prisma.riddleSubmission.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  },

  async approve(submissionId: string, adminId: string) {
    const submission = await prisma.riddleSubmission.findUnique({
      where: { id: submissionId },
      include: { riddle: true },
    });
    if (!submission) throw new ApiError(404, 'Submission not found');
    if (submission.status !== 'PENDING') throw new ApiError(409, 'Submission already reviewed');

    const points = submission.riddle.rewardPoints;

    // Update submission status
    const updated = await prisma.riddleSubmission.update({
      where: { id: submissionId },
      data: {
        status: 'APPROVED',
        pointsAwarded: points,
        reviewedAt: new Date(),
        reviewedById: adminId,
      },
    });

    // Award PalPoints via wallet
    try {
      await walletService.earn(
        submission.userId,
        points,
        'game_complete',
        submissionId,
        'RIDDLE',
      );
    } catch (err) {
      logger.error({ err, submissionId }, 'Failed to award riddle points');
    }

    // Send push notification
    try {
      await notificationService.sendToUser(
        submission.userId,
        '🎉 Correct Answer! You Win!',
        `You solved "${submission.riddle.title}" and earned ${points} PalPoints!`,
        {
          type: 'riddle_approved',
          screen: 'RiddleHunt',
          riddleId: submission.riddleId,
          points: String(points),
        },
        'riddle_approved',
      );
    } catch (err) {
      logger.error({ err, submissionId }, 'Failed to send approval notification');
    }

    return updated;
  },

  async reject(submissionId: string, adminId: string, data: RejectRiddleInput) {
    const submission = await prisma.riddleSubmission.findUnique({
      where: { id: submissionId },
      include: { riddle: true },
    });
    if (!submission) throw new ApiError(404, 'Submission not found');
    if (submission.status !== 'PENDING') throw new ApiError(409, 'Submission already reviewed');

    const updated = await prisma.riddleSubmission.update({
      where: { id: submissionId },
      data: {
        status: 'REJECTED',
        adminComment: data.adminComment,
        reviewedAt: new Date(),
        reviewedById: adminId,
      },
    });

    // Send push notification with correct location hint
    try {
      await notificationService.sendToUser(
        submission.userId,
        '❌ Wrong Location — Try Again Next Time!',
        `For "${submission.riddle.title}" the correct place was: ${data.adminComment}`,
        {
          type: 'riddle_rejected',
          screen: 'RiddleHunt',
          riddleId: submission.riddleId,
          adminComment: data.adminComment,
        },
        'riddle_rejected',
      );
    } catch (err) {
      logger.error({ err, submissionId }, 'Failed to send rejection notification');
    }

    return updated;
  },

  // ─── User: Get Active Riddles by City ─────────────────────────────────────────

  async getActiveForCity(city: string) {
    const now = new Date();
    return prisma.riddle.findMany({
      where: {
        city: { equals: city, mode: 'insensitive' },
        isActive: true,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      },
      orderBy: { createdAt: 'desc' },
      // Return only fields safe for users (no correctPlaceName/lat/lng until rejected)
      select: {
        id: true,
        title: true,
        clue: true,
        hintImage: true,
        city: true,
        rewardPoints: true,
        startsAt: true,
        endsAt: true,
        createdAt: true,
      },
    });
  },

  // ─── User: My Submission for a Riddle ─────────────────────────────────────────

  async getMySubmission(riddleId: string, userId: string) {
    return prisma.riddleSubmission.findUnique({
      where: { riddleId_userId: { riddleId, userId } },
      select: {
        id: true,
        status: true,
        photoUrl: true,
        adminComment: true,
        pointsAwarded: true,
        createdAt: true,
        reviewedAt: true,
      },
    });
  },

  // ─── User: Submit Answer ─────────────────────────────────────────────────────

  async submit(riddleId: string, userId: string, photoUrl: string) {
    const riddle = await prisma.riddle.findUnique({ where: { id: riddleId } });
    if (!riddle) throw new ApiError(404, 'Riddle not found');
    if (!riddle.isActive) throw new ApiError(400, 'This riddle is no longer active');

    const now = new Date();
    if (riddle.startsAt > now) throw new ApiError(400, 'This riddle has not started yet');
    if (riddle.endsAt && riddle.endsAt < now) throw new ApiError(400, 'This riddle has expired');

    const existing = await prisma.riddleSubmission.findUnique({
      where: { riddleId_userId: { riddleId, userId } },
    });
    if (existing) throw new ApiError(409, 'You have already submitted an answer for this riddle');

    return prisma.riddleSubmission.create({
      data: { riddleId, userId, photoUrl },
    });
  },

  // ─── User: All My Submissions ─────────────────────────────────────────────────

  async getMySubmissions(userId: string) {
    return prisma.riddleSubmission.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        riddle: {
          select: {
            id: true,
            title: true,
            clue: true,
            city: true,
            rewardPoints: true,
            correctPlaceName: true,
          },
        },
      },
    });
  },

  // ─── Admin: All Pending Submissions (cross-riddle) ────────────────────────────

  async getAllPendingSubmissions(query: { page?: string; limit?: string }) {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      prisma.riddleSubmission.findMany({
        where: { status: 'PENDING' },
        skip,
        take: limit,
        orderBy: { createdAt: 'asc' },
        include: {
          user: { select: { id: true, name: true, avatar: true, avatarStyle: true } },
          riddle: { select: { id: true, title: true, city: true, correctPlaceName: true } },
        },
      }),
      prisma.riddleSubmission.count({ where: { status: 'PENDING' } }),
    ]);

    return {
      data,
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  },
};
