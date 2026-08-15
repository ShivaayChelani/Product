import { prisma } from '../../config/database';
import { ApiError } from '../../shared/utils/ApiError';
import type { CreateRewardInput, UpdateRewardInput, RewardQueryInput } from './rewards.validation';
import {
  filterEligiblePublicOffers,
  isPublicVendorOfferEligible,
  publicVendorOffersWhere,
  remainingRedemptionCount,
} from './offer-eligibility';
import { publicVendorMapWhere } from '../vendors/vendor-public-visibility';

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distanceKm(
  lat: number,
  lng: number,
  placeLat?: number | null,
  placeLng?: number | null,
): number {
  if (placeLat == null || placeLng == null) return Number.POSITIVE_INFINITY;
  return haversineDistance(lat, lng, placeLat, placeLng);
}

export const rewardsService = {
  async listRewards(query: RewardQueryInput) {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
    const skip = (page - 1) * limit;
    const where: any = {};
    if (query.isActive === undefined) where.isActive = true;
    else if (query.isActive === 'true') where.isActive = true;
    else if (query.isActive === 'false') where.isActive = false;

    if (query.category) where.category = query.category;
    if (query.vendorId) where.vendorId = query.vendorId;
    if (query.minPoints || query.maxPoints) {
      where.pointsRequired = {};
      if (query.minPoints) where.pointsRequired.gte = parseInt(query.minPoints, 10);
      if (query.maxPoints) where.pointsRequired.lte = parseInt(query.maxPoints, 10);
    }
    if (query.search) where.title = { contains: query.search, mode: 'insensitive' };
    if (query.city) {
      where.vendor = { city: { contains: query.city, mode: 'insensitive' } };
    }

    const orderBy: any = query.sort === 'points_asc'
      ? { pointsRequired: 'asc' }
      : query.sort === 'points_desc'
        ? { pointsRequired: 'desc' }
        : query.sort === 'newest'
          ? { createdAt: 'desc' }
          : [{ sortOrder: 'asc' }, { createdAt: 'desc' }];

    const [data, total] = await Promise.all([
      prisma.rewardCatalog.findMany({
        where,
        include: {
          vendor: { select: { id: true, businessName: true, city: true, state: true, imageUrl: true } },
        },
        skip,
        take: limit,
        orderBy,
      }),
      prisma.rewardCatalog.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  },

  async getRewardById(id: string) {
    const reward = await prisma.rewardCatalog.findUnique({
      where: { id },
      include: {
        vendor: { select: { id: true, businessName: true, city: true, state: true, imageUrl: true } },
      },
    });
    if (!reward) throw new ApiError(404, 'Reward not found');
    return reward;
  },

  async createReward(input: CreateRewardInput) {
    return prisma.rewardCatalog.create({
      data: {
        title: input.title,
        description: input.description,
        category: input.category,
        pointsRequired: input.pointsRequired,
        value: input.value,
        imageUrl: input.imageUrl,
        vendorId: input.vendorId,
        vendorOfferId: input.vendorOfferId,
        sortOrder: input.sortOrder ?? 0,
      },
      include: {
        vendor: { select: { id: true, businessName: true, city: true, state: true, imageUrl: true } },
      },
    });
  },

  async updateReward(id: string, input: UpdateRewardInput) {
    const existing = await prisma.rewardCatalog.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, 'Reward not found');

    return prisma.rewardCatalog.update({
      where: { id },
      data: input,
      include: {
        vendor: { select: { id: true, businessName: true, city: true, state: true, imageUrl: true } },
      },
    });
  },

  async deleteReward(id: string) {
    const existing = await prisma.rewardCatalog.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, 'Reward not found');

    await prisma.rewardCatalog.delete({ where: { id } });
  },

  async listVendorOffers(query: { category?: string; city?: string; minPoints?: string; maxPoints?: string; vendorId?: string; page?: string; limit?: string; sort?: string; lat?: string; lng?: string }) {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
    const skip = (page - 1) * limit;
    const now = new Date();
    const where: any = { ...publicVendorOffersWhere(now) };

    if (query.category) {
      const raw = String(query.category).trim().toLowerCase();
      if (raw && raw !== 'all') {
        const mapped =
          (
            {
              hotels: 'hotel',
              hotel: 'hotel',
              restaurants: 'restaurant',
              restaurant: 'restaurant',
              cafes: 'cafe',
              cafe: 'cafe',
              activities: 'adventure',
              adventure: 'adventure',
              shopping: 'local_shop',
              local_shop: 'local_shop',
              wellness: 'homestay',
              entertainment: 'event_organizer',
              travel: 'travel_agent',
              travel_agent: 'travel_agent',
              experiences: 'tour_experience',
              tour_experience: 'tour_experience',
              guides: 'guide',
              guide: 'guide',
            } as Record<string, string>
          )[raw] || raw;
        where.AND = [
          {
            OR: [
              { category: { equals: raw, mode: 'insensitive' } },
              { category: { equals: mapped, mode: 'insensitive' } },
              { vendor: { businessType: mapped } },
            ],
          },
        ];
      }
    }
    if (query.vendorId) where.vendorId = query.vendorId;
    if (query.minPoints || query.maxPoints) {
      where.pointsRequired = {};
      if (query.minPoints) where.pointsRequired.gte = parseInt(query.minPoints, 10);
      if (query.maxPoints) where.pointsRequired.lte = parseInt(query.maxPoints, 10);
    }
    if (query.city) {
      where.vendor = { ...where.vendor, city: { contains: query.city, mode: 'insensitive' } };
    }

    const orderBy: any = [{ isFeatured: 'desc' }, { createdAt: 'desc' }];

    const rows = await prisma.vendorOffer.findMany({
      where,
      include: {
        vendor: {
          select: {
            id: true,
            businessName: true,
            city: true,
            state: true,
            imageUrl: true,
            latitude: true,
            longitude: true,
            status: true,
            subscriptionStatus: true,
            suspendedAt: true,
          },
        },
      },
      orderBy,
    });

    let eligible = filterEligiblePublicOffers(rows, now);

    const lat = query.lat != null ? parseFloat(query.lat) : NaN;
    const lng = query.lng != null ? parseFloat(query.lng) : NaN;
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      eligible = [...eligible].sort((a, b) => {
        if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
        const da = distanceKm(lat, lng, a.vendor?.latitude, a.vendor?.longitude);
        const db = distanceKm(lat, lng, b.vendor?.latitude, b.vendor?.longitude);
        if (da !== db) return da - db;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
    }

    const total = eligible.length;
    const data = eligible.slice(skip, skip + limit).map(o => ({
      ...o,
      remainingRedemptions: remainingRedemptionCount(o),
    }));

    return {
      data,
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  },

  async getPublicVendorOfferById(offerId: string) {
    const now = new Date();
    const offer = await prisma.vendorOffer.findUnique({
      where: { id: offerId },
      include: {
        vendor: {
          select: {
            id: true,
            businessName: true,
            city: true,
            state: true,
            address: true,
            imageUrl: true,
            latitude: true,
            longitude: true,
            status: true,
            subscriptionStatus: true,
            suspendedAt: true,
            operatingHours: true,
          },
        },
      },
    });
    if (!offer || !isPublicVendorOfferEligible(offer, offer.vendor, now)) {
      throw new ApiError(404, 'Offer not found or no longer available');
    }
    return {
      ...offer,
      remainingRedemptions: remainingRedemptionCount(offer),
    };
  },

  async getNearbyRewards(lat: number, lng: number, radiusKm: number) {
    const vendors = await prisma.vendor.findMany({
      where: publicVendorMapWhere,
      select: {
        id: true,
        businessName: true,
        latitude: true,
        longitude: true,
        city: true,
        state: true,
        imageUrl: true,
        offers: {
          where: { isApproved: true, isActive: true, pausedAt: null },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const nearby = vendors
      .map((v) => ({
        ...v,
        offers: filterEligiblePublicOffers(
          (v.offers || []).map((o) => ({
            ...o,
            vendor: {
              id: v.id,
              businessName: v.businessName,
              city: v.city,
              state: v.state,
              status: 'APPROVED' as const,
              subscriptionStatus: 'ACTIVE' as const,
              suspendedAt: null,
              latitude: v.latitude,
              longitude: v.longitude,
            },
          })),
        ),
        distance: haversineDistance(lat, lng, v.latitude!, v.longitude!),
      }))
      .filter((v) => v.distance <= radiusKm)
      .sort((a, b) => a.distance - b.distance);

    return nearby;
  },
};
