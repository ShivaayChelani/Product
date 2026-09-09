import { prisma } from '../../config/database';
import { ApiError } from '../../shared/utils/ApiError';
import { walletService } from '../wallet/wallet.service';
import { notificationService } from '../notifications/notification.service';
import { logger } from '../../config/logger';
import { reverseGeocodeToCity, normalizeCityName } from '../../shared/utils/reverseGeocode';
import { haversineDistance } from '../../shared/utils/geo';
import crypto from 'crypto';
import * as XLSX from 'xlsx';
import type { CreateRiddleInput, UpdateRiddleInput, RejectRiddleInput } from './riddles.validation';

const CHECK_IN_RADIUS_METERS = 500; // 500 meters

export const riddlesService = {
  // ──────────────── Admin: CRUD ────────────────

  async listAll(query: { page?: string; limit?: string; isActive?: string; city?: string; search?: string }) {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    const skip = (page - 1) * limit;
    const where: any = {};

    if (query.isActive !== undefined) where.isActive = query.isActive === 'true';
    if (query.city) where.city = { contains: query.city, mode: 'insensitive' };
    if (query.search) where.title = { contains: query.search, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      prisma.riddle.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
        include: { _count: { select: { submissions: true } } },
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

  async getCitySummary() {
    const grouped = await prisma.riddle.groupBy({
      by: ['city'],
      _count: { _all: true },
      where: { isActive: true },
    });
    return grouped.map(g => ({ city: g.city, activeCount: g._count._all })).sort((a, b) => b.activeCount - a.activeCount);
  },

  async getById(id: string) {
    const riddle = await prisma.riddle.findUnique({
      where: { id },
      include: {
        _count: { select: { submissions: true } },
      },
    });
    if (!riddle) throw new ApiError(404, 'Riddle not found');
    return riddle;
  },

  async create(data: CreateRiddleInput) {
    return prisma.riddle.create({ data });
  },

  async update(id: string, data: UpdateRiddleInput) {
    const riddle = await prisma.riddle.findUnique({ where: { id } });
    if (!riddle) throw new ApiError(404, 'Riddle not found');
    return prisma.riddle.update({ where: { id }, data });
  },

  async delete(id: string) {
    const riddle = await prisma.riddle.findUnique({ where: { id } });
    if (!riddle) throw new ApiError(404, 'Riddle not found');
    return prisma.riddle.delete({ where: { id } });
  },

  async getSubmissions(riddleId: string, query: { page?: string; limit?: string }) {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    const skip = (page - 1) * limit;
    const where = { riddleId };

    const [data, total] = await Promise.all([
      prisma.riddleSubmission.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
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

    let updated;
    try {
      updated = await prisma.$transaction(async (tx) => {
        const sub = await tx.riddleSubmission.update({
          where: { id: submissionId, status: 'PENDING' },
          data: {
            status: 'APPROVED',
            pointsAwarded: points,
            reviewedAt: new Date(),
            reviewedById: adminId,
          },
        });
        
        await walletService.earn(sub.userId, points, 'game_complete', sub.id, 'RIDDLE', undefined, tx);
        
        return sub;
      }, { timeout: 25000, maxWait: 20000 });
    } catch (err: any) {
      if (err.code === 'P2025') {
        throw new ApiError(409, 'Submission already reviewed');
      }
      logger.error({ err, submissionId }, 'Failed to approve submission or award points');
      throw new ApiError(500, 'Failed to process approval and reward');
    }

    try {
      await notificationService.sendToUser(
        updated.userId,
        '🎯 Correct Answer! You Win!',
        `You solved "${submission.riddle.title}" and earned ${points} PalPoints!`,
        { type: 'riddle_approved', screen: 'RiddleHunt', riddleId: submission.riddleId, points: String(points) },
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

    let updated;
    try {
      updated = await prisma.riddleSubmission.update({
        where: { id: submissionId, status: 'PENDING' },
        data: {
          status: 'REJECTED',
          adminComment: data.adminComment,
          reviewedAt: new Date(),
          reviewedById: adminId,
        },
      });
    } catch (err: any) {
      if (err.code === 'P2025') throw new ApiError(409, 'Submission already reviewed');
      throw err;
    }

    try {
      await notificationService.sendToUser(
        submission.userId,
        '❌ Wrong Location – Try Again Next Time!',
        `For "${submission.riddle.title}" the correct place was: ${data.adminComment}`,
        { type: 'riddle_rejected', screen: 'RiddleHunt', riddleId: submission.riddleId, adminComment: data.adminComment },
        'riddle_rejected',
      );
    } catch (err) {
      logger.error({ err, submissionId }, 'Failed to send rejection notification');
    }

    return updated;
  },

  async getAllPendingSubmissions(query: { page?: string; limit?: string }) {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      prisma.riddleSubmission.findMany({
        where: { status: 'PENDING' },
        skip, take: limit, orderBy: { createdAt: 'asc' },
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

  // ──────────────── Admin Excel Bulk Import ────────────────
  async bulkImportValidate(fileBuffer: Buffer) {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<any>(worksheet, { defval: '' });

    if (rows.length === 0) {
      throw new ApiError(400, 'The selected Excel sheet is empty.');
    }

    let validCount = 0;
    let attentionCount = 0;
    let invalidCount = 0;
    const citiesDetected = new Set<string>();
    const cityBreakdown: Record<string, number> = {};

    const results = [];
    for (const row of rows) {
      const rawCity = row['City Name'] || row['City'];
      const title = row['Riddle English'] || row['Title'];
      const clue = row['Riddle English'] || row['Clue'];
      const clueHindi = row['Riddle Hindi'] || '';
      const answer = row['Answer English'] || row['Answer'];
      const answerHindi = row['Answer Hindi'] || '';
      const rewardPoints = parseInt(row['Reward'] || row['Points'] || '100');

      let status = 'VALID';
      let match = null;
      let error = null;

      const city = rawCity ? String(rawCity).trim() : '';

      if (!city || !title || !answer) {
        status = 'INVALID';
        error = 'Missing required fields (City Name, Riddle English, Answer English)';
      } else {
        // Try to match destination
        const place = await prisma.place.findFirst({
          where: {
            OR: [
              { name: { equals: answer, mode: 'insensitive' } },
              { name: { contains: answer, mode: 'insensitive' } },
            ],
            status: 'APPROVED',
            latitude: { not: null },
            longitude: { not: null },
          },
        });

        if (place) {
          match = {
            id: place.id,
            name: place.name,
            lat: place.latitude,
            lng: place.longitude,
          };
        } else {
          status = 'NEEDS_ATTENTION';
          error = 'Destination not found in approved PalSafar Places';
        }
      }

      if (status === 'VALID') validCount++;
      else if (status === 'NEEDS_ATTENTION') attentionCount++;
      else if (status === 'INVALID') invalidCount++;

      if (city && status !== 'INVALID') {
        citiesDetected.add(city);
        cityBreakdown[city] = (cityBreakdown[city] || 0) + 1;
      }

      results.push({
        city,
        title,
        clue,
        clueHindi,
        answer,
        answerHindi,
        rewardPoints,
        status,
        error,
        match
      });
    }

    return {
      summary: {
        total: rows.length,
        valid: validCount,
        needsAttention: attentionCount,
        invalid: invalidCount,
        citiesCount: citiesDetected.size,
        citiesBreakdown: cityBreakdown,
      },
      data: results
    };
  },

  async bulkImportConfirm(validRows: any[]) {
    let imported = 0;
    for (const item of validRows) {
      if (item.status !== 'VALID' || !item.match) continue;
      
      const existingRiddle = await prisma.riddle.findFirst({
        where: {
          title: { equals: item.title.trim(), mode: 'insensitive' },
          city: { equals: item.city.trim(), mode: 'insensitive' },
          correctPlaceName: item.match.name,
        }
      });

      if (!existingRiddle) {
        await prisma.riddle.create({
          data: {
            title: item.title.trim(),
            clue: item.clue.trim(),
            city: item.city.trim(),
            correctPlaceName: item.match.name,
            correctLat: item.match.lat,
            correctLng: item.match.lng,
            rewardPoints: item.rewardPoints,
            isActive: true,
            startsAt: new Date(),
          }
        });
        imported++;
      }
    }
    return { imported };
  },

  // ──────────────── User Gameplay ────────────────

  async getActiveForCurrentLocation(lat: number, lng: number) {
    const currentCity = await reverseGeocodeToCity(lat, lng);
    if (!currentCity) {
      throw new ApiError(400, 'We couldn\'t determine your current city. Please try again.', true, 'CITY_RESOLUTION_FAILED');
    }

    const now = new Date();
    const riddles = await prisma.riddle.findMany({
      where: {
        city: { equals: currentCity, mode: 'insensitive' },
        isActive: true,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
        correctLat: { not: null }, // Must be resolvable
        correctLng: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        clue: true,
        city: true,
        rewardPoints: true,
        startsAt: true,
        endsAt: true,
        createdAt: true,
        hintImage: true,
      },
    });

    // Remove hintImage to enforce Phase 20 (Hint endpoint)
    const mappedRiddles = riddles.map(r => {
      const { hintImage, ...rest } = r;
      return { ...rest, hasHint: !!hintImage };
    });

    return { city: currentCity, riddles: mappedRiddles };
  },

  async getByIdUser(id: string, lat: number, lng: number) {
    const currentCity = await reverseGeocodeToCity(lat, lng);
    const riddle = await prisma.riddle.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        clue: true,
        city: true,
        rewardPoints: true,
        startsAt: true,
        endsAt: true,
        isActive: true,
        hintImage: true,
      },
    });

    if (!riddle) throw new ApiError(404, 'Riddle not found', true, 'RIDDLE_NOT_FOUND');
    if (!currentCity || normalizeCityName(currentCity) !== normalizeCityName(riddle.city)) {
      throw new ApiError(403, `This riddle is in ${riddle.city}, but you are in ${currentCity || 'an unknown location'}.`, true, 'TREASURE_HUNT_CITY_MISMATCH');
    }

    const { hintImage, ...rest } = riddle;
    return { ...rest, hasHint: !!hintImage };
  },

  async getHint(id: string, lat: number, lng: number) {
    const currentCity = await reverseGeocodeToCity(lat, lng);
    const riddle = await prisma.riddle.findUnique({
      where: { id },
      select: {
        id: true,
        city: true,
        hintImage: true,
        isActive: true,
      },
    });

    if (!riddle) throw new ApiError(404, 'Riddle not found', true, 'RIDDLE_NOT_FOUND');
    if (!currentCity || normalizeCityName(currentCity) !== normalizeCityName(riddle.city)) {
      throw new ApiError(403, `This riddle is in ${riddle.city}, but you are in ${currentCity || 'an unknown location'}.`, true, 'TREASURE_HUNT_CITY_MISMATCH');
    }

    return { hintImage: riddle.hintImage };
  },

  async validateCheckIn(riddleId: string, userLat: number, userLng: number) {
    if (!Number.isFinite(userLat) || !Number.isFinite(userLng)) {
      throw new ApiError(400, 'Invalid GPS coordinates');
    }

    const riddle = await prisma.riddle.findUnique({ where: { id: riddleId } });
    if (!riddle) throw new ApiError(404, 'Riddle not found');
    if (!riddle.isActive) throw new ApiError(400, 'This riddle is no longer active');
    if (!riddle.correctLat || !riddle.correctLng) throw new ApiError(500, 'Riddle destination is missing');

    const currentCity = await reverseGeocodeToCity(userLat, userLng);
    if (!currentCity || normalizeCityName(currentCity) !== normalizeCityName(riddle.city)) {
      throw new ApiError(403, `You are not in ${riddle.city}. Check-in denied.`);
    }

    const distanceMeters = haversineDistance(userLat, userLng, riddle.correctLat, riddle.correctLng);
    const allowed = distanceMeters <= CHECK_IN_RADIUS_METERS;

    return { allowed, distanceMeters };
  },

  async submit(riddleId: string, userId: string, photoUrl: string, userLat: number, userLng: number) {
    // 1. Re-validate Check-in on final submit
    const check = await this.validateCheckIn(riddleId, userLat, userLng);
    if (!check.allowed) {
      throw new ApiError(400, `You are too far away (${check.distanceMeters}m). Get closer to submit!`);
    }

    // 2. Prevent duplicate submission
    const existing = await prisma.riddleSubmission.findUnique({
      where: { riddleId_userId: { riddleId, userId } },
    });
    if (existing) throw new ApiError(409, 'You have already submitted an answer for this riddle');

    // 3. Save as PENDING
    return prisma.riddleSubmission.create({
      data: { riddleId, userId, photoUrl },
    });
  },

  async getMySubmissions(userId: string) {
    return prisma.riddleSubmission.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        riddle: {
          select: { id: true, title: true, clue: true, city: true, rewardPoints: true, correctPlaceName: true },
        },
      },
    });
  },

  async getMySubmission(riddleId: string, userId: string) {
    return prisma.riddleSubmission.findUnique({
      where: { riddleId_userId: { riddleId, userId } },
      select: { id: true, status: true, photoUrl: true, adminComment: true, pointsAwarded: true, createdAt: true, reviewedAt: true },
    });
  },
};
