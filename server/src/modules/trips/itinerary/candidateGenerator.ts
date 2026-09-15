/**
 * Candidate generator (Phase 2). Produces multiple ARRANGEMENTS of the SAME
 * resolved place pool using ordering/allocation strategies — never additional
 * DB reads, never invented places.
 *
 *   Candidate A  PRIORITY-FIRST   — mandatory/priority zones get days first.
 *   Candidate B  AREA-FIRST       — richest, most coherent areas get days first.
 *   Candidate C  OPENING-HOURS-FIRST — early-opening areas are scheduled early.
 *
 * All candidates share the same PlaceStore result, the same enrichment cache,
 * and the same base pool (resolveCandidates is NOT repeated here). Only the
 * ordering/allocation emphasis differs. Hard constraints are validated on
 * every candidate; invalid candidates are marked `isRejected` (never chosen).
 * SELF_BUILD adds no complements; AI_BUILD may use the complementary pool that
 * already passed destination/approval checks during resolution.
 */

import type {
  EnrichedPlace,
  GeoCoords,
  ItineraryIntent,
  PlanningWarning,
  Zone,
} from './types';
import {
  DEFAULT_DAY_END_MINUTES,
  DEFAULT_DAY_START_MINUTES,
  buildDaySchedule,
  fixedTimeMap,
  plannedStopsFromSchedule,
} from './scheduleBuilder';
import { buildBackboneOrder, optimizeDayOrder } from './routeOptimizer';
import { validatePlan } from './constraintValidator';
import { allocateDays, zoneMapOf } from './dayAllocator';
import { resolvableMandatoryIds } from './qualityScorer';
import type {
  DayOrderingMode,
  ItineraryCandidate,
  PlanDay,
} from './phase2Types';

export interface GenerateCandidatesOptions {
  intent: ItineraryIntent;
  resolved: EnrichedPlace[];
  zones: Zone[];
  dayStart: GeoCoords;
  speedKmh?: number;
  date?: Date | null;
  earliestStartMinutes?: number;
  /** Strategies to build. Defaults to all three. */
  strategies?: DayOrderingMode[];
  /** Variation seeds (0 = base arrangement). Determines candidate count. */
  variations?: number[];
  /** Single-day regeneration mode. */
  singleDay?: number;
  /** Frozen day assignments kept stable during regeneration. */
  preservedDayAssignments?: ReadonlyMap<number, readonly string[]>;
}

export interface GenerateCandidatesResult {
  candidates: ItineraryCandidate[];
  feasible: number;
  rejected: number;
  warnings: PlanningWarning[];
}

const BASE_STRATEGIES: DayOrderingMode[] = ['PRIORITY', 'AREA', 'OPENING_HOURS'];

export function buildPlanDay(
  dayNumber: number,
  dayPlaceIds: string[],
  zoneIds: string[],
  options: GenerateCandidatesOptions,
): PlanDay {
  const {
    intent, resolved, dayStart, speedKmh = 30, date, earliestStartMinutes = DEFAULT_DAY_START_MINUTES,
  } = options;
  const byId = new Map(resolved.map((p) => [p.id, p]));
  const dayPlaces = dayPlaceIds.map((id) => byId.get(id)).filter((p): p is EnrichedPlace => !!p);

  const backboneOrder = buildBackboneOrder(dayPlaces, intent.lockedPlaceIds, intent.fixedTimePlaces);
  const zoneMap = zoneMapOf(resolved, options.zones);
  const ordered = optimizeDayOrder(dayPlaces, {
    dayStart,
    speedKmh,
    backboneOrder,
    earliestStartMinutes,
    date: date ?? null,
    preferEveningFinish: true,
    zoneByPlaceId: zoneMap,
  });

  const fixedTime = fixedTimeMap(intent.fixedTimePlaces);
  const schedule = buildDaySchedule({
    places: ordered.order,
    dayNumber,
    dayStart,
    windowStart: options.earliestStartMinutes ?? earliestStartMinutes,
    windowEnd: DEFAULT_DAY_END_MINUTES,
    fixedTime,
    speedKmh,
    date: date ?? null,
    insertLunchBuffer: true,
  });

  const openingHoursFeasible = schedule.stops.every((s) => s.openingHoursRespected !== false);

  return {
    dayNumber,
    zoneIds,
    placeIds: ordered.order.map((p) => p.id),
    sequence: ordered.order,
    stops: schedule.stops,
    totalMinutes: schedule.totalMinutes,
    visitMinutes: schedule.visitMinutes,
    travelMinutes: schedule.travelMinutes,
    detourIndex: schedule.detourIndex,
    openingHoursFeasible,
    warnings: schedule.warnings,
  };
}

