import { prisma } from '../../config/database';

export type AuditLogInput = {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
};

export const subscriptionAuditService = {
  async log(input: AuditLogInput) {
    return prisma.subscriptionAuditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        before: input.before != null ? (input.before as object) : undefined,
        after: input.after != null ? (input.after as object) : undefined,
        ipAddress: input.ipAddress ?? null,
      },
    });
  },

  async list(filters?: { entityType?: string; entityId?: string; page?: number; limit?: number }) {
    const page = filters?.page ?? 1;
    const limit = Math.min(filters?.limit ?? 50, 100);
    const where = {
      ...(filters?.entityType ? { entityType: filters.entityType } : {}),
      ...(filters?.entityId ? { entityId: filters.entityId } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.subscriptionAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.subscriptionAuditLog.count({ where }),
    ]);
    return { data, total, page, limit };
  },
};
