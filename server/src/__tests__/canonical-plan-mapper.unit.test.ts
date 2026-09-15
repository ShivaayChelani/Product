import { describe, expect, it } from 'vitest';
import {
  toRawPlanningInput,
  minutesFromTimeString,
  timeStringFromMinutes,
  timeSlotFromMinutes,
  stopReasonFor,
  isStopPinned,
  scheduledStopToWrite,
  plannedDayToWrites,
  estimatedBudgetOf,
  warningMessages,
  toCanonicalPlanRequest,
} from '../modules/trips/canonicalPlanMapper';
import { enrichPlace } from '../modules/trips/itinerary/enrichment';
import type { EnrichedPlace, ItineraryIntent, ScheduledStop } from '../modules/trips/itinerary/types';
import { jprIntent } from './fixtures/itineraryPhase2Fixtures';

function makeEnriched(overrides: { id?: string; entryFee?: EnrichedPlace['entryFee']; state?: EnrichedPlace['state'] } = {}): EnrichedPlace {
  const base: EnrichedPlace = enrichPlace(
    {
      id: overrides.id ?? 'test-place-1',
      name: 'Test Place',
      category: 'landmark',
      tags: [],
      city: 'Jaipur',
      state: 'Rajasthan',
      country: 'India',
      latitude: 26.9,
      longitude: 75.7,
      rating: 4.5,
      reviewCount: 100,
      popularityScore: 8.0,
      hiddenGemScore: 5.0,
      editorialPriority: 3,
      openingHours: null,
      ticketPrice: null,
      estimatedDurationMinutes: 60,
      recommendedDuration: null,
    },
    { travelerCount: 1, date: null, state: { selected: true, pinned: false, lockedPosition: false, fixedTime: false, priorityAnchor: false, complementary: false, optional: false } },
  );
  if (overrides.entryFee) base.entryFee = overrides.entryFee;
  if (overrides.state) base.state = overrides.state;
  return base;
}

function makeStop(overrides: Partial<ScheduledStop> = {}): ScheduledStop {
  return {
    placeId: 'test-place-1',
    order: 1,
    dayNumber: 1,
    startMinutes: 540,
    endMinutes: 600,
    travelFromPrevMinutes: 10,
    distanceFromPrevKm: 2.5,
    fixedTimeAnchor: false,
    openingHoursRespected: true,
    warnings: [],
    ...overrides,
  };
}

