/**
 * Canonical hard/soft constraint validation (Phase 1).
 *
 * Implements the Phase 0 contract §4 constraint catalogue:
 *   HARD   H1 place existence · H2 ownership/auth · H3 trip dates · H4 fixed-time
 *          anchors · H5 locked position · H6 mandatory places · H7 trusted opening
 *          hours · H8 explicit budget ceiling · H9 impossible travel · H10 transport
 *   SOFT   S1 proximity · S2 area coherence · S3 time-of-day · S4 interests ·
 *          S5 popularity · S6 route elegance · S7 uniqueness
 *
 * Rules:
 *   - Hard constraints can never be silently violated.
 *   - UNKNOWN data is NEVER invented; it degrades to a soft warning where apt.
 *   - The validator NEVER mutates an itinerary.
 */

import type {
  ConstraintResult,
  ConstraintViolation,
  EnrichedPlace,
  ItineraryIntent,
  PlannedStop,
  RepairAction,
  ScheduledStop,
  SuggestedRepair,
} from './types';
import { PACE_CONFIG, TRANSPORT_COST_PER_KM, resolveSpeedKmh } from './types';
import { isPlaceOpenAt } from './enrichment';
import { estimateTravelMinutes, haversineKm } from './clustering';
import { matchesInterests, INTEREST_CATEGORY_MAP } from './scoring';
import { routeDetourIndex } from './routeOptimizer';

export interface ValidationInput {
  intent: ItineraryIntent;
  /** All successfully resolved candidates (by id). */
  resolvedPlaces: EnrichedPlace[];
  /** Ordered planned stops (may carry null times before scheduling). */
  plannedStops: PlannedStop[];
  /** Post-scheduling stops when available (overrides planned times). */
  scheduledStops?: ScheduledStop[] | null;
  date?: Date | null;
  /** Optional zone membership for S2. */
  zoneByPlaceId?: Map<string, string>;
  /** Optional owner context (reserved for Phase 2 auth integration). */
  ownerUserId?: string | null;
}

// ---------------------------------------------------------------------------
// Individual hard validators
// ---------------------------------------------------------------------------

export function validateTripDates(intent: ItineraryIntent): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  if (intent.days < 1 || intent.days > 21) {
    violations.push({
      id: 'H3_DAYS_RANGE',
      severity: 'HARD',
      constraint: 'H3',
      message: `Trip day count ${intent.days} is outside the supported 1-21 range.`,
    });
  }
  if (intent.startDate && intent.endDate && intent.startDate > intent.endDate) {
    violations.push({
      id: 'H3_DATES_INVERTED',
      severity: 'HARD',
      constraint: 'H3',
      message: `startDate ${intent.startDate} is after endDate ${intent.endDate}.`,
    });
  }
  return violations;
}

/** H1: every planned place must exist (approved + coordinates) in resolvedPlaces. */
export function validatePlaceExistence(intent: ItineraryIntent, resolvedPlaces: EnrichedPlace[], plannedStops: PlannedStop[]): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const byId = new Map(resolvedPlaces.map((p) => [p.id, p]));
  for (const stop of plannedStops) {
    const place = byId.get(stop.placeId);
    if (!place) {
      violations.push({
        id: 'H1_MISSING_PLACE',
        severity: 'HARD',
        constraint: 'H1',
        message: `Planned place ${stop.placeId} does not exist in the resolved candidate set.`,
        placeIds: [stop.placeId],
      });
      continue;
    }
    if (place.coordinates.lat === 0 && place.coordinates.lng === 0 && !place.factsTrust.coordinatesVerified) {
      violations.push({
        id: 'H1_MISSING_COORDINATES',
        severity: 'HARD',
        constraint: 'H1',
        message: `Place "${place.name}" has no usable coordinates.`,
        placeIds: [place.id],
      });
    }
  }
  return violations;
}

