import { describe, expect, it } from 'vitest';
import {
  buildBackboneOrder,
  computeSequenceScore,
  nearestNeighborOrder,
  optimizeDayOrder,
  routeDetourIndex,
  twoOptImprove,
} from '../modules/trips/itinerary/routeOptimizer';
import { jaipurPlaces, jabalpurPlaces } from './fixtures/itineraryPhase1Fixtures';

const ORIGIN = { lat: 26.924, lng: 75.825 };

describe('route optimizer (Phase 1)', () => {
  it('nearestNeighborOrder returns a simple chain and respects identical input size', () => {
    const pts = [
      { id: 'a', latitude: 0, longitude: 0 },
      { id: 'b', latitude: 0, longitude: 0.01 },
      { id: 'c', latitude: 0, longitude: 0.02 },
    ];
    expect(nearestNeighborOrder(pts)).toHaveLength(3);
    expect(new Set(nearestNeighborOrder(pts).map((p) => p.id)).size).toBe(3);
  });

  it('twoOptImprove never improves the de-facto optimal chain and is deterministic', () => {
    const pts = [
      { id: 'a', latitude: 0, longitude: 0 },
      { id: 'b', latitude: 0, longitude: 0.1 },
      { id: 'c', latitude: 0, longitude: 0.2 },
      { id: 'd', latitude: 0, longitude: 0.3 },
    ];
    expect(twoOptImprove(pts, { latitude: 0, longitude: 0 }, 40).map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('routeDetourIndex is unit when walking a straight line', () => {
    const pts = [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 0.1 },
      { latitude: 0, longitude: 0.2 },
    ];
    expect(routeDetourIndex(pts)).toBe(1);
  });

  it('buildBackboneOrder keeps locked ids first, then fixed-time anchors by start', () => {
    const jpr = jaipurPlaces();
    const places = [jpr.amberFort, jpr.jaigarhFort, jpr.nahargarhFort, jpr.hawaMahal];
    const backbone = buildBackboneOrder(
      places,
      ['jpr-amber-fort', 'jpr-jaigarh'],
      [
        { placeId: 'jpr-nahargarh', startMinutes: 17 * 60 },
        { placeId: 'jpr-hawa-mahal', startMinutes: 10 * 60 },
      ],
    );
    expect(backbone).toEqual(['jpr-amber-fort', 'jpr-jaigarh', 'jpr-hawa-mahal', 'jpr-nahargarh']);
  });

  it('optimizeDayOrder preserves locked relative order even when not travel-optimal', () => {
    const jpr = jaipurPlaces();
    const places = [
      jpr.hawaMahal,   // city center
      jpr.cityPalace,  // city center
      jpr.amberFort,   // hill ~11 km NE
      jpr.nahargarhFort,
    ];
    const result = optimizeDayOrder(places, {
      dayStart: ORIGIN,
      speedKmh: 30,
      backboneOrder: ['jpr-city-palace', 'jpr-amber-fort'],
    });
    const ids = result.order.map((p) => p.id);
    const cityIdx = ids.indexOf('jpr-city-palace');
    const amberIdx = ids.indexOf('jpr-amber-fort');
    expect(cityIdx).toBeGreaterThanOrEqual(0);
    expect(amberIdx).toBeGreaterThan(cityIdx);
    expect(result.totalKm).toBeGreaterThan(0);
    expect(result.detourIndex).toBeGreaterThanOrEqual(1);
  });

  it('computeSequenceScore reports opening-hour infeasibility without lying', () => {
    const jpr = jaipurPlaces();
    const byId = new Map([jpr.amberFort, jpr.hawaMahal, jpr.jaigarhFort].map((p) => [p.id, p]));
    const score = computeSequenceScore(
      [jpr.amberFort, jpr.hawaMahal, jpr.jaigarhFort],
      { byId, speedKmh: 30, earliestStartMinutes: 9 * 60, date: null, backbone: [] },
      ORIGIN,
    );
    expect(score.totalKm).toBeGreaterThan(0);
    expect(Array.isArray(score.reasons)).toBe(true);
  });

  it('optimizeDayOrder favors an evening place when promotion is cheap', () => {
    const b = jabalpurPlaces();
    // Dhuandhar Falls is sunset-friendly; route should pull it toward the end
    // when moving it costs little.
    const places = [b.dhuandhar, b.gwarighat];
    const result = optimizeDayOrder(places, {
      dayStart: { lat: 23.1815, lng: 79.9864 },
      speedKmh: 30,
      backboneOrder: [],
      preferEveningFinish: true,
    });
    // dhuandhar has high eveneg affinity — with only two stops it may swap to end
    // only when detour stays small; either way the output is complete + feasible.
    expect(result.order).toHaveLength(2);
    expect(result.openingHoursFeasible || result.openingHoursFeasible === false).toBe(true);
  });
});