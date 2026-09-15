/**
 * Unit tests for the Phase 2 day allocator (capacity-aware mandatory placement,
 * spill with disclosure, adjacent zone merging, and single-day regeneration).
 */

import { describe, it, expect } from 'vitest';
import type { EnrichedPlace, ItineraryIntent, PlaceState } from '../types';
import { enrichPlace } from '../enrichment';
import { buildZones } from '../clustering';
import {
  allocateDays,
  estimateDayMinutes,
  mandatoryPlaces,
  orderMembersByPriority,
  survivalRankOf,
} from '../dayAllocator';
import { jaipurRecords, jprIntent, JAIPUR_IDS, JAIPUR_ORIGIN } from '../../../../__tests__/fixtures/itineraryPhase2Fixtures';

const RECORDS = new Map(jaipurRecords().map((r) => [r.id, r]));

/** Enrich a subset of the Jaipur records with intent-derived state flags. */
function poolFor(intent: ItineraryIntent): EnrichedPlace[] {
  const explicit = new Set([
    ...intent.selectedPlaceIds,
    ...intent.pinnedPlaceIds,
    ...intent.lockedPlaceIds,
    ...intent.fixedTimePlaces.map((f) => f.placeId),
    ...intent.priorityPlaceIds,
  ]);
  const rows = jaipurRecords().filter(
    (r) => explicit.has(r.id) || intent.planningMode === 'AI_BUILD',
  );
  return rows.map((r) => poolRow(r.id, explicit, intent));
}

function poolRow(id: string, explicit: Set<string>, intent: ItineraryIntent): EnrichedPlace {
  const record = RECORDS.get(id);
  if (!record) throw new Error(`Unknown fixture id ${id}`);
  const state: PlaceState = {
    selected: intent.selectedPlaceIds.includes(id),
    pinned: intent.pinnedPlaceIds.includes(id),
    lockedPosition: intent.lockedPlaceIds.includes(id),
    fixedTime: intent.fixedTimePlaces.some((f) => f.placeId === id),
    priorityAnchor: intent.planningMode === 'AI_BUILD' && intent.priorityPlaceIds.includes(id),
    complementary: intent.planningMode === 'AI_BUILD' && !explicit.has(id),
    optional: false,
  };
  return enrichPlace(record, { travelerCount: intent.travelers, date: null, state });
}

function alloc(
  intent: ItineraryIntent,
  ordering: 'PRIORITY' | 'AREA' | 'OPENING_HOURS' = 'PRIORITY',
) {
  const pool = poolFor(intent);
  const zones = buildZones(pool, { includePlaceIds: [...intent.lockedPlaceIds, ...intent.pinnedPlaceIds] });
  return allocateDays({ intent, pool, zones, dayStart: JAIPUR_ORIGIN, speedKmh: 35, ordering });
}

const ALL = JAIPUR_IDS;

