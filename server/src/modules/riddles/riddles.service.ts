import { prisma } from '../../config/database';
import { ApiError } from '../../shared/utils/ApiError';
import { walletService } from '../wallet/wallet.service';
import { logger } from '../../config/logger';
import { reverseGeocodeToCity } from '../../shared/utils/reverseGeocode';
import { cityDisplayName, canonicalCityKey } from '../../shared/utils/cityIdentity';
import { validateTreasureHuntExcelFile } from './riddles-import';

export const riddlesService = {

  // ──────────────── ADMIN EXCEL IMPORT ────────────────
  async bulkImportValidate(fileBuffer: Buffer) {
    return validateTreasureHuntExcelFile(fileBuffer);
  },

  async bulkImportExecute(options: {
    validRows: any[];
    fileName: string;
    uploadedById: string;
    totalRows: number;
    invalidRows: number;
    cities: string[];
  }) {
    const { validRows, fileName, uploadedById, totalRows, invalidRows, cities } = options;
    let imported = 0;
    // Group by city
    const grouped = (validRows as any[]).reduce((acc: any, row) => {
      if (row.status !== 'VALID') return acc;
      if (!acc[row.city]) acc[row.city] = [];
      acc[row.city].push(row);
      return acc;
    }, {});

    const allCities = cities.length > 0 ? cities : Object.keys(grouped);

    for (const city of Object.keys(grouped)) {
      const hunt = await prisma.treasureHunt.upsert({
        where: { city },
        update: { updatedAt: new Date() },
        create: { city, title: `${city} Treasure Hunt`, rewardCoins: 150 },
      });

      // Clear existing riddles for this city to fully replace them with the Excel rows
      await prisma.riddle.deleteMany({ where: { huntId: hunt.id } });

      const riddlesToCreate = grouped[city].map((row: any, i: number) => ({
        huntId: hunt.id,
        city,
        sequence: i + 1,
        clueEnglish: row.clueEnglish,
        answerEnglish: row.answerEnglish,
        clueHindi: row.clueHindi,
        answerHindi: row.answerHindi,
      }));

      await prisma.riddle.createMany({ data: riddlesToCreate });
      imported += riddlesToCreate.length;
    }

    await prisma.treasureHuntImportLog.create({
      data: {
        fileName,
        uploadedById,
        totalRows,
        validRows: imported,
        failedRows: invalidRows,
        cities: allCities,
        status: 'COMPLETED',
      },
    });

    try {
      logger.info(
        { fileName, uploadedById, totalRows, imported, invalidRows, allCities },
        'Treasure hunt Excel import completed'
      );
    } catch {
      /* no-op */
    }

    return { imported };
  },

  // ──────────────── ADMIN CRUD ────────────────
  async listAllHunts(query: { page?: string; limit?: string; city?: string }) {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    const skip = (page - 1) * limit;
    const where: any = {};
    if (query.city) where.city = { contains: query.city, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      prisma.treasureHunt.findMany({ where, skip, take: limit, include: { _count: { select: { riddles: true } } }, orderBy: { createdAt: 'desc' } }),
      prisma.treasureHunt.count({ where }),
    ]);

    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 },
    };
  },

  async listAllRiddles(query: { page?: string; limit?: string; city?: string; search?: string }) {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    const skip = (page - 1) * limit;
    const where: any = {};
    if (query.city) where.city = { contains: query.city, mode: 'insensitive' };
    if (query.search) {
      where.OR = [
        { clueEnglish: { contains: query.search, mode: 'insensitive' } },
        { clueHindi: { contains: query.search, mode: 'insensitive' } },
        { answerEnglish: { contains: query.search, mode: 'insensitive' } },
        { answerHindi: { contains: query.search, mode: 'insensitive' } },
        { city: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.riddle.findMany({ where, skip, take: limit, orderBy: [{ city: 'asc' }, { sequence: 'asc' }] }),
      prisma.riddle.count({ where }),
    ]);

    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 },
    };
  },

  async deleteHunt(id: string) {
    const hunt = await prisma.treasureHunt.findUnique({ where: { id } });
    if (!hunt) throw new ApiError(404, 'Hunt not found');
    return prisma.treasureHunt.delete({ where: { id } });
  },

  // ──────────────── ADMIN DASHBOARD ────────────────
  async getOverview() {
    const [totalHunts, activeHunts, totalCities, totalRiddles, totalImports, recentImports] = await Promise.all([
      prisma.treasureHunt.count(),
      prisma.treasureHunt.count({ where: { status: 'ACTIVE' } }),
      prisma.riddle.groupBy({ by: ['city'] }),
      prisma.riddle.count(),
      prisma.treasureHuntImportLog.count(),
      prisma.treasureHuntImportLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { uploadedBy: { select: { id: true, name: true, email: true } } },
      }),
    ]);

    return {
      stats: {
        totalHunts,
        activeHunts,
        totalCities: totalCities.length,
        totalRiddles,
        totalImports,
      },
      recentImports,
    };
  },

  async getCities() {
    const cities = await prisma.riddle.groupBy({
      by: ['city'],
      _count: { _all: true },
    });

    const hunts = await prisma.treasureHunt.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, city: true, title: true, status: true, updatedAt: true, createdAt: true },
    });

    const huntByCity = new Map<string, (typeof hunts)[number]>();
    for (const hunt of hunts) huntByCity.set(canonicalCityKey(hunt.city), hunt);

    return cities
      .map((c) => {
        const hunt = huntByCity.get(canonicalCityKey(c.city));
        return {
          city: c.city,
          riddleCount: c._count._all,
          huntId: hunt?.id ?? null,
          title: hunt?.title ?? null,
          status: hunt?.status ?? 'NO_HUNT',
          lastUpdatedAt: hunt?.updatedAt ?? null,
        };
      })
      .sort((a, b) => b.riddleCount - a.riddleCount);
  },

  async listImportHistory(query: { page?: string; limit?: string }) {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      prisma.treasureHuntImportLog.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { uploadedBy: { select: { id: true, name: true, email: true } } },
      }),
      prisma.treasureHuntImportLog.count(),
    ]);

    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 },
    };
  },

  // ──────────────── USER GAMEPLAY ────────────────

  /** Resolve the user's city from GPS and verify they may play this hunt. */
  async verifyHuntCity(huntCity: string, lat: number, lng: number): Promise<string> {
    const currentCity = await reverseGeocodeToCity(lat, lng);
    if (!currentCity) {
      throw new ApiError(400, 'We couldn\'t determine your current city. Please try again.', true, 'CITY_RESOLUTION_FAILED');
    }
    if (canonicalCityKey(currentCity) !== canonicalCityKey(huntCity)) {
      throw new ApiError(
        403,
        `Hunt unavailable. Treasure Hunts can only be played in the city you're currently visiting. You're currently in ${cityDisplayName(currentCity)}.`,
        true,
        'TREASURE_HUNT_CITY_MISMATCH'
      );
    }
    return currentCity;
  },

  /** Get the current hunt available in the user's GPS city (no riddles/clues exposed). */
  async getCurrentCityHunt(lat: number, lng: number) {
    const currentCity = await reverseGeocodeToCity(lat, lng);
    if (!currentCity) {
      throw new ApiError(400, 'We couldn\'t determine your current city. Please try again.', true, 'CITY_RESOLUTION_FAILED');
    }

    const hunt = await prisma.treasureHunt.findFirst({
      where: { city: { equals: canonicalCityKey(currentCity), mode: 'insensitive' }, status: 'ACTIVE' },
      include: { _count: { select: { riddles: true } } },
    });

    if (!hunt || hunt._count.riddles === 0) {
      return { city: cityDisplayName(currentCity), hunt: null };
    }

    return {
      city: cityDisplayName(currentCity),
      hunt: {
        id: hunt.id,
        city: hunt.city,
        title: hunt.title,
        description: hunt.description,
        rewardCoins: hunt.rewardCoins,
        status: hunt.status,
        riddleCount: hunt._count.riddles,
      },
    };
  },

  async getHuntDetails(huntId: string, lat: number, lng: number, userId: string) {
    const hunt = await prisma.treasureHunt.findUnique({
      where: { id: huntId },
      include: {
        riddles: {
          orderBy: { sequence: 'asc' },
          select: { id: true, sequence: true, rewardCoins: true } // EXCLUDE CLUES AND ANSWERS
        }
      }
    });
    if (!hunt) throw new ApiError(404, 'Hunt not found');

    // Backend city gate: reject hunts outside the user's current GPS city.
    await this.verifyHuntCity(hunt.city, lat, lng);

    const progress = await prisma.treasureHuntProgress.findUnique({
      where: { userId_huntId: { userId, huntId } },
      select: { currentRiddleId: true, isCompleted: true, coinsEarned: true, startedAt: true, completedAt: true },
    });

    return {
      id: hunt.id,
      city: hunt.city,
      title: hunt.title,
      description: hunt.description,
      rewardCoins: hunt.rewardCoins,
      status: hunt.status,
      riddles: hunt.riddles,
      myProgress: progress,
    };
  },

  async getRiddle(huntId: string, riddleId: string, lat: number, lng: number) {
    const hunt = await prisma.treasureHunt.findUnique({
      where: { id: huntId },
      select: { id: true, city: true },
    });
    if (!hunt) throw new ApiError(404, 'Hunt not found');

    // Backend city gate: reject riddles from hunts outside the user's GPS city.
    await this.verifyHuntCity(hunt.city, lat, lng);

    const riddle = await prisma.riddle.findFirst({
      where: { id: riddleId, huntId },
      select: { id: true, huntId: true, sequence: true, rewardCoins: true, clueEnglish: true, clueHindi: true }
    });
    if (!riddle) throw new ApiError(404, 'Riddle not found');
    return riddle;
  },

  /** Normalize answer string for comparison */
  normalizeAnswer(answer: string) {
    return answer.toLowerCase().replace(/[\s_.-]+/g, ' ').trim();
  },

  async submitAnswer(
    huntId: string,
    riddleId: string,
    userId: string,
    answer: string,
    language: 'en' | 'hi' | undefined,
    lat: number,
    lng: number,
  ) {
    const hunt = await prisma.treasureHunt.findUnique({
      where: { id: huntId },
      include: { riddles: { orderBy: { sequence: 'asc' } } },
    });
    if (!hunt) throw new ApiError(404, 'Hunt not found');

    // Backend city gate: a user may only answer riddles of the hunt in their
    // current GPS city, regardless of what the client requested.
    await this.verifyHuntCity(hunt.city, lat, lng);

    const riddle = hunt.riddles.find((r) => r.id === riddleId);
    if (!riddle) throw new ApiError(404, 'Riddle not found');

    // Order enforcement: users must solve the current riddle first (prevents
    // skipping ahead or re-answering out-of-sequence riddles via the API).
    const progress = await prisma.treasureHuntProgress.findUnique({
      where: { userId_huntId: { userId, huntId } },
    });

    if (progress) {
      if (!progress.isCompleted && progress.currentRiddleId && progress.currentRiddleId !== riddleId) {
        throw new ApiError(409, 'Please solve the current riddle first before moving ahead.', true, 'RIDDLE_OUT_OF_ORDER');
      }
    } else if (hunt.riddles[0] && hunt.riddles[0].id !== riddleId) {
      throw new ApiError(409, 'Please start the hunt from the first riddle.', true, 'RIDDLE_OUT_OF_ORDER');
    }

    // 1. Check answer against the selected language only (never mix languages).
    const normalizedInput = this.normalizeAnswer(answer);
    const normalizedEnglish = this.normalizeAnswer(riddle.answerEnglish);
    const normalizedHindi = this.normalizeAnswer(riddle.answerHindi);
    const isCorrect =
      language === 'hi'
        ? normalizedInput === normalizedHindi
        : language === 'en'
          ? normalizedInput === normalizedEnglish
          : normalizedInput === normalizedEnglish || normalizedInput === normalizedHindi;

    // 2. Prevent duplicate rewards (transaction)
    let rewardCoins = 0;
    let huntCompleteReward = 0;
    let nextRiddle: { id: string; sequence: number } | null = null;
    let huntCompleted = false;

    const currentIndex = hunt.riddles.findIndex((r) => r.id === riddleId);
    if (currentIndex < hunt.riddles.length - 1) {
      const n = hunt.riddles[currentIndex + 1];
      nextRiddle = { id: n.id, sequence: n.sequence }; // clue hidden until it is the active riddle
    } else {
      huntCompleted = true;
    }

    if (isCorrect) {
      await prisma.$transaction(async (tx) => {
        const existingProgress = await tx.riddleProgress.findUnique({
          where: { userId_riddleId: { userId, riddleId } }
        });

        if (existingProgress?.isCorrect) {
          // Already solved before, no coins
          return;
        }

        rewardCoins = riddle.rewardCoins;

        await tx.riddleProgress.upsert({
          where: { userId_riddleId: { userId, riddleId } },
          create: { userId, huntId, riddleId, attempts: 1, isCorrect: true, coinsEarned: rewardCoins, completedAt: new Date() },
          update: { attempts: { increment: 1 }, isCorrect: true, coinsEarned: rewardCoins, completedAt: new Date() }
        });

        // Award riddle coins (idempotent via referenceId + type)
        await walletService.earn(userId, rewardCoins, 'game_complete', riddleId, 'RIDDLE', undefined, tx);

        let huntProgress = await tx.treasureHuntProgress.findUnique({
          where: { userId_huntId: { userId, huntId } }
        });

        if (!huntProgress) {
          huntProgress = await tx.treasureHuntProgress.create({
            data: { userId, huntId, currentRiddleId: nextRiddle?.id, coinsEarned: rewardCoins }
          });
        } else {
          await tx.treasureHuntProgress.update({
            where: { userId_huntId: { userId, huntId } },
            data: { currentRiddleId: nextRiddle?.id, coinsEarned: { increment: rewardCoins } }
          });
        }

        if (huntCompleted && !huntProgress.isCompleted) {
          huntCompleteReward = hunt.rewardCoins;
          await tx.treasureHuntProgress.update({
            where: { userId_huntId: { userId, huntId } },
            data: { isCompleted: true, completedAt: new Date(), coinsEarned: { increment: huntCompleteReward } }
          });
          await walletService.earn(userId, huntCompleteReward, 'hunt_complete', huntId, 'TREASURE_HUNT', undefined, tx);
        }
      });
    } else {
      // Record wrong attempt
      await prisma.riddleProgress.upsert({
        where: { userId_riddleId: { userId, riddleId } },
        create: { userId, huntId, riddleId, attempts: 1 },
        update: { attempts: { increment: 1 } }
      });
    }

    return {
      correct: isCorrect,
      rewardCoins,
      huntCompleteReward,
      nextRiddle,
      huntCompleted
    };
  },

  async getMyHuntProgress(userId: string) {
    return prisma.treasureHuntProgress.findMany({
      where: { userId },
      include: {
        hunt: { include: { _count: { select: { riddles: true } } } },
      },
      orderBy: { startedAt: 'desc' },
    });
  }
};