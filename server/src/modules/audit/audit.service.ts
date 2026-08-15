import { AuditAction } from '@prisma/client';
import { prisma } from '../../config/database';
import { getPaginationParams, paginatedResponse } from '../../shared/utils/pagination';

function csvSafe(val: unknown): string {
  const s = String(val ?? '');
  return s.length > 0 && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

export const auditService = {
  async log(
    action: AuditAction,
    entityType: string,
    entityId: string,
    actorId: string,
    placeId?: string | null,
    previous?: Record<string, any> | null,
    newValues?: Record<string, any> | null,
  ) {
    await prisma.auditLog.create({
      data: {
        action,
        entityType,
        entityId,
        actorId,
        placeId: placeId || null,
        previous: previous || undefined,
        newValues: newValues || undefined,
      },
    });
  },

  async list(query: {
    page?: string;
    limit?: string;
    entityType?: string;
    entityId?: string;
    action?: string;
    search?: string;
    from?: string;
    to?: string;
    sortBy?: string;
    sortOrder?: string;
  }) {
    const pagination = getPaginationParams(query);
    const where: any = {};

    if (query.entityType) where.entityType = query.entityType;
    if (query.entityId) where.entityId = query.entityId;
    if (query.action) where.action = query.action;

    if (query.search) {
      where.OR = [
        { entityType: { contains: query.search, mode: 'insensitive' } },
        { entityId: { contains: query.search } },
        { action: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to + 'T23:59:59.999Z');
    }

    const orderBy: any = {};
    if (query.sortBy === 'createdAt') {
      orderBy.createdAt = query.sortOrder === 'asc' ? 'asc' : 'desc';
    } else {
      orderBy.createdAt = 'desc';
    }

    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy,
        include: {
          actor: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return paginatedResponse(data, total, pagination);
  },

  async getDistinctActions() {
    const result = await prisma.auditLog.findMany({
      select: { action: true },
      distinct: ['action'],
      orderBy: { action: 'asc' },
    });
    return result.map(r => r.action);
  },

  async getDistinctEntityTypes() {
    const result = await prisma.auditLog.findMany({
      select: { entityType: true },
      distinct: ['entityType'],
      orderBy: { entityType: 'asc' },
    });
    return result.map(r => r.entityType);
  },

  async exportCSV(query: {
    entityType?: string;
    action?: string;
    from?: string;
    to?: string;
  }) {
    const where: any = {};
    if (query.entityType) where.entityType = query.entityType;
    if (query.action) where.action = query.action;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to + 'T23:59:59.999Z');
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { name: true, email: true } } },
      take: 10000,
    });

    const header = 'ID,Action,Entity Type,Entity ID,Actor Name,Actor Email,Previous Values,New Values,Created At\n';
    const rows = logs.map(l => {
      const prev = l.previous ? JSON.stringify(l.previous).replace(/,/g, '; ').replace(/"/g, '') : '';
      const next = l.newValues ? JSON.stringify(l.newValues).replace(/,/g, '; ').replace(/"/g, '') : '';
      return `${l.id},${l.action},${l.entityType},${l.entityId},${csvSafe(l.actor?.name).replace(/,/g,' ')},${csvSafe(l.actor?.email).replace(/,/g,' ')},${csvSafe(prev)},${csvSafe(next)},${l.createdAt}`;
    }).join('\n');

    return header + rows;
  },
};
