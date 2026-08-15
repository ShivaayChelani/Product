import { prisma } from '../../config/database';
import { ApiError } from '../../shared/utils/ApiError';
import { notificationService } from '../notifications/notification.service';
import { logger } from '../../config/logger';
import { palPointsEarnMessage } from './walletEarnMessages';

export type EarnNotifyOptions = {
  notify?: boolean;
  title?: string;
  body?: string;
};

export const walletService = {
  async getOrCreateWallet(userId: string) {
    let wallet = await prisma.wallet.findUnique({
      where: { userId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: { userId },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
    }

    return wallet;
  },

  async getProfile(userId: string) {
    const wallet = await this.getOrCreateWallet(userId);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [recentTransactions, monthEarnAgg, monthSpendAgg] = await Promise.all([
      prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.walletTransaction.aggregate({
        where: {
          walletId: wallet.id,
          type: 'EARN',
          createdAt: { gte: monthStart },
        },
        _sum: { amount: true },
      }),
      prisma.walletTransaction.aggregate({
        where: {
          walletId: wallet.id,
          type: 'SPEND',
          createdAt: { gte: monthStart },
        },
        _sum: { amount: true },
      }),
    ]);

    const monthEarned = Math.abs(monthEarnAgg._sum.amount || 0);
    const monthRedeemed = Math.abs(monthSpendAgg._sum.amount || 0);

    return {
      palPoints: wallet.palPoints,
      lifetimeEarned: wallet.lifetimeEarned,
      lifetimeSpent: wallet.lifetimeSpent,
      recentTransactions,
      thisMonthEarned: monthEarned,
      thisMonthRedeemed: monthRedeemed,
    };
  },

  async getBatchProfiles(userIds: string[]) {
    const uniqueIds = [...new Set(userIds)];
    const wallets = await prisma.wallet.findMany({
      where: { userId: { in: uniqueIds } },
      select: {
        userId: true,
        palPoints: true,
        lifetimeEarned: true,
        lifetimeSpent: true,
      },
    });

    const map: Record<string, { palPoints: number; lifetimeEarned: number; lifetimeSpent: number }> = {};
    for (const wallet of wallets) {
      map[wallet.userId] = {
        palPoints: wallet.palPoints,
        lifetimeEarned: wallet.lifetimeEarned,
        lifetimeSpent: wallet.lifetimeSpent,
      };
    }
    return map;
  },

  async earn(
    userId: string,
    amount: number,
    reason: string,
    referenceId?: string,
    referenceType?: string,
    notifyOptions?: EarnNotifyOptions,
  ) {
    if (amount <= 0) throw new ApiError(400, 'Amount must be positive');

    await this.getOrCreateWallet(userId);

    let awarded = true;
    const result = await prisma.$transaction(async (tx) => {
      // Idempotency: same reference must not mint duplicate EARN rows.
      if (referenceId) {
        const existing = await tx.walletTransaction.findFirst({
          where: {
            userId,
            referenceId,
            type: 'EARN',
            ...(referenceType ? { referenceType } : {}),
          },
        });
        if (existing) {
          awarded = false;
          const wallet = await tx.wallet.findUnique({ where: { userId } });
          if (!wallet) throw new ApiError(404, 'Wallet not found');
          return wallet;
        }
      }

      const wallet = await tx.wallet.update({
        where: { userId },
        data: {
          palPoints: { increment: amount },
          lifetimeEarned: { increment: amount },
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          userId,
          amount,
          type: 'EARN',
          reason,
          referenceId,
          referenceType,
        },
      });

      return wallet;
    });

    if (awarded && notifyOptions?.notify !== false) {
      const title = notifyOptions?.title || `+${amount} PalPoints`;
      const body = notifyOptions?.body || palPointsEarnMessage(reason);
      setImmediate(() => {
        notificationService
          .sendToUser(userId, title, body, { type: 'points_earned', amount, reason }, 'points_earned')
          .catch((err: any) => logger.error({ err, userId, amount, reason }, 'Failed to send points notification'));
      });
    }

    return result;
  },

  /**
   * Game rewards: enforce cooldown + daily cap inside the same transaction as the credit
   * to close TOCTOU races on concurrent /wallet/game-completion calls.
   * Floors apply when the rule has no limits configured (legacy unlimited rows).
   */
  async earnGameComplete(
    userId: string,
    amount: number,
    cooldownSec: number | null | undefined,
    maxDaily: number | null | undefined,
  ) {
    if (amount <= 0) throw new ApiError(400, 'Amount must be positive');

    const reason = 'game_complete';
    const effectiveCooldown = cooldownSec && cooldownSec > 0 ? cooldownSec : 3600;
    const effectiveMaxDaily = maxDaily && maxDaily > 0 ? maxDaily : 10;

    await this.getOrCreateWallet(userId);

    const result = await prisma.$transaction(async (tx) => {
      const since = new Date(Date.now() - effectiveCooldown * 1000);
      const recent = await tx.walletTransaction.findFirst({
        where: { userId, reason, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
      });
      if (recent) {
        throw new ApiError(429, 'You have already played a game recently. Please wait before playing again.');
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const count = await tx.walletTransaction.count({
        where: { userId, reason, createdAt: { gte: today } },
      });
      if (count >= effectiveMaxDaily) {
        throw new ApiError(429, 'Daily game reward limit reached. Try again tomorrow.');
      }

      const wallet = await tx.wallet.update({
        where: { userId },
        data: {
          palPoints: { increment: amount },
          lifetimeEarned: { increment: amount },
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          userId,
          amount,
          type: 'EARN',
          reason,
          referenceType: 'GAME',
        },
      });

      return wallet;
    });

    setImmediate(() => {
      notificationService
        .sendToUser(
          userId,
          `+${amount} PalPoints`,
          palPointsEarnMessage(reason),
          { type: 'points_earned', amount, reason },
          'points_earned',
        )
        .catch((err: any) => logger.error({ err, userId, amount, reason }, 'Failed to send points notification'));
    });

    return result;
  },

  async spend(userId: string, amount: number, reason: string, referenceId?: string, referenceType?: string) {
    if (amount <= 0) throw new ApiError(400, 'Amount must be positive');

    await this.getOrCreateWallet(userId);

    const result = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.wallet.updateMany({
        where: { userId, palPoints: { gte: amount } },
        data: {
          palPoints: { decrement: amount },
          lifetimeSpent: { increment: amount },
        },
      });

      if (updateResult.count === 0) {
        throw new ApiError(400, `Insufficient Pal Points. Need ${amount}`);
      }

      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) throw new ApiError(404, 'Wallet not found');

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          userId,
          amount: -amount,
          type: 'SPEND',
          reason,
          referenceId,
          referenceType,
        },
      });

      return wallet;
    });

    return result;
  },

  async getTransactions(userId: string, page = 1, limit = 20) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const wallet = await this.getOrCreateWallet(userId);
    const skip = (safePage - 1) * safeLimit;
    const [data, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      prisma.walletTransaction.count({ where: { walletId: wallet.id } }),
    ]);

    const totalPages = Math.ceil(total / safeLimit) || 1;
    return {
      data,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages,
        hasNext: safePage < totalPages,
        hasPrev: safePage > 1,
      },
    };
  },

  async adjustWallet(userId: string, adminId: string, data: { palPoints?: number; reason: string }) {
    await this.getOrCreateWallet(userId);

    const delta = data.palPoints;
    if (delta === undefined || delta === 0) {
      throw new ApiError(400, 'palPoints adjustment must be a non-zero integer');
    }

    return prisma.$transaction(async (tx) => {
      if (delta < 0) {
        const debit = -delta;
        const updateResult = await tx.wallet.updateMany({
          where: { userId, palPoints: { gte: debit } },
          data: {
            palPoints: { decrement: debit },
            lifetimeSpent: { increment: debit },
          },
        });
        if (updateResult.count === 0) {
          throw new ApiError(400, `Insufficient Pal Points for debit of ${debit}`);
        }
      } else {
        await tx.wallet.update({
          where: { userId },
          data: {
            palPoints: { increment: delta },
            lifetimeEarned: { increment: delta },
          },
        });
      }

      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) throw new ApiError(404, 'Wallet not found');

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          userId,
          amount: delta,
          type: delta > 0 ? 'EARN' : 'SPEND',
          reason: `Admin Adjustment: ${data.reason}`,
          referenceType: 'ADMIN_ADJUSTMENT',
          referenceId: adminId,
        },
      });

      return wallet;
    });
  },

  async getLeaderboard(page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      prisma.wallet.findMany({
        where: { palPoints: { gt: 0 }, NOT: { user: { permission: 'ADMIN' } } },
        orderBy: { palPoints: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              permission: true,
              userRoles: {
                where: { status: 'APPROVED' },
                select: { role: true },
              },
            },
          },
        },
      }),
      prisma.wallet.count({ where: { palPoints: { gt: 0 }, NOT: { user: { permission: 'ADMIN' } } } }),
    ]);

    const totalPages = Math.ceil(total / limit);
    const ranks = data.map((w, i) => {
      const permission = String(w.user.permission || 'USER').toUpperCase();
      const roles = (w.user.userRoles || []).map((r) => String(r.role).toUpperCase());
      let roleLabel = 'Traveler';
      if (permission === 'VENDOR' || roles.includes('VENDOR')) roleLabel = 'Vendor';
      else if (
        permission === 'CONTENT_CREATOR' ||
        roles.includes('CONTENT_CREATOR')
      ) {
        roleLabel = 'Creator';
      }

      return {
        rank: skip + i + 1,
        userId: w.userId,
        name: w.user.name || 'Unknown',
        palPoints: w.palPoints,
        lifetimeEarned: w.lifetimeEarned,
        roleLabel,
      };
    });

    const avgPoints = total > 0
      ? Math.round(data.reduce((s, w) => s + w.palPoints, 0) / data.length)
      : 0;

    return {
      data: ranks,
      stats: {
        totalUsers: total,
        averagePoints: avgPoints,
        topScore: data[0]?.palPoints || 0,
      },
      pagination: {
        page, limit, total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  },

  async getRegionalLeaderboard(city: string, page = 1, limit = 50) {
    const take = Math.min(Math.max(limit, 1), 100);
    const skip = (page - 1) * take;

    const grouped = await prisma.checkIn.groupBy({
      by: ['userId'],
      where: {
        place: {
          city: { equals: city, mode: 'insensitive' },
        },
      },
      _count: { userId: true },
      orderBy: { _count: { userId: 'desc' } },
      take: skip + take,
    });

    const pageGroups = grouped.slice(skip, skip + take);
    const users = await prisma.user.findMany({
      where: { id: { in: pageGroups.map((g) => g.userId) } },
      select: { id: true, name: true, avatar: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    const ranks = pageGroups.map((item, index) => {
      const user = userById.get(item.userId);
      return {
        rank: skip + index + 1,
        userId: item.userId,
        name: user?.name || 'Unknown',
        avatar: user?.avatar ?? null,
        checkInCount: item._count.userId,
      };
    });

    return {
      data: ranks,
      total: grouped.length,
    };
  },
};