describe('allocateDays', () => {
  it('places every mandatory place across the available days', () => {
    const intent = jprIntent({
      planningMode: 'AI_BUILD', days: 2, pace: 'QUICK',
      priorityPlaceIds: [ALL[0], ALL[3], ALL[4]], fillWithAi: true,
    });
    const result = alloc(intent);
    expect(result.feasible).toBe(true);
    expect(result.unplacedIds).toEqual([]);
    const placed = result.days.flatMap((d) => d.placeIds);
    expect(placed).toContain(ALL[0]);
    expect(placed).toContain(ALL[3]);
    expect(placed).toContain(ALL[4]);
  });

  it('never exceeds the per-day stop budget', () => {
    const intent = jprIntent({ planningMode: 'SELF_BUILD', days: 2, pace: 'QUICK', selectedPlaceIds: ALL });
    const result = alloc(intent);
    expect(result.feasible).toBe(true);
    for (const day of result.days) expect(day.placeIds.length).toBeLessThanOrEqual(7);
  });

  it('reports infeasibility when days x capacity cannot hold the mandatory set', () => {
    const intent = jprIntent({ planningMode: 'SELF_BUILD', days: 1, pace: 'QUICK', selectedPlaceIds: ALL });
    const result = alloc(intent);
    expect(result.feasible).toBe(false);
    expect(result.unplacedIds.length).toBeGreaterThan(0);
    const codes = result.warnings.map((w) => w.code);
    expect(codes).toContain('DAY_OVERCONSTRAINED');
    expect(codes).toContain('MANDATORY_CANNOT_FIT');
  });

  it('merges adjacent zones into one day when the material would fit', () => {
    const intent = jprIntent({ planningMode: 'SELF_BUILD', days: 1, pace: 'QUICK', selectedPlaceIds: ['jpr-amber-fort', 'jpr-hawa-mahal'] });
    const result = alloc(intent);
    expect(result.feasible).toBe(true);
    expect(result.days).toHaveLength(1);
    // Amber area and the old city may share a day (adjacent), so both zones appear.
    expect(result.days[0].placeIds).toEqual(expect.arrayContaining(['jpr-amber-fort', 'jpr-hawa-mahal']));
  });

  it('keeps far-apart areas on separate days', () => {
    // A synthetic far place (outside any Jaipur zone) must land on its own day,
    // never on the day of an unrelated area 60km away.
    const intent = jprIntent({ planningMode: 'SELF_BUILD', days: 2, pace: 'QUICK', selectedPlaceIds: ['jpr-hawa-mahal'] });
    const pool = poolFor(intent);
    const record = RECORDS.get('jpr-hawa-mahal')!;
    const far = enrichPlace(
      { ...record, id: 'jpr-far-away', name: 'Far Away Site', latitude: 26.1, longitude: 75.4 },
      { travelerCount: 2, date: null, state: { selected: true, pinned: false, lockedPosition: false, fixedTime: false, priorityAnchor: false, complementary: false, optional: false } },
    );
    const zones = buildZones([...pool, far], {});
    const result = allocateDays({ intent, pool: [...pool, far], zones, dayStart: JAIPUR_ORIGIN, speedKmh: 35 });
    expect(result.feasible).toBe(true);
    const hawaDay = result.days.find((d) => d.placeIds.includes('jpr-hawa-mahal'));
    const farDay = result.days.find((d) => d.placeIds.includes('jpr-far-away'));
    expect(hawaDay).toBeDefined();
    expect(farDay).toBeDefined();
    expect(hawaDay!.dayNumber).not.toBe(farDay!.dayNumber);
  });

  it('regeneration rebuilds a single day and ignores other days', () => {
    const intent = jprIntent({ planningMode: 'SELF_BUILD', days: 2, pace: 'QUICK', selectedPlaceIds: ['jpr-hawa-mahal', 'jpr-city-palace', 'jpr-nahargarh'] });
    const pool = poolFor(intent);
    const zones = buildZones(pool, {});
    const preserved = new Map<number, string[]>([[1, ['jpr-hawa-mahal', 'jpr-city-palace']]]);
    const result = allocateDays({ intent, pool, zones, dayStart: JAIPUR_ORIGIN, speedKmh: 35, ordering: 'PRIORITY', singleDay: 2, preservedDayAssignments: preserved });
    expect(result.feasible).toBe(true);
    expect(result.days).toHaveLength(1);
    expect(result.days[0].dayNumber).toBe(2);
    expect(result.days[0].placeIds).toEqual(['jpr-nahargarh']);
  });
});

describe('mandatoryPlaces / survivalRankOf / orderMembersByPriority', () => {
  it('collects selected+pinned+locked+fixed+priority states as mandatory', () => {
    const intent = jprIntent({
      planningMode: 'AI_BUILD', days: 2, pace: 'QUICK',
      selectedPlaceIds: [ALL[3]], pinnedPlaceIds: [ALL[0]],
      lockedPlaceIds: [ALL[4]], fixedTimePlaces: [{ placeId: ALL[5], startMinutes: 570, sourceStartTime: '09:30' }],
      priorityPlaceIds: [ALL[6]], fillWithAi: true,
    });
    const ids = mandatoryPlaces(poolFor(intent)).ids;
    expect(ids).toEqual(expect.arrayContaining([ALL[0], ALL[3], ALL[4], ALL[5], ALL[6]]));
  });

  it('ranks pinned/locked above anchors above selected', () => {
    const base = { pinned: false, lockedPosition: false, fixedTime: false, priorityAnchor: false, selected: false, complementary: false, optional: false };
    const wrap = (flags: typeof base) => ({ state: flags });
    const pin = { ...base, pinned: true };
    const lock = { ...base, lockedPosition: true };
    const anchor = { ...base, priorityAnchor: true };
    const sel = { ...base, selected: true };
    expect(survivalRankOf(wrap(pin) as unknown as EnrichedPlace)).toBe(4);
    expect(survivalRankOf(wrap(lock) as unknown as EnrichedPlace)).toBe(4);
    expect(survivalRankOf(wrap(anchor) as unknown as EnrichedPlace)).toBe(3);
    expect(survivalRankOf(wrap(sel) as unknown as EnrichedPlace)).toBe(1);
  });

  it('sorts mandatory members by priority then value', () => {
    const pinned = poolRow('jpr-amber-fort', new Set(), jprIntent({ pinnedPlaceIds: ['jpr-amber-fort'] }));
    const selected = poolRow('jpr-hawa-mahal', new Set(), jprIntent({ selectedPlaceIds: ['jpr-hawa-mahal'] }));
    const ordered = orderMembersByPriority([selected, pinned]);
    expect(ordered[0].id).toBe('jpr-amber-fort');
  });
});