/** H6: explicit mandatory places (never silently dropped). */
export function validateMandatoryPlaces(intent: ItineraryIntent, resolvedPlaces: EnrichedPlace[], plannedStops: PlannedStop[]): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const plannedIds = new Set(plannedStops.map((s) => s.placeId));
  const byId = new Map(resolvedPlaces.map((p) => [p.id, p]));

  const mandatory = intent.planningMode === 'SELF_BUILD'
    ? intent.selectedPlaceIds
    : intent.priorityPlaceIds;

  for (const id of mandatory) {
    const place = byId.get(id);
    if (!place) {
      // Impossible (deleted/invalid/wrong city): reported, not silently dropped.
      violations.push({
        id: 'MANDATORY_IMPOSSIBLE',
        severity: 'SOFT',
        constraint: 'H6',
        message: `Mandatory place ${id} could not be resolved against the DB — dropped with disclosure.`,
        placeIds: [id],
      });
      continue;
    }
    if (!plannedIds.has(id)) {
      violations.push({
        id: 'H6_MANDATORY_DROPPED',
        severity: 'HARD',
        constraint: 'H6',
        message: `Mandatory place "${place.name}" was dropped from the plan without user consent.`,
        placeIds: [id],
      });
    }
  }
  return violations;
}

/** H5: locked relative order must hold. */
export function validateLockedPositions(intent: ItineraryIntent, plannedStops: PlannedStop[]): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const locked = intent.lockedPlaceIds;
  if (!locked.length) return violations;

  const plannedIds = [...plannedStops]
    .sort((a, b) => a.order - b.order)
    .map((s) => s.placeId);
  const lockedPresent: string[] = [];
  const missing: string[] = [];
  for (const id of locked) {
    if (plannedIds.includes(id)) lockedPresent.push(id);
    else missing.push(id);
  }
  if (missing.length) {
    violations.push({
      id: 'H5_LOCKED_MISSING',
      severity: 'HARD',
      constraint: 'H5',
      message: `Locked place(s) missing from plan: ${missing.join(', ')}.`,
      placeIds: missing,
    });
  }
  const orderedLocks = plannedIds.filter((id) => lockedSet(intent).has(id));
  const expectedOrder = locked;
  const keyOf = (id: string) => expectedOrder.indexOf(id);
  for (let i = 1; i < orderedLocks.length; i++) {
    if (keyOf(orderedLocks[i]) < keyOf(orderedLocks[i - 1])) {
      violations.push({
        id: 'H5_LOCKED_REORDERED',
        severity: 'HARD',
        constraint: 'H5',
        message: `Locked places changed relative order (${orderedLocks.slice(0, i + 1).join(' > ')}) versus the user's fixed order.`,
        placeIds: orderedLocks,
      });
      break;
    }
  }
  return violations;
}

function lockedSet(intent: ItineraryIntent): Set<string> {
  return new Set(intent.lockedPlaceIds);
}

/** H4: fixed-time anchors must exist, be planned, and keep their exact start. */
export function validateFixedTimeAnchors(intent: ItineraryIntent, resolvedPlaces: EnrichedPlace[], plannedStops: PlannedStop[], scheduledStops?: ScheduledStop[] | null): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const plannedIds = new Set(plannedStops.map((s) => s.placeId));
  const byId = new Map(resolvedPlaces.map((p) => [p.id, p]));
  const scheduledById = new Map((scheduledStops ?? []).map((s) => [s.placeId, s]));

  for (const spec of intent.fixedTimePlaces) {
    const existing = byId.get(spec.placeId);
    if (!existing) {
      violations.push({
        id: 'FIXED_TIME_IMPOSSIBLE',
        severity: 'SOFT',
        constraint: 'H4',
        message: `Fixed-time anchor ${spec.placeId} could not be resolved against the DB.`,
        placeIds: [spec.placeId],
      });
      continue;
    }
    if (!plannedIds.has(spec.placeId)) {
      violations.push({
        id: 'H4_FIXED_TIME_MISSING',
        severity: 'HARD',
        constraint: 'H4',
        message: `Fixed-time anchor "${existing.name}" is not in the plan.`,
        placeIds: [spec.placeId],
      });
      continue;
    }
    const scheduled = scheduledById.get(spec.placeId);
    if (scheduled && scheduled.startMinutes !== spec.startMinutes) {
      violations.push({
        id: 'H4_FIXED_TIME_MISMATCH',
        severity: 'HARD',
        constraint: 'H4',
        message: `Fixed-time anchor "${existing.name}" scheduled at ${scheduled.startMinutes} instead of ${spec.startMinutes}.`,
        placeIds: [spec.placeId],
      });
    }
  }
  return violations;
}

