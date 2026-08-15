import fs from 'fs';
import path from 'path';
import {
  resolveTripOriginDisplay,
  tripStatusBadge,
} from '../features/myTrips/utils/tripFormatting';
import {
  resolveContinueNavigation,
  resolveItineraryNavigation,
} from '../utils/tripNavigation';
import type { TripPlan } from '../services/api/trips';

const root = path.join(__dirname, '..');

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const baseTripDays = [
  { id: 'd1', tripPlanId: 't1', dayNumber: 1, stops: [{ id: 's1', placeId: 'p1' }] },
];

const aiUpcoming = {
  id: 'ai-up',
  status: 'UPCOMING' as const,
  generationSource: 'AI_PROMPT' as const,
  tripDays: baseTripDays,
};

const manualDraft = {
  id: 'manual-draft',
  status: 'DRAFT' as const,
  generationSource: 'MANUAL' as const,
  tripDays: baseTripDays,
};

const hybridUpcoming = {
  id: 'hybrid-up',
  status: 'UPCOMING' as const,
  generationSource: 'HYBRID' as const,
  tripDays: baseTripDays,
};

describe('trip origin label helper', () => {
  it('TEST 1 — AI trip resolves to AI PLANNED label', () => {
    expect(resolveTripOriginDisplay('AI_PROMPT')).toEqual({
      kind: 'ai',
      label: '✨ AI PLANNED',
      sublabel: 'Planned with AI',
    });
  });

  it('TEST 2 — manual trip resolves to MANUAL TRIP label', () => {
    expect(resolveTripOriginDisplay('MANUAL')).toEqual({
      kind: 'manual',
      label: '🗺️ MANUAL TRIP',
      sublabel: 'Created manually',
    });
  });

  it('TEST 3 — unknown/legacy/null is neutral TRIP (never misclassified)', () => {
    expect(resolveTripOriginDisplay(null).label).toBe('TRIP');
    expect(resolveTripOriginDisplay(undefined).label).toBe('TRIP');
    expect(resolveTripOriginDisplay('').label).toBe('TRIP');
    expect(resolveTripOriginDisplay('LEGACY_VALUE').label).toBe('TRIP');
    expect(resolveTripOriginDisplay(null).kind).toBe('unknown');
  });

  it('TEST 4 — status badge is independent from trip origin type', () => {
    const draftManual = tripStatusBadge({ status: 'DRAFT' } as TripPlan);
    const upcomingAi = tripStatusBadge({ status: 'UPCOMING' } as TripPlan);
    expect(draftManual.label).toBe('BOOKING PENDING');
    expect(upcomingAi.label).toBe('UPCOMING');
    expect(resolveTripOriginDisplay('MANUAL').label).not.toBe(draftManual.label);
    expect(resolveTripOriginDisplay('AI_PROMPT').label).not.toBe(upcomingAi.label);
  });

  it('HYBRID maps to AI PLANNED (AI planner with pinned places)', () => {
    expect(resolveTripOriginDisplay('HYBRID').kind).toBe('ai');
    expect(resolveTripOriginDisplay('HYBRID').label).toBe('✨ AI PLANNED');
  });
});

describe('TripCard origin rendering', () => {
  it('TripCard renders explicit originLabel text separate from status badge', () => {
    const src = read('components/trips/TripCard.tsx');
    expect(src).toMatch(/\{originLabel\}/);
    expect(src).toMatch(/originRow/);
    expect(src).toMatch(/statusBadgeText/);
  });

  it('TripCard maps ai/manual/unknown origin kinds to distinct badge styles', () => {
    const src = read('components/trips/TripCard.tsx');
    expect(src).toMatch(/originBadgeAi/);
    expect(src).toMatch(/originBadgeManual/);
    expect(src).toMatch(/originBadgeUnknown/);
  });
});

describe('AI vs manual navigation (unchanged by generationSource)', () => {
  it('TEST 5 — AI upcoming Continue → TripDetail resume', () => {
    expect(resolveContinueNavigation(aiUpcoming)).toEqual({
      screen: 'TripDetail',
      params: { tripId: 'ai-up', resume: true, mode: 'resume' },
    });
  });

  it('TEST 6 — manual draft Continue → TripBuilder with tripId', () => {
    expect(resolveContinueNavigation(manualDraft)).toEqual({
      screen: 'TripBuilder',
      params: { tripId: 'manual-draft' },
    });
  });

  it('TEST 7 — AI upcoming Itinerary → TripDetail view', () => {
    expect(resolveItineraryNavigation(aiUpcoming)).toEqual({
      screen: 'TripDetail',
      params: { tripId: 'ai-up', mode: 'view' },
    });
  });

  it('TEST 8 — manual draft Itinerary → TripDetail view (not TripBuilder)', () => {
    expect(resolveItineraryNavigation(manualDraft)).toEqual({
      screen: 'TripDetail',
      params: { tripId: 'manual-draft', mode: 'view' },
    });
    expect(resolveItineraryNavigation(hybridUpcoming).screen).toBe('TripDetail');
  });
});

describe('My Trips card wiring', () => {
  it('MyTripsScreen binds generationSource via resolveTripOriginDisplay', () => {
    const src = read('screens/MyTripsScreen.tsx');
    expect(src).toMatch(/resolveTripOriginDisplay\(trip\.generationSource\)/);
    expect(src).toMatch(/originLabel=\{origin\.label\}/);
    expect(src).toMatch(/originKind=\{origin\.kind\}/);
    expect(src).toMatch(/resolveContinueNavigation/);
    expect(src).toMatch(/resolveItineraryNavigation/);
  });

  it('MyTripsScreen upcoming cards use estimateTripPalPoints (places × 10)', () => {
    const src = read('screens/MyTripsScreen.tsx');
    expect(src).toMatch(/estimateTripPalPoints\(trip\)/);
    expect(src).toMatch(/palPoints=\{palPoints\}/);
  });

  it('TripCard shows explicit text origin label separate from status badge', () => {
    const src = read('components/trips/TripCard.tsx');
    expect(src).toMatch(/originLabel/);
    expect(src).toMatch(/statusBadgeText/);
    expect(src).toMatch(/originRow/);
  });
});
