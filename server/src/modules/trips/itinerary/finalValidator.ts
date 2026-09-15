/**
 * Final validator (Phase 2). Runs BEFORE explanation and AGAIN before the
 * result is returned. Its surface covers everything the planner promised:
 * existence, approval, duplicates, region, sequence, dates, times, plus the
 * reused H4–H10 constraint catalogue.
 *
 *   - Never mutates the input candidate.
 *   - A repair is applied ONLY when deterministic and safe: dropping the
 *     lowest-value OPTIONAL (complementary/non-mandatory) place that caused a
 *     budget/overlap/capacity violation, then rebuilding that day. The
 *     reconstructed candidate is returned EXPLICITLY as `repairedCandidate`.
 *   - No invented rescheduling: opening-hours-led fixes are reported as
 *     suggested repairs, not silently applied.
 */

import type {
  ConstraintViolation,
  EnrichedPlace,
  GeoCoords,
  ItineraryIntent,
  PlanningWarning,
  SuggestedRepair,
  Zone,
} from './types';
import {
  buildRepairs,
  validateBudgetCeiling,
  validateFixedTimeAnchors,
  validateImpossibleTravel,
  validateLockedPositions,
  validateOpeningHours,
  validateTransportMode,
} from './constraintValidator';
import { plannedStopsFromSchedule } from './scheduleBuilder';
import { buildPlanDay } from './candidateGenerator';
import type { ItineraryCandidate } from './phase2Types';

export interface FinalValidationInput {
  intent: ItineraryIntent;
  candidate: ItineraryCandidate;
  /** Full resolved pool (all approved places available to the engine). */
  resolved: EnrichedPlace[];
  zones: Zone[];
  dayStart: GeoCoords;
  speedKmh?: number;
  /** Ids that failed resolution in this planning run. */
  dropped?: Array<{ placeId: string; reason: string }>;
  /** Rebuild a repaired candidate when a deterministic safe drop exists. */
  applySafeRepairs?: boolean;
}

export interface FinalValidationResult {
  feasible: boolean;
  hardViolations: ConstraintViolation[];
  warnings: PlanningWarning[];
  repairs: SuggestedRepair[];
  repairedCandidate: ItineraryCandidate | null;
  repairedReason: string | null;
}

// ---------------------------------------------------------------------------
// Structural checks beyond the Phase 1 catalogue
// ---------------------------------------------------------------------------

