import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import { ApiError } from '../../../shared/utils/ApiError';
import { getPaginationParams, paginatedResponse } from '../../../shared/utils/pagination';
import { eventBus, AppEvents } from '../../../config/events';
import {
  CreatePlaceInput, UpdatePlaceInput, VendorUpdatePlaceInput,
  CreateOfferInput, UpdateOfferInput, CreateEventInput, UpdateEventInput,
  AddImageInput, AddVideoInput, ReviewInput,
} from '../places.validation';
import {
  placeListSelect, placeDetailSelect, generateSlug,
  verifyVendorAccess, verifyAccess, resolvePlace,
  dedupeImageUrls, excludeCommercialPlacesWhere,
} from './places.helpers';
import { syncPlaceImageRecords, deleteCloudinaryImageIfOrphan } from './place-images.sync';
import { dedupePlacesByLocation } from '../../../shared/utils/placeDedupe';
import { walletService } from '../../wallet/wallet.service';
import { pointRulesService } from '../../point-rules/pointRules.service';
import { logger } from '../../../config/logger';
import { applyPublicPlacePrismaFilter, canPublicViewPlace } from './places-public-visibility';
import {
  filterTouristPlaces,
  mergePlaceWhere,
} from '../../../shared/utils/touristPlaceFilter';
import { placesCanonicalService } from './places.canonical.service';
import { withPlaceGeohash } from './place-geo.helpers';
import { buildAdminPlaceOrderBy, buildAdminPlaceSearchWhere } from './places.adminQuery';

