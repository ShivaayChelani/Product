/**
 * Prisma-backed PlaceStore (Phase 1). Maps approved Place rows to the canonical
 * PlaceRecord shape. This is the ONLY module in the itinerary domain that
 * imports @prisma/client / the prisma singleton — everything else is pure and
 * testable with an injected store.
 */

import { PlaceStatus } from '@prisma/client';
import { prisma } from '../../../config/database';
import type { PlaceRecord } from './types';
import { canonicalizeDestination } from '../../../shared/utils/destination';
import type { PlaceStore } from './candidates';

export const APPROVED = PlaceStatus.APPROVED;

/** PlaceRow used by the store (canonical DB column subset). */
export interface PlaceRow {
  id: string;
  name: string;
  category: string;
  tags: string[];
  city: string | null;
  state: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  reviewCount: number;
  popularityScore: number | null;
  hiddenGemScore: number | null;
  editorialPriority: number;
  openingHours: unknown;
  ticketPrice: unknown;
  estimatedDurationMinutes: number | null;
  recommendedDuration: string | null;
}

export const PLACE_RECORD_SELECT = {
  id: true,
  name: true,
  category: true,
  tags: true,
  city: true,
  state: true,
  country: true,
  latitude: true,
  longitude: true,
  rating: true,
  reviewCount: true,
  popularityScore: true,
  hiddenGemScore: true,
  editorialPriority: true,
  openingHours: true,
  ticketPrice: true,
  estimatedDurationMinutes: true,
  recommendedDuration: true,
} as const;

export function placeRecordFromRow(row: PlaceRow): PlaceRecord {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    tags: row.tags,
    city: row.city || null,
    state: row.state || null,
    country: row.country || null,
    latitude: row.latitude,
    longitude: row.longitude,
    rating: row.rating,
    reviewCount: row.reviewCount,
    popularityScore: row.popularityScore,
    hiddenGemScore: row.hiddenGemScore,
    editorialPriority: row.editorialPriority,
    openingHours: row.openingHours ?? null,
    ticketPrice: row.ticketPrice ?? null,
    estimatedDurationMinutes: row.estimatedDurationMinutes,
    recommendedDuration: row.recommendedDuration,
  };
}

/**
 * Default store. Batch reads only — no N+1. The engine keeps reads to a small
 * number of bounded queries.
 */
export const prismaPlaceStore: PlaceStore = {
  async findApprovedByIds(ids) {
    if (!ids.length) return [];
    const rows = await prisma.place.findMany({
      where: { id: { in: [...ids] }, status: APPROVED },
      select: PLACE_RECORD_SELECT,
    });
    return rows.map(placeRecordFromRow);
  },

  async findApprovedByDestination(destination, opts) {
    const dest = canonicalizeDestination(destination);
    if (!dest) return [];
    const rows = await prisma.place.findMany({
      where: {
        status: APPROVED,
        OR: [
          { city: { contains: dest, mode: 'insensitive' } },
          { state: { contains: dest, mode: 'insensitive' } },
          { name: { contains: dest, mode: 'insensitive' } },
        ],
      },
      select: PLACE_RECORD_SELECT,
      orderBy: [{ popularityScore: 'desc' }, { rating: 'desc' }],
      take: opts?.limit ?? 60,
    });
    return rows.map(placeRecordFromRow);
  },

  async findApprovedNear(latitude, longitude, radiusKm, opts) {
    if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return [];
    }
    const latKm = radiusKm / 110.574;
    const lngKm = radiusKm / (111.32 * Math.cos((latitude * Math.PI) / 180));
    const rows = await prisma.place.findMany({
      where: {
        status: APPROVED,
        latitude: { not: null, gte: latitude - latKm, lte: latitude + latKm },
        longitude: { not: null, gte: longitude - lngKm, lte: longitude + lngKm },
      },
      select: PLACE_RECORD_SELECT,
      orderBy: [{ popularityScore: 'desc' }, { rating: 'desc' }],
      take: opts?.limit ?? 30,
    });
    return rows.map(placeRecordFromRow);
  },
};