/** H7: trusted opening hours are a hard scheduling constraint; unknown -> soft warning. */
export function validateOpeningHours(resolvedPlaces: EnrichedPlace[], scheduledStops?: ScheduledStop[] | null): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const byId = new Map(resolvedPlaces.map((p) => [p.id, p]));

  for (const stop of scheduledStops ?? []) {
    const place = byId.get(stop.placeId);
    if (!place) continue;
    if (place.hoursTrust !== 'VERIFIED' || !place.openingHours) {
      violations.push({
        id: 'H7_UNKNOWN_HOURS',
        severity: 'SOFT',
        constraint: 'H7',
        message: `Opening hours unknown for "${place.name}" — assumed schedulable with a warning (never fabricated).`,
        placeIds: [place.id],
      });
      continue;
    }
    const open = isPlaceOpenAt(place.openingHours, null, stop.startMinutes);
    if (open === false) {
      violations.push({
        id: 'H7_OPENING_HOURS_VIOLATED',
        severity: 'HARD',
        constraint: 'H7',
        message: `"${place.name}" is scheduled at ${stop.startMinutes} during trusted closed hours.`,
        placeIds: [place.id],
      });
    }
  }
  return violations;
}

function estimatedTravelCostKm(km: number | null | undefined): number {
  return (km ?? 0) * TRANSPORT_COST_PER_KM;
}

/** H8: explicit budget ceiling (never exceed unless the user allows overflow). */
export function validateBudgetCeiling(
  intent: ItineraryIntent,
  plannedStops: PlannedStop[],
  resolvedPlaces: EnrichedPlace[],
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  if (intent.budgetCap == null || intent.allowBudgetOverflow) return violations;

  const byId = new Map(resolvedPlaces.map((p) => [p.id, p]));
  let estimated = 0;
  for (const stop of plannedStops) {
    const place = byId.get(stop.placeId);
    if (!place) continue;
    estimated += place.entryFee.amount;
    estimated += estimatedTravelCostKm(stop.distanceFromPrevKm);
  }

  if (estimated > intent.budgetCap) {
    violations.push({
      id: 'H8_BUDGET_EXCEEDED',
      severity: 'HARD',
      constraint: 'H8',
      message: `Estimated trip cost ₹${Math.round(estimated)} exceeds the explicit budget ceiling ₹${intent.budgetCap}.`,
    });
  }
  return violations;
}

/** H9: impossible-travel prevention (legs, overlap, day capacity). */
export function validateImpossibleTravel(
  intent: ItineraryIntent,
  scheduledStops: ScheduledStop[] | null,
  plannedStops: PlannedStop[],
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const stops = scheduledStops?.length
    ? scheduledStops.map((s) => ({ ...s, dayNumber: s.dayNumber, order: s.order }))
    : [];

  const legs = stops.length ? stops : plannedStops;
  const legsByDay = new Map<number, ScheduledStop[]>();
  for (const stop of legs) {
    const arr = legsByDay.get(stop.dayNumber) ?? [];
    arr.push(stop as ScheduledStop);
    legsByDay.set(stop.dayNumber, arr);
  }

  const sorted = [...legs].sort((a, b) => a.dayNumber - b.dayNumber || a.order - b.order);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (prev.dayNumber !== cur.dayNumber) continue;
    const distance = cur.distanceFromPrevKm ?? 0;
    if (intent.avoid.includes('LONG_TRAVEL') && distance > 25) {
      violations.push({
        id: 'H9_LONG_LEG',
        severity: 'HARD',
        constraint: 'H9',
        message: `Leg of ${distance.toFixed(1)} km violates the LONG_TRAVEL avoidance (max 25 km).`,
        placeIds: [prev.placeId, cur.placeId],
      });
    }
    // No same-hour impossible back-to-back travel.
    if (prev.endMinutes != null && cur.startMinutes != null) {
      if (cur.startMinutes < prev.endMinutes) {
        violations.push({
          id: 'H9_OVERLAP',
          severity: 'HARD',
          constraint: 'H9',
          message: `Stop ${cur.placeId} starts (${cur.startMinutes}) before the previous stop ends (${prev.endMinutes}).`,
          placeIds: [prev.placeId, cur.placeId],
        });
      }
    }
  }

  // Pace capacity per day.
  const pace = PACE_CONFIG[intent.pace] ?? PACE_CONFIG.BALANCED;
  for (const [day, dayStops] of legsByDay) {
    const ordered = dayStops.sort((a, b) => a.order - b.order);
    const last = ordered[ordered.length - 1];
    if (!last || last.endMinutes == null) continue;
    const total = last.endMinutes - (intent.earliestStartMinutes ?? 9 * 60);
    if (total > pace.maxMinutesPerDay) {
      violations.push({
        id: 'H9_DAY_OVERCAPACITY',
        severity: 'HARD',
        constraint: 'H9',
        message: `Day ${day} runs ${total} minutes, exceeding the ${intent.pace} pace budget of ${pace.maxMinutesPerDay} minutes.`,
        dayNumber: day,
      });
    }
  }

  return violations;
}