export function generateCandidates(options: GenerateCandidatesOptions): GenerateCandidatesResult {
  const {
    intent, resolved, zones, dayStart, speedKmh = 30, date,
  } = options;

  const strategies = options.strategies ?? BASE_STRATEGIES;
  const variations = options.variations ?? [0];
  const warnings: PlanningWarning[] = [];
  const candidates: ItineraryCandidate[] = [];
  const seen = new Set<string>();

  for (const strategy of strategies) {
    for (const variation of variations) {
      const alloc = allocateDays({
        intent,
        pool: resolved,
        zones,
        dayStart,
        speedKmh,
        ordering: strategy,
        variation,
        singleDay: options.singleDay,
        preservedDayAssignments: options.preservedDayAssignments,
      });
      warnings.push(...alloc.warnings.filter((w) => !warnings.some((x) => x.message === w.message)));

      const days = alloc.days.map((d) => buildPlanDay(d.dayNumber, d.placeIds, d.zoneIds, options));

      const allStops = days
        .flatMap((d) => d.stops)
        .sort((a, b) => a.dayNumber - b.dayNumber || a.order - b.order);
      const allStopIds = allStops.map((s) => s.placeId);
      const signature = allStopIds.join('|');
      if (seen.has(signature)) continue;
      seen.add(signature);

      const zoneMap = zoneMapOf(resolved, zones);
      const plannedStops = plannedStopsFromSchedule(allStops);
      const constraintResult = validatePlan({
        intent,
        resolvedPlaces: resolved,
        plannedStops,
        scheduledStops: allStops,
        zoneByPlaceId: zoneMap,
        date: date ?? null,
      });

      const hardIds = constraintResult.hardViolations
        .filter((v) => v.severity === 'HARD');
      let isRejected = hardIds.length > 0 || !alloc.feasible;
      const rejectionReasons: string[] = [];
      if (hardIds.length) rejectionReasons.push(...hardIds.map((v) => v.id));
      if (!alloc.feasible) rejectionReasons.push(...alloc.reasons);

      // Mode contracts apply to FULL plans only. Regeneration rebuilds ONE day
      // from a reduced pool, so "every selected place present" can never hold
      // here — those checks run again on the merged full plan (see planner.ts).
      if (options.singleDay == null) {
        if (intent.planningMode === 'SELF_BUILD') {
          const contract = evaluateSelfBuildContract(intent, resolved, allStopIds, warnings);
          if (contract.isRejected) isRejected = true;
          rejectionReasons.push(...contract.rejectionReasons);
        } else if (intent.planningMode === 'AI_BUILD') {
          const contract = evaluateAiBuildContract(intent, resolved, allStopIds, warnings);
          if (contract.isRejected) isRejected = true;
          rejectionReasons.push(...contract.rejectionReasons);
        }
      }

      const label = `candidate-${(candidates.length + 1)}`;

      candidates.push({
        id: `${strategy}-v${variation}`,
        meta: {
          strategy: strategy as DayOrderingMode,
          variation,
          label,
          description: tacticsDescription(strategy),
        },
        days,
        allStops,
        allStopIds,
        zoneByPlaceId: zoneMap,
        constraintResult,
        quality: null,
        warnings,
        isRejected,
        rejectionReasons,
      });
    }
  }

  // Guarantee: whenever feasible planning is possible at least one candidate
  // survives — rejected candidates are still returned (with reasons) so the
  // planner can disclose WHY a plan was not feasible.
  const feasibleCount = candidates.filter((c) => !c.isRejected).length;

  return {
    candidates,
    feasible: feasibleCount,
    rejected: candidates.length - feasibleCount,
    warnings,
  };
}