function validateStructure(
  intent: ItineraryIntent,
  candidate: ItineraryCandidate,
  resolved: EnrichedPlace[],
  droppedIds: Set<string>,
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const byId = new Map(resolved.map((p) => [p.id, p]));

  for (const stop of candidate.allStopIds) {
    const place = byId.get(stop);
    if (!place) {
      violations.push({
        id: 'FINAL_PLACE_UNRESOLVED',
        severity: 'HARD',
        constraint: 'H1',
        message: `Place ${stop} does not exist in the resolved pool.`,
        placeIds: [stop],
      });
      continue;
    }
    if (!place.factsTrust.statusVerified) {
      violations.push({
        id: 'FINAL_PLACE_NOT_APPROVED',
        severity: 'HARD',
        constraint: 'H1',
        message: `Place "${place.name}" is not an approved place.`,
        placeIds: [place.id],
      });
    }
  }

  for (const id of droppedIds) {
    if (candidate.allStopIds.includes(id)) {
      violations.push({
        id: 'FINAL_DELETED_PLACE',
        severity: 'HARD',
        constraint: 'H1',
        message: `Deleted/unresolved place ${id} appears in the plan.`,
        placeIds: [id],
      });
    }
  }

  const seen = new Set<string>();
  for (const id of candidate.allStopIds) {
    if (seen.has(id)) {
      violations.push({
        id: 'FINAL_DUPLICATE_PLACE',
        severity: 'HARD',
        constraint: 'H1',
        message: `Place ${id} appears more than once in the plan.`,
        placeIds: [id],
      });
    }
    seen.add(id);
  }

  for (const stop of candidate.allStopIds) {
    const place = byId.get(stop);
    if (!place) continue;
    if (place.state.complementary && !place.belongsToDestination) {
      violations.push({
        id: 'FINAL_REGION_MISMATCH',
        severity: 'HARD',
        constraint: 'H1',
        message: `Complementary place "${place.name}" does not belong to destination "${intent.destination}".`,
        placeIds: [place.id],
      });
    }
  }

  const byDay = new Map<number, Array<(typeof candidate.allStops)[number]>>();
  for (const s of candidate.allStops) {
    const list = byDay.get(s.dayNumber) ?? [];
    list.push(s);
    byDay.set(s.dayNumber, list);
  }
  for (const [day, stops] of byDay) {
    if (day < 1 || day > intent.days) {
      violations.push({
        id: 'FINAL_INVALID_DAYNUMBER',
        severity: 'HARD',
        constraint: 'H3',
        message: `Day ${day} is outside the trip's ${intent.days}-day range.`,
        dayNumber: day,
      });
    }
    const orders = stops.map((s) => s.order).sort((a, b) => a - b);
    if (!orders.every((o, i) => o === i + 1)) {
      violations.push({
        id: 'FINAL_BROKEN_SEQUENCE',
        severity: 'HARD',
        constraint: 'H9',
        message: `Day ${day} stop orders are not contiguous (${orders.join(',')}).`,
        dayNumber: day,
      });
    }
    for (const s of stops) {
      if (s.endMinutes != null && s.startMinutes != null && s.endMinutes <= s.startMinutes) {
        violations.push({
          id: 'FINAL_CONTRADICTORY_TIMES',
          severity: 'HARD',
          constraint: 'H9',
          message: `Stop ${s.placeId} ends at ${s.endMinutes}, not after its start ${s.startMinutes}.`,
          placeIds: [s.placeId],
        });
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Deterministic safe repair
// ---------------------------------------------------------------------------

function isMandatoryState(place: EnrichedPlace | undefined): boolean {
  if (!place) return true; // unknown rows cannot be dropped safely
  return !!(place.state.selected || place.state.pinned || place.state.lockedPosition
    || place.state.fixedTime || place.state.priorityAnchor);
}

function involvedOptionalDropIds(
  candidate: ItineraryCandidate,
  resolved: EnrichedPlace[],
): string[] {
  const byId = new Map(resolved.map((p) => [p.id, p]));
  const hardPlaceIds = new Set(
    candidate.constraintResult.hardViolations
      .filter((v) => v.severity === 'HARD')
      .flatMap((v) => v.placeIds ?? []),
  );
  if (!hardPlaceIds.size) return [];

  const involved = candidate.allStops
    .map((s) => byId.get(s.placeId))
    .filter((p): p is EnrichedPlace => !!p)
    .filter((p) => hardPlaceIds.has(p.id) && !isMandatoryState(p));

  return involved
    .sort(
      (a, b) =>
        (a.editorialPriority ?? 3) - (b.editorialPriority ?? 3)
        || (a.rating ?? 0) - (b.rating ?? 0)
        || (a.popularityScore ?? 0) - (b.popularityScore ?? 0)
        || a.id.localeCompare(b.id),
    )
    .map((p) => p.id);
}

function salvageDrop(
  candidate: ItineraryCandidate,
  dropId: string,
  intent: ItineraryIntent,
  resolved: EnrichedPlace[],
  zones: Zone[],
  dayStart: GeoCoords,
  speedKmh: number,
): ItineraryCandidate | null {
  const day = candidate.days.find((d) => d.placeIds.includes(dropId));
  if (!day) return null;

  const kept = day.placeIds.filter((id) => id !== dropId);
  const rebuiltDay = buildPlanDay(day.dayNumber, kept, day.zoneIds, {
    intent,
    resolved,
    zones,
    dayStart,
    speedKmh,
    date: null,
  });
  if (!rebuiltDay.stops.length) return null;

  const days = candidate.days
    .map((d) => (d.dayNumber === rebuiltDay.dayNumber ? rebuiltDay : d))
    .filter((d) => d.stops.length > 0);
  const allStops = days.flatMap((d) => d.stops).sort((a, b) => a.dayNumber - b.dayNumber || a.order - b.order);

  return {
    ...candidate,
    id: `${candidate.id}-repaired`,
    days,
    allStops,
    allStopIds: allStops.map((s) => s.placeId),
    constraintResult: candidate.constraintResult,
    warnings: [...candidate.warnings, {
      code: 'OPTIONAL_DROPPED_FOR_FIX',
      message: `Optional place ${dropId} was dropped to restore a feasible plan.`,
      severity: 'WARNING' as const,
      placeIds: [dropId],
    }],
    isRejected: false,
    rejectionReasons: [],
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function finalValidate(input: FinalValidationInput): FinalValidationResult {
  const { intent, candidate, resolved, zones, dayStart, speedKmh = 30, applySafeRepairs = true } = input;
  const droppedIds = new Set((input.dropped ?? []).map((d) => d.placeId));

  const plannedStops = plannedStopsFromSchedule(candidate.allStops);

  // Merge the candidate's own hard violations (already checked during
  // generation) with fresh structural + reused catalogue checks.
  const previousHard = candidate.constraintResult.hardViolations
    .filter((v) => v.severity === 'HARD');

  const reused: ConstraintViolation[] = [
    ...validateFixedTimeAnchors(intent, resolved, plannedStops, candidate.allStops),
    ...validateOpeningHours(resolved, candidate.allStops),
    ...validateBudgetCeiling(intent, plannedStops, resolved),
    ...validateImpossibleTravel(intent, candidate.allStops, plannedStops),
    ...validateTransportMode(intent),
    ...validateLockedPositions(intent, plannedStops),
  ];

  const structural = validateStructure(intent, candidate, resolved, droppedIds);

  const hardViolations = [...previousHard, ...reused, ...structural].reduce<ConstraintViolation[]>(
    (acc, v) => {
      if (!acc.some((x) => x.id === v.id && x.message === v.message)) acc.push(v);
      return acc;
    },
    [],
  );

  const warnings: PlanningWarning[] = [
    ...candidate.warnings,
    ...candidate.constraintResult.hardViolations
      .filter((v) => v.severity === 'SOFT')
      .map((v) => ({ code: v.id, message: v.message, severity: 'WARNING' as const, placeIds: v.placeIds, dayNumber: v.dayNumber })),
    ...candidate.constraintResult.softWarnings
      .map((v) => ({ code: v.id, message: v.message, severity: 'WARNING' as const, placeIds: v.placeIds, dayNumber: v.dayNumber })),
  ];

  const repairs = buildRepairs(hardViolations, candidate.constraintResult.softWarnings);

  let repairedCandidate: ItineraryCandidate | null = null;
  let repairedReason: string | null = null;

  if (applySafeRepairs && hardViolations.some((v) => v.severity === 'HARD')) {
    const candidatesForDrop = involvedOptionalDropIds(candidate, resolved);
    const rebuilt = salvageDrop(candidate, candidatesForDrop[0], intent, resolved, zones, dayStart, speedKmh);
    if (rebuilt) {
      repairedCandidate = rebuilt;
      repairedReason = `Dropped optional place ${candidatesForDrop[0]} (lowest-value deterministic repair).`;
    }
  }

  return {
    feasible: hardViolations.every((v) => v.severity !== 'HARD'),
    hardViolations,
    warnings,
    repairs,
    repairedCandidate,
    repairedReason,
  };
}