describe('estimateDayMinutes (Phase 5 capacity-driven cap)', () => {
  it('sums visit durations and adds travel legs from the day start', () => {
    const intent = jprIntent({ planningMode: 'AI_BUILD', days: 1, pace: 'QUICK', fillWithAi: true, priorityPlaceIds: ['jpr-hawa-mahal'] });
    const pool = poolFor(intent);
    const byId = new Map(pool.map((p) => [p.id, p]));
    const total = estimateDayMinutes(['jpr-hawa-mahal', 'jpr-city-palace'], byId, JAIPUR_ORIGIN, 35);
    // 60 + 75 (sightseeing slices cap at 75) visit minutes + at least one 10-minute travel buffer.
    expect(total).toBeGreaterThanOrEqual(60 + 75 + 10);
  });

  it('is zero for an empty day', () => {
    const pool = poolFor(jprIntent());
    expect(estimateDayMinutes([], new Map(pool.map((p) => [p.id, p])), JAIPUR_ORIGIN, 35)).toBe(0);
  });

  it('works without a day start (no leading travel leg)', () => {
    const intent = jprIntent({ planningMode: 'AI_BUILD', days: 1, pace: 'QUICK', fillWithAi: true, priorityPlaceIds: ['jpr-hawa-mahal'] });
    const pool = poolFor(intent);
    const byId = new Map(pool.map((p) => [p.id, p]));
    const total = estimateDayMinutes(['jpr-hawa-mahal'], byId, null, 35);
    expect(total).toBe(60);
  });
});

describe('allocateDays Phase 5 capacity-driven complement cap', () => {
  it('does not cram optionals onto a relaxed day past its minute budget', () => {
    const intent = jprIntent({ planningMode: 'AI_BUILD', days: 1, pace: 'VERY_RELAXED', fillWithAi: true });
    const result = alloc(intent);
    expect(result.feasible).toBe(true);
    const pool = poolFor(intent);
    const byId = new Map(pool.map((p) => [p.id, p]));
    for (const day of result.days) {
      expect(estimateDayMinutes(day.placeIds, byId, JAIPUR_ORIGIN, 35)).toBeLessThanOrEqual(390);
    }
    // Day capacity still holds for VERY_RELAXED (4 stops).
    for (const day of result.days) expect(day.placeIds.length).toBeLessThanOrEqual(4);
  });

  it('single-day regeneration also respects the minute budget when topping up', () => {
    const intent = jprIntent({ planningMode: 'AI_BUILD', days: 1, pace: 'VERY_RELAXED', fillWithAi: true });
    const pool = poolFor(intent);
    const zones = buildZones(pool, {});
    const preserved = new Map<number, string[]>([]);
    const result = allocateDays({
      intent, pool, zones, dayStart: JAIPUR_ORIGIN, speedKmh: 35,
      ordering: 'PRIORITY', singleDay: 1, preservedDayAssignments: preserved,
    });
    expect(result.feasible).toBe(true);
    const byId = new Map(pool.map((p) => [p.id, p]));
    for (const day of result.days) {
      expect(estimateDayMinutes(day.placeIds, byId, JAIPUR_ORIGIN, 35)).toBeLessThanOrEqual(390);
    }
  });
});