import { PlaceCategory, PlaceSource, PlaceStatus, PlaceDataQuality, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../shared/utils/ApiError';
import { getPaginationParams, paginatedResponse } from '../../shared/utils/pagination';
import { eventBus, AppEvents } from '../../config/events';
import {
  CreateHiddenGemInput,
  UpdateHiddenGemInput,
  ApproveHiddenGemInput,
  RejectHiddenGemInput,
  MergeHiddenGemInput,
  HIDDEN_GEM_CATEGORY_VALUES,
} from './hiddenGems.validation';
import { resolvePlace } from '../places/services/places.helpers';
import { placesCanonicalService } from '../places/services/places.canonical.service';
import { walletService } from '../wallet/wallet.service';
import { pointRulesService } from '../point-rules/pointRules.service';
import { logger } from '../../config/logger';

const HIDDEN_GEM_CATEGORIES = new Set<string>(HIDDEN_GEM_CATEGORY_VALUES);

const META_PREFIX = {
  cost: 'hg-cost:',
  safety: 'hg-safety:',
  worth: 'hg-worth:',
  loc: 'hg-loc:',
  points: 'hg-points:',
} as const;

/** Map contributor subcategory → valid PlaceCategory enum (DB cannot store `hidden_gem`). */
function mapSubcategoryToPlaceCategory(subcategory: string): PlaceCategory {
  switch (subcategory) {
    case 'waterfall':
      return PlaceCategory.WATERFALL;
    case 'lake':
      return PlaceCategory.LAKE;
    case 'wildlife':
      return PlaceCategory.WILDLIFE;
    case 'river_ghat':
      return PlaceCategory.GHAT;
    case 'old_temple':
      return PlaceCategory.TEMPLE;
    case 'small_fort':
      return PlaceCategory.FORT;
    case 'nature_trail':
      return PlaceCategory.TREKKING;
    case 'heritage':
      return PlaceCategory.MONUMENT;
    case 'cave':
      return PlaceCategory.OTHER;
    default:
      return PlaceCategory.OTHER;
  }
}

function encodeMetaTags(input: {
  category: string;
  estimatedCost?: string;
  safetyTip?: string;
  worthVisitingReason?: string;
  locationMethod?: string;
  pending?: boolean;
}): string[] {
  const tags = [input.category, 'hidden-gem'];
  if (input.pending !== false) tags.push('pending-review');
  if (input.estimatedCost) tags.push(`${META_PREFIX.cost}${input.estimatedCost}`);
  if (input.safetyTip) tags.push(`${META_PREFIX.safety}${input.safetyTip}`);
  if (input.worthVisitingReason) tags.push(`${META_PREFIX.worth}${input.worthVisitingReason}`);
  if (input.locationMethod) tags.push(`${META_PREFIX.loc}${input.locationMethod}`);
  return tags;
}

function parseMetaFromTags(tags: string[]) {
  const subcategory =
    tags.find((t) => HIDDEN_GEM_CATEGORIES.has(t)) || 'other';
  const estimatedCost =
    tags.find((t) => t.startsWith(META_PREFIX.cost))?.slice(META_PREFIX.cost.length) || undefined;
  const safetyTip =
    tags.find((t) => t.startsWith(META_PREFIX.safety))?.slice(META_PREFIX.safety.length) || undefined;
  const worthVisitingReason =
    tags.find((t) => t.startsWith(META_PREFIX.worth))?.slice(META_PREFIX.worth.length) || undefined;
  const locationMethod = tags.find((t) => t.startsWith(META_PREFIX.loc))?.slice(
    META_PREFIX.loc.length,
  ) as 'gps' | 'map_pick' | 'manual' | undefined;
  const pointsRaw = tags
    .find((t) => t.startsWith(META_PREFIX.points))
    ?.slice(META_PREFIX.points.length);
  const pointsReward = pointsRaw ? Number(pointsRaw) || 0 : 0;
  return {
    subcategory,
    estimatedCost,
    safetyTip,
    worthVisitingReason,
    locationMethod,
    pointsReward,
  };
}

function assertIndiaishCoords(lat: number, lng: number) {
  // Soft India bbox — rejects clearly invalid / ocean placeholders without redesigning GPS rules.
  if (lat < 6 || lat > 38 || lng < 68 || lng > 98) {
    throw new ApiError(400, 'Coordinates must be within India.');
  }
}

function resolveSubmissionImages(input: { imageUri?: string; images?: string[] }): string[] {
  if (input.images && input.images.length > 0) {
    return input.images.slice(0, 4);
  }
  return input.imageUri ? [input.imageUri] : [];
}

function buildSubmissionView(place: {
  id: string;
  name: string;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  images: string[];
  tags: string[];
  status: PlaceStatus;
  city: string;
  state: string;
  bestTimeToVisit: unknown;
  rejectionReason: string | null;
  hiddenGemScore: number | null;
  submittedBy?: { id: string; name: string } | null;
  approvedBy?: { id: string; name: string } | null;
  reviewedAt: Date | null;
  createdAt: Date;
  mergedIntoId?: string | null;
}) {
  const meta = parseMetaFromTags(place.tags || []);
  return {
    id: place.id,
    userId: place.submittedBy?.id || '',
    userName: place.submittedBy?.name || 'System',
    placeName: place.name,
    category: meta.subcategory,
    city: place.city,
    state: place.state,
    latitude: place.latitude,
    longitude: place.longitude,
    imageUri: place.images[0] || null,
    images: place.images,
    description: place.description,
    bestTimeToVisit: place.bestTimeToVisit || null,
    estimatedCost: meta.estimatedCost,
    safetyTip: meta.safetyTip,
    worthVisitingReason: meta.worthVisitingReason,
    locationMethod: meta.locationMethod,
    status:
      place.mergedIntoId && place.status === PlaceStatus.REJECTED
        ? 'merged'
        : place.status.toLowerCase(),
    submittedAt: place.createdAt.getTime(),
    pointsReward: meta.pointsReward || place.hiddenGemScore || 0,
    reviewedAt: place.reviewedAt?.getTime(),
    reviewedBy: place.approvedBy?.name,
    rejectionReason: place.rejectionReason,
    mergedIntoPlaceId: place.mergedIntoId || undefined,
  };
}

const placeSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  shortDescription: true,
  latitude: true,
  longitude: true,
  category: true,
  images: true,
  thumbnail: true,
  tags: true,
  status: true,
  source: true,
  city: true,
  state: true,
  country: true,
  rating: true,
  reviewCount: true,
  hiddenGemScore: true,
  popularityScore: true,
  verificationLevel: true,
  rejectionReason: true,
  bestTimeToVisit: true,
  mergedIntoId: true,
  submittedById: true,
  submittedBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PlaceSelect;

/** Identify HG submissions by source (category enum has no `hidden_gem` value). */
const hiddenGemWhere: Prisma.PlaceWhereInput = {
  source: PlaceSource.HIDDEN_GEM,
  tags: { has: 'hidden-gem' },
};

export const hiddenGemsService = {
  async create(input: CreateHiddenGemInput, userId: string) {
    assertIndiaishCoords(input.latitude, input.longitude);

    let bestTimeDb: Record<string, string> | undefined;
    if (input.bestTimeToVisit) {
      if (typeof input.bestTimeToVisit === 'string') {
        bestTimeDb = { from: 'Any', to: 'Any', label: input.bestTimeToVisit };
      } else {
        bestTimeDb = {
          from: input.bestTimeToVisit.from,
          to: input.bestTimeToVisit.to,
          ...(input.bestTimeToVisit.label ? { label: input.bestTimeToVisit.label } : {}),
        };
      }
    }

    const place = await prisma.place.create({
      select: placeSelect,
      data: {
        name: input.placeName,
        slug: `hidden-gem-${input.placeName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
        shortDescription: input.description.substring(0, 200),
        description: input.description,
        latitude: input.latitude,
        longitude: input.longitude,
        category: mapSubcategoryToPlaceCategory(input.category),
        source: PlaceSource.HIDDEN_GEM,
        images: resolveSubmissionImages(input),
        tags: encodeMetaTags({
          category: input.category,
          estimatedCost: input.estimatedCost,
          safetyTip: input.safetyTip,
          worthVisitingReason: input.worthVisitingReason,
          locationMethod: input.locationMethod,
          pending: true,
        }),
        city: input.city,
        state: input.state,
        country: 'India',
        submittedById: userId,
        status: PlaceStatus.PENDING,
        hiddenGemScore: 0,
        popularityScore: 0,
        verificationLevel: 0,
        bestTimeToVisit: bestTimeDb ? JSON.parse(JSON.stringify(bestTimeDb)) : undefined,
      },
    });

    const submission = buildSubmissionView(place);

    eventBus.emit(AppEvents.PLACE_CREATED, {
      placeId: place.id,
      actorId: userId,
      data: submission,
    });

    return submission;
  },

  async updatePending(idOrSlug: string, input: UpdateHiddenGemInput, userId: string) {
    const { id } = await resolvePlace(idOrSlug);
    const place = await prisma.place.findFirst({
      where: { id, ...hiddenGemWhere, status: PlaceStatus.PENDING, submittedById: userId },
      select: placeSelect,
    });
    if (!place) {
      throw new ApiError(404, 'Pending hidden gem not found.');
    }

    if (input.latitude != null && input.longitude != null) {
      assertIndiaishCoords(input.latitude, input.longitude);
    } else if (input.latitude != null || input.longitude != null) {
      throw new ApiError(400, 'Both latitude and longitude are required when updating coordinates.');
    }

    const meta = parseMetaFromTags(place.tags || []);
    const nextCategory = input.category || meta.subcategory;
    const tags = encodeMetaTags({
      category: nextCategory,
      estimatedCost: input.estimatedCost ?? meta.estimatedCost,
      safetyTip: input.safetyTip ?? meta.safetyTip,
      worthVisitingReason: input.worthVisitingReason ?? meta.worthVisitingReason,
      locationMethod: input.locationMethod ?? meta.locationMethod,
      pending: true,
    });

    let bestTimeDb: unknown = undefined;
    if (input.bestTimeToVisit !== undefined) {
      if (typeof input.bestTimeToVisit === 'string') {
        bestTimeDb = { from: 'Any', to: 'Any', label: input.bestTimeToVisit };
      } else if (input.bestTimeToVisit) {
        bestTimeDb = {
          from: input.bestTimeToVisit.from,
          to: input.bestTimeToVisit.to,
          ...(input.bestTimeToVisit.label ? { label: input.bestTimeToVisit.label } : {}),
        };
      } else {
        bestTimeDb = null;
      }
    }

    const updated = await prisma.place.update({
      where: { id },
      select: placeSelect,
      data: {
        ...(input.placeName ? { name: input.placeName } : {}),
        ...(input.description
          ? {
              description: input.description,
              shortDescription: input.description.substring(0, 200),
            }
          : {}),
        ...(input.latitude != null ? { latitude: input.latitude } : {}),
        ...(input.longitude != null ? { longitude: input.longitude } : {}),
        ...(input.city ? { city: input.city } : {}),
        ...(input.state ? { state: input.state } : {}),
        ...(input.category ? { category: mapSubcategoryToPlaceCategory(input.category) } : {}),
        ...(input.images !== undefined
          ? { images: input.images.slice(0, 4) }
          : input.imageUri !== undefined
            ? { images: input.imageUri ? [input.imageUri] : [] }
            : {}),
        tags,
        ...(bestTimeDb !== undefined
          ? { bestTimeToVisit: bestTimeDb ? JSON.parse(JSON.stringify(bestTimeDb)) : Prisma.JsonNull }
          : {}),
      },
    });

    eventBus.emit(AppEvents.PLACE_UPDATED, {
      placeId: id,
      actorId: userId,
      data: { pendingUpdate: true },
    });

    return buildSubmissionView(updated);
  },

  async deletePending(idOrSlug: string, userId: string) {
    const { id } = await resolvePlace(idOrSlug);
    const place = await prisma.place.findFirst({
      where: { id, ...hiddenGemWhere, status: PlaceStatus.PENDING, submittedById: userId },
      select: { id: true, name: true, status: true },
    });
    if (!place) {
      throw new ApiError(404, 'Pending hidden gem not found.');
    }

    await prisma.place.delete({ where: { id } });

    eventBus.emit(AppEvents.PLACE_DELETED, {
      placeId: id,
      actorId: userId,
      previous: { name: place.name, status: place.status, source: PlaceSource.HIDDEN_GEM },
    });

    return { message: 'Pending hidden gem deleted' };
  },

  async list(
    query: { page?: string | number; limit?: string | number; status?: string; search?: string },
    viewer?: { isAdmin?: boolean; userId?: string },
  ) {
    const pagination = getPaginationParams({
      page: query.page != null ? String(query.page) : undefined,
      limit: query.limit != null ? String(query.limit) : undefined,
    });
    const where: Prisma.PlaceWhereInput = { ...hiddenGemWhere };
    const requestedStatus = query.status ? String(query.status).toUpperCase() : undefined;

    if (viewer?.isAdmin) {
      if (requestedStatus) where.status = requestedStatus as PlaceStatus;
    } else if (requestedStatus) {
      // Contributor queue (pending / approved / rejected / merged-as-rejected): own rows only.
      where.status = requestedStatus as PlaceStatus;
      where.submittedById = viewer?.userId || '__none__';
    } else {
      // Public approved Hidden Gems feed
      where.status = PlaceStatus.APPROVED;
      where.mergedIntoId = null;
    }

    if (query.search?.trim()) {
      const q = query.search.trim();
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { city: { contains: q, mode: 'insensitive' } },
            { state: { contains: q, mode: 'insensitive' } },
            { submittedBy: { name: { contains: q, mode: 'insensitive' } } },
          ],
        },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.place.findMany({
        select: placeSelect,
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.place.count({ where }),
    ]);

    return paginatedResponse(
      data.map((p) => buildSubmissionView(p)),
      total,
      pagination,
    );
  },

  async getById(idOrSlug: string, viewer?: { isAdmin?: boolean; userId?: string }) {
    const { id } = await resolvePlace(idOrSlug);
    const place = await prisma.place.findFirst({
      where: { id, ...hiddenGemWhere },
      select: placeSelect,
    });
    if (!place) {
      throw new ApiError(404, 'Hidden gem not found.');
    }
    if (place.status !== PlaceStatus.APPROVED) {
      const allowed =
        viewer?.isAdmin || (!!viewer?.userId && place.submittedById === viewer.userId);
      if (!allowed) {
        throw new ApiError(404, 'Hidden gem not found.');
      }
    }

    return buildSubmissionView(place);
  },

  async findDuplicateCandidates(idOrSlug: string) {
    const { id } = await resolvePlace(idOrSlug);
    const place = await prisma.place.findFirst({
      where: { id, ...hiddenGemWhere },
    });
    if (!place) {
      throw new ApiError(404, 'Hidden gem not found.');
    }
    if (place.latitude == null || place.longitude == null) {
      return [];
    }

    const raw = await placesCanonicalService.findDuplicateCandidates({
      name: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
      state: place.state || undefined,
      district: place.district || undefined,
      category: place.category,
      excludePlaceId: id,
    });

    const candidateIds = raw.map((c) => c.placeId);
    if (candidateIds.length === 0) return [];

    const existing = await prisma.place.findMany({
      where: {
        id: { in: candidateIds.filter((cid) => cid !== id) },
        status: { in: [PlaceStatus.APPROVED, PlaceStatus.PENDING] },
        mergedIntoId: null,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        state: true,
        district: true,
        category: true,
        status: true,
        images: true,
        description: true,
      },
    });

    const byId = new Map(existing.map((p) => [p.id, p]));
    return raw
      .filter((c) => byId.has(c.placeId))
      .map((c) => ({
        ...c,
        place: byId.get(c.placeId)!,
      }));
  },

  async mergeContribution(idOrSlug: string, input: MergeHiddenGemInput, adminId: string) {
    const { id } = await resolvePlace(idOrSlug);
    const place = await prisma.place.findFirst({
      where: { id, ...hiddenGemWhere, status: PlaceStatus.PENDING },
    });
    if (!place) {
      throw new ApiError(404, 'Pending hidden gem not found.');
    }

    const target = await prisma.place.findFirst({
      where: {
        id: input.targetPlaceId,
        status: PlaceStatus.APPROVED,
        mergedIntoId: null,
      },
    });
    if (!target) {
      throw new ApiError(404, 'Target place not found or not approved.');
    }

    const newImages = [
      ...new Set([
        ...(target.images || []),
        ...(place.images || []),
        ...(input.additionalPhotos || []),
      ]),
    ];

    let description = target.description || '';
    if (input.updateDescription && input.description) {
      description = input.description;
    } else if (input.appendDescription !== false && place.description) {
      description = description
        ? `${description}\n\n---\nContributor note: ${place.description}`
        : place.description;
    }

    const fullRule = await pointRulesService.getPointsForAction('hidden_gem');
    const mergeRule = await pointRulesService.getPointsForAction('hidden_gem_merge');
    const fullPoints = fullRule?.points ?? 50;
    const points = input.points ?? mergeRule?.points ?? Math.max(1, Math.floor(fullPoints / 2));

    if (place.submittedById && points > 0) {
      const limitReached = await pointRulesService.checkDailyLimit(place.submittedById, 'hidden_gem_merge');
      if (limitReached) {
        logger.warn(
          { userId: place.submittedById, placeId: id },
          'Hidden gem merge daily point limit reached — merge proceeds without points',
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.place.update({
        where: { id: target.id },
        data: {
          images: newImages,
          description,
          shortDescription: description.substring(0, 200),
          thumbnail: target.thumbnail || newImages[0] || null,
        },
      });

      // Soft-close contribution and link to canonical target (no false "rejected" UX).
      const mergeTags = (place.tags || [])
        .filter((t) => t !== 'pending-review' && !t.startsWith(META_PREFIX.points));
      if (points > 0) mergeTags.push(`${META_PREFIX.points}${points}`);

      await tx.place.update({
        where: { id },
        data: {
          status: PlaceStatus.REJECTED,
          mergedIntoId: target.id,
          rejectionReason: input.reason || `Merged into ${target.name}`,
          approvedById: adminId,
          reviewedAt: new Date(),
          tags: mergeTags,
        },
      });
    });

    let awarded = 0;
    if (place.submittedById && points > 0) {
      const limitReached = await pointRulesService.checkDailyLimit(place.submittedById, 'hidden_gem_merge');
      if (!limitReached) {
        try {
          await walletService.earn(place.submittedById, points, 'hidden_gem_merge', id, 'HIDDEN_GEM');
          awarded = points;
        } catch (error) {
          logger.error({ error, placeId: id, targetId: target.id }, 'Failed to award hidden gem merge points');
        }
      }
    }

    // Do NOT emit PLACE_REJECTED — that sends a contradictory "rejected, submit again" notification.
    eventBus.emit(AppEvents.HIDDEN_GEM_MERGED, {
      submitterId: place.submittedById,
      placeName: place.name,
      mergedIntoPlaceName: target.name,
      pointsReward: awarded,
      placeId: id,
      mergedIntoPlaceId: target.id,
      actorId: adminId,
    });

    return {
      id,
      status: 'merged',
      mergedIntoPlaceId: target.id,
      mergedIntoPlaceName: target.name,
      pointsReward: awarded,
    };
  },

  async approve(idOrSlug: string, input: ApproveHiddenGemInput, adminId: string) {
    const { id } = await resolvePlace(idOrSlug);
    const place = await prisma.place.findFirst({
      where: { id, ...hiddenGemWhere },
    });
    if (!place) {
      throw new ApiError(404, 'Hidden gem not found.');
    }
    if (place.status !== PlaceStatus.PENDING) {
      throw new ApiError(400, 'Only pending hidden gems can be approved.');
    }

    if (!input.force) {
      const duplicates = await this.findDuplicateCandidates(id);
      if (duplicates.length > 0) {
        throw new ApiError(
          409,
          'Duplicate places detected. Merge the contribution or explicitly approve as a new place.',
          true,
          'DUPLICATE_CANDIDATES',
          { candidates: duplicates },
        );
      }
    }

    const rule = await pointRulesService.getPointsForAction('hidden_gem');
    const points = input.points ?? rule?.points ?? 50;
    const previous = { status: place.status };

    const cleanedTags = (place.tags || [])
      .filter((t) => t !== 'pending-review' && !t.startsWith(META_PREFIX.points));
    if (points > 0) cleanedTags.push(`${META_PREFIX.points}${points}`);

    const updated = await prisma.place.update({
      where: { id },
      data: {
        status: PlaceStatus.APPROVED,
        dataQuality: PlaceDataQuality.VERIFIED,
        lastVerifiedAt: new Date(),
        verificationLevel: Math.max(place.verificationLevel ?? 0, 2),
        approvedById: adminId,
        reviewedAt: new Date(),
        tags: cleanedTags,
        // Modest quality signal only — payout is stored in hg-points tag, not ranking score.
        hiddenGemScore: place.hiddenGemScore && place.hiddenGemScore > 0 ? place.hiddenGemScore : 1,
      },
    });

    let awarded = 0;
    if (place.submittedById && points > 0) {
      const limitReached = await pointRulesService.checkDailyLimit(place.submittedById, 'hidden_gem');
      if (!limitReached) {
        try {
          await walletService.earn(place.submittedById, points, 'hidden_gem', updated.id, 'HIDDEN_GEM');
          awarded = points;
        } catch (error) {
          logger.error({ error, placeId: id }, 'Failed to award hidden gem points');
        }
      } else {
        logger.warn({ userId: place.submittedById, placeId: id }, 'Hidden gem daily point limit reached');
      }
    }

    eventBus.emit(AppEvents.PLACE_APPROVED, {
      placeId: id,
      actorId: adminId,
      submitterId: place.submittedById,
      placeName: place.name,
      previous,
    });

    return {
      id: updated.id,
      status: 'approved',
      pointsReward: awarded,
      reviewedAt: updated.reviewedAt?.getTime(),
    };
  },

  async reject(idOrSlug: string, input: RejectHiddenGemInput, adminId: string) {
    const { id } = await resolvePlace(idOrSlug);
    const place = await prisma.place.findFirst({
      where: { id, ...hiddenGemWhere },
    });
    if (!place) {
      throw new ApiError(404, 'Hidden gem not found.');
    }
    if (place.status !== PlaceStatus.PENDING) {
      throw new ApiError(400, 'Only pending hidden gems can be rejected.');
    }

    const updated = await prisma.place.update({
      where: { id },
      data: {
        status: PlaceStatus.REJECTED,
        approvedById: adminId,
        reviewedAt: new Date(),
        rejectionReason: input.reason || null,
        tags: (place.tags || []).filter((t) => t !== 'pending-review'),
      },
    });

    eventBus.emit(AppEvents.PLACE_REJECTED, {
      placeId: id,
      actorId: adminId,
      submitterId: place.submittedById,
      placeName: place.name,
      reason: input.reason || null,
      previous: { status: place.status },
    });

    return {
      id: updated.id,
      status: 'rejected',
      reviewedAt: updated.reviewedAt?.getTime(),
      rejectionReason: input.reason,
    };
  },

  /**
   * Deactivate an already-approved Hidden Gem Place without hard-delete.
   * Keeps media, audit, and related rows; removes it from public discovery.
   */
  async unpublish(idOrSlug: string, input: RejectHiddenGemInput, adminId: string) {
    const { id } = await resolvePlace(idOrSlug);
    const place = await prisma.place.findFirst({
      where: { id, ...hiddenGemWhere },
    });
    if (!place) {
      throw new ApiError(404, 'Hidden gem not found.');
    }
    if (place.status !== PlaceStatus.APPROVED) {
      throw new ApiError(400, 'Only approved hidden gems can be unpublished.');
    }
    if (place.mergedIntoId) {
      throw new ApiError(400, 'Merged contributions cannot be unpublished independently.');
    }

    const reason = input.reason?.trim() || 'Unpublished by admin';
    const updated = await prisma.place.update({
      where: { id },
      data: {
        status: PlaceStatus.REJECTED,
        approvedById: adminId,
        reviewedAt: new Date(),
        rejectionReason: reason,
      },
    });

    eventBus.emit(AppEvents.PLACE_REJECTED, {
      placeId: id,
      actorId: adminId,
      submitterId: place.submittedById,
      placeName: place.name,
      reason,
      previous: { status: place.status },
    });

    return {
      id: updated.id,
      status: 'unpublished',
      reviewedAt: updated.reviewedAt?.getTime(),
      rejectionReason: reason,
    };
  },
};
