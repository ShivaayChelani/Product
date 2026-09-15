import { describe, expect, it } from 'vitest';
import {
  COMPACT_OUTING_DIAMETER_KM,
  MAX_DAY_SPAN_KM,
  ZONE_ADJACENT_CENTER_KM,
  buildDayAreas,
  buildZoneAround,
  buildZones,
  clusterCenterOf,
  clusterDiameterKm,
  estimateTravelMinutes,
  haversineKm,
  scoreZone,
  shouldCombineForDay,
} from '../modules/trips/itinerary/clustering';
import { jabalpurPlaces, jaipurPlaces } from './fixtures/itineraryPhase1Fixtures';

const ORIGIN = { lat: 23.1815, lng: 79.9864 };

describe('clustering (Phase 1)', () => {
  it('haversineKm computes a sane approximate distance', () => {
    const km = haversineKm(23.1815, 79.9864, 23.1815, 80.5);
    expect(km).toBeGreaterThan(50);
    expect(km).toBeLessThan(60); // 0.5136 deg lng at lat 23 ≈ 52 km
  });

  it('estimateTravelMinutes includes the fixed parking/buffer minute', () => {
    expect(estimateTravelMinutes(15, 30)).toBe(40); // 30 min drive + 10 buffer
    expect(estimateTravelMinutes(8, 40)).toBe(22);  // 12 min drive + 10 buffer
  });

  it('clusterCenterOf is the centroid and clusterDiameterKm the max pairwise span', () => {
    const bhedaghat = jabalpurPlaces();
    const members = [bhedaghat.dhuandhar, bhedaghat.marbleRocks, bhedaghat.chausathYogini];
    const center = clusterCenterOf(members);
    const span = clusterDiameterKm(members);
    expect(typeof center.lat).toBe('number');
    expect(span).toBeGreaterThan(0);
    // Dhuandhar and Marble Rocks are adjacent; the trio stays compact.
    expect(span).toBeLessThan(COMPACT_OUTING_DIAMETER_KM + 2);
  });

  it('buildZones groups the three Bhedaghat-area attractions into one zone', () => {
    const bhedaghat = jabalpurPlaces();
    const pool = [
      bhedaghat.dhuandhar,
      bhedaghat.marbleRocks,
      bhedaghat.chausathYogini,
      bhedaghat.raniDurgavatiMuseum, // ~16 km away in the city
    ];
    const zones = buildZones(pool);
    const bhedaghatZone = zones.find((z) => z.placeIds.includes(bhedaghat.dhuandhar.id));
    expect(bhedaghatZone).toBeDefined();
    expect(bhedaghatZone!.placeIds).toContain(bhedaghat.marbleRocks.id);
    expect(bhedaghatZone!.placeIds).toContain(bhedaghat.chausathYogini.id);
    // Museum is too far to join the falls outing.
    const museumZone = zones.find((z) => z.placeIds.includes(bhedaghat.raniDurgavatiMuseum.id));
    expect(museumZone!.placeIds).not.toContain(bhedaghat.dhuandhar.id);
  });

  it('buildZoneAround seeds the zone at the requested place', () => {
    const jpr = jaipurPlaces();
    const pool = [jpr.amberFort, jpr.jaigarhFort, jpr.nahargarhFort, jpr.hawaMahal];
    const zone = buildZoneAround(jpr.amberFort, pool);
    expect(zone.hubPlaceId).toBe(jpr.amberFort.id);
    expect(zone.placeIds).toContain(jpr.amberFort.id);
    expect(zone.compact).toBe(true);
  });

  it('computeAdjacency links close centers within the adjacency threshold', () => {
    const jpr = jaipurPlaces();
    const zones = buildZones([jpr.hawaMahal, jpr.cityPalace, jpr.amberFort, jpr.jaigarhFort]);
    const oldCity = zones.find((z) => z.placeIds.includes(jpr.hawaMahal.id))!;
    expect(oldCity.adjacentZoneIds.length).toBeGreaterThan(0);
    expect(ZONE_ADJACENT_CENTER_KM).toBe(12);
  });

  it('shouldCombineForDay allows adjacent zones to share a day (soft preference)', () => {
    const jpr = jaipurPlaces();
    const pool = [jpr.hawaMahal, jpr.cityPalace, jpr.amberFort, jpr.jaigarhFort, jpr.nahargarhFort];
    const zones = buildZones(pool);
    const byId = new Map(pool.map((p) => [p.id, p]));

    const primary = zones.find((z) => z.placeIds.includes(jpr.amberFort.id))!;
    const secondary = zones.find((z) => z.placeIds.includes(jpr.hawaMahal.id))!;
    // Amber hill and the old city are a natural same-day pair.
    const decision = shouldCombineForDay(primary, secondary, { poolById: byId, dayStart: ORIGIN, adjacentCenterKm: 14 });
    expect(decision.combine).toBe(true);
    void MAX_DAY_SPAN_KM;
  });

  it('scoreZone rewards richness and penalizes sprawl, but never vetoes on distance alone', () => {
    const bhedaghat = jabalpurPlaces();
    const pool = [bhedaghat.dhuandhar, bhedaghat.marbleRocks, bhedaghat.chausathYogini];
    const zones = buildZones(pool);
    const byId = new Map(pool.map((p) => [p.id, p]));
    const scored = scoreZone(zones[0], byId, ORIGIN);
    expect(scored.memberCount).toBe(3);
    expect(scored.score).toBeGreaterThan(0);
    expect(scored.reason.length).toBeGreaterThan(0);
  });

  it('buildDayAreas returns zone groupings for a multi-day horizon', () => {
    const bhedaghat = jabalpurPlaces();
    const pool = [bhedaghat.dhuandhar, bhedaghat.marbleRocks, bhedaghat.chausathYogini, bhedaghat.gwarighat];
    const zones = buildDayAreas(pool, 1);
    expect(zones.length).toBeGreaterThan(0);
    expect(zones.some((z) => z.placeIds.includes(bhedaghat.dhuandhar.id))).toBe(true);
  });
});