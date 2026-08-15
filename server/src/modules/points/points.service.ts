import { prisma } from '../../config/database';
import { ApiError } from '../../shared/utils/ApiError';
import { walletService } from '../wallet/wallet.service';

const POINTS_PER_RUPEE = 10;

/**
 * Compatibility façade over Wallet.palPoints + WalletTransaction.
 * Legacy PointBalance / PointTransaction are not read or written.
 */
export const pointsService = {
  async getBalance(userId: string) {
    const wallet = await walletService.getOrCreateWallet(userId);
    return {
      balance: wallet.palPoints,
      lifetimeEarned: wallet.lifetimeEarned,
      lifetimeSpent: wallet.lifetimeSpent,
    };
  },

  async earn(_userId: string, _amount: number, _reason: string, _referenceId?: string) {
    throw new ApiError(
      410,
      'Legacy points ledger is retired. Rewards are credited only through Wallet.',
    );
  },

  async spend(userId: string, amount: number, reason: string, referenceId?: string) {
    return walletService.spend(userId, amount, reason, referenceId, 'POINTS_COMPAT');
  },

  async getTransactionHistory(userId: string, page = 1, limit = 20) {
    const wallet = await walletService.getOrCreateWallet(userId);
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.walletTransaction.count({ where: { walletId: wallet.id } }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  },

  pointsToRupees(points: number): number {
    return Math.floor(points / POINTS_PER_RUPEE);
  },

  rupeesToPoints(rupees: number): number {
    return rupees * POINTS_PER_RUPEE;
  },
};
