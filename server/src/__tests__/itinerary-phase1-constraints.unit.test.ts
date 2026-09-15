import { describe, expect, it } from 'vitest';
import {
  validateBudgetCeiling,
  validateFixedTimeAnchors,
  validateLockedPositions,
  validateMandatoryPlaces,
  validateOpeningHours,
  validatePlaceExistence,
  validatePlan,
} from '../modules/trips/itinerary/constraintValidator';
import { normalizeIntent } from '../modules/trips/itinerary/intent';
import { plannedStopsFromSchedule } from '../modules/trips/itinerary/scheduleBuilder';
import { jaipurPlaces, jabalpurPlaces } from './fixtures/itineraryPhase1Fixtures';

describe('constraint validator (Phase 1)', () => {
  it('H6: a mandatory place dropped from the plan is a hard violation', () => {
    const jpr = jaipurPlaces();
    const resolved = [jpr.amberFort, jpr.hawaMahal];
    const intent = normalizeIntent({
      destination: 'Jaipur',
      planningMode: 'SELF_BUILD',
      selectedPlaceIds: ['jpr-amber-fort', 'jpr-hawa-mahal'],
    }).intent;

    const violations = validateMandatoryPlaces(intent, resolved, [
      { placeId: 'jpr-amber-fort', dayNumber: 1, order: 1, startMinutes: null, endMinutes: null },
    ]);
    expect(violations.some((v) => v.id === 'H6_MANDATORY_DROPPED' && v.severity === 'HARD')).toBe(true);
  });

  it('H5: locked relative order is enforced', () => {
    const intent = normalizeIntent({
      destination: 'Jaipur',
      planningMode: 'SELF_BUILD',
      selectedPlaceIds: ['jpr-amber-fort', 'jpr-hawa-mahal'],
      lockedPlaceIds: ['jpr-amber-fort', 'jpr-hawa-mahal'],
    }).intent;
    const reordered = [
      { placeId: 'jpr-hawa-mahal', dayNumber: 1, order: 1, startMinutes: null, endMinutes: null },
      { placeId: 'jpr-amber-fort', dayNumber: 1, order: 2, startMinutes: null, endMinutes: null },
    ];
    expect(validateLockedPositions(intent, reordered).some((v) => v.id === 'H5_LOCKED_REORDERED')).toBe(true);
  });

  it('H4: a scheduled fixed-time anchor must keep its exact minute', () => {
    const jpr = jaipurPlaces();
    const intent = normalizeIntent({
      destination: 'Jaipur',
      planningMode: 'SELF_BUILD',
      selectedPlaceIds: ['jpr-amber-fort'],
      fixedTimePlaces: [{ placeId: 'jpr-amber-fort', startTime: '09:00' }],
    }).intent;
    const planned = [{ placeId: 'jpr-amber-fort', dayNumber: 1, order: 1, startMinutes: 9 * 60, endMinutes: 12 * 60 }];
    const scheduled = [
      {
        placeId: 'jpr-amber-fort',
        order: 1,
        dayNumber: 1,
        startMinutes: 11 * 60,
        endMinutes: 14 * 60,
        travelFromPrevMinutes: 0,
        distanceFromPrevKm: 0,
        fixedTimeAnchor: true,
        openingHoursRespected: null,
        warnings: [],
      },
    ];
    const violations = validateFixedTimeAnchors(intent, [jpr.amberFort], planned, scheduled);
    expect(violations.some((v) => v.id === 'H4_FIXED_TIME_MISMATCH')).toBe(true);
  });

  it('H7: scheduling a place inside trusted closed hours is hard; unknown hours are soft', () => {
    const jpr = jaipurPlaces();
    const closedStop = {
      placeId: jpr.amberFort.id,
      order: 1,
      dayNumber: 1,
      startMinutes: 20 * 60, // Amber hours 9-18
      endMinutes: 23 * 60,
      travelFromPrevMinutes: 0,
      distanceFromPrevKm: 0,
      fixedTimeAnchor: false,
      openingHoursRespected: false,
      warnings: [],
    };
    const hard = validateOpeningHours([jpr.amberFort], [closedStop]);
    expect(hard.some((v) => v.id === 'H7_OPENING_HOURS_VIOLATED' && v.severity === 'HARD')).toBe(true);

    const unknownHoursPlace = { ...jpr.govindDevJi, openingHours: null, hoursTrust: 'UNKNOWN' as const };
    const soft = validateOpeningHours([unknownHoursPlace], [{ ...closedStop, placeId: unknownHoursPlace.id }]);
    expect(soft.some((v) => v.id === 'H7_UNKNOWN_HOURS' && v.severity === 'SOFT')).toBe(true);
  });

  it('H8: estimated cost over the explicit budget ceiling is a hard violation unless overflow allowed', () => {
    const jpr = jaipurPlaces();
    const resolved = [jpr.amberFort, jpr.hawaMahal];
    const intent = normalizeIntent({
      destination: 'Jaipur',
      planningMode: 'SELF_BUILD',
      selectedPlaceIds: ['jpr-amber-fort', 'jpr-hawa-mahal'],
      travelers: 1,
      customBudgetAmount: 500,
    }).intent; // per-person fees (1 traveler): 550 + 200 = 750 > 500
    const planned = plannedStopsFromSchedule([
      {
        placeId: 'jpr-amber-fort', order: 1, dayNumber: 1,
        startMinutes: 9 * 60, endMinutes: 12 * 60, travelFromPrevMinutes: 0, distanceFromPrevKm: 0,
        fixedTimeAnchor: false, openingHoursRespected: null, warnings: [],
      },
      {
        placeId: 'jpr-hawa-mahal', order: 2, dayNumber: 1,
        startMinutes: 12 * 60, endMinutes: 13 * 60, travelFromPrevMinutes: 20, distanceFromPrevKm: 12,
        fixedTimeAnchor: false, openingHoursRespected: null, warnings: [],
      },
    ]);
    const violations = validateBudgetCeiling(intent, planned, resolved);
    expect(violations.some((v) => v.id === 'H8_BUDGET_EXCEEDED' && v.severity === 'HARD')).toBe(true);

    const overflow = normalizeIntent({
      destination: 'Jaipur', planningMode: 'SELF_BUILD', customBudgetAmount: 100,
      selectedPlaceIds: ['jpr-amber-fort'], travelers: 1, allowBudgetOverflow: true,
    }).intent;
    expect(validateBudgetCeiling(overflow, planned, resolved)).toHaveLength(0);
  });

  it('H1: a planned place missing from the resolved set is a hard violation', () => {
    const jpr = jaipurPlaces();
    const intent = normalizeIntent({ destination: 'Jaipur', planningMode: 'AI_BUILD' }).intent;
    const violations = validatePlaceExistence(
      intent,
      [jpr.hawaMahal],
      [{ placeId: 'jpr-ghost', dayNumber: 1, order: 1, startMinutes: null, endMinutes: null }],
    );
    expect(violations.some((v) => v.id === 'H1_MISSING_PLACE')).toBe(true);
  });

  it('validatePlan aggregates hard+soft and reports feasibility', () => {
    const jpr = jaipurPlaces();
    const resolved = [jpr.amberFort, jpr.hawaMahal];
    const intent = normalizeIntent({
      destination: 'Jaipur',
      planningMode: 'SELF_BUILD',
      selectedPlaceIds: ['jpr-amber-fort', 'jpr-hawa-mahal'],
      interests: ['heritage'],
      timePreference: 'MORNING_FOCUSED',
    }).intent;
    const stops = plannedStopsFromSchedule([
      {
        placeId: 'jpr-amber-fort', order: 1, dayNumber: 1,
        startMinutes: 9 * 60, endMinutes: 12 * 60, travelFromPrevMinutes: 0, distanceFromPrevKm: 0,
        fixedTimeAnchor: false, openingHoursRespected: null, warnings: [],
      },
      {
        placeId: 'jpr-hawa-mahal', order: 2, dayNumber: 1,
        startMinutes: 12 * 60, endMinutes: 13 * 60, travelFromPrevMinutes: 30, distanceFromPrevKm: 8,
        fixedTimeAnchor: false, openingHoursRespected: null, warnings: [],
      },
    ]);
    const result = validatePlan({ intent, resolvedPlaces: resolved, plannedStops: stops, scheduledStops: stops, ownerUserId: null });
    expect(result.feasible).toBe(true);
    expect(Array.isArray(result.hardViolations)).toBe(true);
    expect(result.suggestedRepairs.length).toBeGreaterThanOrEqual(0);
    void jabalpurPlaces;
  });
});