describe('toRawPlanningInput', () => {
  it('SELF_BUILD: passes selected ids and leaves priority empty', () => {
    const raw = toRawPlanningInput({
      destination: 'Jaipur',
      days: 2,
      mode: 'SELF_BUILD',
      selectedPlaceIds: ['a', 'b'],
    });
    expect(raw.planningMode).toBe('SELF_BUILD');
    expect(raw.selectedPlaceIds).toEqual(['a', 'b']);
    expect(raw.priorityPlaceIds).toEqual([]);
    expect(raw.fillWithAi).toBe(false);
  });

  it('AI_BUILD: maps selected ids to priority anchors and enables fillWithAi', () => {
    const raw = toRawPlanningInput({
      destination: 'Jaipur',
      mode: 'AI_BUILD',
      selectedPlaceIds: ['x', 'y'],
    });
    expect(raw.planningMode).toBe('AI_BUILD');
    expect(raw.priorityPlaceIds).toEqual(['x', 'y']);
    expect(raw.fillWithAi).toBe(true);
  });

  it('passes through avoid, transportation, and fixedTimePlaces', () => {
    const raw = toRawPlanningInput({
      destination: 'Jaipur',
      mode: 'SELF_BUILD',
      avoid: ['CROWDED', 'EXPENSIVE_ENTRY'],
      transportation: ['WALKING', 'BIKE'],
      fixedTimePlaces: [{ placeId: 'z', startTime: '10:30' }],
    });
    expect(raw.avoid).toEqual(['CROWDED', 'EXPENSIVE_ENTRY']);
    expect(raw.transportation).toEqual(['WALKING', 'BIKE']);
    expect(raw.fixedTimePlaces).toEqual([{ placeId: 'z', startTime: '10:30' }]);
  });

  it('budget CUSTOM passes customBudgetAmount; non-CUSTOM nulls it', () => {
    expect(toRawPlanningInput({ destination: 'X', mode: 'SELF_BUILD', budget: 'CUSTOM', customBudgetAmount: 5000 }).customBudgetAmount).toBe(5000);
    expect(toRawPlanningInput({ destination: 'X', mode: 'SELF_BUILD', budget: 'HIGH' }).customBudgetAmount).toBeNull();
    expect(toRawPlanningInput({ destination: 'X', mode: 'SELF_BUILD', budget: 'HIGH' }).budgetTier).toBe('HIGH');
  });

  it('AI_BUILD merges extra prompt-resolved ids into the priority anchors', () => {
    const raw = toRawPlanningInput(
      { destination: 'Jaipur', mode: 'AI_BUILD', selectedPlaceIds: ['x', 'y'] },
      ['r1', 'r2'],
    );
    expect(raw.priorityPlaceIds).toEqual(['x', 'y', 'r1', 'r2']);
    expect(raw.fillWithAi).toBe(true);
  });

  it('SELF_BUILD ignores extra prompt-resolved ids (never merged)', () => {
    const raw = toRawPlanningInput(
      { destination: 'Jaipur', mode: 'SELF_BUILD', selectedPlaceIds: ['x'] },
      ['r1'],
    );
    expect(raw.priorityPlaceIds).toEqual([]);
  });

  it('dedupes extra prompt-resolved ids against explicit picks', () => {
    const raw = toRawPlanningInput(
      { destination: 'Jaipur', mode: 'AI_BUILD', selectedPlaceIds: ['x'] },
      ['x', 'r1'],
    );
    expect(raw.priorityPlaceIds).toEqual(['x', 'x', 'r1']);
    // The engine de-dupes downstream; the mapper simply never silently drops.
    expect(raw.priorityPlaceIds.length).toBe(3);
  });
});

describe('minutesFromTimeString / minutesToTimeString', () => {
  it('roundtrips "HH:MM"', () => {
    expect(minutesFromTimeString('09:00')).toBe(540);
    expect(minutesFromTimeString('23:59')).toBe(1439);
    expect(minutesFromTimeString('00:00')).toBe(0);
    expect(timeStringFromMinutes(540)).toBe('09:00');
    expect(timeStringFromMinutes(1439)).toBe('23:59');
    expect(timeStringFromMinutes(0)).toBe('00:00');
    expect(timeStringFromMinutes(1445)).toBe('00:05'); // wraps
  });

  it('rejects garbage', () => {
    expect(minutesFromTimeString(null)).toBeNull();
    expect(minutesFromTimeString('')).toBeNull();
    expect(minutesFromTimeString('abc')).toBeNull();
    expect(minutesFromTimeString('25:00')).toBeNull();
  });
});

describe('timeSlotFromMinutes', () => {
  it('maps MORNING / AFTERNOON / EVENING boundaries', () => {
    expect(timeSlotFromMinutes(0)).toBe('MORNING');
    expect(timeSlotFromMinutes(719)).toBe('MORNING');
    expect(timeSlotFromMinutes(720)).toBe('AFTERNOON');
    expect(timeSlotFromMinutes(1019)).toBe('AFTERNOON');
    expect(timeSlotFromMinutes(1020)).toBe('EVENING');
    expect(timeSlotFromMinutes(1439)).toBe('EVENING');
  });
});

