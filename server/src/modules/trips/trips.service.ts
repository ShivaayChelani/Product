import { Prisma, TravelPace, TimePreference, AvoidOption } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError, ErrorCodes } from '../../shared/utils/ApiError';
import { paginatedResponse, getPaginationParams } from '../../shared/utils/pagination';
import { resolvePlace } from '../places/services/places.helpers';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import {
  generateItineraryPlan, estimateDurationMinutes, parseEntryFee, isPlaceOpenAt,
  nearestNeighborOrder, twoOptImprove, TimeSlotKey,
} from './itineraryEngine';
import { parseTripIntent, hasGlobalIntentSignals, extractPlaceNameCandidates } from './tripIntentParser';
import { resolvePromptPlaceMentions } from './promptPlaceResolution';
import { getCachedPlan, setCachedPlan, buildPlannerCacheKey } from './plannerCache';
import {
  canonicalizeDestination,
  cityKeyFromPlace,
  destinationMatchesCity,
  formatDestinationLabel,
  isGenericDestination,
  tripCanAcceptPlaceCity,
} from '../../shared/utils/destination';
import { haversineDistance } from '../../shared/utils/geo';
import { walletService } from '../wallet/wallet.service';
import { pointRulesService } from '../point-rules/pointRules.service';
import {
  getItineraryCheckpointRadiusMeters,
  getItineraryGpsAccuracyMaxMeters,
  getItineraryMaxTravelSpeedKmh,
  isItineraryGpsRewardsEnabled,
} from './itinerary-rewards.config';
import { resolvePlaceForQuickAdd } from './vendorItineraryPlace';
import {
  planFromRaw,
} from './itinerary/planner';
import {
  normalizeIntent,
} from './itinerary/intent';
import { enrichPlace } from './itinerary/enrichment';
import { buildZones } from './itinerary/clustering';
import { zoneMapOf } from './itinerary/dayAllocator';
import { zoneAreaLabel } from './itinerary/aiExplainer';
import {
  APPROVED,
  PLACE_RECORD_SELECT,
  placeRecordFromRow,
  prismaPlaceStore,
  type PlaceRow,
} from './itinerary/prismaPlaceStore';
import {
  toRawPlanningInput,
  plannedDayToWrites,
  estimatedBudgetOf,
  warningMessages,
  minutesFromTimeString,
  toCanonicalPlanRequest,
  type CanonicalPlanRequest,
} from './canonicalPlanMapper';
import type {
  EnrichedPlace,
  ItineraryIntent,
  PlaceState,
  ScheduledStop,
  Zone,
} from './itinerary/types';
import type {
  ItineraryCandidate,
  PlanDay,
} from './itinerary/phase2Types';
import {
  haversineKm as stopHaversineKm,
  roundKm,
  distanceFromPreviousStopKm,
} from './stopDistance';
import { recoverCustomBudgetAmount } from './customBudget';

const prismaTrip = prisma.tripPlan;
const prismaDay = prisma.tripPlanDay;
const prismaStop = prisma.tripPlanStop;
const prismaCollab = prisma.tripCollaborator;

function calcDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return stopHaversineKm(lat1, lng1, lat2, lng2);
}

async function persistConsecutiveDistances(
  tx: Prisma.TransactionClient,
  orderedStopIds: string[],
): Promise<void> {
  if (orderedStopIds.length === 0) return;
  const stops = await tx.tripPlanStop.findMany({
    where: { id: { in: orderedStopIds } },
    include: { place: { select: { latitude: true, longitude: true } } },
  });
  const byId = new Map(stops.map((s) => [s.id, s]));
  let prev: { latitude: number | null; longitude: number | null } | null = null;
  for (const id of orderedStopIds) {
    const stop = byId.get(id);
    if (!stop) continue;
    const dist = distanceFromPreviousStopKm(prev, stop.place);
    await tx.tripPlanStop.update({
      where: { id },
      data: { distanceFromPrev: dist },
    });
    prev = stop.place;
  }
}

