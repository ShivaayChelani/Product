import { prisma } from '../../config/database';
import { Role, ReelReportStatus, ContentModerationStatus } from '@prisma/client';
import { ApiError } from '../../shared/utils/ApiError';
import { paginatedResponse, getPaginationParams } from '../../shared/utils/pagination';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseReviewCompositeId(compositeId: string): { entityType: "PLACE" | "VENDOR"; reviewId: string } | null {
  if (compositeId.startsWith("place-")) {
    return { entityType: "PLACE", reviewId: compositeId.slice("place-".length) };
  }
  if (compositeId.startsWith("vendor-")) {
    return { entityType: "VENDOR", reviewId: compositeId.slice("vendor-".length) };
  }
  return null;
}

export const adminPanelService = {
  async listCategories(query: any) {
    const { search } = query;
    const places = await prisma.place.findMany({
      where: {
        mergedIntoId: null,
        ...(search
          ? { category: { contains: String(search), mode: 'insensitive' as const } }
          : {}),
      },
      select: { category: true },
    });

    const counts = new Map<string, number>();
    for (const p of places) {
      const key = p.category?.trim() || 'Uncategorized';
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const items = Array.from(counts.entries())
      .map(([name, linkedEntitiesCount]) => ({
        id: slugify(name),
        name,
        slug: slugify(name),
        description: null,
        parentId: null,
        level: 0,
        status: 'ACTIVE' as const,
        visibility: 'PUBLIC' as const,
        icon: null,
        color: null,
        sortOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        healthScore: 100,
        isFeatured: false,
        isSeasonal: false,
        childrenCount: 0,
        linkedEntitiesCount,
      }))
      .sort((a, b) => b.linkedEntitiesCount - a.linkedEntitiesCount);

    const params = getPaginationParams({ ...query, limit: query.limit ?? 50 });
    const start = params.skip;
    const slice = items.slice(start, start + params.limit);
    return paginatedResponse(slice, items.length, params);
  },

  async getCategory(id: string) {
    const categories = await this.listCategories({ limit: 1000 });
    const found = categories.data.find((c: any) => c.id === id);
    if (!found) throw new ApiError(404, 'Category not found');
    return found;
  },

  async updateCategory(id: string, data: { name?: string }) {
    const current = await this.getCategory(id);
    if (data.name && data.name !== current.name) {
      await prisma.place.updateMany({
        where: { category: current.name, mergedIntoId: null },
        data: { category: data.name },
      });
      return this.getCategory(slugify(data.name));
    }
    return current;
  },

  async deleteCategory(id: string) {
    const current = await this.getCategory(id);
    await prisma.place.updateMany({
      where: { category: current.name, mergedIntoId: null },
      data: { category: 'Other' },
    });
  },

  async listTags(query: any) {
    const { search } = query;
    const places = await prisma.place.findMany({
      where: { mergedIntoId: null },
      select: { tags: true },
    });

    const counts = new Map<string, number>();
    for (const p of places) {
      for (const tag of p.tags || []) {
        const key = tag.trim();
        if (!key) continue;
        if (search && !key.toLowerCase().includes(String(search).toLowerCase())) continue;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }

    const items = Array.from(counts.entries())
      .map(([name, usageCount]) => ({
        id: slugify(name),
        name,
        slug: slugify(name),
        aliases: [] as string[],
        usageCount,
        status: 'ACTIVE' as const,
        icon: null,
        color: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }))
      .sort((a, b) => b.usageCount - a.usageCount);

    const params = getPaginationParams({ ...query, limit: query.limit ?? 50 });
    const slice = items.slice(params.skip, params.skip + params.limit);
    return paginatedResponse(slice, items.length, params);
  },

  async getTag(id: string) {
    const tags = await this.listTags({ limit: 1000 });
    const found = tags.data.find((t: any) => t.id === id);
    if (!found) throw new ApiError(404, 'Tag not found');
    return found;
  },

  async updateTag(id: string, data: { name?: string }) {
    const current = await this.getTag(id);
    if (data.name && data.name !== current.name) {
      const places = await prisma.place.findMany({
        where: { tags: { has: current.name }, mergedIntoId: null },
        select: { id: true, tags: true },
      });
      for (const place of places) {
        const tags = place.tags.map((t) => (t === current.name ? data.name! : t));
        await prisma.place.update({ where: { id: place.id }, data: { tags } });
      }
      return this.getTag(slugify(data.name));
    }
    return current;
  },

  async deleteTag(id: string) {
    const current = await this.getTag(id);
    const places = await prisma.place.findMany({
      where: { tags: { has: current.name }, mergedIntoId: null },
      select: { id: true, tags: true },
    });
    for (const place of places) {
      await prisma.place.update({
        where: { id: place.id },
        data: { tags: place.tags.filter((t) => t !== current.name) },
      });
    }
  },

  async listMedia(query: any) {
    const { search, type } = query;
    const params = getPaginationParams({ ...query, limit: query.limit ?? 20 });
    const searchFilter = search
      ? { contains: String(search), mode: 'insensitive' as const }
      : undefined;

    const items: any[] = [];

    if (!type || type === 'PLACE_IMAGE') {
      const images = await prisma.placeImage.findMany({
        where: searchFilter ? { url: searchFilter } : undefined,
        take: 100,
        orderBy: { createdAt: 'desc' },
        include: { place: { select: { id: true, name: true } } },
      });
      items.push(
        ...images.map((img) => ({
          id: img.id,
          type: 'PLACE_IMAGE',
          url: img.url,
          thumbnail: img.url,
          title: img.caption || img.place.name,
          entityType: 'PLACE',
          entityId: img.placeId,
          entityName: img.place.name,
          status: img.verificationStatus || 'APPROVED',
          createdAt: img.createdAt.toISOString(),
        })),
      );
    }

    if (!type || type === 'USER_PLACE_IMAGE') {
      const userImages = await prisma.userPlaceImage.findMany({
        where: searchFilter ? { url: searchFilter } : undefined,
        take: 100,
        orderBy: { createdAt: 'desc' },
        include: {
          place: { select: { id: true, name: true } },
          user: { select: { id: true, name: true } },
        },
      });
      items.push(
        ...userImages.map((img) => ({
          id: img.id,
          type: 'USER_PLACE_IMAGE',
          url: img.url,
          thumbnail: img.url,
          title: `${img.user.name} → ${img.place.name}`,
          entityType: 'PLACE',
          entityId: img.placeId,
          entityName: img.place.name,
          status: img.status?.toUpperCase() || 'PENDING',
          createdAt: img.createdAt.toISOString(),
        })),
      );
    }

    if (!type || type === 'REEL') {
      const reels = await prisma.reel.findMany({
        where: searchFilter ? { title: searchFilter } : undefined,
        take: 100,
        orderBy: { createdAt: 'desc' },
        include: { creator: { select: { username: true } } },
      });
      items.push(
        ...reels.map((reel) => ({
          id: reel.id,
          type: 'REEL',
          url: reel.videoUrl,
          thumbnail: reel.thumbnail,
          title: reel.title || reel.creator.username,
          entityType: 'REEL',
          entityId: reel.id,
          entityName: reel.title || reel.creator.username,
          status: reel.status,
          createdAt: reel.createdAt.toISOString(),
        })),
      );
    }

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const slice = items.slice(params.skip, params.skip + params.limit);
    return paginatedResponse(slice, items.length, params);
  },

  async deleteMedia(type: string, id: string) {
    switch (type) {
      case 'PLACE_IMAGE':
        await prisma.placeImage.delete({ where: { id } });
        break;
      case 'USER_PLACE_IMAGE':
        await prisma.userPlaceImage.delete({ where: { id } });
        break;
      case 'REEL':
        await prisma.reel.delete({ where: { id } });
        break;
      default:
        throw new ApiError(400, 'Unsupported media type');
    }
  },

  async listReviews(query: {
    status?: string;
    entityType?: string;
    search?: string;
    page?: string | number;
    limit?: string | number;
  }) {
    const { status, entityType, search } = query;
    const params = getPaginationParams({
      ...query,
      page: query.page != null ? String(query.page) : undefined,
      limit: String(query.limit ?? 15),
    });
    const statusFilter =
      status === 'PENDING' || status === 'APPROVED' || status === 'REJECTED'
        ? (status as ContentModerationStatus)
        : undefined;

    const searchWhere = search
      ? { content: { contains: String(search), mode: 'insensitive' as const } }
      : undefined;

    const placeReviews =
      !entityType || entityType === 'PLACE'
        ? await prisma.review.findMany({
            where: {
              ...searchWhere,
              ...(statusFilter ? { status: statusFilter } : {}),
            },
            include: {
              user: { select: { id: true, name: true, avatar: true } },
              place: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 200,
          })
        : [];

    let vendorReviews: Array<{
      id: string;
      vendorId: string;
      rating: number;
      content: string | null;
      status: ContentModerationStatus;
      createdAt: Date;
      user: { id: string; name: string; avatar: string | null };
      vendor: { id: string; businessName: string };
    }> = [];

    if (!entityType || entityType === 'VENDOR') {
      try {
        vendorReviews = await prisma.vendorReview.findMany({
          where: {
            ...searchWhere,
            ...(statusFilter ? { status: statusFilter } : {}),
          },
          include: {
            user: { select: { id: true, name: true, avatar: true } },
            vendor: { select: { id: true, businessName: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 200,
        });
      } catch {
        vendorReviews = [];
      }
    }

    const unified = [
      ...placeReviews
        .filter((r) => r.place != null && r.user != null)
        .map((r) => ({
        id: `place-${r.id}`,
        reviewId: r.id,
        rating: r.rating,
        content: r.content || '',
        entityType: 'PLACE' as const,
        entityId: r.placeId,
        entityName: r.place!.name,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        reviewer: { id: r.user.id, name: r.user.name, avatar: r.user.avatar },
        reportsCount: 0,
      })),
      ...vendorReviews
        .filter((r) => r.vendor != null && r.user != null)
        .map((r) => ({
        id: `vendor-${r.id}`,
        reviewId: r.id,
        rating: r.rating,
        content: r.content || '',
        entityType: 'VENDOR' as const,
        entityId: r.vendorId,
        entityName: r.vendor!.businessName,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        reviewer: { id: r.user.id, name: r.user.name, avatar: r.user.avatar },
        reportsCount: 0,
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const slice = unified.slice(params.skip, params.skip + params.limit);
    return paginatedResponse(slice, unified.length, params);
  },

  async getReview(compositeId: string) {
    const parsed = parseReviewCompositeId(compositeId);
    if (!parsed) throw new ApiError(404, 'Review not found');

    if (parsed.entityType === 'PLACE') {
      const r = await prisma.review.findUnique({
        where: { id: parsed.reviewId },
        include: {
          user: { select: { id: true, name: true, avatar: true } },
          place: { select: { id: true, name: true } },
        },
      });
      if (!r || !r.place || !r.user) throw new ApiError(404, 'Review not found');
      return {
        id: `place-${r.id}`,
        reviewId: r.id,
        rating: r.rating,
        content: r.content || '',
        entityType: 'PLACE' as const,
        entityId: r.placeId,
        entityName: r.place.name,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        reviewer: { id: r.user.id, name: r.user.name, avatar: r.user.avatar },
        reportsCount: 0,
      };
    }

    const r = await prisma.vendorReview.findUnique({
      where: { id: parsed.reviewId },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        vendor: { select: { id: true, businessName: true } },
      },
    });
    if (!r || !r.vendor || !r.user) throw new ApiError(404, 'Review not found');
    return {
      id: `vendor-${r.id}`,
      reviewId: r.id,
      rating: r.rating,
      content: r.content || '',
      entityType: 'VENDOR' as const,
      entityId: r.vendorId,
      entityName: r.vendor.businessName,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      reviewer: { id: r.user.id, name: r.user.name, avatar: r.user.avatar },
      reportsCount: 0,
    };
  },

  async updateReviewStatus(compositeId: string, status: string) {
    const allowed: ContentModerationStatus[] = [
      ContentModerationStatus.PENDING,
      ContentModerationStatus.APPROVED,
      ContentModerationStatus.REJECTED,
    ];
    if (!allowed.includes(status as ContentModerationStatus)) {
      throw new ApiError(400, 'Invalid review status. Use PENDING, APPROVED, or REJECTED.');
    }
    const nextStatus = status as ContentModerationStatus;
    const review = await this.getReview(compositeId);

    if (review.entityType === 'PLACE') {
      await prisma.review.update({
        where: { id: review.reviewId },
        data: { status: nextStatus },
      });
      const { recalculatePlaceRating } = await import('../places/services/places.helpers');
      await recalculatePlaceRating(review.entityId);
    } else {
      await prisma.vendorReview.update({
        where: { id: review.reviewId },
        data: { status: nextStatus },
      });
    }

    return { ...review, status: nextStatus };
  },

  async listIncidents(query: any) {
    const { status, contentType, search } = query;
    const incidents: any[] = [];

    const [pendingPlaces, pendingVendors, pendingCreators, pendingImages, reelReports, pendingGems] =
      await Promise.all([
        prisma.place.findMany({
          where: { status: 'PENDING', mergedIntoId: null },
          take: 50,
          orderBy: { createdAt: 'desc' },
          select: { id: true, name: true, createdAt: true, submittedById: true },
        }),
        prisma.vendor.findMany({
          where: { status: 'PENDING' },
          take: 50,
          orderBy: { createdAt: 'desc' },
          select: { id: true, businessName: true, createdAt: true, userId: true },
        }),
        prisma.creatorProfile.findMany({
          where: { status: 'PENDING' },
          take: 50,
          orderBy: { createdAt: 'desc' },
          select: { id: true, username: true, createdAt: true, userId: true },
        }),
        prisma.userPlaceImage.findMany({
          where: { status: 'pending' },
          take: 50,
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { id: true, name: true, avatar: true } } },
        }),
        prisma.reelReport.findMany({
          where: { status: ReelReportStatus.PENDING },
          take: 50,
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { id: true, name: true, avatar: true } },
            reel: { select: { id: true, title: true } },
          },
        }),
        prisma.place.findMany({
          where: { source: 'HIDDEN_GEM', status: 'PENDING', mergedIntoId: null },
          take: 50,
          orderBy: { createdAt: 'desc' },
          select: { id: true, name: true, createdAt: true, submittedById: true },
        }),
      ]);

    for (const p of pendingPlaces) {
      incidents.push({
        id: `place-${p.id}`,
        contentType: 'PLACE',
        entityId: p.id,
        entityName: p.name,
        reporter: { id: p.submittedById || 'system', name: 'User submission', avatar: null },
        reason: 'Place pending approval',
        severity: 'MEDIUM',
        priority: 'P2',
        status: 'PENDING',
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.createdAt.toISOString(),
        slaBreached: false,
      });
    }

    for (const g of pendingGems) {
      incidents.push({
        id: `hidden-gem-${g.id}`,
        contentType: 'HIDDEN_GEM',
        entityId: g.id,
        entityName: g.name,
        reporter: { id: g.submittedById || 'system', name: 'Community', avatar: null },
        reason: 'Hidden gem pending review',
        severity: 'MEDIUM',
        priority: 'P2',
        status: 'PENDING',
        createdAt: g.createdAt.toISOString(),
        updatedAt: g.createdAt.toISOString(),
        slaBreached: false,
      });
    }

    for (const v of pendingVendors) {
      incidents.push({
        id: `vendor-${v.id}`,
        contentType: 'VENDOR_APP',
        entityId: v.id,
        entityName: v.businessName,
        reporter: { id: v.userId, name: 'Vendor applicant', avatar: null },
        reason: 'Vendor application pending',
        severity: 'HIGH',
        priority: 'P1',
        status: 'PENDING',
        createdAt: v.createdAt.toISOString(),
        updatedAt: v.createdAt.toISOString(),
        slaBreached: false,
      });
    }

    for (const c of pendingCreators) {
      incidents.push({
        id: `creator-${c.id}`,
        contentType: 'CREATOR_APP',
        entityId: c.id,
        entityName: c.username,
        reporter: { id: c.userId, name: 'Creator applicant', avatar: null },
        reason: 'Creator application pending',
        severity: 'HIGH',
        priority: 'P1',
        status: 'PENDING',
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.createdAt.toISOString(),
        slaBreached: false,
      });
    }

    for (const img of pendingImages) {
      incidents.push({
        id: `place-image-${img.id}`,
        contentType: 'PLACE',
        entityId: img.id,
        entityName: 'User place image',
        reporter: { id: img.user.id, name: img.user.name, avatar: img.user.avatar },
        reason: 'User-submitted place image',
        severity: 'LOW',
        priority: 'P3',
        status: 'PENDING',
        createdAt: img.createdAt.toISOString(),
        updatedAt: img.createdAt.toISOString(),
        slaBreached: false,
      });
    }

    for (const report of reelReports) {
      incidents.push({
        id: `reel-report-${report.id}`,
        contentType: 'REEL',
        entityId: report.reelId,
        entityName: report.reel.title || 'Reel',
        reporter: { id: report.user.id, name: report.user.name, avatar: report.user.avatar },
        reason: report.reason,
        severity: 'HIGH',
        priority: 'P1',
        status: 'PENDING',
        createdAt: report.createdAt.toISOString(),
        updatedAt: report.updatedAt.toISOString(),
        slaBreached: false,
      });
    }

    let filtered = incidents;
    if (status) filtered = filtered.filter((i) => i.status === status);
    if (contentType) filtered = filtered.filter((i) => i.contentType === contentType);
    if (search) {
      const q = String(search).toLowerCase();
      filtered = filtered.filter(
        (i) =>
          i.entityName.toLowerCase().includes(q) ||
          i.reason.toLowerCase().includes(q) ||
          i.id.toLowerCase().includes(q),
      );
    }

    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const params = getPaginationParams({ ...query, limit: query.limit ?? 15 });
    const slice = filtered.slice(params.skip, params.skip + params.limit);
    return paginatedResponse(slice, filtered.length, params);
  },

  async getIncident(id: string) {
    const incidents = await this.listIncidents({ limit: 500 });
    const found = incidents.data.find((i: any) => i.id === id);
    if (!found) throw new ApiError(404, 'Incident not found');
    return found;
  },

  async updateIncidentStatus(id: string, status: string, notes?: string) {
    const incident = await this.getIncident(id);
    const normalized = String(status || '').toUpperCase();

    if (normalized === 'RESOLVED' || normalized === 'APPROVED' || normalized === 'CLOSED') {
      await this.applyIncidentDomainAction(incident, 'approve', notes);
      return {
        ...incident,
        status: 'RESOLVED',
        resolutionNotes: notes,
        resolvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    if (normalized === 'REJECTED') {
      await this.applyIncidentDomainAction(incident, 'reject', notes);
      return {
        ...incident,
        status: 'REJECTED',
        resolutionNotes: notes,
        resolvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    // Soft states (escalated / under review) — no durable table for incidents yet.
    return {
      ...incident,
      status: normalized,
      resolutionNotes: notes,
      updatedAt: new Date().toISOString(),
    };
  },

  /**
   * Persist moderation decisions onto the underlying domain records so the
   * queue item disappears on the next list (status filter = PENDING).
   */
  async applyIncidentDomainAction(
    incident: {
      id: string;
      contentType: string;
      entityId: string;
    },
    action: 'approve' | 'reject',
    notes?: string,
  ) {
    const now = new Date();
    const placeStatus = action === 'approve' ? 'APPROVED' : 'REJECTED';
    const reason = notes?.trim() || undefined;

    if (incident.id.startsWith('place-image-')) {
      await prisma.userPlaceImage.update({
        where: { id: incident.entityId },
        data: { status: action === 'approve' ? 'approved' : 'rejected' },
      });
      return;
    }

    if (incident.id.startsWith('place-') || incident.contentType === 'PLACE') {
      await prisma.place.update({
        where: { id: incident.entityId },
        data: {
          status: placeStatus,
          reviewedAt: now,
          ...(reason ? { rejectionReason: reason } : {}),
        } as any,
      });
      return;
    }

    if (incident.id.startsWith('hidden-gem-') || incident.contentType === 'HIDDEN_GEM') {
      await prisma.place.update({
        where: { id: incident.entityId },
        data: {
          status: placeStatus,
          reviewedAt: now,
          ...(reason ? { rejectionReason: reason } : {}),
        } as any,
      });
      return;
    }

    if (incident.id.startsWith('vendor-') || incident.contentType === 'VENDOR_APP') {
      await prisma.vendor.update({
        where: { id: incident.entityId },
        data: {
          status: action === 'approve' ? 'APPROVED' : 'REJECTED',
          ...(reason ? { rejectionReason: reason } : {}),
        } as any,
      });
      return;
    }

    if (incident.id.startsWith('creator-') || incident.contentType === 'CREATOR_APP') {
      await prisma.creatorProfile.update({
        where: { id: incident.entityId },
        data: {
          status: action === 'approve' ? 'APPROVED' : 'REJECTED',
        },
      });
      return;
    }

    if (incident.id.startsWith('reel-report-')) {
      const reportId = incident.id.replace('reel-report-', '');
      if (action === 'approve') {
        // Dismiss report — content kept
        await prisma.reelReport.update({
          where: { id: reportId },
          data: { status: ReelReportStatus.RESOLVED },
        });
      } else {
        // Take action on reported reel + close report
        await prisma.$transaction([
          prisma.reelReport.update({
            where: { id: reportId },
            data: { status: ReelReportStatus.RESOLVED },
          }),
          prisma.reel.update({
            where: { id: incident.entityId },
            data: { status: 'HIDDEN' },
          }),
        ]);
      }
    }
  },

  async assignIncident(id: string, moderatorId: string) {
    const incident = await this.getIncident(id);
    const mod = await prisma.user.findUnique({ where: { id: moderatorId }, select: { id: true, name: true } });
    if (!mod) throw new ApiError(404, 'Moderator not found');
    return {
      ...incident,
      status: 'ASSIGNED',
      assignedModerator: { id: mod.id, name: mod.name },
      updatedAt: new Date().toISOString(),
    };
  },

  async listRoles() {
    const adminRoles: Role[] = [
      Role.SUPER_ADMIN,
      Role.ADMIN,
      Role.OPS_ADMIN,
      Role.VENDOR_MANAGER,
      Role.CONTENT_MODERATOR,
      Role.FINANCE_MANAGER,
      Role.SUPPORT_AGENT,
      Role.MARKETING_ADMIN,
      Role.ANALYTICS_VIEWER,
    ];

    const counts = await prisma.user.groupBy({
      by: ['permission'],
      _count: { permission: true },
    });
    const countMap = new Map(counts.map((c) => [c.permission, c._count.permission]));

    return adminRoles.map((role) => ({
      id: role,
      name: role.replace(/_/g, ' '),
      slug: role.toLowerCase(),
      description: `PalSafar ${role.replace(/_/g, ' ').toLowerCase()} role`,
      userCount: countMap.get(role) || 0,
      isSystem: true,
      permissions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  },

  async getRole(id: string) {
    const roles = await this.listRoles();
    const found = roles.find((r) => r.id === id);
    if (!found) throw new ApiError(404, 'Role not found');
    const users = await prisma.user.findMany({
      where: { permission: id as Role },
      select: { id: true, name: true, email: true, createdAt: true },
      take: 50,
      orderBy: { createdAt: 'desc' },
    });
    return { ...found, users };
  },
};