export const placesCrudService = {
  async create(
    input: CreatePlaceInput,
    userId: string,
    options?: { isAdmin?: boolean },
  ) {
    const slug = await generateSlug(input.name);

    if (input.latitude != null && input.longitude != null) {
      const duplicates = await placesCanonicalService.findDuplicateCandidates({
        name: input.name,
        latitude: input.latitude,
        longitude: input.longitude,
        state: input.state,
        category: input.category,
      });
      if (duplicates.length > 0) {
        throw new ApiError(
          409,
          'A similar place already exists nearby. Use admin merge tools instead of creating a duplicate.',
          true,
          'DUPLICATE_CANDIDATES',
          { candidates: duplicates },
        );
      }
    }

    function safeJson(val: unknown) {
      return val !== undefined ? JSON.parse(JSON.stringify(val)) : undefined;
    }

    const images = dedupeImageUrls(input.images);
    const isAdmin = options?.isAdmin === true;
    const place = await prisma.place.create({
      select: placeListSelect,
      data: withPlaceGeohash({
        name: input.name,
        slug,
        shortDescription: input.shortDescription || (input.description?.substring(0, 200) ?? ''),
        description: input.description,
        latitude: input.latitude,
        longitude: input.longitude,
        category: input.category,
        images,
        thumbnail: images[0] || null,
        tags: input.tags ?? [],
        city: input.city ?? '',
        state: input.state ?? '',
        country: input.country ?? 'India',
        openingHours: safeJson(input.openingHours),
        ticketPrice: safeJson(input.ticketPrice),
        history: input.history,
        recommendedDuration: input.recommendedDuration,
        hasParking: input.hasParking,
        parkingDetails: input.parkingDetails,
        isAccessible: input.isAccessible,
        accessibilityDetails: input.accessibilityDetails,
        hasWashroom: input.hasWashroom,
        isPetFriendly: input.isPetFriendly,
        website: input.website,
        emergencyContact: input.emergencyContact,
        bestTimeToVisit: safeJson(input.bestTimeToVisit),
        bestTimeReason: input.bestTimeReason,
        editorialPriority: isAdmin ? (input.editorialPriority ?? 3) : 3,
        submittedById: userId,
        ...(isAdmin
          ? {
              status: 'APPROVED',
              source: 'ADMIN',
              approvedById: userId,
              reviewedAt: new Date(),
            }
          : {}),
      }),
    });

    eventBus.emit(AppEvents.PLACE_CREATED, {
      placeId: place.id,
      actorId: userId,
      data: { name: input.name, category: input.category, city: input.city },
    });

    if (images.length) {
      await syncPlaceImageRecords(place.id, images, { cleanupCloudinary: false });
    }

    return place;
  },

  async list(query: {
    page?: string;
    limit?: string;
    status?: string;
    category?: string;
    search?: string;
    city?: string;
    state?: string;
  }, viewer?: { isAdmin?: boolean; userId?: string }) {
    const pagination = getPaginationParams(query, 100);
    const where: Prisma.PlaceWhereInput = {};

    const requestedStatus = query.status ? String(query.status).toUpperCase() : undefined;
    if (viewer?.isAdmin) {
      if (requestedStatus) where.status = requestedStatus as any;
    } else if (requestedStatus && requestedStatus !== 'APPROVED' && viewer?.userId) {
      // Non-admins may only filter non-approved statuses for their own submissions
      where.status = requestedStatus as any;
      where.submittedById = viewer.userId;
    } else {
      where.status = 'APPROVED';
    }
    if (query.category) {
      // Normalize to enum casing so list matches geo LOWER(...) filters.
      where.category = String(query.category).trim().toUpperCase() as any;
    }
    if (query.city) {
      where.city = { contains: query.city, mode: 'insensitive' };
    }
    if (query.state) {
      where.state = { contains: query.state, mode: 'insensitive' };
    }
    if (query.search) {
      const words = String(query.search).trim().split(/\s+/).filter(Boolean);
      if (words.length > 0) {
        where.AND = words.map(word => ({
          OR: [
            { name: { contains: word, mode: 'insensitive' } },
            { description: { contains: word, mode: 'insensitive' } },
            { city: { contains: word, mode: 'insensitive' } },
            { state: { contains: word, mode: 'insensitive' } },
            { tags: { has: word } },
          ],
        }));
      }
    }

    if (!viewer?.isAdmin) {
      Object.assign(where, applyPublicPlacePrismaFilter({ mergedIntoId: null }, false));
    }

    const [data, total] = await Promise.all([
      prisma.place.findMany({
        select: placeListSelect,
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.place.count({ where }),
    ]);

    // Admin needs every DB row for moderation; dedupe is for tourist discovery only.
    const rows = viewer?.isAdmin ? data : dedupePlacesByLocation(data);

    return paginatedResponse(rows, total, pagination);
  },

  async adminList(query: {
    page?: string;
    limit?: string;
    status?: string;
    category?: string;
    search?: string;
    city?: string;
    state?: string;
    touristOnly?: string;
    verified?: string;
    featured?: string;
    sort?: string;
    sortDir?: string;
  }) {
    const pagination = getPaginationParams(query, 200);
    const touristOnly = query.touristOnly !== 'false';
    const where = placesCrudService.buildAdminWhere(query, touristOnly);
    const orderBy = buildAdminPlaceOrderBy(query.sort, query.sortDir);

    if (!touristOnly) {
      const [data, total] = await Promise.all([
        prisma.place.findMany({
          select: placeListSelect,
          where,
          skip: pagination.skip,
          take: pagination.limit,
          orderBy,
        }),
        prisma.place.count({ where }),
      ]);
      return paginatedResponse(data, total, pagination);
    }

    // Tourist-only: commercial categories excluded in SQL; name/park quality refined in memory.
    // Walk ordered rows until the requested page is filled so skip/total stay consistent.
    const batchSize = Math.min(Math.max(pagination.limit * 4, 100), 400);
    const needed = pagination.skip + pagination.limit;
    const touristRows: Prisma.PlaceGetPayload<{ select: typeof placeListSelect }>[] = [];
    let dbOffset = 0;
    let exhausted = false;

    while (touristRows.length < needed && !exhausted) {
      const batch = await prisma.place.findMany({
        select: placeListSelect,
        where,
        skip: dbOffset,
        take: batchSize,
        orderBy,
      });
      if (batch.length === 0) {
        exhausted = true;
        break;
      }
      dbOffset += batch.length;
      touristRows.push(...filterTouristPlaces(batch));
      if (batch.length < batchSize) exhausted = true;
    }

    let total = touristRows.length;
    if (!exhausted) {
      // Continue scanning for an accurate total (cap batches to avoid runaway admin scans).
      let safety = 0;
      while (!exhausted && safety < 50) {
        safety += 1;
        const batch = await prisma.place.findMany({
          select: {
            id: true,
            name: true,
            category: true,
            source: true,
            editorialPriority: true,
            tags: true,
            description: true,
          },
          where,
          skip: dbOffset,
          take: batchSize,
          orderBy,
        });
        if (batch.length === 0) break;
        dbOffset += batch.length;
        total += filterTouristPlaces(batch).length;
        if (batch.length < batchSize) break;
      }
    }

    const data = touristRows.slice(pagination.skip, pagination.skip + pagination.limit);
    return paginatedResponse(data, total, pagination);
  },

  async adminCityClusters(query: {
    page?: string;
    limit?: string;
    status?: string;
    state?: string;
    search?: string;
    touristOnly?: string;
    placesPerCity?: string;
  }) {
    const pagination = getPaginationParams(query, 20);
    const touristOnly = query.touristOnly !== 'false';
    const placesPerCity = Math.min(parseInt(query.placesPerCity || '20', 10), 50);
    const where = placesCrudService.buildAdminWhere(query, touristOnly);

    const groups = await prisma.place.groupBy({
      by: ['state', 'city'],
      where,
      _count: { _all: true },
    });

    const sorted = groups
      .map((g) => ({
        state: g.state?.trim() || '(unknown state)',
        city: g.city?.trim() || '(unknown city)',
        dbCount: g._count._all,
      }))
      .sort((a, b) => b.dbCount - a.dbCount || a.state.localeCompare(b.state) || a.city.localeCompare(b.city));

    const pageGroups = sorted.slice(pagination.skip, pagination.skip + pagination.limit);

    const clusters = await Promise.all(
      pageGroups.map(async (g) => {
        const cityWhere: Prisma.PlaceWhereInput =
          g.city === '(unknown city)'
            ? { OR: [{ city: '' }, { city: { equals: '' } }] }
            : { city: { equals: g.city, mode: 'insensitive' } };
        const stateWhere: Prisma.PlaceWhereInput =
          g.state === '(unknown state)'
            ? {}
            : { state: { equals: g.state, mode: 'insensitive' } };

        let places = await prisma.place.findMany({
          select: placeListSelect,
          where: mergePlaceWhere(where, mergePlaceWhere(cityWhere, stateWhere)),
          orderBy: [{ editorialPriority: 'desc' }, { name: 'asc' }],
          take: touristOnly ? placesPerCity * 3 : placesPerCity,
        });
        if (touristOnly) places = filterTouristPlaces(places);
        places = places.slice(0, placesPerCity);

        return {
          city: g.city,
          state: g.state,
          placeCount: places.length,
          totalInCity: touristOnly ? places.length : g.dbCount,
          places,
        };
      }),
    );

    return paginatedResponse(clusters.filter((c) => c.places.length > 0), sorted.length, pagination);
  },

  buildAdminWhere(
    query: {
      status?: string;
      category?: string;
      search?: string;
      city?: string;
      state?: string;
      verified?: string;
      featured?: string;
    },
    touristOnly: boolean,
  ): Prisma.PlaceWhereInput {
    const where: Prisma.PlaceWhereInput = {};
    const requestedStatus = query.status ? String(query.status).toUpperCase() : undefined;
    if (requestedStatus) where.status = requestedStatus as any;
    if (query.category) {
      where.category = { equals: String(query.category).trim(), mode: 'insensitive' };
    }
    if (query.city) where.city = { contains: query.city, mode: 'insensitive' };
    if (query.state) where.state = { contains: query.state, mode: 'insensitive' };
    const searchWhere = buildAdminPlaceSearchWhere(query.search);
    if (searchWhere) {
      where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), searchWhere];
    }

    const verified = String(query.verified || '').toLowerCase();
    if (verified === 'verified') {
      const verifiedClause: Prisma.PlaceWhereInput = {
        OR: [{ dataQuality: 'VERIFIED' }, { verificationLevel: { gte: 2 } }],
      };
      where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), verifiedClause];
    } else if (verified === 'unverified') {
      const unverifiedClause: Prisma.PlaceWhereInput = {
        AND: [
          { NOT: { dataQuality: 'VERIFIED' } },
          { verificationLevel: { lt: 2 } },
        ],
      };
      where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), unverifiedClause];
    }

    const featured = String(query.featured || '').toLowerCase();
    if (featured === 'featured') {
      where.editorialPriority = { gte: 3 };
    } else if (featured === 'not') {
      where.editorialPriority = { lt: 3 };
    }

    if (touristOnly) {
      // Safe enum pre-filter (avoids fragile nested OR from touristPlacePrismaWhere).
      // Name/park quality is refined by filterTouristPlaces after fetch.
      Object.assign(where, excludeCommercialPlacesWhere);
    }
    return where;
  },

  async getById(idOrSlug: string, viewer?: { isAdmin?: boolean; userId?: string }) {
    const { id: resolvedId } = await resolvePlace(idOrSlug);
    const place = await prisma.place.findFirst({
      select: { ...placeDetailSelect, submittedById: true, mergedIntoId: true, dataQuality: true },
      where: { id: resolvedId },
    });
    if (!place) {
      throw new ApiError(404, 'Place not found.');
    }
    if (!canPublicViewPlace(place, !!viewer?.isAdmin)) {
      const allowed =
        viewer?.isAdmin ||
        (!!viewer?.userId && place.submittedById === viewer.userId);
      if (!allowed) {
        throw new ApiError(404, 'Place not found.');
      }
    }
    if (place.status !== 'APPROVED') {
      const allowed =
        viewer?.isAdmin ||
        (!!viewer?.userId && place.submittedById === viewer.userId);
      if (!allowed) {
        throw new ApiError(404, 'Place not found.');
      }
    }
    const { submittedById: _omit, mergedIntoId: _m, dataQuality: _dq, ...publicPlace } = place as typeof place & {
      submittedById?: string | null;
      mergedIntoId?: string | null;
      dataQuality?: string | null;
    };
    return publicPlace;
  },

  async getBySlug(slug: string, viewer?: { isAdmin?: boolean; userId?: string }) {
    return this.getById(slug, viewer);
  },

  async update(idOrSlug: string, input: UpdatePlaceInput, userId: string) {
    const { id } = await resolvePlace(idOrSlug);
    const existing = await prisma.place.findUnique({
      where: { id },
      select: { submittedById: true, status: true, images: true },
    });
    if (!existing) throw new ApiError(404, 'Place not found.');
    if (existing.submittedById !== userId) {
      throw new ApiError(403, 'You can only update your own submissions.');
    }
    if (existing.status !== 'PENDING') {
      throw new ApiError(400, 'Only pending places can be edited by the submitter.');
    }

    const data: any = { ...input };
    delete data.editorialPriority;
    if (input.name) {
      data.slug = await generateSlug(input.name, id);
    }
    if (input.openingHours) {
      data.openingHours = JSON.parse(JSON.stringify(input.openingHours));
    }
    if (input.ticketPrice) {
      data.ticketPrice = JSON.parse(JSON.stringify(input.ticketPrice));
    }
    if (input.bestTimeToVisit) {
      data.bestTimeToVisit = JSON.parse(JSON.stringify(input.bestTimeToVisit));
    }
    if (input.images) {
      data.images = dedupeImageUrls(input.images);
      if (!input.thumbnail) data.thumbnail = data.images[0] || null;
    }

    const updated = await prisma.place.update({
      select: placeListSelect,
      where: { id },
      data,
    });

    if (input.images) {
      await syncPlaceImageRecords(id, data.images, {
        previousUrls: existing.images ?? [],
      });
    }

    return updated;
  },

  async adminUpdate(idOrSlug: string, input: UpdatePlaceInput, actorId: string) {
    const { id } = await resolvePlace(idOrSlug);
    const existing = await prisma.place.findUnique({
      where: { id },
      select: { id: true, name: true, status: true, images: true, thumbnail: true },
    });
    if (!existing) throw new ApiError(404, 'Place not found.');

    const data: any = { ...input };
    if (input.name) {
      data.slug = await generateSlug(input.name, id);
    }
    if (input.openingHours) {
      data.openingHours = JSON.parse(JSON.stringify(input.openingHours));
    }
    if (input.ticketPrice) {
      data.ticketPrice = JSON.parse(JSON.stringify(input.ticketPrice));
    }
    if (input.bestTimeToVisit) {
      data.bestTimeToVisit = JSON.parse(JSON.stringify(input.bestTimeToVisit));
    }
    if (input.images) {
      data.images = dedupeImageUrls(input.images);
      if (!input.thumbnail) {
        data.thumbnail = data.images[0] || null;
      }
    } else if (input.thumbnail === undefined && existing.images?.length) {
      // keep existing; no-op
    }

    const updated = await prisma.place.update({
      select: placeListSelect,
      where: { id },
      data,
    });

    if (input.images) {
      await syncPlaceImageRecords(id, data.images, {
        previousUrls: existing.images ?? [],
      });
      const fresh = await prisma.place.findUnique({
        select: placeListSelect,
        where: { id },
      });

      eventBus.emit(AppEvents.PLACE_UPDATED, {
        placeId: id,
        actorId,
        data: { previous: { name: existing.name, status: existing.status }, newValues: input },
      });

      return fresh ?? updated;
    }

    eventBus.emit(AppEvents.PLACE_UPDATED, {
      placeId: id,
      actorId,
      data: { previous: { name: existing.name, status: existing.status }, newValues: input },
    });

    return updated;
  },

  async delete(idOrSlug: string, actorId: string) {
    const { id } = await resolvePlace(idOrSlug);
    const place = await prisma.place.findUnique({
      where: { id },
      select: {
        name: true,
        slug: true,
        status: true,
        latitude: true,
        longitude: true,
        submittedById: true,
        city: true,
        state: true,
        externalId: true,
      },
    });
    if (!place) throw new ApiError(404, 'Place not found.');

    const user = await prisma.user.findUnique({ where: { id: actorId } });
    if (user?.permission !== 'ADMIN' && place.submittedById !== actorId) {
      throw new ApiError(403, 'You do not have permission to delete this place.');
    }

    const previous = { name: place.name, status: place.status, latitude: place.latitude, longitude: place.longitude };

    // Tombstone so curated/OSM reseed cannot recreate this place
    await prisma.deletedPlaceRef.upsert({
      where: { slug: place.slug },
      create: {
        slug: place.slug,
        curatedId: place.externalId?.startsWith('curated:')
          ? place.externalId.replace(/^curated:/, '')
          : place.slug,
        name: place.name,
        city: place.city || '',
        state: place.state || '',
        externalId: place.externalId,
        deletedById: actorId,
      },
      update: {
        name: place.name,
        city: place.city || '',
        state: place.state || '',
        externalId: place.externalId,
        deletedById: actorId,
        deletedAt: new Date(),
      },
    });

    await prisma.tripPlanStop.deleteMany({ where: { placeId: id } });
    await prisma.collectionPlace.deleteMany({ where: { placeId: id } });
    await prisma.placeStat.deleteMany({ where: { placeId: id } });
    await prisma.checkIn.deleteMany({ where: { placeId: id } });
    await prisma.review.deleteMany({ where: { placeId: id } });
    await prisma.placeImage.deleteMany({ where: { placeId: id } });
    await prisma.placeVideo.deleteMany({ where: { placeId: id } });
    await prisma.placeOffer.deleteMany({ where: { placeId: id } });
    await prisma.placeEvent.deleteMany({ where: { placeId: id } });
    await prisma.reel.updateMany({ where: { placeId: id }, data: { placeId: null } });
    await prisma.auditLog.updateMany({ where: { placeId: id }, data: { placeId: null } });

    await prisma.place.delete({ where: { id } });

    eventBus.emit(AppEvents.PLACE_DELETED, { placeId: id, actorId, previous });
  },

  async adminDeleteAll(actorId: string) {
    const count = await prisma.place.count();

    await prisma.tripPlanStop.deleteMany({});
    await prisma.collectionPlace.deleteMany({});
    await prisma.placeStat.deleteMany({});
    await prisma.checkIn.deleteMany({});
    await prisma.review.deleteMany({});
    await prisma.placeImage.deleteMany({});
    await prisma.placeVideo.deleteMany({});
    await prisma.placeOffer.deleteMany({});
    await prisma.placeEvent.deleteMany({});
    await prisma.reel.updateMany({ data: { placeId: null } });
    await prisma.auditLog.updateMany({ data: { placeId: null } });
    await prisma.place.deleteMany();

    eventBus.emit(AppEvents.PLACE_DELETED, { placeId: 'ALL', actorId, previous: { count } as any });
    return { deletedCount: count };
  },

  async getPendingPlaces(query: { page?: string; limit?: string }) {
    const pagination = getPaginationParams(query);
    const where: Prisma.PlaceWhereInput = { status: 'PENDING' };

    const [data, total] = await Promise.all([
      prisma.place.findMany({
        select: {
          ...placeListSelect,
          description: true,
        },
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.place.count({ where }),
    ]);

    return paginatedResponse(data, total, pagination);
  },

  async getMySubmissions(userId: string, query: { page?: string; limit?: string; status?: string }) {
    const pagination = getPaginationParams(query);
    const where: Prisma.PlaceWhereInput = { submittedById: userId };
    if (query.status) {
      where.status = query.status as any;
    }

    const [data, total] = await Promise.all([
      prisma.place.findMany({
        select: placeListSelect,
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.place.count({ where }),
    ]);

    return paginatedResponse(data, total, pagination);
  },

  async vendorUpdate(idOrSlug: string, input: VendorUpdatePlaceInput, vendorId: string) {
    const { id } = await resolvePlace(idOrSlug);
    await verifyVendorAccess(id, vendorId);

    const data: any = { ...input };
    if (input.openingHours) {
      data.openingHours = JSON.parse(JSON.stringify(input.openingHours));
    }
    if (input.ticketPrice) {
      data.ticketPrice = JSON.parse(JSON.stringify(input.ticketPrice));
    }

    return prisma.place.update({
      select: placeListSelect,
      where: { id },
      data,
    });
  },

  // ── Media ──

  async addImage(placeIdOrSlug: string, input: AddImageInput, userId: string) {
    const { id: placeId } = await resolvePlace(placeIdOrSlug);
    await verifyAccess(placeId, userId);

    const url = String(input.url || '').trim();
    if (!url) throw new ApiError(400, 'Image URL is required.');

    // Skip duplicate URL for this place
    const existingImg = await prisma.placeImage.findFirst({
      where: { placeId, url },
    });
    if (existingImg) {
      if (input.isPrimary && !existingImg.isPrimary) {
        await prisma.placeImage.updateMany({
          where: { placeId, isPrimary: true },
          data: { isPrimary: false },
        });
        await prisma.placeImage.update({
          where: { id: existingImg.id },
          data: { isPrimary: true },
        });
        await prisma.place.update({
          where: { id: placeId },
          data: { thumbnail: url },
        });
      }
      return existingImg;
    }

    if (input.isPrimary) {
      await prisma.placeImage.updateMany({
        where: { placeId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const created = await prisma.placeImage.create({
      data: {
        placeId,
        url,
        caption: input.caption,
        isPrimary: input.isPrimary || false,
      },
    });

    // Keep Place.images + thumbnail in sync (admin list/map use these)
    const place = await prisma.place.findUnique({
      where: { id: placeId },
      select: { images: true, thumbnail: true },
    });
    const images = dedupeImageUrls([...(place?.images || []), url]);
    await prisma.place.update({
      where: { id: placeId },
      data: {
        images,
        thumbnail: input.isPrimary || !place?.thumbnail ? url : place.thumbnail,
      },
    });

    return created;
  },

  async deleteImage(imageId: string, userId: string) {
    const image = await prisma.placeImage.findUnique({
      where: { id: imageId },
      include: { place: { select: { id: true, submittedById: true, images: true, thumbnail: true } } },
    });
    if (!image) throw new ApiError(404, 'Image not found.');
    await verifyAccess(image.place.id, userId);

    await prisma.placeImage.delete({ where: { id: imageId } });

    const remaining = dedupeImageUrls(
      (image.place.images || []).filter((u) => u !== image.url),
    );
    await prisma.place.update({
      where: { id: image.place.id },
      data: {
        images: remaining,
        thumbnail:
          image.place.thumbnail === image.url
            ? remaining[0] || null
            : image.place.thumbnail,
      },
    });

    await deleteCloudinaryImageIfOrphan(image.url, image.place.id);
  },

  async setPrimaryImage(imageId: string, userId: string) {
    const image = await prisma.placeImage.findUnique({
      where: { id: imageId },
      include: { place: { select: { id: true, submittedById: true } } },
    });
    if (!image) throw new ApiError(404, 'Image not found.');
    await verifyAccess(image.place.id, userId);

    await prisma.placeImage.updateMany({
      where: { placeId: image.place.id, isPrimary: true },
      data: { isPrimary: false },
    });

    const updated = await prisma.placeImage.update({
      where: { id: imageId },
      data: { isPrimary: true },
    });

    await prisma.place.update({
      where: { id: image.place.id },
      data: { thumbnail: image.url },
    });

    return updated;
  },

  async getImages(placeIdOrSlug: string) {
    const { id: placeId } = await resolvePlace(placeIdOrSlug);
    return prisma.placeImage.findMany({
      where: { placeId },
      orderBy: [{ isPrimary: 'desc' }, { order: 'asc' }],
    });
  },

  async addVideo(placeIdOrSlug: string, input: AddVideoInput, userId: string) {
    const { id: placeId } = await resolvePlace(placeIdOrSlug);
    await verifyAccess(placeId, userId);

    return prisma.placeVideo.create({
      data: {
        placeId,
        url: input.url,
        thumbnail: input.thumbnail,
        title: input.title,
        duration: input.duration,
      },
    });
  },

  async deleteVideo(videoId: string, userId: string) {
    const video = await prisma.placeVideo.findUnique({
      where: { id: videoId },
      include: { place: { select: { id: true, submittedById: true } } },
    });
    if (!video) throw new ApiError(404, 'Video not found.');
    await verifyAccess(video.place.id, userId);

    await prisma.placeVideo.delete({ where: { id: videoId } });
  },

  async getVideos(placeIdOrSlug: string) {
    const { id: placeId } = await resolvePlace(placeIdOrSlug);
    return prisma.placeVideo.findMany({
      where: { placeId },
      orderBy: { order: 'asc' },
    });
  },

  async getReels(placeIdOrSlug: string) {
    const targetPlace = await prisma.place.findFirst({
      where: {
        OR: [
          { id: placeIdOrSlug },
          { slug: placeIdOrSlug },
        ],
      },
      select: { id: true, slug: true, mergedIntoId: true },
    });

    const matchingPlaceIds = new Set<string>([placeIdOrSlug]);
    if (targetPlace) {
      if (targetPlace.id) matchingPlaceIds.add(targetPlace.id);
      if (targetPlace.slug) matchingPlaceIds.add(targetPlace.slug);
      if (targetPlace.mergedIntoId) matchingPlaceIds.add(targetPlace.mergedIntoId);
    }

    return prisma.reel.findMany({
      where: {
        placeId: { in: Array.from(matchingPlaceIds) },
        status: 'APPROVED',
      },
      orderBy: { createdAt: 'desc' },
      include: {
        creator: {
          select: { id: true, username: true, avatar: true, verified: true, userId: true },
        },
        place: {
          select: { id: true, name: true, city: true, state: true },
        },
        vendor: {
          select: { id: true, businessName: true, city: true, state: true },
        },
      },
    });
  },

  // ── Offers & Events ──

  async addOffer(placeIdOrSlug: string, input: CreateOfferInput, vendorId: string) {
    const { id: placeId } = await resolvePlace(placeIdOrSlug);
    await verifyVendorAccess(placeId, vendorId);

    return prisma.placeOffer.create({
      data: {
        placeId,
        title: input.title,
        description: input.description,
        discount: input.discount,
        validFrom: input.validFrom ? new Date(input.validFrom) : null,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
      },
    });
  },

  async updateOffer(offerId: string, input: UpdateOfferInput, vendorId: string) {
    const offer = await prisma.placeOffer.findUnique({ where: { id: offerId }, include: { place: { select: { id: true } } } });
    if (!offer) throw new ApiError(404, 'Offer not found.');
    await verifyVendorAccess(offer.place.id, vendorId);

    const data: any = { ...input };
    if (input.validFrom) data.validFrom = new Date(input.validFrom);
    if (input.validUntil) data.validUntil = new Date(input.validUntil);

    return prisma.placeOffer.update({ where: { id: offerId }, data });
  },

  async deleteOffer(offerId: string, vendorId: string) {
    const offer = await prisma.placeOffer.findUnique({ where: { id: offerId }, include: { place: { select: { id: true } } } });
    if (!offer) throw new ApiError(404, 'Offer not found.');
    await verifyVendorAccess(offer.place.id, vendorId);

    await prisma.placeOffer.delete({ where: { id: offerId } });
  },

  async getOffers(placeIdOrSlug: string) {
    const { id: placeId } = await resolvePlace(placeIdOrSlug);
    return prisma.placeOffer.findMany({
      where: { placeId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  },

  async addEvent(placeIdOrSlug: string, input: CreateEventInput, vendorId: string) {
    const { id: placeId } = await resolvePlace(placeIdOrSlug);
    await verifyVendorAccess(placeId, vendorId);

    return prisma.placeEvent.create({
      data: {
        placeId,
        title: input.title,
        description: input.description,
        imageUrl: input.imageUrl,
        startDate: new Date(input.startDate),
        endDate: input.endDate ? new Date(input.endDate) : null,
      },
    });
  },

  async updateEvent(eventId: string, input: UpdateEventInput, vendorId: string) {
    const event = await prisma.placeEvent.findUnique({ where: { id: eventId }, include: { place: { select: { id: true } } } });
    if (!event) throw new ApiError(404, 'Event not found.');
    await verifyVendorAccess(event.place.id, vendorId);

    const data: any = { ...input };
    if (input.startDate) data.startDate = new Date(input.startDate);
    if (input.endDate) data.endDate = new Date(input.endDate);

    return prisma.placeEvent.update({ where: { id: eventId }, data });
  },

  async deleteEvent(eventId: string, vendorId: string) {
    const event = await prisma.placeEvent.findUnique({ where: { id: eventId }, include: { place: { select: { id: true } } } });
    if (!event) throw new ApiError(404, 'Event not found.');
    await verifyVendorAccess(event.place.id, vendorId);

    await prisma.placeEvent.delete({ where: { id: eventId } });
  },

  async getEvents(placeIdOrSlug: string) {
    const { id: placeId } = await resolvePlace(placeIdOrSlug);
    return prisma.placeEvent.findMany({
      where: { placeId },
      orderBy: { startDate: 'asc' },
    });
  },

  async getUpcomingEvents(placeIdOrSlug: string) {
    const { id: placeId } = await resolvePlace(placeIdOrSlug);
    return prisma.placeEvent.findMany({
      where: { placeId, startDate: { gte: new Date() } },
      orderBy: { startDate: 'asc' },
    });
  },

  // ── Social ──

  async savePlace(placeIdOrSlug: string, userId: string) {
    const { id: placeId } = await resolvePlace(placeIdOrSlug);

    const existing = await prisma.placeStat.findFirst({
      where: { placeId, userId, action: 'save' },
      select: { id: true },
    });
    if (existing) return;

    await prisma.placeStat.create({
      data: { placeId, userId, action: 'save' },
    });

    eventBus.emit(AppEvents.STAT_RECORDED, { placeId, userId, action: 'save' });
  },

  async unsavePlace(placeIdOrSlug: string, userId: string) {
    const { id: placeId } = await resolvePlace(placeIdOrSlug);
    await prisma.placeStat.deleteMany({
      where: { placeId, userId, action: 'save' },
    });
  },

  async getSavedPlaces(userId: string, query: { page?: string; limit?: string }) {
    const pagination = getPaginationParams(query);

    // Distinct placeIds the user saved (newest first). Load all for correct
    // pagination after APPROVED/merged filters — save counts per user stay modest.
    const savedStats = await prisma.placeStat.findMany({
      where: { userId, action: 'save' },
      select: { placeId: true, createdAt: true },
      distinct: ['placeId'],
      orderBy: { createdAt: 'desc' },
    });

    const placeIds = savedStats.map((s) => s.placeId);
    const places = placeIds.length
      ? await prisma.place.findMany({
          where: {
            id: { in: placeIds },
            status: 'APPROVED',
            mergedIntoId: null,
          },
          include: {
            submittedBy: { select: { id: true, name: true, email: true } },
          },
        })
      : [];

    const placeMap = new Map(places.map((p) => [p.id, p]));
    const orderedPlaces = placeIds
      .map((id) => {
        const p = placeMap.get(id);
        if (!p) return null;
        return {
          ...p,
          savedAt: savedStats.find((s) => s.placeId === id)?.createdAt,
        };
      })
      .filter(Boolean);

    const total = orderedPlaces.length;
    const paged = orderedPlaces.slice(pagination.skip, pagination.skip + pagination.limit);

    return paginatedResponse(paged, total, pagination);
  },

  async checkIn(placeIdOrSlug: string, userId: string) {
    const { id: placeId } = await resolvePlace(placeIdOrSlug);

    const existing = await prisma.checkIn.findUnique({
      where: { placeId_userId: { placeId, userId } },
    });
    if (existing) {
      return existing;
    }

    const checkin = await prisma.checkIn.create({
      data: { placeId, userId },
    });

    await prisma.placeStat.create({
      data: { placeId, userId, action: 'checkin' },
    });

    try {
      const RULE_KEY = 'place_visit';
      const isLimitReached = await pointRulesService.checkDailyLimit(userId, RULE_KEY);
      const onCooldown = await pointRulesService.checkCooldown(userId, RULE_KEY);
      const rule = await pointRulesService.getPointsForAction(RULE_KEY);
      if (!isLimitReached && !onCooldown && rule) {
        await walletService.earn(userId, rule.points, 'place_visit', checkin.id, 'CHECKIN');
      }
    } catch (error) {
      logger.error({ error, userId, placeId }, 'Failed to award place_visit points');
    }

    return checkin;
  },

  async addReview(_placeIdOrSlug: string, _userId: string, _input: ReviewInput) {
    throw new ApiError(
      403,
      'Place reviews are not supported. Reviews can only be submitted for vendors.',
    );
  },

  async getReviews(placeIdOrSlug: string, query: { page?: string; limit?: string }) {
    const { id: placeId } = await resolvePlace(placeIdOrSlug);
    const pagination = getPaginationParams(query);

    const [data, total] = await Promise.all([
      prisma.review.findMany({
        where: { placeId, status: 'APPROVED' },
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: [{ helpfulVotes: 'desc' }, { createdAt: 'desc' }],
        include: {
          user: { select: { id: true, name: true, avatarStyle: true, avatar: true } },
        },
      }),
      prisma.review.count({ where: { placeId, status: 'APPROVED' } }),
    ]);

    return paginatedResponse(data, total, pagination);
  },

  async markReviewHelpful(_placeIdOrSlug: string, _reviewId: string) {
    throw new ApiError(
      403,
      'Place reviews are not supported. Reviews can only be submitted for vendors.',
    );
  },
};