function minutesToTimeStr(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60).toString().padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}`;
}

function minutesToTimeSlot(minutes: number): TimeSlotKey {
  const m = minutes % 1440;
  if (m < 720) return 'MORNING';
  if (m < 1020) return 'AFTERNOON';
  return 'EVENING';
}

/** Assign start/end times for every stop in the given order. Never drops stops. */
function scheduleOrderedStopsForDay(
  day: { stops: Array<{ id: string; place: { latitude: number | null; longitude: number | null; ticketPrice: unknown } & Record<string, unknown> }> },
  orderedStopIds: string[],
  _pace: string,
  _startLocation?: { latitude: number; longitude: number },
): { id: string; data: Record<string, unknown> }[] {
  let currentMinutes = 480; // 08:00
  const updates: { id: string; data: Record<string, unknown> }[] = [];
  let prevLat: number | null = null;
  let prevLng: number | null = null;

  orderedStopIds.forEach((stopId, idx) => {
    const stop = day.stops.find((s) => s.id === stopId);
    if (!stop?.place) return;

    const place = stop.place;
    const duration = Math.max(30, estimateDurationMinutes(place as any));

    let distFromPrev: number | undefined;
    if (idx > 0 && prevLat != null && prevLng != null && place.latitude != null && place.longitude != null) {
      distFromPrev = roundKm(calcDistance(prevLat, prevLng, place.latitude, place.longitude));
    }

    const endMinutes = currentMinutes + duration;
    updates.push({
      id: stop.id,
      data: {
        order: idx,
        startTime: minutesToTimeStr(currentMinutes),
        endTime: minutesToTimeStr(endMinutes),
        duration,
        distanceFromPrev: distFromPrev,
        timeSlot: minutesToTimeSlot(currentMinutes),
        entryFee: parseEntryFee(place.ticketPrice) ?? undefined,
      },
    });

    currentMinutes = endMinutes + 10;
    if (place.latitude != null && place.longitude != null) {
      prevLat = place.latitude;
      prevLng = place.longitude;
    }
  });

  return updates;
}

/** Pack an ordered route into day buckets by daily time budget — never drops a stop. */
function packStopsIntoDayBuckets(
  orderedStopIds: string[],
  durationByStopId: Map<string, number>,
  pace: string,
): string[][] {
  const maxMinPerDay = pace === 'relaxed' ? 480 : pace === 'fast' ? 360 : 420;
  const buckets: string[][] = [];
  let current: string[] = [];
  let dayMinutes = 0;

  for (const stopId of orderedStopIds) {
    const duration = durationByStopId.get(stopId) ?? 60;
    if (current.length > 0 && dayMinutes + duration > maxMinPerDay) {
      buckets.push(current);
      current = [];
      dayMinutes = 0;
    }
    current.push(stopId);
    dayMinutes += duration + 10;
  }
  if (current.length > 0) buckets.push(current);
  return buckets.length > 0 ? buckets : [[]];
}

/** Manual quick-add targets Day 1, or the earliest day that already has stops. */
async function resolveQuickAddDay(
  tx: Prisma.TransactionClient,
  tripPlanId: string,
): Promise<{ id: string }> {
  const withStops = await tx.tripPlanDay.findFirst({
    where: { tripPlanId, stops: { some: {} } },
    orderBy: { dayNumber: 'asc' },
    select: { id: true },
  });
  if (withStops) return withStops;

  const firstDay = await tx.tripPlanDay.findFirst({
    where: { tripPlanId },
    orderBy: { dayNumber: 'asc' },
    select: { id: true },
  });
  if (firstDay) return firstDay;

  return tx.tripPlanDay.create({
    data: { tripPlanId, dayNumber: 1 },
    select: { id: true },
  });
}

const TRIP_CITY_SELECT = {
  destination: true,
  tripDays: {
    select: {
      stops: {
        select: { place: { select: { city: true, state: true } } },
      },
    },
  },
} as const;

type TripCitySnapshot = {
  destination: string | null;
  tripDays: Array<{ stops: Array<{ place: { city: string | null; state: string | null } | null }> }>;
};

function stopCityKeys(trip: TripCitySnapshot): string[] {
  const keys = new Set<string>();
  for (const day of trip.tripDays) {
    for (const stop of day.stops) {
      const key = cityKeyFromPlace(stop.place || {});
      if (key) keys.add(key);
    }
  }
  return [...keys];
}

function assertTripAcceptsPlace(
  trip: TripCitySnapshot,
  place: { city?: string | null; state?: string | null },
) {
  const cityKey = cityKeyFromPlace(place);
  if (tripCanAcceptPlaceCity(trip.destination, stopCityKeys(trip), cityKey)) return;
  const destLabel = formatDestinationLabel(place.city || place.state || '') || place.city || 'another city';
  throw new ApiError(
    409,
    'This place belongs to a different city than this itinerary.',
    true,
    ErrorCodes.CITY_MISMATCH,
    { city: destLabel },
  );
}

async function maybeConsolidateManualDraftStops(tripId: string): Promise<boolean> {
  const trip = await prismaTrip.findUnique({
    where: { id: tripId },
    include: {
      tripDays: {
        orderBy: { dayNumber: 'asc' },
        include: { stops: { orderBy: { order: 'asc' } } },
      },
    },
  });
  if (!trip || trip.status !== 'DRAFT' || !trip.tripDays.length) return false;

  const day1 = trip.tripDays[0];
  if (day1.stops.length > 0) return false;

  const misplaced = trip.tripDays.slice(1).flatMap((d) => d.stops);
  if (misplaced.length === 0) return false;

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < misplaced.length; i++) {
      await tx.tripPlanStop.update({
        where: { id: misplaced[i].id },
        data: { tripPlanDayId: day1.id, order: i },
      });
    }
    for (const d of trip.tripDays.slice(1)) {
      const count = await tx.tripPlanStop.count({ where: { tripPlanDayId: d.id } });
      if (count === 0) await tx.tripPlanDay.delete({ where: { id: d.id } });
    }
    const remainingDays = await tx.tripPlanDay.count({ where: { tripPlanId: tripId } });
    await tx.tripPlan.update({ where: { id: tripId }, data: { days: remainingDays } });
  });
  return true;
}

const NON_FAMILY_FRIENDLY_KEYWORDS = ['bar', 'pub', 'nightclub', 'nightlife', 'casino'];
const FOOD_KEYWORDS = ['restaurant', 'market', 'street food', 'cafe', 'food'];
const NATURE_KEYWORDS = ['waterfall', 'lake', 'park', 'wildlife', 'beach', 'garden'];
const HERITAGE_KEYWORDS = ['fort', 'palace', 'monument', 'museum', 'temple'];

function strategyMultiplier(strategy: string, place: { category: string; tags: string[]; rating: number | null; popularityScore: number | null; ticketPrice: unknown }): number {
  const cat = (place.category || '').toLowerCase();
  const tags = (place.tags || []).map((t) => t.toLowerCase());
  const hasAny = (keywords: string[]) => keywords.some((k) => cat.includes(k) || tags.some((t) => t.includes(k)));

  switch (strategy) {
    case 'budget': {
      const fee = parseEntryFee(place.ticketPrice);
      return fee && fee > 200 ? 1.5 : 0.85;
    }
    case 'family':
      return hasAny(NON_FAMILY_FRIENDLY_KEYWORDS) ? 1.6 : 0.9;
    case 'food':
      return hasAny(FOOD_KEYWORDS) ? 0.7 : 1.1;
    case 'heritage':
      return hasAny(HERITAGE_KEYWORDS) ? 0.7 : 1.15;
    case 'nature':
      return hasAny(NATURE_KEYWORDS) ? 0.7 : 1.15;
    case 'instagram':
      return (place.popularityScore ?? 0) > 60 ? 0.7 : 1.1;
    case 'scenic':
      return hasAny(NATURE_KEYWORDS) ? 0.8 : 1.15;
    case 'fastest':
      return 0.8;
    case 'shortest':
    default:
      return 1;
  }
}

type AccessLevel = 'view' | 'edit' | 'owner';

async function assertTripAccess(tripId: string, userId: string, level: AccessLevel = 'edit') {
  const trip = await prismaTrip.findUnique({
    where: { id: tripId },
    include: { collaborators: { where: { userId } } },
  });
  if (!trip) throw new ApiError(404, 'Trip not found');

  const isOwner = trip.userId === userId;
  const collab = trip.collaborators[0];

  // Non-leaking: an inaccessible trip is indistinguishable from a missing one.
  if (!isOwner && !collab) throw new ApiError(404, 'Trip not found');
  if (level === 'owner' && !isOwner) throw new ApiError(403, 'Only the trip owner can perform this action');
  if (level === 'edit' && !isOwner && collab?.role === 'VIEWER') throw new ApiError(403, 'Viewers cannot modify this trip');

  return trip;
}

async function getTripIdForDay(dayId: string): Promise<string> {
  const day = await prismaDay.findUnique({ where: { id: dayId }, select: { tripPlanId: true } });
  if (!day) throw new ApiError(404, 'Trip day not found');
  return day.tripPlanId;
}

async function getTripIdForStop(stopId: string): Promise<{ tripId: string; dayId: string; order: number }> {
  const stop = await prismaStop.findUnique({ where: { id: stopId }, select: { tripPlanDayId: true, order: true, tripPlanDay: { select: { tripPlanId: true } } } });
  if (!stop) throw new ApiError(404, 'Stop not found');
  return { tripId: stop.tripPlanDay.tripPlanId, dayId: stop.tripPlanDayId, order: stop.order };
}

const TRIP_INCLUDE = {
  tripDays: {
    orderBy: { dayNumber: 'asc' as const },
    include: {
      _count: { select: { stops: true } },
      stops: {
        orderBy: { order: 'asc' as const },
        include: {
          place: {
            select: {
              id: true, name: true, slug: true, description: true,
              latitude: true, longitude: true, category: true, tags: true,
              images: true, thumbnail: true, city: true, state: true,
              rating: true, reviewCount: true, openingHours: true,
              ticketPrice: true, bestTimeToVisit: true, estimatedDurationMinutes: true,
              recommendedDuration: true,
            },
          },
        },
      },
    },
  },
  collaborators: {
    include: {
      user: { select: { id: true, name: true, avatar: true, avatarStyle: true } },
    },
  },
  user: { select: { id: true, name: true, avatar: true, avatarStyle: true } },
};

/** List/history payload: all days with stop counts, plus one cover stop per day. */
const LIST_TRIP_INCLUDE = {
  tripDays: {
    orderBy: { dayNumber: 'asc' as const },
    include: {
      _count: { select: { stops: true } },
      stops: {
        take: 1,
        orderBy: { order: 'asc' as const },
        include: { place: { select: { images: true, thumbnail: true, name: true, city: true } } },
      },
    },
  },
  _count: { select: { tripDays: true, collaborators: true } },
  user: { select: { id: true, name: true, avatar: true } },
} as const;

function withListStopsCount<T extends { tripDays?: Array<{ _count?: { stops?: number } }> }>(trip: T) {
  const stopsCount = (trip.tripDays || []).reduce(
    (sum, day) => sum + (day._count?.stops || 0),
    0,
  );
  return { ...trip, stopsCount };
}

export interface AiGenerateInput {
  tripId?: string;
  destination: string;
  days: number;
  pace: TravelPace;
  travelers: string;
  budget: 'LOW' | 'MEDIUM' | 'HIGH' | 'CUSTOM';
  customBudgetAmount?: number;
  interests: string[];
  timePreference?: TimePreference;
  avoid: AvoidOption[];
  prompt?: string;
  manualPlaceIds: string[];
  fillWithAi?: boolean;
  startDate?: string;
  transportation?: string[];
  /** Regenerate only this day (1-based); pinned stops are preserved. */
  regenerateDayNumber?: number;
  /** Force a fresh plan instead of the 5-minute generation cache. */
  refresh?: boolean;
  /** Cycles which area opens the trip. 0 = original; 1+ = alternatives. */
  variationSeed?: number;
}

// ---------------------------------------------------------------------------
// Canonical planner (Phase 3) — flag, reconstruction, helpers
// ---------------------------------------------------------------------------

let canonicalOverride: boolean | null = null;

/** Test seam: switch the canonical engine flag at runtime without env reload. */
export function setCanonicalItineraryEnabledForTesting(value: boolean | null): void {
  canonicalOverride = value;
}

export function isCanonicalItineraryEnabled(): boolean {
  return canonicalOverride ?? env.canonicalItineraryEnabled;
}

function stateForReconstruction(
  id: string,
  intent: ItineraryIntent,
  persistedPinned: boolean,
): PlaceState {
  return {
    selected: intent.selectedPlaceIds.includes(id),
    pinned: intent.pinnedPlaceIds.includes(id) || persistedPinned,
    lockedPosition: intent.lockedPlaceIds.includes(id),
    fixedTime: intent.fixedTimePlaces.some((f) => f.placeId === id),
    priorityAnchor: intent.planningMode === 'AI_BUILD' && intent.priorityPlaceIds.includes(id),
    complementary: false,
    optional: false,
  };
}

/**
 * Rebuild the current ItineraryCandidate from persisted TripPlan rows so a
 * single-day regeneration can keep the other days byte-for-byte.
 */
async function loadPersistedCandidate(
  tripId: string,
  intent: ItineraryIntent,
  travelerCount: number,
  date: Date | null,
): Promise<ItineraryCandidate | null> {
  const rows = await prismaTrip.findUnique({
    where: { id: tripId },
    include: {
      tripDays: {
        orderBy: { dayNumber: 'asc' },
        include: {
          stops: {
            orderBy: { order: 'asc' },
            include: { place: { select: PLACE_RECORD_SELECT } },
          },
        },
      },
    },
  });
  if (!rows || !rows.tripDays.length) return null;

  const enriched: EnrichedPlace[] = [];
  const byId = new Map<string, EnrichedPlace>();
  for (const day of rows.tripDays) {
    for (const s of day.stops) {
      if (!s.place) continue;
      const record = placeRecordFromRow(s.place as unknown as PlaceRow);
      const place = enrichPlace(record, {
        travelerCount: Math.max(1, travelerCount),
        date,
        state: stateForReconstruction(s.placeId, intent, s.isPinned),
      });
      if (!byId.has(s.placeId)) {
        byId.set(s.placeId, place);
        enriched.push(place);
      }
    }
  }
  if (enriched.length === 0) return null;

  const zones = buildZones(enriched, {
    includePlaceIds: [...intent.lockedPlaceIds, ...intent.pinnedPlaceIds],
  });
  const zoneByPlaceId = zoneMapOf(enriched, zones);

  const days: PlanDay[] = rows.tripDays
    .map((day) => {
      const stops: ScheduledStop[] = [];
      const sequence: EnrichedPlace[] = [];
      let firstStart: number | null = null;
      let lastEnd: number | null = null;
      let visit = 0;
      for (const s of day.stops) {
        const place = byId.get(s.placeId);
        if (!place) continue;
        const start = minutesFromTimeString(s.startTime) ?? 0;
        const end = minutesFromTimeString(s.endTime) ?? start + Math.max(30, s.duration ?? 60);
        if (s.duration && s.duration > 0) visit += s.duration;
        if (firstStart == null) firstStart = start;
        lastEnd = end;
        const spec = intent.fixedTimePlaces.find((f) => f.placeId === s.placeId);
        stops.push({
          placeId: s.placeId,
          order: s.order,
          dayNumber: day.dayNumber,
          startMinutes: start,
          endMinutes: end,
          travelFromPrevMinutes: 0,
          distanceFromPrevKm: s.distanceFromPrev ?? 0,
          fixedTimeAnchor: !!spec && spec.startMinutes === start,
          openingHoursRespected: true,
          warnings: [],
        });
        sequence.push(place);
      }
      if (stops.length === 0) return null;
      const zoneIds = [
        ...new Set(sequence.map((p) => zoneByPlaceId.get(p.id)).filter((z): z is string => !!z)),
      ];
      const total = lastEnd != null && firstStart != null && firstStart < lastEnd
        ? lastEnd - firstStart
        : visit;
      return {
        dayNumber: day.dayNumber,
        zoneIds,
        placeIds: stops.map((s) => s.placeId),
        sequence,
        stops,
        totalMinutes: Math.max(visit, total),
        visitMinutes: visit,
        travelMinutes: Math.max(0, Math.max(visit, total) - visit),
        detourIndex: 0,
        openingHoursFeasible: true,
        warnings: [],
      } as PlanDay;
    })
    .filter((d): d is PlanDay => !!d);

  if (days.length === 0) return null;
  const allStops = days.flatMap((d) => d.stops).sort((a, b) => a.dayNumber - b.dayNumber || a.order - b.order);

  return {
    id: `${tripId}-persisted`,
    meta: { strategy: 'MIXED', variation: 0, label: 'persisted', description: 'Previously saved itinerary' },
    days,
    allStops,
    allStopIds: allStops.map((s) => s.placeId),
    zoneByPlaceId,
    constraintResult: { feasible: true, hardViolations: [], softWarnings: [], suggestedRepairs: [], validationWarnings: [] },
    quality: null,
    warnings: [],
    isRejected: false,
    rejectionReasons: [],
  };
}

/** Dominant-area label for a planned day (used as the persisted day theme). */
function themeForDay(day: PlanDay, zones: Zone[], poolById: Map<string, EnrichedPlace>): string | null {
  const candidates = zones.filter((z) => day.zoneIds.includes(z.id));
  if (candidates.length === 0) return null;
  let best: Zone | null = null;
  let bestCount = 0;
  for (const z of candidates) {
    const count = day.placeIds.filter((id) => z.placeIds.includes(id)).length;
    if (count > bestCount) {
      best = z;
      bestCount = count;
    }
  }
  if (!best) return null;
  return zoneAreaLabel(best, poolById);
}

export const tripsService = {
  async create(data: any, userId: string) {
    const days = data.startDate && data.endDate
      ? Math.max(1, Math.ceil((new Date(data.endDate).getTime() - new Date(data.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1)
      : 1;

    const trip = await prismaTrip.create({
      data: {
        title: data.title,
        description: data.description,
        destination: data.destination,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        userId,
        days,
        travelers: data.travelers || 'SOLO',
        transportation: data.transportation || [],
        budget: data.budget || 'MEDIUM',
        accommodation: data.accommodation,
        interests: data.interests || [],
        coverImage: data.coverImage,
        status: 'DRAFT',
        pace: data.pace || 'BALANCED',
        timePreference: data.timePreference,
        avoid: data.avoid || [],
        tripDays: {
          create: Array.from({ length: days }, (_, i) => ({
            dayNumber: i + 1,
            date: data.startDate ? new Date(new Date(data.startDate).getTime() + i * 86400000) : undefined,
          })),
        },
      },
      include: TRIP_INCLUDE,
    });

    return trip;
  },

  async list(userId: string, query: any) {
    const { status } = query;
    const params = getPaginationParams(query);

    const where: any = {
      userId,
      ...(status && { status }),
    };

    const [data, total] = await Promise.all([
      prismaTrip.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: params.skip,
        take: params.limit,
        include: LIST_TRIP_INCLUDE,
      }),
      prismaTrip.count({ where }),
    ]);

    return paginatedResponse(data.map(withListStopsCount), total, params);
  },

  async getById(id: string, userId: string): Promise<any> {
    const trip = await prismaTrip.findFirst({
      where: {
        id,
        OR: [
          { userId },
          { collaborators: { some: { userId } } },
        ],
      },
      include: TRIP_INCLUDE,
    });

    if (!trip) {
      throw new ApiError(404, 'Trip not found');
    }

    if (trip.status === 'DRAFT') {
      const consolidated = await maybeConsolidateManualDraftStops(trip.id);
      if (consolidated) {
        return this.getById(id, userId);
      }
    }

    return trip;
  },

  async update(id: string, data: any, userId: string) {
    const trip = await assertTripAccess(id, userId, 'edit');

    const updateData: any = { ...data };
    if (data.startDate) updateData.startDate = new Date(data.startDate);
    if (data.endDate) updateData.endDate = new Date(data.endDate);

    let newDays: number | undefined = data.days;
    if (data.startDate || data.endDate) {
      const start = data.startDate ? new Date(data.startDate) : trip.startDate;
      const end = data.endDate ? new Date(data.endDate) : trip.endDate;
      if (start && end) {
        newDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
      }
    }

    return prisma.$transaction(async (tx) => {
      if (typeof newDays === 'number') {
        const existingDays = await tx.tripPlanDay.findMany({
          where: { tripPlanId: id },
          include: { _count: { select: { stops: true } } },
          orderBy: { dayNumber: 'asc' },
        });

        if (newDays > existingDays.length) {
          const startBase = updateData.startDate ?? trip.startDate;
          await tx.tripPlanDay.createMany({
            data: Array.from({ length: newDays - existingDays.length }, (_, i) => ({
              tripPlanId: id,
              dayNumber: existingDays.length + i + 1,
              date: startBase ? new Date(new Date(startBase).getTime() + (existingDays.length + i) * 86400000) : undefined,
            })),
          });
          updateData.days = newDays;
        } else if (newDays < existingDays.length) {
          const trailing = existingDays.filter((d) => d.dayNumber > newDays!);
          const deletable = trailing.filter((d) => d._count.stops === 0);
          if (deletable.length > 0) {
            await tx.tripPlanDay.deleteMany({ where: { id: { in: deletable.map((d) => d.id) } } });
          }
          // Days with stops are never silently dropped — final count reflects what actually remains.
          updateData.days = Math.max(newDays, existingDays.length - deletable.length);
        } else {
          updateData.days = newDays;
        }
      }

      return tx.tripPlan.update({
        where: { id },
        data: updateData,
        include: TRIP_INCLUDE,
      });
    });
  },

  async delete(id: string, userId: string) {
    const trip = await prismaTrip.findFirst({ where: { id, userId } });
    if (!trip) throw new ApiError(404, 'Trip not found or unauthorized');

    // AiGenerationLog.tripPlanId has no onDelete Cascade — null FKs first (no schema change).
    await prisma.$transaction(async (tx) => {
      await tx.aiGenerationLog.updateMany({
        where: { tripPlanId: id },
        data: { tripPlanId: null },
      });
      await tx.tripPlan.delete({ where: { id } });
    });
  },

  async duplicate(id: string, userId: string) {
    const trip = await prismaTrip.findFirst({
      where: { id, userId },
      include: { tripDays: { include: { stops: true } } },
    });
    if (!trip) throw new ApiError(404, 'Trip not found or unauthorized');

    const { id: _id, createdAt: _c, updatedAt: _u, aiPreferences, ...tripData } = trip || {};

    const newTrip = await prismaTrip.create({
      data: {
        ...tripData,
        aiPreferences: aiPreferences ?? undefined,
        title: `${trip.title} (Copy)`,
        status: 'DRAFT',
        tripDays: {
          create: trip.tripDays.map(day => ({
            dayNumber: day.dayNumber,
            date: day.date,
            theme: day.theme,
            stops: {
              create: day.stops.map(stop => ({
                placeId: stop.placeId,
                order: stop.order,
                startTime: stop.startTime,
                endTime: stop.endTime,
                duration: stop.duration,
                cost: stop.cost,
                entryFee: stop.entryFee,
                distanceFromPrev: stop.distanceFromPrev,
                transportMode: stop.transportMode,
                timeSlot: stop.timeSlot,
                notes: stop.notes,
                reason: stop.reason,
                isPinned: stop.isPinned,
              })),
            },
          })),
        },
      },
      include: TRIP_INCLUDE,
    });

    return newTrip;
  },

  async addStop(dayId: string, data: any, userId: string) {
    const tripId = await getTripIdForDay(dayId);
    await assertTripAccess(tripId, userId, 'edit');

    const resolved = await resolvePlace(data.placeId);
    const placeCity = await prisma.place.findUnique({
      where: { id: resolved.id },
      select: { city: true, state: true },
    });
    const tripCity = await prismaTrip.findUnique({
      where: { id: tripId },
      select: TRIP_CITY_SELECT,
    });
    if (tripCity && placeCity) {
      assertTripAcceptsPlace(tripCity, placeCity);
    }

    const existing = await prismaStop.findFirst({ where: { tripPlanDayId: dayId, placeId: resolved.id } });
    if (existing) throw new ApiError(409, 'This place is already added to that day');

    const maxOrder = await prismaStop.findFirst({
      where: { tripPlanDayId: dayId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    const stop = await prismaStop.create({
      data: {
        tripPlanDayId: dayId,
        placeId: resolved.id,
        order: data.order ?? (maxOrder ? maxOrder.order + 1 : 0),
        startTime: data.startTime,
        endTime: data.endTime,
        duration: data.duration,
        cost: data.cost,
        entryFee: data.entryFee,
        distanceFromPrev: data.distanceFromPrev,
        transportMode: data.transportMode,
        timeSlot: data.timeSlot,
        notes: data.notes,
        reason: data.reason,
        isPinned: data.isPinned ?? true,
      },
      include: {
        place: {
          select: {
            id: true, name: true, slug: true, latitude: true, longitude: true,
            category: true, images: true, thumbnail: true, city: true, state: true,
            rating: true, reviewCount: true, openingHours: true, ticketPrice: true,
          },
        },
      },
    });

    return stop;
  },

  async updateStop(id: string, data: any, userId: string) {
    const { tripId } = await getTripIdForStop(id);
    await assertTripAccess(tripId, userId, 'edit');

    return prismaStop.update({
      where: { id },
      data,
      include: {
        place: {
          select: {
            id: true, name: true, slug: true, latitude: true, longitude: true,
            category: true, images: true, thumbnail: true, city: true, state: true,
            rating: true, reviewCount: true,
          },
        },
      },
    });
  },

  async deleteStop(id: string, userId: string) {
    const { tripId, dayId, order } = await getTripIdForStop(id);
    await assertTripAccess(tripId, userId, 'edit');

    await prisma.$transaction(async (tx) => {
      await tx.tripPlanStop.delete({ where: { id } });
      await tx.tripPlanStop.updateMany({
        where: { tripPlanDayId: dayId, order: { gt: order } },
        data: { order: { decrement: 1 } },
      });
      const remaining = await tx.tripPlanStop.findMany({
        where: { tripPlanDayId: dayId },
        orderBy: { order: 'asc' },
        select: { id: true },
      });
      await persistConsecutiveDistances(tx, remaining.map((s) => s.id));
    });
  },

  async reorderStops(dayId: string, stopIds: string[], userId: string) {
    if (!Array.isArray(stopIds) || stopIds.length === 0) {
      throw new ApiError(400, 'stopIds must be a non-empty array');
    }
    if (new Set(stopIds).size !== stopIds.length) {
      throw new ApiError(400, 'stopIds must not contain duplicates');
    }

    const tripId = await getTripIdForDay(dayId);
    await assertTripAccess(tripId, userId, 'edit');

    return prisma.$transaction(async (tx) => {
      const existing = await tx.tripPlanStop.findMany({
        where: { tripPlanDayId: dayId },
        select: { id: true },
      });
      const allowed = new Set(existing.map((s) => s.id));
      if (stopIds.length !== existing.length || stopIds.some((id) => !allowed.has(id))) {
        throw new ApiError(400, 'Invalid stop order');
      }

      const ordered = await Promise.all(
        stopIds.map((id, index) => tx.tripPlanStop.update({ where: { id }, data: { order: index } })),
      );
      await persistConsecutiveDistances(tx, stopIds);
      return ordered;
    });
  },

  async generateItinerary(tripId: string, pace: string, userId: string, _startLocation?: { latitude: number; longitude: number }) {
    await assertTripAccess(tripId, userId, 'edit');

    const trip = await prismaTrip.findUnique({
      where: { id: tripId },
      include: {
        tripDays: {
          orderBy: { dayNumber: 'asc' },
          include: { stops: { orderBy: { order: 'asc' }, include: { place: true } } },
        },
      },
    });
    if (!trip) throw new ApiError(404, 'Trip not found');

    const maxMinPerDay = pace === 'relaxed' ? 480 : pace === 'fast' ? 360 : 420;
    const baseTimes: Record<string, number> = {
      sunrise: 330, morning: 480, afternoon: 780, evening: 1020, sunset: 1050, night: 1140,
    };
    const timeSlotOrder = ['sunrise', 'morning', 'afternoon', 'evening', 'sunset', 'night'];

    const updates: { id: string; data: any }[] = [];

    for (const day of trip.tripDays) {
      const places = day.stops.map(s => s.place).filter(p => p.latitude && p.longitude);
      if (places.length === 0) continue;

      const timeSlots: Record<string, typeof places> = {};
      places.forEach(p => {
        const slot = (p.bestTimeToVisit as any)?.timeOfDay || 'morning';
        if (!timeSlots[slot]) timeSlots[slot] = [];
        timeSlots[slot].push(p);
      });

      let currentOrder = 0;
      let dayMinutes = 0;

      for (const slot of timeSlotOrder) {
        const slotPlaces = timeSlots[slot];
        if (!slotPlaces?.length) continue;

        let currentMinutes = baseTimes[slot] || 480;

        for (const place of slotPlaces) {
          const duration = estimateDurationMinutes(place);
          if (dayMinutes + duration > maxMinPerDay) break;

          const stop = day.stops.find(s => s.placeId === place.id);
          if (!stop) continue;

          const prevPlace = currentOrder > 0
            ? day.stops.find(s => s.order === currentOrder - 1)?.place
            : null;

          let distFromPrev: number | null = null;
          if (currentOrder > 0 && prevPlace && prevPlace.latitude && prevPlace.longitude && place.latitude && place.longitude) {
            distFromPrev = roundKm(calcDistance(prevPlace.latitude, prevPlace.longitude, place.latitude, place.longitude));
          }

          const openState = isPlaceOpenAt(place.openingHours, day.date, currentMinutes % 1440);
          const effectiveSlot = openState === false ? slot : slot; // unknown/open -> keep; closed -> flagged below but never dropped

          const endMinutes = currentMinutes + duration;
          const startTimeStr = `${Math.floor(currentMinutes / 60).toString().padStart(2, '0')}:${(currentMinutes % 60).toString().padStart(2, '0')}`;
          const endTimeStr = `${Math.floor(endMinutes / 60).toString().padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`;

          updates.push({
            id: stop.id,
            data: {
              order: currentOrder,
              startTime: startTimeStr,
              endTime: endTimeStr,
              duration,
              distanceFromPrev: distFromPrev ?? undefined,
              timeSlot: effectiveSlot.toUpperCase(),
              entryFee: parseEntryFee(place.ticketPrice) ?? undefined,
            },
          });

          currentMinutes = endMinutes + 10;
          currentOrder++;
          dayMinutes += duration + 10;
        }
      }
    }

    await prisma.$transaction([
      ...updates.map((u) => prismaStop.update({ where: { id: u.id }, data: u.data })),
      prismaTrip.update({ where: { id: tripId }, data: { status: 'UPCOMING' } }),
    ]);

    const totalDistance = await this.calculateTotalDistance(tripId);
    const totalTime = await this.calculateTotalTime(tripId);
    await prismaTrip.update({ where: { id: tripId }, data: { totalDistance, totalTravelTime: totalTime } });

    return this.getById(tripId, trip.userId);
  },

  async optimizeRoute(tripId: string, strategy: string, userId: string, startLocation?: { latitude: number; longitude: number }) {
    await assertTripAccess(tripId, userId, 'edit');

    const trip = await prismaTrip.findUnique({
      where: { id: tripId },
      include: {
        tripDays: {
          orderBy: { dayNumber: 'asc' },
          include: { stops: { orderBy: { order: 'asc' }, include: { place: true } } },
        },
      },
    });
    if (!trip) throw new ApiError(404, 'Trip not found');

    // Flatten every stop the user saved from the map — self-build and AI both need a full timed plan.
    const allStops = trip.tripDays.flatMap((d) => d.stops);
    if (allStops.length === 0) {
      throw new ApiError(422, 'Add at least one place from the map before optimizing.');
    }

    const stopsWithCoords = allStops.filter((s) => s.place?.latitude && s.place?.longitude);
    const withoutCoords = allStops.filter((s) => !s.place?.latitude || !s.place?.longitude);

    let orderedStopIds: string[];
    if (stopsWithCoords.length >= 2) {
      const start = startLocation
        ? { latitude: startLocation.latitude, longitude: startLocation.longitude }
        : { latitude: stopsWithCoords[0].place.latitude!, longitude: stopsWithCoords[0].place.longitude! };

      const remaining = stopsWithCoords.map((s) => ({
        id: s.id,
        latitude: s.place.latitude!,
        longitude: s.place.longitude!,
        weight: strategyMultiplier(strategy, s.place),
      }));
      const ordered: typeof remaining = [];
      let curLat = start.latitude;
      let curLng = start.longitude;
      while (remaining.length > 0) {
        let bestIdx = 0;
        let bestScore = Infinity;
        for (let i = 0; i < remaining.length; i++) {
          const dist = calcDistance(curLat, curLng, remaining[i].latitude, remaining[i].longitude);
          const score = dist * remaining[i].weight;
          if (score < bestScore) {
            bestScore = score;
            bestIdx = i;
          }
        }
        const [chosen] = remaining.splice(bestIdx, 1);
        ordered.push(chosen);
        curLat = chosen.latitude;
        curLng = chosen.longitude;
      }

      const improved = twoOptImprove(nearestNeighborOrder(ordered, start), start);
      orderedStopIds = [...improved.map((s) => s.id), ...withoutCoords.map((s) => s.id)];
    } else {
      orderedStopIds = allStops.map((s) => s.id);
    }

    const durationByStopId = new Map(
      allStops.map((s) => [s.id, Math.max(30, estimateDurationMinutes(s.place as any))]),
    );
    const dayBuckets = packStopsIntoDayBuckets(orderedStopIds, durationByStopId, 'moderate');
    const stopById = new Map(allStops.map((s) => [s.id, s]));

    await prisma.$transaction(async (tx) => {
      // Ensure we have one day row per packed bucket.
      const existingDays = [...trip.tripDays].sort((a, b) => a.dayNumber - b.dayNumber);
      const dayRows: { id: string; dayNumber: number }[] = [];

      for (let i = 0; i < dayBuckets.length; i++) {
        const dayNumber = i + 1;
        if (existingDays[i]) {
          dayRows.push({ id: existingDays[i].id, dayNumber });
          if (existingDays[i].dayNumber !== dayNumber) {
            await tx.tripPlanDay.update({ where: { id: existingDays[i].id }, data: { dayNumber } });
          }
        } else {
          const created = await tx.tripPlanDay.create({
            data: { tripPlanId: tripId, dayNumber },
          });
          dayRows.push({ id: created.id, dayNumber });
        }
      }

      const stopUpdates: { id: string; data: Record<string, unknown> }[] = [];

      for (let dayIdx = 0; dayIdx < dayBuckets.length; dayIdx++) {
        const bucketIds = dayBuckets[dayIdx];
        const dayRow = dayRows[dayIdx];
        const syntheticDay = {
          stops: bucketIds.map((id) => stopById.get(id)!).filter(Boolean),
        };
        const scheduled = scheduleOrderedStopsForDay(syntheticDay, bucketIds, 'moderate', startLocation);

        for (const u of scheduled) {
          stopUpdates.push({
            id: u.id,
            data: {
              ...u.data,
              tripPlanDayId: dayRow.id,
            },
          });
        }
      }

      // Move + schedule every stop first, then remove days that no longer hold stops.
      for (const u of stopUpdates) {
        await tx.tripPlanStop.update({ where: { id: u.id }, data: u.data as any });
      }

      for (let i = dayBuckets.length; i < existingDays.length; i++) {
        const leftover = existingDays[i];
        const remaining = await tx.tripPlanStop.count({ where: { tripPlanDayId: leftover.id } });
        if (remaining === 0) {
          await tx.tripPlanDay.delete({ where: { id: leftover.id } });
        }
      }

      await tx.tripPlan.update({
        where: { id: tripId },
        data: {
          status: 'UPCOMING',
          days: dayBuckets.length,
          generationSource: trip.generationSource === 'AI_PROMPT' ? trip.generationSource : 'MANUAL',
        },
      });
    });

    const totalDistance = await this.calculateTotalDistance(tripId);
    const totalTime = await this.calculateTotalTime(tripId);
    await prismaTrip.update({ where: { id: tripId }, data: { totalDistance, totalTravelTime: totalTime } });

    return this.getById(tripId, trip.userId);
  },

  async aiGenerate(userId: string, input: AiGenerateInput) {
    const isRefresh = !!input.refresh || !!input.regenerateDayNumber || (input.variationSeed != null && input.variationSeed > 0);
    const cacheKey = buildPlannerCacheKey(input);
    if (!isRefresh) {
      const cached = getCachedPlan(cacheKey);
      if (cached) {
        return cached as { trip: Awaited<ReturnType<typeof tripsService.getById>>; dayInfo: unknown; warnings: string[]; note: string; nearbyDestinations?: unknown };
      }
    }

    // Phase 3: when the canonical engine is enabled, /ai-generate delegates to
    // it (mode AI_BUILD). Legacy megafunction stays byte-for-byte when OFF.
    if (isCanonicalItineraryEnabled()) {
      const canonical = await this.canonicalPlan(userId, toCanonicalPlanRequest(input));
      if (!isRefresh) setCachedPlan(cacheKey, canonical);
      return canonical;
    }

    const startDate = input.startDate ? new Date(input.startDate) : null;
    const budgetTier = input.budget === 'CUSTOM' ? null : input.budget;
    const provider = env.geminiApiKey && process.env.ENABLE_GEMINI_ITINERARY_POLISH === 'true'
      ? 'gemini+algorithmic'
      : 'algorithmic';

    // Defensive defaults — never let null/undefined arrays crash generation.
    const interests = Array.isArray(input.interests) ? input.interests : [];
    const avoid = Array.isArray(input.avoid) ? input.avoid : [];
    const manualPlaceIds = Array.isArray(input.manualPlaceIds) ? input.manualPlaceIds : [];

    // Natural-language intent ("Make Day 2 less busy", "Start after 10 AM",
    // "Add more nature", "Remove Bhedaghat") -> structured engine params.
    // Deterministic parsing; explicit API fields still apply, text refines them.
    const intent = parseTripIntent(input.prompt);
    const effectivePace: TravelPace = intent.pace ?? input.pace;
    const mergedInterests = Array.from(new Set([...interests, ...intent.interests]));
    // "Make this trip cheaper" must actually bias selection toward lower-cost
    // places — even when the trip was created with a CUSTOM budget amount
    // (the amount keeps acting as a hard cap independently).
    const wantsCheaper = intent.budgetTier === 'LOW';
    const effectiveBudgetTier =
      input.budget === 'CUSTOM'
        ? (wantsCheaper ? ('LOW' as const) : null)
        : (intent.budgetTier ?? budgetTier);
    const effectiveTimePreference: TimePreference | null | undefined = intent.timePreference ?? input.timePreference;

    let existingTrip: { id: string } | null = null;
    let pinnedPlaceIds = [...manualPlaceIds];
    let excludePlaceIds: string[] = [];
    let avoidHubIds: string[] = [];
    let previousPlaceIds: string[] = [];
    const regenerateDayNumber = input.regenerateDayNumber;
    // Day-scoped NL request ("Make Day 2 less busy"): scope regeneration to
    // that day only when no explicit day was passed and no global intent
    // signal (pace/budget/time/interests) would be lost by scoping.
    let effectiveRegenerateDay = regenerateDayNumber;
    // Pace actually handed to the engine — equals the trip pace unless a
    // day-scoped NL pace overrides it for a single-day rebuild.
    let enginePace = effectivePace;

    if (input.tripId) {
      existingTrip = await assertTripAccess(input.tripId, userId, 'edit');
      const existingStops = await prismaStop.findMany({
        where: { tripPlanDay: { tripPlanId: input.tripId } },
        include: {
          tripPlanDay: { select: { dayNumber: true } },
          place: { select: { name: true } },
        },
      });
      previousPlaceIds = existingStops.map((s) => s.placeId);

      // "Remove X" / "Replace X" — resolve name hints against the user's own
      // trip stops so those places are dropped from the regenerated plan.
      const hintExcludedIds = new Set<string>();
      if (intent.removeHints.length > 0) {
        for (const stop of existingStops) {
          const name = (stop.place?.name || '').toLowerCase();
          if (!name) continue;
          if (intent.removeHints.some((hint) => name.includes(hint) || hint.includes(name))) {
            hintExcludedIds.add(stop.placeId);
          }
        }
        if (hintExcludedIds.size > 0) {
          excludePlaceIds = Array.from(new Set([...excludePlaceIds, ...hintExcludedIds]));
        }
      }

      // Day-scoped NL request ("Make Day 2 less busy"): scope regeneration to
      // that day only when no explicit day was passed and no global intent
      // signal (pace/budget/time/interests) would be lost by scoping.
      if (!effectiveRegenerateDay && intent.targetDayNumber && !hasGlobalIntentSignals(intent)) {
        effectiveRegenerateDay = intent.targetDayNumber;
        if (intent.dayScopedPace) {
          enginePace = intent.dayScopedPace;
        }
      }

      if (effectiveRegenerateDay) {
        const dayStops = existingStops.filter((s) => s.tripPlanDay.dayNumber === effectiveRegenerateDay);
        pinnedPlaceIds = Array.from(new Set([
          ...pinnedPlaceIds,
          ...dayStops.filter((s) => s.isPinned && !hintExcludedIds.has(s.placeId)).map((s) => s.placeId),
        ]));
        excludePlaceIds = Array.from(new Set([
          ...existingStops
            .filter((s) => s.tripPlanDay.dayNumber !== effectiveRegenerateDay || !s.isPinned)
            .map((s) => s.placeId),
          ...hintExcludedIds,
        ]));
      } else {
        const existingPinned = existingStops.filter((s) => s.isPinned && !hintExcludedIds.has(s.placeId));
        pinnedPlaceIds = Array.from(new Set([...pinnedPlaceIds, ...existingPinned.map((s) => s.placeId)]));
        if (isRefresh) {
          avoidHubIds = existingStops
            .filter((s) => s.tripPlanDay.dayNumber === 1)
            .map((s) => s.placeId);
        }
      }
    }

    if (input.budget === 'CUSTOM') {
      let persistedAmount: unknown;
      let prefs: unknown;
      if (input.tripId) {
        const row = await prismaTrip.findUnique({
          where: { id: input.tripId },
          select: { customBudgetAmount: true, aiPreferences: true },
        });
        persistedAmount = row?.customBudgetAmount;
        prefs = row?.aiPreferences;
      }
      const recovered = recoverCustomBudgetAmount({
        budget: input.budget,
        requestAmount: input.customBudgetAmount,
        persistedAmount,
        aiPreferences: prefs,
      });
      if (recovered == null) {
        throw new ApiError(400, 'customBudgetAmount is required when budget is CUSTOM');
      }
      input.customBudgetAmount = recovered;
    }

    const resolvedPinned: string[] = [];
    for (const idOrSlug of pinnedPlaceIds) {
      try {
        const resolved = await resolvePlace(idOrSlug);
        resolvedPinned.push(resolved.id);
      } catch {
        // Unknown place id/slug — skip gracefully, never fail the whole generation.
      }
    }

    // Canonicalize so "Bangalore" / "New Delhi" resolve to the same place catalog.
    const destination = formatDestinationLabel(
      canonicalizeDestination(input.destination) || input.destination,
    );

    // If the user selected many places, expand days so every pick can fit
    // without silently dropping pins under the pace cap.
    const paceStops = ({ QUICK: 7, BALANCED: 6, RELAXED: 5, VERY_RELAXED: 4 } as Record<string, number>)[effectivePace] || 6;
    const daysNeeded = resolvedPinned.length > 0
      ? Math.max(input.days, Math.ceil(resolvedPinned.length / paceStops))
      : input.days;
    const effectiveDays = Math.min(21, daysNeeded);
    // Align endDate with selected duration so UI date range matches days/nights.
    const endDate = startDate
      ? new Date(startDate.getTime() + (effectiveDays - 1) * 86400000)
      : null;

    let variationSeed = input.variationSeed ?? 0;
    if (isRefresh && variationSeed <= 0 && existingTrip) {
      try {
        variationSeed = await prisma.aiGenerationLog.count({
          where: { tripPlanId: existingTrip.id, success: true },
        });
      } catch {
        variationSeed = 1;
      }
      if (variationSeed <= 0) variationSeed = 1;
    }

    let plan;
    try {
      plan = await generateItineraryPlan({
        destination,
        days: effectiveDays,
        pace: enginePace,
        travelers: input.travelers,
        budgetTier: effectiveBudgetTier,
        customBudgetAmount: input.budget === 'CUSTOM' ? input.customBudgetAmount ?? null : null,
        interests: mergedInterests,
        timePreference: effectiveTimePreference,
        avoid,
        manualPlaceIds: resolvedPinned,
        fillWithAi: !!input.fillWithAi || !!effectiveRegenerateDay,
        prompt: input.prompt,
        startDate,
        transportation: input.transportation,
        regenerateDayNumber: effectiveRegenerateDay,
        excludePlaceIds,
        variationSeed,
        avoidHubIds,
        earliestStartMinutes: intent.earliestStartMinutes ?? null,
      });
      const samePlaces = (a: string[], b: string[]) => {
        if (a.length === 0 || a.length !== b.length) return false;
        const left = [...a].sort().join(',');
        const right = [...b].sort().join(',');
        return left === right;
      };
      if (
        isRefresh
        && !effectiveRegenerateDay
        && previousPlaceIds.length > 0
        && samePlaces(previousPlaceIds, plan.stops.map((s) => s.placeId))
        && variationSeed < 8
      ) {
        plan = await generateItineraryPlan({
          destination,
          days: effectiveDays,
          pace: enginePace,
          travelers: input.travelers,
          budgetTier: effectiveBudgetTier,
          customBudgetAmount: input.budget === 'CUSTOM' ? input.customBudgetAmount ?? null : null,
          interests: mergedInterests,
          timePreference: effectiveTimePreference,
          avoid,
          manualPlaceIds: resolvedPinned,
          fillWithAi: true,
          prompt: input.prompt,
          startDate,
          transportation: input.transportation,
          excludePlaceIds,
          variationSeed: variationSeed + 1,
          avoidHubIds: [...avoidHubIds, ...previousPlaceIds],
          earliestStartMinutes: intent.earliestStartMinutes ?? null,
        });
        variationSeed += 1;
      }
    } catch (err: any) {
      try {
        await prisma.aiGenerationLog.create({
          data: {
            userId, tripPlanId: existingTrip?.id, prompt: input as unknown as Prisma.InputJsonValue,
            rawPromptText: input.prompt, provider, success: false,
            errorMessage: err?.message || 'Unknown generation error',
          },
        });
      } catch (logErr) {
        logger.error({ err: logErr }, 'Failed to write AI generation failure log');
      }
      logger.error({ err, destination: input.destination, days: input.days }, 'Itinerary engine failed');
      const detail = typeof err?.message === 'string' && err.message.trim() ? err.message.trim() : '';
      throw new ApiError(
        502,
        detail && detail.length < 200
          ? `Failed to generate itinerary: ${detail}`
          : 'Failed to generate itinerary. Please try again.',
      );
    }

    if (plan.stops.length === 0) {
      try {
        await prisma.aiGenerationLog.create({
          data: {
            userId, tripPlanId: existingTrip?.id, prompt: input as unknown as Prisma.InputJsonValue,
            rawPromptText: input.prompt, provider, success: false,
            errorMessage: plan.note,
          },
        });
      } catch (logErr) {
        logger.error({ err: logErr }, 'Failed to write empty-plan AI generation log');
      }
      throw new ApiError(
        422,
        plan.note || `We couldn't find enough places for "${destination}". Try a different destination or broaden your interests.`,
        true,
        'INSUFFICIENT_PLACES',
        plan.nearbyDestinations?.length ? { nearbyDestinations: plan.nearbyDestinations } : undefined,
      );
    }

    let tripId: string;
    try {
      tripId = await prisma.$transaction(async (tx) => {
      let trip: { id: string };

      if (existingTrip) {
        await tx.tripPlan.update({
          where: { id: existingTrip.id },
          data: {
            destination,
            days: effectiveDays,
            pace: effectivePace,
            timePreference: effectiveTimePreference ?? undefined,
            avoid,
            estimatedBudget: plan.estimatedBudget,
            customBudgetAmount: input.budget === 'CUSTOM' ? input.customBudgetAmount ?? null : null,
            transportation: input.transportation || [],
            generationSource: resolvedPinned.length > 0 ? 'HYBRID' : 'AI_PROMPT',
            aiPrompt: input.prompt,
            aiPreferences: { ...input, variationSeed } as unknown as Prisma.InputJsonValue,
            generatedAt: new Date(),
            startDate: startDate ?? undefined,
            endDate: endDate ?? undefined,
            status: 'UPCOMING',
          },
        });
        trip = existingTrip;

        const existingDays = await tx.tripPlanDay.findMany({ where: { tripPlanId: trip.id }, orderBy: { dayNumber: 'asc' } });
        if (existingDays.length < effectiveDays) {
          await tx.tripPlanDay.createMany({
            data: Array.from({ length: effectiveDays - existingDays.length }, (_, i) => ({
              tripPlanId: trip.id,
              dayNumber: existingDays.length + i + 1,
              date: startDate ? new Date(startDate.getTime() + (existingDays.length + i) * 86400000) : undefined,
            })),
          });
        }

        if (effectiveRegenerateDay) {
          const targetDay = existingDays.find((d) => d.dayNumber === effectiveRegenerateDay)
            || (await tx.tripPlanDay.findFirst({ where: { tripPlanId: trip.id, dayNumber: effectiveRegenerateDay } }));
          if (targetDay) {
            await tx.tripPlanStop.deleteMany({
              where: { tripPlanDayId: targetDay.id, isPinned: false },
            });
          }
        } else {
          await tx.tripPlanStop.deleteMany({ where: { tripPlanDay: { tripPlanId: trip.id }, isPinned: false } });
        }
      } else {
        trip = await tx.tripPlan.create({
          data: {
            title: `${destination} Trip`,
            destination,
            userId,
            days: effectiveDays,
            travelers: input.travelers,
            interests: mergedInterests,
            transportation: input.transportation || [],
            budget: input.budget,
            pace: effectivePace,
            timePreference: effectiveTimePreference ?? null,
            avoid,
            estimatedBudget: plan.estimatedBudget,
            customBudgetAmount: input.budget === 'CUSTOM' ? input.customBudgetAmount ?? null : null,
            generationSource: resolvedPinned.length > 0 ? 'HYBRID' : 'AI_PROMPT',
            aiPrompt: input.prompt,
            aiPreferences: { ...input, variationSeed } as unknown as Prisma.InputJsonValue,
            generatedAt: new Date(),
            startDate,
            endDate,
            status: 'UPCOMING',
            tripDays: {
              create: Array.from({ length: effectiveDays }, (_, i) => ({
                dayNumber: i + 1,
                date: startDate ? new Date(startDate.getTime() + i * 86400000) : undefined,
              })),
            },
          },
        });
      }

      const days = await tx.tripPlanDay.findMany({ where: { tripPlanId: trip.id }, orderBy: { dayNumber: 'asc' } });
      const dayByNumber = new Map(days.map((d) => [d.dayNumber, d]));

      // Persist dynamic day themes from the engine (never leave stale city titles).
      for (const info of plan.dayInfo || []) {
        const day = dayByNumber.get(info.dayNumber);
        if (!day || !info.theme) continue;
        await tx.tripPlanDay.update({
          where: { id: day.id },
          data: { theme: info.theme },
        });
      }

      for (const stop of plan.stops) {
        const day = dayByNumber.get(stop.dayNumber);
        if (!day) continue;

        await tx.tripPlanStop.upsert({
          where: { tripPlanDayId_placeId: { tripPlanDayId: day.id, placeId: stop.placeId } },
          create: {
            tripPlanDayId: day.id,
            placeId: stop.placeId,
            order: stop.order,
            timeSlot: stop.timeSlot as TimeSlotKey,
            startTime: stop.startTime,
            endTime: stop.endTime,
            duration: stop.duration,
            cost: stop.cost ?? undefined,
            entryFee: stop.entryFee ?? undefined,
            distanceFromPrev: stop.distanceFromPrev ?? undefined,
            reason: stop.reason,
            isPinned: stop.isPinned,
          },
          update: {
            order: stop.order,
            timeSlot: stop.timeSlot as TimeSlotKey,
            startTime: stop.startTime,
            endTime: stop.endTime,
            duration: stop.duration,
            distanceFromPrev: stop.distanceFromPrev ?? undefined,
            reason: stop.reason,
          },
        });
      }

      return trip.id;
    }, { maxWait: 15_000, timeout: 30_000 });
    } catch (err: any) {
      logger.error({ err, destination: input.destination }, 'Failed to persist generated itinerary');
      throw new ApiError(502, 'Trip was planned but could not be saved. Please try again.');
    }

    try {
      const totalDistance = await this.calculateTotalDistance(tripId);
      await prismaTrip.update({ where: { id: tripId }, data: { totalDistance } });
    } catch (err) {
      logger.warn({ err, tripId }, 'Failed to update totalDistance after AI generate');
    }

    try {
      await prisma.aiGenerationLog.create({
        data: {
          userId, tripPlanId: tripId, prompt: input as unknown as Prisma.InputJsonValue,
          rawPromptText: input.prompt ?? null, provider, success: true,
        },
      });
    } catch (err) {
      logger.warn({ err, tripId }, 'Failed to write AI generation success log');
    }

    const trip = await this.getById(tripId, userId);

    // P1 honesty rule: a "cheaper" request that could not change anything must
    // say so instead of silently returning an identical itinerary.
    const sameStopSet =
      previousPlaceIds.length > 0
      && plan.stops.length === previousPlaceIds.length
      && [...plan.stops.map((s) => s.placeId)].sort().join('|') === [...previousPlaceIds].sort().join('|');
    const cheaperExplainedNoOp = wantsCheaper && sameStopSet;
    const CHEAPER_NO_OP_MESSAGE =
      'This itinerary is already close to the lowest-cost option for your selected preferences, so nothing needed to change.';
    const finalWarnings = cheaperExplainedNoOp ? [...plan.warnings, CHEAPER_NO_OP_MESSAGE] : plan.warnings;

    const result = {
      trip,
      dayInfo: plan.dayInfo,
      warnings: finalWarnings,
      note: cheaperExplainedNoOp ? CHEAPER_NO_OP_MESSAGE : plan.note,
      nearbyDestinations: plan.nearbyDestinations,
    };
    if (!isRefresh) setCachedPlan(cacheKey, result);
    return result;
  },

  // -----------------------------------------------------------------------
  // Phase 3 — canonical /plan orchestrator
  // -----------------------------------------------------------------------

  async canonicalPlan(userId: string, input: CanonicalPlanRequest) {
    const regen = input.regenerateDayNumber ?? null;
    const startDate = input.startDate ? new Date(input.startDate) : null;

    let existingTrip: { id: string } | null = null;
    if (input.tripId) {
      existingTrip = await assertTripAccess(input.tripId, userId, 'edit');
    }

    if (input.budget === 'CUSTOM') {
      let persistedAmount: unknown;
      let prefs: unknown;
      if (input.tripId) {
        const row = await prismaTrip.findUnique({
          where: { id: input.tripId },
          select: { customBudgetAmount: true, aiPreferences: true },
        });
        persistedAmount = row?.customBudgetAmount;
        prefs = row?.aiPreferences;
      }
      const recovered = recoverCustomBudgetAmount({
        budget: input.budget,
        requestAmount: input.customBudgetAmount,
        persistedAmount,
        aiPreferences: prefs,
      });
      if (recovered == null) {
        throw new ApiError(400, 'customBudgetAmount is required when budget is CUSTOM');
      }
      input.customBudgetAmount = recovered;
    }

    // Server-side place resolution — client existence/coords/travel times are never trusted.
    const placeableIds = Array.from(new Set([
      ...(input.selectedPlaceIds ?? []),
      ...(input.pinnedPlaceIds ?? []),
      ...(input.lockedPlaceIds ?? []),
      ...(input.fixedTimePlaces ?? []).map((f) => f.placeId),
    ]));
    const approvedRows = placeableIds.length
      ? await prisma.place.findMany({
          where: { id: { in: placeableIds }, status: APPROVED },
          select: PLACE_RECORD_SELECT,
        })
      : [];
    const approvedSet = new Set(approvedRows.map((r) => r.id));
    const missingPlaceable = placeableIds.filter((id) => !approvedSet.has(id));
    if (missingPlaceable.length > 0) {
      throw new ApiError(
        422,
        'Some requested places could not be found. Pick approved places in this destination and try again.',
        true,
        'PLACE_RESOLUTION_FAILED',
        { placeIds: missingPlaceable },
      );
    }

    // Phase 5: extract prompt-mentioned place names and resolve them against the
    // destination pool so the user gets the places they explicitly asked for.
    const destination = String(input.destination).trim();
    let promptResolvedIds: string[] = [];
    let promptWarnings: string[] = [];
    if (input.mode === 'AI_BUILD' && input.prompt) {
      const mentionCandidates = extractPlaceNameCandidates(input.prompt);
      if (mentionCandidates.length) {
        const destRows = await prismaPlaceStore.findApprovedByDestination(destination, { limit: 60 });
        const mentionResult = resolvePromptPlaceMentions(mentionCandidates, destRows);
        promptResolvedIds = mentionResult.placeIds;
        if (mentionResult.unresolved.length) {
          promptWarnings = [`I couldn't find places matching: ${mentionResult.unresolved.join(', ')} — skipped.`];
        }
      }
    }

    const raw = toRawPlanningInput(input, promptResolvedIds);
    const normalized = normalizeIntent(raw);
    if (!normalized.ok) {
      throw new ApiError(
        422,
        normalized.errors?.join('; ') || 'The planning request is invalid.',
        true,
        'INVALID_PLAN_REQUEST',
      );
    }

    const intent = normalized.intent;
    const date = startDate;

    const previousPlan =
      regen && existingTrip
        ? await loadPersistedCandidate(existingTrip.id, intent, intent.travelers, date)
        : null;

    const result = await planFromRaw(raw, prismaPlaceStore, {
      origin: input.origin ?? undefined,
      date,
      regenerateDayNumber: regen ?? undefined,
      previousPlan: previousPlan ?? undefined,
      variationSeed: input.variationSeed ?? 0,
    });

    const chosen = result.chosen;
    const placeById = new Map(result.regions.pool.map((p) => [p.id, p]));
    const zones = result.regions.zones;

    if (!result.ok || !chosen || !result.finalValidation?.feasible) {
      const poolEmpty = result.regions.pool.length === 0;
      const msg = result.messages?.[0]
        ?? (poolEmpty
          ? 'No places could be resolved for this request — nothing to plan.'
          : 'The trip could not be planned feasibly as requested.');
      throw new ApiError(
        422,
        msg,
        true,
        poolEmpty ? 'INSUFFICIENT_PLACES' : 'PLANNING_INFEASIBLE',
        {
          warnings: warningMessages(result.warnings),
          dropped: result.dropped?.map((d) => d.placeId),
          candidateStats: result.candidateStats,
        },
      );
    }

    const effectiveDays = chosen.days.length;
    const startDateObj = date;
    const endDate = (() => {
      if (input.endDate) return new Date(input.endDate);
      if (startDateObj) return new Date(startDateObj.getTime() + (effectiveDays - 1) * 86400000);
      return null;
    })();

    const pace = intent.pace as TravelPace;
    const interests = input.interests ?? [];
    const customBudgetAmount = input.budget === 'CUSTOM' ? (input.customBudgetAmount ?? null) : null;
    const generationSource = (() => {
      if (intent.planningMode === 'SELF_BUILD') return 'MANUAL' as const;
      return (input.selectedPlaceIds?.length ?? 0) > 0 ? 'HYBRID' as const : 'AI_PROMPT' as const;
    })();

    let tripId: string;
    try {
      tripId = await prisma.$transaction(async (tx) => {
        let trip: { id: string };

        if (existingTrip) {
          await tx.tripPlan.update({
            where: { id: existingTrip.id },
            data: {
              destination,
              days: effectiveDays,
              title: `${destination} Trip`,
              pace,
              travelers: input.travelers != null ? String(input.travelers) : 'SOLO',
              interests,
              transportation: input.transportation ?? [],
              avoid: (input.avoid ?? []) as AvoidOption[],
              timePreference: (input.timePreference ?? null) as TimePreference | null,
              budget: input.budget ?? null,
              customBudgetAmount,
              estimatedBudget: estimatedBudgetOf(placeById, chosen.allStopIds),
              generationSource,
              aiPrompt: input.prompt ?? null,
              aiPreferences: { ...input, plannerVersion: 'canonical-v1' } as unknown as Prisma.InputJsonValue,
              generatedAt: new Date(),
              startDate: startDateObj ?? undefined,
              endDate: endDate ?? undefined,
              status: 'UPCOMING',
            },
          });
          trip = existingTrip;

          const existingDays = await tx.tripPlanDay.findMany({
            where: { tripPlanId: trip.id },
            orderBy: { dayNumber: 'asc' },
          });
          if (existingDays.length < effectiveDays) {
            await tx.tripPlanDay.createMany({
              data: Array.from({ length: effectiveDays - existingDays.length }, (_, i) => ({
                tripPlanId: trip.id,
                dayNumber: existingDays.length + i + 1,
                date: startDateObj ? new Date(startDateObj.getTime() + (existingDays.length + i) * 86400000) : undefined,
              })),
            });
          }

          if (regen) {
            const targetDay = existingDays.find((d) => d.dayNumber === regen)
              ?? (await tx.tripPlanDay.findFirst({ where: { tripPlanId: trip.id, dayNumber: regen } }));
            if (targetDay) {
              await tx.tripPlanStop.deleteMany({ where: { tripPlanDayId: targetDay.id, isPinned: false } });
            }
          } else {
            await tx.tripPlanStop.deleteMany({
              where: { tripPlanDay: { tripPlanId: trip.id }, isPinned: false },
            });
          }
        } else {
          trip = await tx.tripPlan.create({
            data: {
              title: `${destination} Trip`,
              destination,
              userId,
              days: effectiveDays,
              travelers: input.travelers != null ? String(input.travelers) : 'SOLO',
              interests,
              transportation: input.transportation ?? [],
              avoid: (input.avoid ?? []) as AvoidOption[],
              timePreference: (input.timePreference ?? null) as TimePreference | null,
              budget: input.budget ?? null,
              customBudgetAmount,
              pace,
              estimatedBudget: estimatedBudgetOf(placeById, chosen.allStopIds),
              generationSource,
              aiPrompt: input.prompt ?? null,
              aiPreferences: { ...input, plannerVersion: 'canonical-v1' } as unknown as Prisma.InputJsonValue,
              generatedAt: new Date(),
              startDate: startDateObj,
              endDate,
              status: 'UPCOMING',
              tripDays: {
                create: Array.from({ length: effectiveDays }, (_, i) => ({
                  dayNumber: i + 1,
                  date: startDateObj ? new Date(startDateObj.getTime() + i * 86400000) : undefined,
                })),
              },
            },
          });
        }

        const days = await tx.tripPlanDay.findMany({
          where: { tripPlanId: trip.id },
          orderBy: { dayNumber: 'asc' },
        });
        const dayByNumber = new Map(days.map((d) => [d.dayNumber, d]));

        for (const day of chosen.days) {
          const dayRow = dayByNumber.get(day.dayNumber);
          if (!dayRow) continue;

          const theme = themeForDay(day, zones, placeById);
          if (theme && theme !== dayRow.theme) {
            await tx.tripPlanDay.update({ where: { id: dayRow.id }, data: { theme } });
          }

          for (const write of plannedDayToWrites(day, intent, placeById, destination)) {
            await tx.tripPlanStop.upsert({
              where: { tripPlanDayId_placeId: { tripPlanDayId: dayRow.id, placeId: write.placeId } },
              create: {
                tripPlanDayId: dayRow.id,
                placeId: write.placeId,
                order: write.order,
                timeSlot: write.timeSlot,
                startTime: write.startTime,
                endTime: write.endTime,
                duration: write.duration,
                entryFee: write.entryFee ?? undefined,
                distanceFromPrev: write.distanceFromPrev ?? undefined,
                reason: write.reason,
                isPinned: write.isPinned,
              },
              update: {
                order: write.order,
                timeSlot: write.timeSlot,
                startTime: write.startTime,
                endTime: write.endTime,
                duration: write.duration,
                distanceFromPrev: write.distanceFromPrev ?? undefined,
                reason: write.reason,
                isPinned: write.isPinned,
              },
            });
          }
        }

        return trip.id;
      }, { maxWait: 15_000, timeout: 30_000 });
    } catch (err: any) {
      if (err instanceof ApiError) throw err;
      logger.error({ err, destination }, 'Failed to persist canonical plan');
      throw new ApiError(502, 'Trip was planned but could not be saved. Please try again.');
    }

    try {
      const totalDistance = await this.calculateTotalDistance(tripId);
      const totalTime = await this.calculateTotalTime(tripId);
      await prismaTrip.update({
        where: { id: tripId },
        data: { totalDistance, totalTravelTime: totalTime },
      });
    } catch (err) {
      logger.warn({ err, tripId }, 'Failed to update totals after canonical plan');
    }

    const trip = await this.getById(tripId, userId);

    const cleanedMessages = (result.messages || []).slice(0, 6).map((m) => m.trim()).filter(Boolean);
    const note = result.explanation?.summary
      || cleanedMessages[0]
      || `Planned ${chosen.days.length} day(s) with ${chosen.allStopIds.length} stops in ${destination}.`;
    const warnings = [...promptWarnings, ...warningMessages([...result.warnings, ...(result.finalValidation?.warnings ?? [])])];
    const dayExplanations = result.explanation?.dayDetails ?? [];
    const dayInfo = dayExplanations.map((d) => {
      const day = chosen.days.find((x) => x.dayNumber === d.dayNumber);
      return { dayNumber: d.dayNumber, theme: day ? themeForDay(day, zones, placeById) : null };
    });

    return {
      trip,
      explanation: result.explanation?.summary ?? note,
      dayExplanations,
      dayInfo,
      warnings,
      note,
      qualityScore: chosen.quality?.totalScore ?? null,
      candidateStats: result.candidateStats,
    };
  },

  async replaceStop(stopId: string, placeIdOrSlug: string, userId: string) {
    const { tripId, dayId } = await getTripIdForStop(stopId);
    await assertTripAccess(tripId, userId, 'edit');

    const resolved = await resolvePlace(placeIdOrSlug);
    const existing = await prismaStop.findFirst({
      where: { tripPlanDayId: dayId, placeId: resolved.id, NOT: { id: stopId } },
    });
    if (existing) throw new ApiError(409, 'This place is already on that day');

    const place = await prisma.place.findUnique({
      where: { id: resolved.id },
      select: {
        id: true, name: true, slug: true, latitude: true, longitude: true,
        category: true, images: true, thumbnail: true, city: true, state: true,
        rating: true, reviewCount: true, openingHours: true, ticketPrice: true,
        estimatedDurationMinutes: true, recommendedDuration: true, tags: true,
      },
    });
    if (!place) throw new ApiError(404, 'Place not found');

    const tripCity = await prismaTrip.findUnique({
      where: { id: tripId },
      select: TRIP_CITY_SELECT,
    });
    if (tripCity) {
      assertTripAcceptsPlace(tripCity, place);
    }

    const day = await prismaDay.findUnique({
      where: { id: dayId },
      include: { stops: { orderBy: { order: 'asc' }, include: { place: true } } },
    });
    if (!day) throw new ApiError(404, 'Trip day not found');

    const stop = day.stops.find((s) => s.id === stopId);
    if (!stop) throw new ApiError(404, 'Stop not found');

    await prismaStop.update({
      where: { id: stopId },
      data: {
        placeId: place.id,
        duration: estimateDurationMinutes(place),
        entryFee: parseEntryFee(place.ticketPrice) ?? undefined,
        reason: `Replaced with ${place.name} — verified place from PalSafar database.`,
      },
    });

    const updatedDay = await prismaDay.findUnique({
      where: { id: dayId },
      include: { stops: { orderBy: { order: 'asc' }, include: { place: true } } },
    });
    if (!updatedDay) throw new ApiError(404, 'Trip day not found');

    const orderedIds = updatedDay.stops.map((s) => s.id);
    const scheduled = scheduleOrderedStopsForDay(updatedDay, orderedIds, 'moderate');
    await prisma.$transaction(
      scheduled.map((u) => prismaStop.update({ where: { id: u.id }, data: u.data as any })),
    );

    const updatedStop = await prismaStop.findUnique({
      where: { id: stopId },
      include: {
        place: {
          select: {
            id: true, name: true, slug: true, latitude: true, longitude: true,
            category: true, images: true, thumbnail: true, city: true, state: true,
            rating: true, reviewCount: true, openingHours: true, ticketPrice: true,
          },
        },
      },
    });

    return updatedStop;
  },

  async quickAdd(userId: string, placeIdOrSlug: string, explicitTripId?: string) {
    const place = await resolvePlaceForQuickAdd(placeIdOrSlug);
    if (!place) throw new ApiError(404, 'Place not found.');

    const cityKey = cityKeyFromPlace(place);
    const destLabel = formatDestinationLabel(place.city || place.state || '') || place.city || 'My Trip';
    const title = (place.city || place.state)
      ? `Trip to ${formatDestinationLabel(place.city || place.state || '')}`
      : 'My Itinerary';

    const draftSelect = {
      id: true,
      ...TRIP_CITY_SELECT,
    } as const;

    return prisma.$transaction(async (tx) => {
      let trip: { id: string } | null = null;
      let shouldAdoptDestination = false;

      if (explicitTripId) {
        const found = await tx.tripPlan.findFirst({
          where: {
            id: explicitTripId,
            OR: [{ userId }, { collaborators: { some: { userId, role: { not: 'VIEWER' } } } }],
          },
          select: draftSelect,
        });
        if (!found) throw new ApiError(404, 'Trip not found or unauthorized');
        assertTripAcceptsPlace(found, place);
        trip = { id: found.id };
        shouldAdoptDestination = Boolean(cityKey) && isGenericDestination(found.destination);
      } else {
        const drafts = await tx.tripPlan.findMany({
          where: { userId, status: 'DRAFT' },
          orderBy: { updatedAt: 'desc' },
          select: draftSelect,
        });

        const matching = cityKey
          ? drafts.find((d) => tripCanAcceptPlaceCity(d.destination, stopCityKeys(d), cityKey)
            && destinationMatchesCity(d.destination, cityKey))
          : undefined;
        const adoptable = drafts.find(
          (d) => isGenericDestination(d.destination) && stopCityKeys(d).length === 0,
        );

        if (matching) {
          trip = { id: matching.id };
        } else if (adoptable && cityKey) {
          trip = { id: adoptable.id };
          shouldAdoptDestination = true;
        } else if (!cityKey && adoptable) {
          trip = { id: adoptable.id };
        }
      }

      if (!trip) {
        trip = await tx.tripPlan.create({
          data: {
            title,
            destination: destLabel,
            userId,
            days: 1,
            status: 'DRAFT',
            generationSource: 'MANUAL',
            tripDays: { create: [{ dayNumber: 1 }] },
          },
          select: { id: true },
        });
      } else if (shouldAdoptDestination && cityKey) {
        await tx.tripPlan.update({
          where: { id: trip.id },
          data: { destination: destLabel, title },
        });
      }

      const day = await resolveQuickAddDay(tx, trip.id);

      const existingStop = await tx.tripPlanStop.findFirst({
        where: { tripPlanDay: { tripPlanId: trip.id }, placeId: place.id },
        select: { id: true },
      });
      if (existingStop) {
        return { tripId: trip.id, stopId: existingStop.id, alreadyExists: true };
      }

      const maxOrder = await tx.tripPlanStop.findFirst({
        where: { tripPlanDayId: day.id },
        orderBy: { order: 'desc' },
        select: { order: true },
      });

      const stop = await tx.tripPlanStop.create({
        data: {
          tripPlanDayId: day.id,
          placeId: place.id,
          order: maxOrder ? maxOrder.order + 1 : 0,
          duration: estimateDurationMinutes(place),
          entryFee: parseEntryFee(place.ticketPrice),
          isPinned: true,
        },
        select: { id: true },
      });

      return { tripId: trip.id, stopId: stop.id, alreadyExists: false };
    }, { maxWait: 5_000, timeout: 10_000 });
  },

  async calculateTotalDistance(tripId: string): Promise<number> {
    const stops = await prismaStop.findMany({
      where: { tripPlanDay: { tripPlanId: tripId } },
      include: { place: true },
      orderBy: [{ tripPlanDay: { dayNumber: 'asc' } }, { order: 'asc' }],
    });

    let total = 0;
    for (let i = 1; i < stops.length; i++) {
      const prev = stops[i - 1].place;
      const curr = stops[i].place;
      if (prev.latitude && prev.longitude && curr.latitude && curr.longitude) {
        total += calcDistance(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
      }
    }
    return Math.round(total * 10) / 10;
  },

  async calculateTotalTime(tripId: string): Promise<number> {
    const stops = await prismaStop.findMany({
      where: { tripPlanDay: { tripPlanId: tripId } },
      select: { duration: true, place: { select: { category: true, recommendedDuration: true, estimatedDurationMinutes: true } } },
    });

    return stops.reduce((sum, s) => sum + (s.duration || estimateDurationMinutes(s.place)), 0);
  },

  async startTrip(tripId: string, userId: string) {
    const trip = await prismaTrip.findFirst({ where: { id: tripId, userId } });
    if (!trip) throw new ApiError(404, 'Trip not found or unauthorized');
    if (trip.status === 'ACTIVE') throw new ApiError(400, 'Trip is already active');
    if (trip.status === 'COMPLETED') throw new ApiError(400, 'Trip is already completed');

    const stops = await prismaStop.findMany({
      where: { tripPlanDay: { tripPlanId: tripId } },
      orderBy: [{ tripPlanDay: { dayNumber: 'asc' } }, { order: 'asc' }],
    });
    if (stops.length === 0) throw new ApiError(400, 'Cannot start a trip with no stops');

    return prismaTrip.update({
      where: { id: tripId },
      data: {
        status: 'ACTIVE',
        startedAt: new Date(),
        currentDayIndex: 0,
        currentStopIndex: 0,
      },
      include: TRIP_INCLUDE,
    });
  },

  async completeTrip(tripId: string, userId: string) {
    const trip = await prismaTrip.findFirst({ where: { id: tripId, userId } });
    if (!trip) throw new ApiError(404, 'Trip not found or unauthorized');
    if (trip.status !== 'ACTIVE') throw new ApiError(400, 'Trip is not active');

    // Exactly-once: only the call that wins the ACTIVE -> COMPLETED transition
    // may award the completion bonus (concurrent duplicates otherwise double-award).
    const claimed = await prismaTrip.updateMany({
      where: { id: tripId, userId, status: 'ACTIVE' },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        currentDayIndex: null,
        currentStopIndex: null,
      },
    });
    if (claimed.count !== 1) {
      const already = await prismaTrip.findUnique({
        where: { id: tripId },
        include: TRIP_INCLUDE,
      });
      return { ...already, completionBonus: null };
    }

    const updated = await prismaTrip.update({
      where: { id: tripId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        currentDayIndex: null,
        currentStopIndex: null,
      },
      include: TRIP_INCLUDE,
    });

    const completionBonus = await this.tryAwardItineraryCompletionBonus(tripId, userId, false);
    return { ...updated, completionBonus };
  },

  async getProgress(tripId: string, userId: string) {
    const trip = await prismaTrip.findFirst({
      where: {
        id: tripId,
        OR: [{ userId }, { collaborators: { some: { userId } } }],
      },
      include: {
        tripDays: {
          orderBy: { dayNumber: 'asc' },
          include: {
            stops: {
              orderBy: { order: 'asc' },
              include: {
                place: {
                  select: {
                    id: true, name: true, slug: true, latitude: true, longitude: true,
                    category: true, images: true, thumbnail: true, city: true, state: true,
                    rating: true, reviewCount: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!trip) throw new ApiError(404, 'Trip not found');

    const allStops = trip.tripDays.flatMap(d => d.stops);
    const totalStops = allStops.length;
    const visitedStops = allStops.filter(s => s.visitedAt);
    const skippedStops = allStops.filter(s => s.skippedAt);

    return {
      tripId: trip.id,
      title: trip.title,
      status: trip.status,
      currentDayIndex: trip.currentDayIndex ?? 0,
      currentStopIndex: trip.currentStopIndex ?? 0,
      totalDays: trip.tripDays.length,
      totalStops,
      visitedCount: visitedStops.length,
      skippedCount: skippedStops.length,
      remainingCount: totalStops - visitedStops.length - skippedStops.length,
      completionPercent: totalStops > 0 ? Math.round(((visitedStops.length + skippedStops.length) / totalStops) * 100) : 0,
      startedAt: trip.startedAt,
      completedAt: trip.completedAt,
      currentDay: trip.tripDays[trip.currentDayIndex ?? 0] ? {
        dayNumber: trip.tripDays[trip.currentDayIndex ?? 0].dayNumber,
        theme: trip.tripDays[trip.currentDayIndex ?? 0].theme,
      } : null,
      currentStop: (trip.currentDayIndex != null && trip.currentStopIndex != null)
        ? (trip.tripDays[trip.currentDayIndex]?.stops[trip.currentStopIndex] ?? null)
        : null,
      nextStop: this.getNextUnvisitedStop(trip.tripDays, trip.currentDayIndex ?? 0, trip.currentStopIndex ?? 0),
      tripDays: trip.tripDays,
    };
  },

  getNextUnvisitedStop(tripDays: any[], currentDayIdx: number, currentStopIdx: number) {
    for (let d = currentDayIdx; d < tripDays.length; d++) {
      const stops = tripDays[d].stops;
      const startIdx = d === currentDayIdx ? currentStopIdx + 1 : 0;
      for (let s = startIdx; s < stops.length; s++) {
        if (!stops[s].visitedAt && !stops[s].skippedAt) return stops[s];
      }
    }
    return null;
  },

  async markStopVisited(
    stopId: string,
    userId: string,
    gps?: { latitude: number; longitude: number; accuracy?: number; timestamp?: string | number },
  ) {
    const stop = await prismaStop.findUnique({
      where: { id: stopId },
      include: {
        tripPlanDay: true,
        place: {
          select: {
            id: true, name: true, slug: true, latitude: true, longitude: true,
            category: true, images: true, thumbnail: true, city: true, state: true,
            rating: true, reviewCount: true,
          },
        },
      },
    });
    if (!stop) throw new ApiError(404, 'Stop not found');

    const trip = await prismaTrip.findFirst({
      where: { id: stop.tripPlanDay.tripPlanId, userId },
    });
    if (!trip) throw new ApiError(403, 'Not authorized');
    if (trip.status !== 'ACTIVE') {
      throw new ApiError(400, 'Itinerary must be started (ACTIVE) before verifying checkpoints');
    }
    if (stop.visitedAt) {
      return {
        stop: await prismaStop.findUnique({
          where: { id: stopId },
          include: {
            place: {
              select: {
                id: true, name: true, slug: true, latitude: true, longitude: true,
                category: true, images: true, thumbnail: true, city: true, state: true,
                rating: true, reviewCount: true,
              },
            },
          },
        }),
        alreadyVerified: true,
        checkpointReward: null,
        completionBonus: null,
      };
    }
    if (stop.skippedAt) throw new ApiError(400, 'Stop was skipped');

    if (
      gps == null
      || !Number.isFinite(gps.latitude)
      || !Number.isFinite(gps.longitude)
    ) {
      throw new ApiError(400, 'GPS latitude and longitude are required to verify this checkpoint');
    }

    const placeLat = stop.place?.latitude;
    const placeLng = stop.place?.longitude;
    if (placeLat == null || placeLng == null) {
      throw new ApiError(400, 'This place has no coordinates and cannot be GPS-verified');
    }

    if (
      gps.latitude < -90 || gps.latitude > 90
      || gps.longitude < -180 || gps.longitude > 180
    ) {
      throw new ApiError(400, 'GPS coordinates are out of valid range');
    }

    const accuracyMax = getItineraryGpsAccuracyMaxMeters();
    if (gps.accuracy != null && Number.isFinite(gps.accuracy) && gps.accuracy > accuracyMax) {
      throw new ApiError(
        400,
        'GPS accuracy is too low. Try moving to an open area.',
      );
    }

    const distanceM = haversineDistance(gps.latitude, gps.longitude, placeLat, placeLng);
    const radiusM = getItineraryCheckpointRadiusMeters();
    if (distanceM > radiusM) {
      throw new ApiError(
        400,
        'Move closer to the destination to verify your visit.',
      );
    }

    if (gps.timestamp != null) {
      const ts = typeof gps.timestamp === 'number' ? gps.timestamp : Date.parse(String(gps.timestamp));
      if (Number.isFinite(ts)) {
        const skewMs = Math.abs(Date.now() - ts);
        if (skewMs > 10 * 60 * 1000) {
          throw new ApiError(400, 'GPS timestamp is too old or in the future. Refresh your location and try again.');
        }
      }
    }

    const priorVisit = await prismaStop.findFirst({
      where: {
        tripPlanDay: { tripPlanId: trip.id },
        visitedAt: { not: null },
        id: { not: stopId },
      },
      orderBy: { visitedAt: 'desc' },
      include: {
        place: { select: { latitude: true, longitude: true } },
      },
    });
    if (
      priorVisit?.visitedAt
      && priorVisit.place?.latitude != null
      && priorVisit.place?.longitude != null
    ) {
      const legM = haversineDistance(
        priorVisit.place.latitude,
        priorVisit.place.longitude,
        placeLat,
        placeLng,
      );
      const elapsedHours = (Date.now() - priorVisit.visitedAt.getTime()) / (1000 * 60 * 60);
      if (elapsedHours > 0) {
        const speedKmh = (legM / 1000) / elapsedHours;
        const maxSpeed = getItineraryMaxTravelSpeedKmh();
        if (speedKmh > maxSpeed) {
          throw new ApiError(
            400,
            'Unrealistic travel speed detected between checkpoints. Complete stops in order at each location.',
          );
        }
      }
    }

    // Atomic claim: only the request that flips visitedAt null -> now may verify/award.
    const claim = await prismaStop.updateMany({
      where: { id: stopId, visitedAt: null, skippedAt: null },
      data: { visitedAt: new Date() },
    });
    if (claim.count === 0) {
      const latest = await prismaStop.findUnique({
        where: { id: stopId },
        include: {
          place: {
            select: {
              id: true, name: true, slug: true, latitude: true, longitude: true,
              category: true, images: true, thumbnail: true, city: true, state: true,
              rating: true, reviewCount: true,
            },
          },
        },
      });
      if (latest?.visitedAt) {
        return {
          stop: latest,
          alreadyVerified: true,
          checkpointReward: null,
          completionBonus: null,
        };
      }
      if (!latest) throw new ApiError(404, 'Stop not found');
      throw new ApiError(400, 'Stop was skipped');
    }

    const updatedStop = await prismaStop.findUnique({
      where: { id: stopId },
      include: {
        place: {
          select: {
            id: true, name: true, slug: true, latitude: true, longitude: true,
            category: true, images: true, thumbnail: true, city: true, state: true,
            rating: true, reviewCount: true,
          },
        },
      },
    });
    if (!updatedStop) throw new ApiError(404, 'Stop not found');

    // Do not auto-complete here; completion (status + bonus) is claimed atomically below.
    await this.advanceToNextStop(trip.id, stop.tripPlanDayId, stop.order, { autoComplete: false });

    const checkpointRule = await pointRulesService.getPointsForAction('itinerary_checkpoint');
    let checkpointReward: { points: number; awarded: boolean } | null = null;
    if (isItineraryGpsRewardsEnabled() && checkpointRule && checkpointRule.points > 0) {
      const before = await prisma.walletTransaction.findFirst({
        where: {
          userId,
          type: 'EARN',
          referenceId: stopId,
          referenceType: 'ITINERARY_CHECKPOINT',
        },
      });
      await walletService.earn(
        userId,
        checkpointRule.points,
        'itinerary_checkpoint',
        stopId,
        'ITINERARY_CHECKPOINT',
      );
      checkpointReward = { points: checkpointRule.points, awarded: !before };
    }

    const completionBonus = await this.tryAwardItineraryCompletionBonus(trip.id, userId, true);

    return {
      stop: updatedStop,
      alreadyVerified: false,
      distanceMeters: Math.round(distanceM),
      checkpointReward,
      completionBonus,
    };
  },

  async tryAwardItineraryCompletionBonus(
    tripId: string,
    userId: string,
    claimTransition = false,
  ) {
    const stops = await prismaStop.findMany({
      where: { tripPlanDay: { tripPlanId: tripId } },
      select: { id: true, visitedAt: true, skippedAt: true },
    });
    const required = stops.filter((s) => !s.skippedAt);
    if (required.length === 0) return null;
    if (!required.every((s) => s.visitedAt)) return null;

    const trip = await prismaTrip.findFirst({ where: { id: tripId, userId } });
    if (!trip) return null;

    // Exactly-once: only the request that wins the ACTIVE -> COMPLETED transition
    // may award the completion bonus. Concurrent duplicate visits / manual completes
    // otherwise both pass the "all stops visited" check and double-award.
    if (claimTransition) {
      const claimed = await prismaTrip.updateMany({
        where: { id: tripId, userId, status: 'ACTIVE' },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          currentDayIndex: null,
          currentStopIndex: null,
        },
      });
      if (claimed.count !== 1) return null;
    } else if (trip.status === 'ACTIVE') {
      await prismaTrip.update({
        where: { id: tripId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          currentDayIndex: null,
          currentStopIndex: null,
        },
      });
    }

    const bonusRule = await pointRulesService.getPointsForAction('itinerary_completion');
    if (!isItineraryGpsRewardsEnabled() || !bonusRule || bonusRule.points <= 0) return null;

    const before = await prisma.walletTransaction.findFirst({
      where: {
        userId,
        type: 'EARN',
        referenceId: tripId,
        referenceType: 'ITINERARY_COMPLETION',
      },
    });
    await walletService.earn(
      userId,
      bonusRule.points,
      'itinerary_completion',
      tripId,
      'ITINERARY_COMPLETION',
    );
    return { points: bonusRule.points, awarded: !before };
  },

  async skipStop(stopId: string, userId: string) {
    const stop = await prismaStop.findUnique({
      where: { id: stopId },
      include: { tripPlanDay: true },
    });
    if (!stop) throw new ApiError(404, 'Stop not found');

    const trip = await prismaTrip.findFirst({
      where: { id: stop.tripPlanDay.tripPlanId, userId },
    });
    if (!trip) throw new ApiError(403, 'Not authorized');
    if (stop.visitedAt) throw new ApiError(400, 'Stop already visited, cannot skip');
    if (stop.skippedAt) throw new ApiError(400, 'Stop already skipped');

    const updatedStop = await prismaStop.update({
      where: { id: stopId },
      data: { skippedAt: new Date() },
      include: {
        place: {
          select: {
            id: true, name: true, slug: true, latitude: true, longitude: true,
            category: true, images: true, thumbnail: true, city: true, state: true,
            rating: true, reviewCount: true,
          },
        },
      },
    });

    await this.advanceToNextStop(trip.id, stop.tripPlanDayId, stop.order);
    return updatedStop;
  },

  async advanceToNextStop(
    tripId: string,
    currentDayId: string,
    currentOrder: number,
    options: { autoComplete?: boolean } = {},
  ) {
    const autoComplete = options.autoComplete !== false;
    const tripDays = await prismaDay.findMany({
      where: { tripPlanId: tripId },
      orderBy: { dayNumber: 'asc' },
      include: {
        stops: { orderBy: { order: 'asc' }, where: { visitedAt: null, skippedAt: null } },
      },
    });

    const currentDayIdx = tripDays.findIndex(d => d.id === currentDayId);
    if (currentDayIdx === -1) return;

    const remainingInDay = tripDays[currentDayIdx].stops.filter(
      s => s.order > currentOrder && !s.visitedAt && !s.skippedAt
    );

    if (remainingInDay.length > 0) {
      const nextOrder = remainingInDay[0].order;
      const nextIndex = tripDays[currentDayIdx].stops.findIndex(s => s.order === nextOrder);
      await prismaTrip.update({
        where: { id: tripId },
        data: { currentDayIndex: currentDayIdx, currentStopIndex: nextIndex },
      });
      return;
    }

    if (currentDayIdx + 1 < tripDays.length) {
      const nextDay = tripDays[currentDayIdx + 1];
      if (nextDay.stops.length > 0) {
        const nextStopIdx = nextDay.stops.findIndex(s => !s.visitedAt && !s.skippedAt);
        await prismaTrip.update({
          where: { id: tripId },
          data: { currentDayIndex: currentDayIdx + 1, currentStopIndex: Math.max(0, nextStopIdx) },
        });
        return;
      }
    }

    if (autoComplete) {
      await prismaTrip.update({
        where: { id: tripId },
        data: { status: 'COMPLETED', completedAt: new Date(), currentDayIndex: null, currentStopIndex: null },
      });
    }
  },

  async getAllTrips(query: any) {
    const params = getPaginationParams(query);
    const { status, search } = query;

    const where: any = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { destination: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      prismaTrip.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.limit,
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true } },
          _count: { select: { tripDays: true, collaborators: true } },
          tripDays: {
            include: { _count: { select: { stops: true } } },
          },
        },
      }),
      prismaTrip.count({ where }),
    ]);

    const enriched = data.map((trip: any) => {
      const { tripDays, ...rest } = trip;
      const stopsCount = tripDays.reduce((sum: number, d: any) => sum + (d._count?.stops || 0), 0);
      return { ...rest, stopsCount };
    });

    return paginatedResponse(enriched, total, params);
  },

  async getTripsStats() {
    const [totalTrips, activeTrips, completedToday, totalStops] = await Promise.all([
      prismaTrip.count(),
      prismaTrip.count({ where: { status: 'ACTIVE' } }),
      prismaTrip.count({
        where: {
          completedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      prismaStop.count(),
    ]);

    return { totalTrips, activeTrips, completedToday, totalStops };
  },

  async adminGetById(id: string) {
    const [trip, generationLog] = await Promise.all([
      prismaTrip.findUnique({
        where: { id },
        include: {
          ...TRIP_INCLUDE,
          user: { select: { id: true, name: true, email: true, avatar: true, avatarStyle: true } },
        },
      }),
      // Generation forensics: let admins see WHY this itinerary looks the way
      // it does (prompt, provider, failure reason) without raw DB access.
      prisma.aiGenerationLog.findFirst({
        where: { tripPlanId: id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          provider: true,
          success: true,
          errorMessage: true,
          rawPromptText: true,
          createdAt: true,
        },
      }),
    ]);
    if (!trip) throw new ApiError(404, 'Trip not found');
    return { ...trip, generationLog };
  },

  async adminDelete(id: string) {
    const trip = await prismaTrip.findUnique({ where: { id } });
    if (!trip) throw new ApiError(404, 'Trip not found');
    await prismaTrip.delete({ where: { id } });
  },

  async getHistory(userId: string, query: any) {
    const params = getPaginationParams(query);

    const [data, total] = await Promise.all([
      prismaTrip.findMany({
        where: {
          userId,
          status: { in: ['COMPLETED', 'ARCHIVED'] },
        },
        orderBy: { completedAt: 'desc' },
        skip: params.skip,
        take: params.limit,
        include: LIST_TRIP_INCLUDE,
      }),
      prismaTrip.count({ where: { userId, status: { in: ['COMPLETED', 'ARCHIVED'] } } }),
    ]);

    return paginatedResponse(data.map(withListStopsCount), total, params);
  },

  async addCollaborator(tripPlanId: string, userId: string, role: string, requesterId: string) {
    await assertTripAccess(tripPlanId, requesterId, 'owner');

    const existing = await prismaCollab.findUnique({
      where: { tripPlanId_userId: { tripPlanId, userId } },
    });
    if (existing) throw new ApiError(409, 'User is already a collaborator');

    return prismaCollab.create({
      data: { tripPlanId, userId, role },
      include: {
        user: { select: { id: true, name: true, avatar: true, avatarStyle: true } },
      },
    });
  },

  async removeCollaborator(tripPlanId: string, userId: string, requesterId: string) {
    await assertTripAccess(tripPlanId, requesterId, 'owner');

    const collab = await prismaCollab.findUnique({
      where: { tripPlanId_userId: { tripPlanId, userId } },
    });
    if (!collab) throw new ApiError(404, 'Collaborator not found');

    await prismaCollab.delete({ where: { id: collab.id } });
  },

  async updateCollaboratorRole(tripPlanId: string, userId: string, role: string, requesterId: string) {
    await assertTripAccess(tripPlanId, requesterId, 'owner');

    const collab = await prismaCollab.findUnique({
      where: { tripPlanId_userId: { tripPlanId, userId } },
    });
    if (!collab) throw new ApiError(404, 'Collaborator not found');

    return prismaCollab.update({
      where: { id: collab.id },
      data: { role },
      include: {
        user: { select: { id: true, name: true, avatar: true, avatarStyle: true } },
      },
    });
  },
};
