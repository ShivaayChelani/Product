import { prisma } from '../../config/database';
import { ApiError } from '../../shared/utils/ApiError';
import { walletService } from '../wallet/wallet.service';
import { logger } from '../../config/logger';
import { reverseGeocodeToCity } from '../../shared/utils/reverseGeocode';
import { cityDisplayName, canonicalCityKey } from '../../shared/utils/cityIdentity';
import { validateTreasureHuntExcelFile } from './riddles-import';
import { isAnswerMatch } from '../../shared/utils/answerMatch';
import { TREASURE_HUNT_RIDDLE_REWARD_POINTS } from './riddles.constants';
import { getIndiaRewardDate } from '../social/creatorDailyReelReward';

// ──────────────── TYPES ────────────────

type DailyStatus = 'AVAILABLE' | 'COMPLETED_TODAY' | 'LOCKED_TODAY' | 'NO_RIDDLES' | 'HUNT_COMPLETE';

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
    const imported = (validRows as any[]).filter((row) => row.status === 'VALID').length;

    // Group by city
    const grouped = (validRows as any[]).reduce((acc: any, row) => {
      if (row.status !== 'VALID') return acc;
      if (!acc[row.city]) acc[row.city] = [];
      acc[row.city].push(row);
      return acc;
    }, {});

    const allCities = cities.length > 0 ? cities : Object.keys(grouped);

    // Create the audit log FIRST so every imported riddle can record which
    // import created it (riddles.import_log_id). This ownership link is what
    // makes import-scoped deletion safe -- no filename/timestamp guessing.
    const importLog = await prisma.treasureHuntImportLog.create({
      data: {
        fileName,
        uploadedById,
        totalRows,
        validRows: imported,
        failedRows: invalidRows,
        cities: allCities,
        status: 'PROCESSING',
      },
    });

    for (const city of Object.keys(grouped)) {
      // IMPORTANT: We do NOT delete existing riddles for the city.
      // Each import owns only its own riddles (via importLogId).
      // Same-city riddles from another import are never touched.
      const hunt = await prisma.treasureHunt.upsert({
        where: { city },
        update: { updatedAt: new Date() },
        create: { city, title: `${city} Treasure Hunt`, rewardCoins: 0 },
      });

      // Sequence: start after the last ACTIVE riddle for this hunt so new rows
      // append without colliding with existing sequence numbers.
      const lastActive = await prisma.riddle.findFirst({
        where: { huntId: hunt.id, status: 'ACTIVE' },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });
      let nextSeq = (lastActive?.sequence ?? 0) + 1;

      const riddlesToCreate = grouped[city].map((row: any) => {
        const rec = {
          huntId: hunt.id,
          city,
          sequence: nextSeq,
          rewardCoins: TREASURE_HUNT_RIDDLE_REWARD_POINTS,
          clueEnglish: row.clueEnglish,
          answerEnglish: row.answerEnglish,
          clueHindi: row.clueHindi,
          answerHindi: row.answerHindi,
          importLogId: importLog.id,
        };
        nextSeq++;
        return rec;
      });

      await prisma.riddle.createMany({ data: riddlesToCreate });
    }

    await prisma.treasureHuntImportLog.update({
      where: { id: importLog.id },
      data: { status: 'COMPLETED' },
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

  async listAllHunts(query: { page?: string; limit?: string; city?: string; status?: string }) {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    const skip = (page - 1) * limit;
    const where: any = {};
    if (query.status === 'ALL') {
      // no status filter
    } else if (query.status) {
      where.status = query.status;
    } else {
      where.status = 'ACTIVE';
    }
    if (query.city) where.city = { contains: query.city, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      prisma.treasureHunt.findMany({
        where,
        skip,
        take: limit,
        include: { _count: { select: { riddles: { where: { status: 'ACTIVE' } } } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.treasureHunt.count({ where }),
    ]);

    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 },
    };
  },

  async listAllRiddles(query: { page?: string; limit?: string; city?: string; search?: string; status?: string }) {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    const skip = (page - 1) * limit;
    const where: any = {};
    if (query.status === 'ALL') {
      // no status filter
    } else if (query.status) {
      where.status = query.status;
    } else {
      where.status = 'ACTIVE';
    }
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

  async deleteImport(importId: string, deletedById: string) {
    const log = await prisma.treasureHuntImportLog.findUnique({
      where: { id: importId },
      select: { id: true, fileName: true, status: true, deletedAt: true },
    });
    if (!log) throw new ApiError(404, 'Import record not found');
    if (log.deletedAt || log.status === 'DELETED') {
      return { importId, fileName: log.fileName, alreadyDeleted: true, mode: 'NONE', hunts: 0, riddles: 0 };
    }

    const outcome = await prisma.$transaction(async (tx) => {
      const riddles = await tx.riddle.findMany({
        where: { importLogId: importId },
        select: { id: true, huntId: true },
      });
      const riddleIds = riddles.map((r) => r.id);
      const huntIds = [...new Set(riddles.map((r) => r.huntId))];

      let mode: 'NO_CONTENT' | 'DELETED' | 'ARCHIVED' = 'NO_CONTENT';
      if (riddleIds.length > 0) {
        const [riddleProgressCount, huntProgressCount, walletRefCount, dailyAttemptCount] = await Promise.all([
          tx.riddleProgress.count({
            where: { OR: [{ riddleId: { in: riddleIds } }, { huntId: { in: huntIds } }] },
          }),
          tx.treasureHuntProgress.count({ where: { huntId: { in: huntIds } } }),
          tx.walletTransaction.count({
            where: {
              OR: [
                { referenceType: 'RIDDLE', referenceId: { in: riddleIds } },
                { referenceType: 'TREASURE_HUNT', referenceId: { in: huntIds } },
              ],
            },
          }),
          tx.riddleDailyAttempt.count({ where: { riddleId: { in: riddleIds } } }),
        ]);

        const hasUserData = riddleProgressCount + huntProgressCount + walletRefCount + dailyAttemptCount > 0;
        if (hasUserData) {
          mode = 'ARCHIVED';
          await tx.riddle.updateMany({ where: { id: { in: riddleIds } }, data: { status: 'ARCHIVED' } });
          for (const huntId of huntIds) {
            const activeCount = await tx.riddle.count({ where: { huntId, status: 'ACTIVE' } });
            if (activeCount === 0) {
              await tx.treasureHunt.update({ where: { id: huntId }, data: { status: 'ARCHIVED' } });
            }
          }
        } else {
          mode = 'DELETED';
          await tx.riddle.deleteMany({ where: { id: { in: riddleIds } } });
          const maybeEmpty = await tx.treasureHunt.findMany({
            where: { id: { in: huntIds } },
            select: { id: true, _count: { select: { riddles: true } } },
          });
          const killHunts = maybeEmpty.filter((h) => h._count.riddles === 0).map((h) => h.id);
          if (killHunts.length > 0) {
            await tx.treasureHunt.deleteMany({ where: { id: { in: killHunts } } });
          }
        }
      }

      await tx.treasureHuntImportLog.update({
        where: { id: importId },
        data: { status: 'DELETED', deletedAt: new Date(), deletedById },
      });

      return { mode, hunts: huntIds.length, riddles: riddleIds.length };
    });

    return { importId, fileName: log.fileName, alreadyDeleted: false, ...outcome };
  },

  // ──────────────── ADMIN DASHBOARD ────────────────

  async getOverview() {
    const today = getIndiaRewardDate();
    const [activeHunts, activeCities, activeRiddles, totalImports, recentImports, todayAttempts, todayCorrect] = await Promise.all([
      prisma.treasureHunt.count({ where: { status: 'ACTIVE' } }),
      prisma.riddle.groupBy({ by: ['city'], where: { status: 'ACTIVE' } }),
      prisma.riddle.count({ where: { status: 'ACTIVE' } }),
      prisma.treasureHuntImportLog.count(),
      prisma.treasureHuntImportLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { uploadedBy: { select: { id: true, name: true, email: true } } },
      }),
      prisma.riddleDailyAttempt.count({ where: { rewardDate: today } }),
      prisma.riddleDailyAttempt.count({ where: { rewardDate: today, isCorrect: true } }),
    ]);

    return {
      stats: {
        activeHunts,
        activeCities: activeCities.length,
        activeRiddles,
        totalImports,
        todayAttempts,
        todayCorrect,
        todayWrong: todayAttempts - todayCorrect,
        todayPoints: todayCorrect * TREASURE_HUNT_RIDDLE_REWARD_POINTS,
      },
      recentImports,
    };
  },

  async getCities() {
    const cities = await prisma.riddle.groupBy({
      by: ['city'],
      _count: { _all: true },
      where: { status: 'ACTIVE' },
    });

    const today = getIndiaRewardDate();

    const hunts = await prisma.treasureHunt.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, city: true, title: true, status: true, updatedAt: true, createdAt: true },
    });

    const huntByCity = new Map<string, (typeof hunts)[number]>();
    for (const hunt of hunts) huntByCity.set(canonicalCityKey(hunt.city), hunt);

    const todayAttemptsByCity = await prisma.riddleDailyAttempt.groupBy({
      by: ['huntId'],
      where: { rewardDate: today },
      _count: { _all: true },
    });
    const todayCorrectByCity = await prisma.riddleDailyAttempt.groupBy({
      by: ['huntId'],
      where: { rewardDate: today, isCorrect: true },
      _count: { _all: true },
    });

    const attemptMap = new Map(todayAttemptsByCity.map((r) => [r.huntId, r._count._all]));
    const correctMap = new Map(todayCorrectByCity.map((r) => [r.huntId, r._count._all]));

    return cities
      .map((c) => {
        const hunt = huntByCity.get(canonicalCityKey(c.city));
        const todayTotal = hunt ? (attemptMap.get(hunt.id) ?? 0) : 0;
        const todayRight = hunt ? (correctMap.get(hunt.id) ?? 0) : 0;
        return {
          city: c.city,
          riddleCount: c._count._all,
          huntId: hunt?.id ?? null,
          title: hunt?.title ?? null,
          status: hunt?.status ?? 'NO_HUNT',
          lastUpdatedAt: hunt?.updatedAt ?? null,
          todayAttempts: todayTotal,
          todayCorrect: todayRight,
          todayWrong: todayTotal - todayRight,
          todayPoints: todayRight * TREASURE_HUNT_RIDDLE_REWARD_POINTS,
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

  async verifyHuntCity(huntCity: string, lat: number, lng: number): Promise<string> {
    const currentCity = await reverseGeocodeToCity(lat, lng);
    if (!currentCity) {
      throw new ApiError(400, "We couldn't determine your current city. Please try again.", true, 'CITY_RESOLUTION_FAILED');
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

  async getCurrentCityHunt(lat: number, lng: number) {
    const currentCity = await reverseGeocodeToCity(lat, lng);
    if (!currentCity) {
      throw new ApiError(400, "We couldn't determine your current city. Please try again.", true, 'CITY_RESOLUTION_FAILED');
    }

    const hunt = await prisma.treasureHunt.findFirst({
      where: { city: { equals: canonicalCityKey(currentCity), mode: 'insensitive' }, status: 'ACTIVE' },
      include: { _count: { select: { riddles: { where: { status: 'ACTIVE' } } } } },
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
        rewardCoins: TREASURE_HUNT_RIDDLE_REWARD_POINTS,
        status: hunt.status,
        riddleCount: hunt._count.riddles,
      },
    };
  },

  async getEligibleRiddle(huntId: string, lat: number, lng: number, userId: string) {
    const hunt = await prisma.treasureHunt.findUnique({
      where: { id: huntId, status: 'ACTIVE' },
      include: {
        riddles: {
          where: { status: 'ACTIVE' },
          orderBy: { sequence: 'asc' },
          select: { id: true, sequence: true },
        },
      },
    });
    if (!hunt) throw new ApiError(404, 'Hunt not found');

    await this.verifyHuntCity(hunt.city, lat, lng);

    const riddles = hunt.riddles;
    if (riddles.length === 0) {
      return {
        hunt: { id: hunt.id, city: hunt.city, title: hunt.title },
        eligibleRiddle: null,
        dailyStatus: 'NO_RIDDLES' as DailyStatus,
      };
    }

    const today = getIndiaRewardDate();

    const progress = await prisma.treasureHuntProgress.findUnique({
      where: { userId_huntId: { userId, huntId } },
      select: { currentRiddleId: true, isCompleted: true },
    });

    if (progress?.isCompleted) {
      return {
        hunt: { id: hunt.id, city: hunt.city, title: hunt.title },
        eligibleRiddle: null,
        dailyStatus: 'HUNT_COMPLETE' as DailyStatus,
      };
    }

    let currentRiddle = riddles[0];
    if (progress?.currentRiddleId) {
      const found = riddles.find((r) => r.id === progress.currentRiddleId);
      if (found) currentRiddle = found;
    }

    const todayAttempt = await prisma.riddleDailyAttempt.findUnique({
      where: {
        riddle_daily_attempts_user_riddle_date_key: {
          userId,
          riddleId: currentRiddle.id,
          rewardDate: today,
        },
      },
      select: { isCorrect: true },
    });

    if (todayAttempt) {
      const status: DailyStatus = todayAttempt.isCorrect ? 'COMPLETED_TODAY' : 'LOCKED_TODAY';
      return {
        hunt: { id: hunt.id, city: hunt.city, title: hunt.title },
        eligibleRiddle: null,
        dailyStatus: status,
      };
    }

    return {
      hunt: { id: hunt.id, city: hunt.city, title: hunt.title },
      eligibleRiddle: { id: currentRiddle.id, sequence: currentRiddle.sequence },
      dailyStatus: 'AVAILABLE' as DailyStatus,
    };
  },

  async getHuntDetails(huntId: string, lat: number, lng: number, userId: string) {
    const hunt = await prisma.treasureHunt.findUnique({
      where: { id: huntId },
      include: {
        riddles: {
          where: { status: 'ACTIVE' },
          orderBy: { sequence: 'asc' },
          select: { id: true, sequence: true, rewardCoins: true },
        },
      },
    });
    if (!hunt) throw new ApiError(404, 'Hunt not found');

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
      rewardCoins: TREASURE_HUNT_RIDDLE_REWARD_POINTS,
      status: hunt.status,
      riddles: hunt.riddles.map((r) => ({
        id: r.id,
        sequence: r.sequence,
        rewardCoins: TREASURE_HUNT_RIDDLE_REWARD_POINTS,
      })),
      myProgress: progress,
    };
  },

  async getRiddle(huntId: string, riddleId: string, lat: number, lng: number) {
    const hunt = await prisma.treasureHunt.findUnique({
      where: { id: huntId },
      select: { id: true, city: true },
    });
    if (!hunt) throw new ApiError(404, 'Hunt not found');

    await this.verifyHuntCity(hunt.city, lat, lng);

    const riddle = await prisma.riddle.findFirst({
      where: { id: riddleId, huntId, status: 'ACTIVE' },
      select: { id: true, huntId: true, sequence: true, rewardCoins: true, clueEnglish: true, clueHindi: true },
    });
    if (!riddle) throw new ApiError(404, 'Riddle not found');
    return { ...riddle, rewardCoins: TREASURE_HUNT_RIDDLE_REWARD_POINTS };
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
      include: { riddles: { where: { status: 'ACTIVE' }, orderBy: { sequence: 'asc' } } },
    });
    if (!hunt) throw new ApiError(404, 'Hunt not found');

    await this.verifyHuntCity(hunt.city, lat, lng);

    const riddle = hunt.riddles.find((r) => r.id === riddleId);
    if (!riddle) throw new ApiError(404, 'Riddle not found');

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

    // ── DAILY LOCK CHECK ──────────────────────────────────────────────────────
    const today = getIndiaRewardDate();

    const existingDailyAttempt = await prisma.riddleDailyAttempt.findUnique({
      where: {
        riddle_daily_attempts_user_riddle_date_key: {
          userId,
          riddleId,
          rewardDate: today,
        },
      },
      select: { isCorrect: true },
    });

    if (existingDailyAttempt) {
      return {
        correct: existingDailyAttempt.isCorrect,
        rewardCoins: 0,
        dailyLocked: true,
        alreadyAttemptedToday: true,
      };
    }
    // ─────────────────────────────────────────────────────────────────────────

    const isCorrect =
      language === 'hi'
        ? isAnswerMatch(answer, riddle.answerHindi)
        : language === 'en'
          ? isAnswerMatch(answer, riddle.answerEnglish)
          : isAnswerMatch(answer, riddle.answerEnglish) || isAnswerMatch(answer, riddle.answerHindi);

    let rewardCoins = 0;

    if (isCorrect) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.riddleDailyAttempt.create({
            data: { userId, riddleId, huntId, rewardDate: today, isCorrect: true },
          });

          const existingLifetime = await tx.riddleProgress.findUnique({
            where: { userId_riddleId: { userId, riddleId } },
          });

          if (!existingLifetime?.isCorrect) {
            rewardCoins = TREASURE_HUNT_RIDDLE_REWARD_POINTS;

            await tx.riddleProgress.upsert({
              where: { userId_riddleId: { userId, riddleId } },
              create: { userId, huntId, riddleId, attempts: 1, isCorrect: true, coinsEarned: rewardCoins, completedAt: new Date() },
              update: { attempts: { increment: 1 }, isCorrect: true, coinsEarned: rewardCoins, completedAt: new Date() },
            });

            await walletService.earn(userId, rewardCoins, 'game_complete', riddleId, 'RIDDLE', undefined, tx);
          } else {
            rewardCoins = 0;
            await tx.riddleProgress.update({
              where: { userId_riddleId: { userId, riddleId } },
              data: { attempts: { increment: 1 } },
            });
          }

          const currentIndex = hunt.riddles.findIndex((r) => r.id === riddleId);
          const nextRiddle = currentIndex < hunt.riddles.length - 1 ? hunt.riddles[currentIndex + 1] : null;
          const allDone = nextRiddle === null;

          if (!progress) {
            await tx.treasureHuntProgress.create({
              data: {
                userId,
                huntId,
                currentRiddleId: nextRiddle?.id ?? null,
                coinsEarned: rewardCoins,
                isCompleted: allDone,
                ...(allDone ? { completedAt: new Date() } : {}),
              },
            });
          } else {
            await tx.treasureHuntProgress.update({
              where: { userId_huntId: { userId, huntId } },
              data: {
                currentRiddleId: nextRiddle?.id ?? null,
                coinsEarned: { increment: rewardCoins },
                ...(allDone && !progress.isCompleted ? { isCompleted: true, completedAt: new Date() } : {}),
              },
            });
          }
          // NOTE: No hunt completion bonus is ever awarded. This is intentional per spec.
        });
      } catch (err: any) {
        if (err?.code === 'P2002') {
          // Concurrent duplicate -- treat as already-attempted
          rewardCoins = 0;
        } else {
          throw err;
        }
      }
    } else {
      try {
        await prisma.riddleDailyAttempt.create({
          data: { userId, riddleId, huntId, rewardDate: today, isCorrect: false },
        });
      } catch (err: any) {
        if (err?.code !== 'P2002') throw err;
      }

      await prisma.riddleProgress.upsert({
        where: { userId_riddleId: { userId, riddleId } },
        create: { userId, huntId, riddleId, attempts: 1 },
        update: { attempts: { increment: 1 } },
      });
    }

    return {
      correct: isCorrect,
      rewardCoins,
      dailyLocked: true,
      alreadyAttemptedToday: false,
    };
  },

  async getMyHuntProgress(userId: string) {
    return prisma.treasureHuntProgress.findMany({
      where: { userId },
      include: {
        hunt: { include: { _count: { select: { riddles: { where: { status: 'ACTIVE' } } } } } },
      },
      orderBy: { startedAt: 'desc' },
    });
  },
};