describe('stopReasonFor', () => {
  const intent: ItineraryIntent = jprIntent({ selectedPlaceIds: ['a'], fixedTimePlaces: [{ placeId: 'ft', startMinutes: 600, sourceStartTime: '10:00' }] });

  it('fixed time', () => {
    const p = makeEnriched({ id: 'ft', state: { selected: false, pinned: false, lockedPosition: false, fixedTime: true, priorityAnchor: false, complementary: false, optional: false } });
    expect(stopReasonFor(p, intent, 'Jaipur')).toContain('Fixed time');
  });

  it('pinned', () => {
    const p = makeEnriched({ state: { selected: false, pinned: true, lockedPosition: false, fixedTime: false, priorityAnchor: false, complementary: false, optional: false } });
    expect(stopReasonFor(p, intent, 'Jaipur')).toContain('pinned');
  });

  it('priority anchor (AI_BUILD)', () => {
    const p = makeEnriched({ id: 'a', state: { selected: false, pinned: false, lockedPosition: false, fixedTime: false, priorityAnchor: true, complementary: false, optional: false } });
    expect(stopReasonFor(p, intent, 'Jaipur')).toContain('High-priority');
  });

  it('complementary', () => {
    const p = makeEnriched({ state: { selected: false, pinned: false, lockedPosition: false, fixedTime: false, priorityAnchor: false, complementary: true, optional: false } });
    expect(stopReasonFor(p, intent, 'Jaipur')).toContain('Recommended');
  });

  it('complementary names the matched interest when present (Phase 5)', () => {
    const place = enrichPlace(
      {
        id: 'comp-1',
        name: 'Heritage Stepwell',
        category: 'historical',
        tags: ['heritage'],
        city: 'Jaipur',
        state: 'Rajasthan',
        country: 'India',
        latitude: 26.9,
        longitude: 75.7,
        rating: 4.4,
        reviewCount: 50,
        popularityScore: 6.0,
        hiddenGemScore: 3.0,
        editorialPriority: 2,
        openingHours: null,
        ticketPrice: null,
        estimatedDurationMinutes: 45,
        recommendedDuration: null,
      },
      { travelerCount: 1, date: null, state: { selected: false, pinned: false, lockedPosition: false, fixedTime: false, priorityAnchor: false, complementary: true, optional: false } },
    );
    const heritageIntent = jprIntent({ interests: ['heritage', 'food'] });
    const reason = stopReasonFor(place, heritageIntent, 'Jaipur');
    expect(reason).toContain('Recommended');
    expect(reason).toContain('heritage');
  });

  it('complementary without a matched interest stays generic', () => {
    const p = makeEnriched({ state: { selected: false, pinned: false, lockedPosition: false, fixedTime: false, priorityAnchor: false, complementary: true, optional: false } });
    expect(stopReasonFor(p, intent, 'Jaipur')).toBe('Recommended to complete your Jaipur itinerary.');
  });

  it('selected', () => {
    const p = makeEnriched({ id: 'a', state: { selected: true, pinned: false, lockedPosition: false, fixedTime: false, priorityAnchor: false, complementary: false, optional: false } });
    expect(stopReasonFor(p, intent, 'Jaipur')).toContain('selected');
  });
});

describe('isStopPinned', () => {
  it('pinned OR locked OR fixed → true', () => {
    expect(isStopPinned(makeEnriched({ state: { ...makeEnriched().state, pinned: true } }))).toBe(true);
    expect(isStopPinned(makeEnriched({ state: { ...makeEnriched().state, lockedPosition: true } }))).toBe(true);
    expect(isStopPinned(makeEnriched({ state: { ...makeEnriched().state, fixedTime: true } }))).toBe(true);
    expect(isStopPinned(makeEnriched({ state: { ...makeEnriched().state } }))).toBe(false);
  });
});

