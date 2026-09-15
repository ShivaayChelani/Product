import {
  tripsApi,
  TripPlan,
  TripPlanStop,
  PlanItineraryInput,
  PlanDayExplanation,
  TravelPace,
  Travelers,
  BudgetTier,
  TimePreference,
  AvoidOption,
} from '../../../services/api/trips';
import { seedDraftTripCache } from '../../../utils/quickAddPlace';
import { invalidateMyTripsList } from '../../myTrips/myTripsCache';
import { normalizeTripPlan } from '../../../utils/normalizeTripPlan';
import { ITINERARY_ENGINE_CONFIG } from '../../../config/itineraryEngine';

const TRAVEL_PACES = new Set<string>(['QUICK', 'BALANCED', 'RELAXED', 'VERY_RELAXED']);
const TRAVELERS = new Set<string>(['SOLO', 'COUPLE', 'FAMILY', 'FRIENDS']);
const BUDGETS = new Set<string>(['LOW', 'MEDIUM', 'HIGH', 'CUSTOM']);
const TRANSPORT = new Set<string>(['WALKING', 'BIKE', 'CAR', 'TRAIN', 'FLIGHT']);

/** Every stop in iteration order (day asc, order asc) with stable placeIds. */
export function flattenTripStops(trip: TripPlan | null | undefined): TripPlanStop[] {
  if (!trip?.tripDays?.length) return [];
  return [...trip.tripDays]
    .sort((a, b) => (a.dayNumber ?? 0) - (b.dayNumber ?? 0))
    .flatMap(day =>
      [...(day.stops || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    );
}

/** Stable, deduplicated selected place ids — never array indexes, names, or markers. */
export function collectSelectedPlaceIds(trip: TripPlan | null | undefined): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const stop of flattenTripStops(trip)) {
    if (!stop?.placeId) continue;
    if (seen.has(stop.placeId)) continue;
    seen.add(stop.placeId);
    ids.push(stop.placeId);
  }
  return ids;
}

/** Button visibility: canonical SELF_BUILD requires at least 2 selected places. */
export function canOrganizeItinerary(trip: TripPlan | null | undefined): boolean {
  if (!ITINERARY_ENGINE_CONFIG.canonicalSelfBuildEnabled) return false;
  return collectSelectedPlaceIds(trip).length >= 2;
}

/**
 * Build the SELF_BUILD /plan payload from the current trip.
 * Selection comes from server stop rows (placeId) only — never index/name.
 * Returns null when there is nothing to organize (guarded by <2 as well).
 */
export function buildOrganizePayload(trip: TripPlan | null | undefined): PlanItineraryInput | null {
  if (!trip?.id) return null;
  const stops = flattenTripStops(trip);
  const selectedPlaceIds = collectSelectedPlaceIds(trip);
  if (selectedPlaceIds.length < 2) return null;

  const pinnedSeen = new Set<string>();
  const pinnedPlaceIds: string[] = [];
  const fixedSeen = new Set<string>();
  const fixedTimePlaces: PlanItineraryInput['fixedTimePlaces'] = [];

  for (const stop of stops) {
    if (stop.isPinned && !pinnedSeen.has(stop.placeId)) {
      pinnedSeen.add(stop.placeId);
      pinnedPlaceIds.push(stop.placeId);
    }
    if (stop.startTime && !fixedSeen.has(stop.placeId)) {
      fixedSeen.add(stop.placeId);
      fixedTimePlaces.push({ placeId: stop.placeId, startTime: stop.startTime });
    }
  }

  return {
    tripId: trip.id,
    destination: trip.destination || trip.title,
    startDate: trip.startDate || undefined,
    endDate: trip.endDate || undefined,
    days: trip.days && trip.days >= 1 ? trip.days : undefined,
    mode: 'SELF_BUILD' as const,
    selectedPlaceIds,
    pinnedPlaceIds,
    lockedPlaceIds: [],
    fixedTimePlaces,
    interests: trip.interests || [],
    pace: TRAVEL_PACES.has(trip.pace) ? (trip.pace as TravelPace) : undefined,
    travelers: trip.travelers && TRAVELERS.has(trip.travelers) ? (trip.travelers as Travelers) : undefined,
    budget: trip.budget && BUDGETS.has(trip.budget) ? (trip.budget as BudgetTier) : undefined,
    customBudgetAmount: trip.customBudgetAmount ?? undefined,
    timePreference: trip.timePreference
      ? (trip.timePreference as TimePreference)
      : undefined,
    avoid: Array.isArray(trip.avoid)
      ? trip.avoid.filter((a): a is AvoidOption =>
          ['CROWDED', 'LONG_TRAVEL', 'EXPENSIVE_ENTRY', 'NON_FAMILY_FRIENDLY'].includes(a),
        )
      : [],
    transportation: Array.isArray(trip.transportation)
      ? trip.transportation.filter(t => TRANSPORT.has(t))
      : undefined,
  };
}

export interface OrganizeOutcome {
  /** True when the request was skipped (flag off, <2 places, or already in flight). */
  skipped: boolean;
  explanation: string | null;
  dayExplanations: PlanDayExplanation[];
  warnings: string[];
}

/** In-flight guard so a duplicate tap never fires a second request. */
let inflightTripId: string | null = null;

/**
 * Runs the canonical SELF_BUILD optimize request, then paints the server's
 * fresh plan onto the builder. On throw, nothing was mutated — the caller's
 * existing builder state is preserved.
 */
export async function organizeItineraryAction(
  trip: TripPlan | null | undefined,
  onTripChanged: (trip: TripPlan) => void,
): Promise<OrganizeOutcome> {
  const skipped: OrganizeOutcome = {
    skipped: true,
    explanation: null,
    dayExplanations: [],
    warnings: [],
  };
  if (!ITINERARY_ENGINE_CONFIG.canonicalSelfBuildEnabled) return skipped;

  const payload = buildOrganizePayload(trip);
  if (!payload) return skipped;
  if (inflightTripId === payload.tripId) return skipped;
  inflightTripId = payload.tripId ?? null;

  try {
    const result = await tripsApi.plan(payload);
    const fresh = normalizeTripPlan(result.trip);
    onTripChanged(fresh);
    seedDraftTripCache(fresh);
    invalidateMyTripsList();
    return {
      skipped: false,
      explanation: result.explanation ?? null,
      dayExplanations: result.dayExplanations ?? [],
      warnings: result.warnings ?? [],
    };
  } finally {
    inflightTripId = null;
  }
}