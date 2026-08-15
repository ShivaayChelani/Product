import { SyncStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { getPaginationParams, paginatedResponse } from '../../shared/utils/pagination';
import { SyncBatchInput } from './sync.validation';

export const syncService = {
  async processBatch(userId: string, input: SyncBatchInput) {
    const results: Array<{ entityType: string; action: string; success: boolean; id?: string; error?: string }> = [];

    for (const op of input.operations) {
      try {
        const queueItem = await prisma.syncQueue.create({
          data: {
            userId,
            action: op.action,
            entityType: op.entityType,
            payload: op.payload as any,
            status: SyncStatus.PENDING,
          },
        });

        results.push({
          entityType: op.entityType,
          action: op.action,
          success: true,
          id: queueItem.id,
        });
      } catch (error: any) {
        results.push({
          entityType: op.entityType,
          action: op.action,
          success: false,
          error: error.message,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return {
      results,
      summary: {
        total: results.length,
        accepted: successCount,
        failed: failCount,
      },
    };
  },

  async getPending(userId: string, query: { page?: string; limit?: string }) {
    const pagination = getPaginationParams(query);
    const where = { userId, status: SyncStatus.PENDING as SyncStatus };

    const [data, total] = await Promise.all([
      prisma.syncQueue.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'asc' },
      }),
      prisma.syncQueue.count({ where }),
    ]);

    return paginatedResponse(data, total, pagination);
  },

  async getUserStatus(userId: string) {
    const [pending, completed, failed] = await Promise.all([
      prisma.syncQueue.count({ where: { userId, status: SyncStatus.PENDING } }),
      prisma.syncQueue.count({ where: { userId, status: SyncStatus.COMPLETED } }),
      prisma.syncQueue.count({ where: { userId, status: SyncStatus.FAILED } }),
    ]);

    return { pending, completed, failed };
  },

  async getAllAdmin(query: { page?: string; limit?: string; status?: string }) {
    const pagination = getPaginationParams(query);
    const where: any = {};
    if (query.status) where.status = query.status.toUpperCase() as SyncStatus;

    const [data, total] = await Promise.all([
      prisma.syncQueue.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.syncQueue.count({ where }),
    ]);

    return paginatedResponse(data, total, pagination);
  },

  async getAdminStats() {
    const [pending, processing, completed, failed, total] = await Promise.all([
      prisma.syncQueue.count({ where: { status: SyncStatus.PENDING } }),
      prisma.syncQueue.count({ where: { status: SyncStatus.PROCESSING } }),
      prisma.syncQueue.count({ where: { status: SyncStatus.COMPLETED } }),
      prisma.syncQueue.count({ where: { status: SyncStatus.FAILED } }),
      prisma.syncQueue.count(),
    ]);

    return { total, pending, processing, completed, failed };
  },
};