describe('scheduledStopToWrite', () => {
  it('populates entryFee when basis is PER_PERSON and trust VERIFIED', () => {
    const place = makeEnriched({ entryFee: { amount: 100, basis: 'PER_PERSON', trust: 'VERIFIED' } });
    const intent = jprIntent({ selectedPlaceIds: ['test-place-1'] });
    const write = scheduledStopToWrite(makeStop(), place, intent, 'Jaipur');
    expect(write.entryFee).toBe(100);
    expect(write.timeSlot).toBe('MORNING');
    expect(write.duration).toBe(60);
  });

  it('omits entryFee for FREE', () => {
    const place = makeEnriched({ entryFee: { amount: 0, basis: 'FREE', trust: 'VERIFIED' } });
    const intent = jprIntent({ selectedPlaceIds: ['test-place-1'] });
    const write = scheduledStopToWrite(makeStop(), place, intent, 'Jaipur');
    expect(write.entryFee).toBeUndefined();
  });

  it('sets isPinned true when place state is pinned', () => {
    const place = makeEnriched({ state: { ...makeEnriched().state, pinned: true } });
    const intent = jprIntent({ selectedPlaceIds: ['test-place-1'] });
    expect(scheduledStopToWrite(makeStop(), place, intent, 'Jaipur').isPinned).toBe(true);
  });
});

describe('plannedDayToWrites', () => {
  it('maps day stops to ordered LegacyStopWrite array', () => {
    const place = makeEnriched({ id: 'p1', entryFee: { amount: 250, basis: 'PER_PERSON', trust: 'VERIFIED' } });
    const intent = jprIntent({ selectedPlaceIds: ['p1'] });
    const day = {
      dayNumber: 1,
      zoneIds: [],
      placeIds: ['p1'],
      sequence: [place],
      stops: [makeStop({ placeId: 'p1', order: 1, startMinutes: 600, endMinutes: 690 })],
      totalMinutes: 90,
      visitMinutes: 90,
      travelMinutes: 0,
      detourIndex: 0,
      openingHoursFeasible: true,
      warnings: [],
    } as any;
    const writes = plannedDayToWrites(day, intent, new Map([['p1', place]]), 'Jaipur');
    expect(writes).toHaveLength(1);
    expect(writes[0].entryFee).toBe(250);
    expect(writes[0].startTime).toBe('10:00');
    expect(writes[0].endTime).toBe('11:30');
  });
});

describe('estimatedBudgetOf', () => {
  it('sums party-level entry fees across all stops', () => {
    const places = new Map<string, EnrichedPlace>();
    places.set('a', makeEnriched({ id: 'a', entryFee: { amount: 100, basis: 'PER_PERSON', trust: 'VERIFIED' } }));
    places.set('b', makeEnriched({ id: 'b', entryFee: { amount: 50, basis: 'PER_PERSON', trust: 'VERIFIED' } }));
    places.set('c', makeEnriched({ id: 'c', entryFee: { amount: 0, basis: 'FREE', trust: 'VERIFIED' } }));
    expect(estimatedBudgetOf(places, ['a', 'b', 'c'])).toBe(150);
  });

  it('skips UNKNOWN trust entries', () => {
    const places = new Map<string, EnrichedPlace>();
    places.set('a', makeEnriched({ id: 'a', entryFee: { amount: 100, basis: 'PER_PERSON', trust: 'UNKNOWN' } }));
    expect(estimatedBudgetOf(places, ['a'])).toBe(0);
  });
});

describe('warningMessages', () => {
  it('deduplicates messages', () => {
    const warnings = [
      { code: 'A', message: 'Foo', severity: 'WARNING' as const },
      { code: 'B', message: 'Bar', severity: 'WARNING' as const },
      { code: 'C', message: 'Foo', severity: 'INFO' as const },
    ];
    expect(warningMessages(warnings)).toEqual(['Foo', 'Bar']);
  });
});

describe('toCanonicalPlanRequest bridge', () => {
  it('maps manualPlaceIds → selectedPlaceIds with mode AI_BUILD', () => {
    const req = toCanonicalPlanRequest({
      destination: 'Jaipur',
      days: 3,
      pace: 'BALANCED',
      travelers: 'COUPLE',
      budget: 'MEDIUM',
      interests: ['heritage'],
      manualPlaceIds: ['p1', 'p2'],
    });
    expect(req.mode).toBe('AI_BUILD');
    expect(req.selectedPlaceIds).toEqual(['p1', 'p2']);
    expect(req.destination).toBe('Jaipur');
    expect(req.days).toBe(3);
  });
});
