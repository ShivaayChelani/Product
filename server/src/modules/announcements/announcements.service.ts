import { AuditAction, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../shared/utils/ApiError';
import { auditService } from '../audit/audit.service';
import { getPaginationParams, paginatedResponse } from '../../shared/utils/pagination';
import type { CreateAnnouncementInput, UpdateAnnouncementInput } from './announcements.validation';

const attribution = {
  createdBy: { select: { id: true, name: true, email: true } },
};

export const announcementsService = {
  async list(query: { page?: string; limit?: string; isActive?: string; audience?: string }) {
    const pagination = getPaginationParams(query);
    const where: Prisma.AnnouncementWhereInput = {};
    if (query.isActive === 'true') where.isActive = true;
    if (query.isActive === 'false') where.isActive = false;
    if (query.audience) where.audience = query.audience as any;

    const [items, total] = await Promise.all([
      prisma.announcement.findMany({
        where,
        include: attribution,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.announcement.count({ where }),
    ]);

    return paginatedResponse(items, total, pagination);
  },

  async getById(id: string) {
    const announcement = await prisma.announcement.findUnique({ where: { id }, include: attribution });
    if (!announcement) throw new ApiError(404, 'Announcement not found.');
    return announcement;
  },

  async create(adminId: string, input: CreateAnnouncementInput) {
    const announcement = await prisma.announcement.create({
      data: {
        title: input.title,
        body: input.body,
        severity: input.severity,
        audience: input.audience,
        isActive: input.isActive,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        linkUrl: input.linkUrl ?? null,
        linkLabel: input.linkLabel ?? null,
        createdById: adminId,
      },
      include: attribution,
    });

    await auditService.log(AuditAction.ANNOUNCEMENT_CREATED, 'Announcement', announcement.id, adminId, null, null, { title: announcement.title });
    return announcement;
  },

  async update(id: string, adminId: string, input: UpdateAnnouncementInput) {
    const existing = await prisma.announcement.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, 'Announcement not found.');

    const data: Prisma.AnnouncementUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.body !== undefined) data.body = input.body;
    if (input.severity !== undefined) data.severity = input.severity;
    if (input.audience !== undefined) data.audience = input.audience;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.startsAt !== undefined) data.startsAt = input.startsAt ? new Date(input.startsAt) : null;
    if (input.endsAt !== undefined) data.endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if (input.linkUrl !== undefined) data.linkUrl = input.linkUrl ?? null;
    if (input.linkLabel !== undefined) data.linkLabel = input.linkLabel ?? null;

    const updated = await prisma.announcement.update({ where: { id }, data, include: attribution });
    await auditService.log(AuditAction.ANNOUNCEMENT_UPDATED, 'Announcement', id, adminId, null, { title: existing.title }, { title: updated.title });
    return updated;
  },

  async remove(id: string, adminId: string) {
    const existing = await prisma.announcement.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, 'Announcement not found.');

    await prisma.announcement.delete({ where: { id } });
    await auditService.log(AuditAction.ANNOUNCEMENT_DELETED, 'Announcement', id, adminId, null, { title: existing.title }, null);
  },

  /** Public: currently active announcements for a given audience (always includes ALL). */
  async listActive(audience?: string) {
    const now = new Date();
    const audiences = audience && audience !== 'ALL' ? ['ALL', audience] : ['ALL'];

    return prisma.announcement.findMany({
      where: {
        isActive: true,
        audience: { in: audiences as any[] },
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        title: true,
        body: true,
        severity: true,
        audience: true,
        linkUrl: true,
        linkLabel: true,
        startsAt: true,
        endsAt: true,
        createdAt: true,
      },
    });
  },
};
