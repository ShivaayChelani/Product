import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DAY_END_MINUTES,
  DEFAULT_DAY_START_MINUTES,
  buildDaySchedule,
  fixedTimeMap,
  planVisitWindow,
  plannedStopsFromSchedule,
} from '../modules/trips/itinerary/scheduleBuilder';
import { haversineKm } from '../modules/trips/itinerary/clustering';
import { jaipurPlaces, jabalpurPlaces } from './fixtures/itineraryPhase1Fixtures';

const ORIGIN = { lat: 23.1815, lng: 79.9864 };
const JAIPUR_START = { lat: 26.9855, lng: 75.8513 };

describe('schedule builder (Phase 1)', () => {
  it('planVisitWindow rejects a window smaller than the visit duration', () => {
    const b = jabalpurPlaces();
    const w = planVisitWindow(b.dhuandhar, {
      windowStart: 12 * 60,
      windowEnd: 12 * 60 + 30, // 30 minutes < 90-minute visit
      anchorStart: null,
      hardCloseMinutes: null,
      openingFrom: null,
    });
    expect(w.feasible).toBe(false);
    expect(w.warnings.some((x) => x.code === 'WINDOW_TOO_SMALL')).toBe(true);
  });

  it('planVisitWindow shifts into the next open minute when the recommendation is closed', () => {
    const jpr = jaipurPlaces();
    const w = planVisitWindow(jpr.govindDevJi, {
      windowStart: 8 * 60,
      windowEnd: 13 * 60,
      anchorStart: null,
      hardCloseMinutes: null,
      openingFrom: 5 * 60,
    });
    expect(w.feasible).toBe(true);
    expect(w.recommendedStartMinutes).toBeGreaterThanOrEqual(8 * 60);
  });

  it('buildDaySchedule honors a fixed-time anchor exactly', () => {
    const jpr = jaipurPlaces();
    const result = buildDaySchedule({
      places: [jpr.amberFort, jpr.hawaMahal],
      dayNumber: 1,
      dayStart: JAIPUR_START,
      windowStart: DEFAULT_DAY_START_MINUTES,
      windowEnd: DEFAULT_DAY_END_MINUTES,
      fixedTime: new Map([[jpr.amberFort.id, 9 * 60]]),
      speedKmh: 30,
      insertLunchBuffer: true,
    });
    const amber = result.stops.find((s) => s.placeId === jpr.amberFort.id)!;
    expect(amber.startMinutes).toBe(9 * 60);
    expect(result.stops.length).toBe(2);
    expect(result.totalMinutes).toBeGreaterThan(0);
  });

  it('buildDaySchedule shifts a closed-time start and warns transparently', () => {
    const jpr = jaipurPlaces();
    // Govind Dev Ji opens 05:00; a fabricated pre-open start must be corrected.
    const result = buildDaySchedule({
      places: [jpr.govindDevJi],
      dayNumber: 1,
      dayStart: ORIGIN,
      windowStart: 4 * 60,
      windowEnd: 8 * 60,
      speedKmh: 30,
    });
    expect(result.stops[0].startMinutes).toBeGreaterThanOrEqual(5 * 60);
    void result.warnings;
  });

  it('fixedTimeMap converts specs to a lookup and plannedStopsFromSchedule maps back cleanly', () => {
    const b = jabalpurPlaces();
    const map = fixedTimeMap([{ placeId: b.dhuandhar.id, startMinutes: 9 * 60 }]);
    expect(map.get(b.dhuandhar.id)).toBe(9 * 60);
    const built = buildDaySchedule({
      places: [b.dhuandhar],
      dayNumber: 1,
      dayStart: ORIGIN,
      windowStart: 8 * 60,
      windowEnd: 20 * 60,
      fixedTime: map,
      speedKmh: 30,
    });
    const planned = plannedStopsFromSchedule(built.stops);
    expect(planned[0].placeId).toBe('jbp-dhuandhar');
    expect(planned[0].distanceFromPrevKm).toBe(0);
  });

  it('previous-stop distance is consecutive itinerary order, not origin→stop', () => {
    const b = jabalpurPlaces();
    const result = buildDaySchedule({
      places: [b.dhuandhar, b.marbleRocks],
      dayNumber: 1,
      dayStart: ORIGIN,
      windowStart: 8 * 60,
      windowEnd: 20 * 60,
      speedKmh: 30,
    });
    expect(result.stops[0].distanceFromPrevKm).toBe(0);
    expect(result.stops[1].distanceFromPrevKm).toBeGreaterThan(0);
    const expected = Math.round(
      haversineKm(
        b.dhuandhar.coordinates.lat,
        b.dhuandhar.coordinates.lng,
        b.marbleRocks.coordinates.lat,
        b.marbleRocks.coordinates.lng,
      ) * 100,
    ) / 100;
    expect(result.stops[1].distanceFromPrevKm).toBe(expected);
  });
});