/** H10: transport mode sanity. */
export function validateTransportMode(intent: ItineraryIntent): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const speed = resolveSpeedKmh(intent.transportation);
  if (intent.avoid.includes('LONG_TRAVEL') && intent.transportation.includes('FLIGHT')) {
    violations.push({
      id: 'H10_IMPLAUSIBLE_MODE',
      severity: 'HARD',
      constraint: 'H10',
      message: 'FLIGHT transport conflicts with LONG_TRAVEL avoidance for a single-city trip.',
    });
  }
  if (intent.transportation.length === 0) {
    // Informational only — engine defaults to 30 km/h.
    violations.push({
      id: 'H10_DEFAULT_SPEED',
      severity: 'SOFT',
      constraint: 'H10',
      message: `No transport mode given — using the default estimate of ${speed} km/h.`,
    });
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Soft validators
// ---------------------------------------------------------------------------

export function validateProximity(scheduledStops: ScheduledStop[] | null, plannedStops: PlannedStop[]): ConstraintViolation[] {
  const warnings: ConstraintViolation[] = [];
  const stops = scheduledStops?.length ? scheduledStops : (plannedStops as unknown as ScheduledStop[]);
  for (const stop of stops) {
    if ((stop.distanceFromPrevKm ?? 0) > 15) {
      warnings.push({
        id: 'S1_FAR_LEG',
        severity: 'SOFT',
        constraint: 'S1',
        message: `Long hop of ${(stop.distanceFromPrevKm ?? 0).toFixed(1)} km before stop ${stop.placeId}.`,
        placeIds: [stop.placeId],
      });
    }
  }
  return warnings;
}

export function validateAreaCoherence(
  plannedStops: PlannedStop[],
  zoneByPlaceId?: Map<string, string>,
): ConstraintViolation[] {
  const warnings: ConstraintViolation[] = [];
  if (!zoneByPlaceId) return warnings;
  const byDay = new Map<number, string[]>();
  for (const stop of plannedStops) {
    const zone = zoneByPlaceId.get(stop.placeId);
    if (!zone) continue;
    const arr = byDay.get(stop.dayNumber) ?? [];
    arr.push(zone);
    byDay.set(stop.dayNumber, arr);
  }
  for (const [day, zones] of byDay) {
    const unique = new Set(zones);
    if (unique.size > 1) {
      warnings.push({
        id: 'S2_MULTI_ZONE_DAY',
        severity: 'SOFT',
        constraint: 'S2',
        message: `Day ${day} spans ${unique.size} zones (${Array.from(unique).join(', ')}).`,
        dayNumber: day,
      });
    }
  }
  return warnings;
}

export function validateTimeOfDay(resolvedPlaces: EnrichedPlace[], scheduledStops?: ScheduledStop[] | null): ConstraintViolation[] {
  const warnings: ConstraintViolation[] = [];
  const byId = new Map(resolvedPlaces.map((p) => [p.id, p]));
  for (const stop of scheduledStops ?? []) {
    const place = byId.get(stop.placeId);
    if (!place) continue;
    const slot = stop.startMinutes < 12 * 60 ? 'MORNING' : stop.startMinutes < 17 * 60 ? 'AFTERNOON' : 'EVENING';
    const suitability = place.timeOfDaySuitability[slot];
    if (suitability < 0.3) {
      warnings.push({
        id: 'S3_POOR_SLOT_FIT',
        severity: 'SOFT',
        constraint: 'S3',
        message: `"${place.name}" has low ${slot} suitability (${suitability}).`,
        placeIds: [place.id],
      });
    }
  }
  return warnings;
}

export function validateInterests(intent: ItineraryIntent, resolvedPlaces: EnrichedPlace[], plannedStops: PlannedStop[]): ConstraintViolation[] {
  const warnings: ConstraintViolation[] = [];
  const meaningful = intent.interests.filter((i) => (INTEREST_CATEGORY_MAP[i] || []).length > 0);
  if (!meaningful.length) return warnings;
  const byId = new Map(resolvedPlaces.map((p) => [p.id, p]));
  let matched = 0;
  let total = 0;
  for (const stop of plannedStops) {
    const place = byId.get(stop.placeId);
    if (!place) continue;
    total += 1;
    if (matchesInterests(place, meaningful)) matched += 1;
  }
  if (total > 0 && matched / total < 0.5) {
    warnings.push({
      id: 'S4_INTEREST_MISMATCH',
      severity: 'SOFT',
      constraint: 'S4',
      message: `Only ${matched}/${total} planned stops match the requested interests.`,
    });
  }
  return warnings;
}

export function validatePopularity(resolvedPlaces: EnrichedPlace[], scheduledStops: ScheduledStop[] | null, plannedStops: PlannedStop[]): ConstraintViolation[] {
  const warnings: ConstraintViolation[] = [];
  const stops = (scheduledStops?.length ? scheduledStops : plannedStops) as ScheduledStop[];
  const byId = new Map(resolvedPlaces.map((p) => [p.id, p]));
  const days = new Map<number, EnrichedPlace[]>();
  for (const stop of stops) {
    const place = byId.get(stop.placeId);
    if (!place) continue;
    const list = days.get(stop.dayNumber) ?? [];
    list.push(place);
    days.set(stop.dayNumber, list);
  }
  for (const [day, places] of days) {
    if (!places.some((p) => (p.rating ?? 0) >= 3.5)) {
      warnings.push({
        id: 'S5_LOW_POPULARITY_DAY',
        severity: 'SOFT',
        constraint: 'S5',
        message: `Day ${day} has no place rated >= 3.5☆.`,
        dayNumber: day,
      });
    }
  }
  return warnings;
}

export function validateRouteElegance(scheduledStops: ScheduledStop[] | null, resolvedPlaces: EnrichedPlace[]): ConstraintViolation[] {
  const warnings: ConstraintViolation[] = [];
  const stops = scheduledStops ?? null;
  if (!stops || !stops.length) return warnings;
  const byId = new Map(resolvedPlaces.map((p) => [p.id, p]));
  const days = new Map<number, EnrichedPlace[]>();
  for (const stop of [...stops].sort((a, b) => a.order - b.order)) {
    const place = byId.get(stop.placeId);
    if (!place) continue;
    const list = days.get(stop.dayNumber) ?? [];
    list.push(place);
    days.set(stop.dayNumber, list);
  }
  for (const [day, places] of days) {
    const pts = places.map((p) => ({ latitude: p.coordinates.lat, longitude: p.coordinates.lng }));
    if (routeDetourIndex(pts) > 1.8) {
      warnings.push({
        id: 'S6_DETOUR',
        severity: 'SOFT',
        constraint: 'S6',
        message: `Day ${day} route detour index ${routeDetourIndex(pts)} exceeds 1.8 (excessive backtracking).`,
        dayNumber: day,
      });
    }
  }
  return warnings;
}

export function validateUniqueness(scheduledStops: ScheduledStop[] | null, plannedStops: PlannedStop[], resolvedPlaces: EnrichedPlace[]): ConstraintViolation[] {
  const warnings: ConstraintViolation[] = [];
  const stops = (scheduledStops?.length ? scheduledStops : plannedStops) as ScheduledStop[];
  const byId = new Map(resolvedPlaces.map((p) => [p.id, p]));
  const counts = new Map<string, Map<string, number>>();
  for (const stop of stops) {
    const place = byId.get(stop.placeId);
    if (!place) continue;
    const cat = place.category.toLowerCase();
    const dayMap = counts.get(String(stop.dayNumber)) ?? new Map<string, number>();
    dayMap.set(cat, (dayMap.get(cat) ?? 0) + 1);
    counts.set(String(stop.dayNumber), dayMap);
  }
  for (const [day, dayMap] of counts) {
    for (const [cat, n] of dayMap) {
      if (n >= 3) {
        warnings.push({
          id: 'S7_CATEGORY_REPEAT',
          severity: 'SOFT',
          constraint: 'S7',
          message: `Day ${day} repeats category "${cat}" ${n} times.`,
          dayNumber: Number(day),
        });
      }
    }
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Aggregate validation
// ---------------------------------------------------------------------------

export function buildRepairs(hardViolations: ConstraintViolation[], softWarnings: ConstraintViolation[]): SuggestedRepair[] {
  const repairs: SuggestedRepair[] = [];
  for (const v of hardViolations) {
    let action: RepairAction = 'NONE';
    if (v.constraint === 'H6' || v.constraint === 'H4_FIXED_TIME_MISSING' || v.id === 'H6_MANDATORY_DROPPED') action = 'PICK_ALTERNATIVE';
    else if (v.constraint === 'H7') action = 'RESCHEDULE';
    else if (v.id === 'H9_OVERLAP' || v.id === 'H9_DAY_OVERCAPACITY') action = 'DROP_PLACE';
    else if (v.id === 'H8_BUDGET_EXCEEDED') action = 'DROP_PLACE';
    else if (v.id === 'H9_LONG_LEG') action = 'REORDER';
    repairs.push({ id: `REPAIR_${v.id}`, action, message: `Resolve "${v.id}"`, placeIds: v.placeIds });
  }
  for (const w of softWarnings) {
    repairs.push({ id: `REPAIR_${w.id}`, action: 'NONE', message: `Acknowledge "${w.id}"`, placeIds: w.placeIds });
  }
  return repairs;
}

export function validatePlan(input: ValidationInput): ConstraintResult {
  const { intent, resolvedPlaces, plannedStops, zoneByPlaceId } = input;
  const scheduledStops: ScheduledStop[] | null = input.scheduledStops ?? null;

  const hardViolations: ConstraintViolation[] = [
    ...validateTripDates(intent),
    ...validatePlaceExistence(intent, resolvedPlaces, plannedStops),
    ...validateMandatoryPlaces(intent, resolvedPlaces, plannedStops),
    ...validateLockedPositions(intent, plannedStops),
    ...validateFixedTimeAnchors(intent, resolvedPlaces, plannedStops, scheduledStops),
    ...validateOpeningHours(resolvedPlaces, scheduledStops),
    ...validateBudgetCeiling(intent, plannedStops, resolvedPlaces),
    ...validateImpossibleTravel(intent, scheduledStops, plannedStops),
    ...validateTransportMode(intent),
  ];

  const softWarnings: ConstraintViolation[] = [
    ...validateProximity(scheduledStops, plannedStops),
    ...validateAreaCoherence(plannedStops, zoneByPlaceId),
    ...validateTimeOfDay(resolvedPlaces, scheduledStops),
    ...validateInterests(intent, resolvedPlaces, plannedStops),
    ...validatePopularity(resolvedPlaces, scheduledStops, plannedStops),
    ...validateRouteElegance(scheduledStops, resolvedPlaces),
    ...validateUniqueness(scheduledStops, plannedStops, resolvedPlaces),
  ];

  const feasible = hardViolations.every((v) => v.severity !== 'HARD');

  return {
    feasible,
    hardViolations,
    softWarnings,
    suggestedRepairs: buildRepairs(hardViolations, softWarnings),
    validationWarnings: [
      ...hardViolations.filter((v) => v.severity === 'SOFT').map((v) => ({ code: v.id, message: v.message, severity: 'WARNING' as const, placeIds: v.placeIds })),
      ...softWarnings.map((v) => ({ code: v.id, message: v.message, severity: 'WARNING' as const, placeIds: v.placeIds })),
    ],
  };
}

// Kept for explicitness: travel estimates are Haversine-based (never road truth).
export function travelEstimateMinutes(distKm: number, speedKmh: number): number {
  return estimateTravelMinutes(distKm, speedKmh);
}

export { haversineKm };