function tacticsDescription(strategy: DayOrderingMode): string {
  if (strategy === 'PRIORITY') return 'Prioritizes mandatory/priority areas first';
  if (strategy === 'AREA') return 'Plans the richest, most coherent areas first';
  return 'Schedules areas by opening hours (early-open areas first)';
}

export interface ModeContractResult {
  isRejected: boolean;
  rejectionReasons: string[];
  warnings: PlanningWarning[];
}

/**
 * SELF_BUILD contract (Phase 0 soft-build): the candidate set is EXACTLY the
 * user's explicit choices — never invented, never supplemented, never silently
 * dropped. Explicit sources (selected + pinned + locked + fixed-time + priority)
 * may all appear; anything else is treated as "added" and invalidates the plan.
 * Warnings are appended to the shared `warnings` list (deduplicated upstream).
 */
export function evaluateSelfBuildContract(
  intent: ItineraryIntent,
  resolved: EnrichedPlace[],
  allStopIds: string[],
  warnings: PlanningWarning[],
): ModeContractResult {
  const explicitSet = new Set([
    ...intent.selectedPlaceIds,
    ...intent.pinnedPlaceIds,
    ...intent.lockedPlaceIds,
    ...intent.priorityPlaceIds,
    ...intent.fixedTimePlaces.map((f) => f.placeId),
  ]);
  const rejectionReasons: string[] = [];
  let isRejected = false;

  const foreign = allStopIds.filter((id) => !explicitSet.has(id));
  if (foreign.length) {
    rejectionReasons.push(`SELF_BUILD added unselected places: ${foreign.join(', ')}`);
    isRejected = true;
  }

  const missing = intent.selectedPlaceIds
    .filter((id) => resolved.some((p) => p.id === id))
    .filter((id) => !allStopIds.includes(id));
  for (const id of missing) {
    rejectionReasons.push(`SELF_BUILD dropped selected place ${id}`);
    warnings.push({
      code: 'SELECTED_PLACE_DROPPED',
      message: `Selected place ${id} could not be kept in this arrangement.`,
      severity: 'WARNING',
      placeIds: [id],
    });
  }
  if (missing.length) isRejected = true;

  return { isRejected, rejectionReasons, warnings };
}

/**
 * AI_BUILD contract: every resolvable priority anchor / explicit selection must
 * survive — a variant that loses one is infeasible and can never win. Missing
 * anchors are disclosed as warnings (never silently dropped).
 */
export function evaluateAiBuildContract(
  intent: ItineraryIntent,
  resolved: EnrichedPlace[],
  allStopIds: string[],
  warnings: PlanningWarning[],
): ModeContractResult {
  const mandatory = resolvableMandatoryIds(intent, resolved);
  const rejectionReasons: string[] = [];
  let isRejected = false;
  for (const id of mandatory) {
    if (allStopIds.includes(id)) continue;
    isRejected = true;
    rejectionReasons.push(`AI_BUILD dropped mandatory anchor ${id}`);
    warnings.push({
      code: 'PRIORITY_PLACE_DROPPED',
      message: `Priority anchor ${id} did not survive this arrangement.`,
      severity: 'WARNING',
      placeIds: [id],
    });
  }
  return { isRejected, rejectionReasons, warnings };
}

/** Convenience: which ids are complementary (AI-only) within a candidate. */
export function complementaryPlaceIds(intent: ItineraryIntent, allStopIds: string[]): string[] {
  const chosen = new Set(allStopIds);
  const explicit = new Set([
    ...intent.selectedPlaceIds,
    ...intent.priorityPlaceIds,
    ...intent.pinnedPlaceIds,
    ...intent.lockedPlaceIds,
    ...intent.fixedTimePlaces.map((f) => f.placeId),
  ]);
  return allStopIds.filter((id) => chosen.has(id) && !explicit.has(id));
}