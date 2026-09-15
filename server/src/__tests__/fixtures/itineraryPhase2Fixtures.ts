/**
 * Golden fixtures for the Phase 2 planner tests (deterministic, DB-free).
 *
 * Reuses the Phase 1 record builders (makeRecord / memStore) with the same
 * synthetic ids/coordinates as itineraryPhase1Fixtures so numbers stay stable:
 *   Jaipur  — Amber Fort / Jaigarh / Nahargarh / Hawa Mahal / City Palace /
 *             Jantar Mantar / Govind Dev Ji / Johri Bazaar
 *   Mumbai  — Gateway of India / Taj Mahal Palace / Marine Drive
 *
 * Also exports `jprIntent(...)` so tests build ItineraryIntent objects with
 * type-safe defaults instead of hand-rolling every field.
 */

import type { ItineraryIntent } from '../../modules/trips/itinerary/types';
import type { PlaceStore } from '../../modules/trips/itinerary/candidates';
import { makeRecord, memStore, type PlaceSpec } from './itineraryPhase1Fixtures';
import type { PlaceRecord } from '../../modules/trips/itinerary/types';

export const JAIPUR_ORIGIN = { lat: 26.9124, lng: 75.7873 } as const;

const DAILY_9_18: Record<string, Array<{ open: number; close: number }>> = { daily: [{ open: 9 * 60, close: 18 * 60 }] };

// ---------------------------------------------------------------------------
// Jaipur records (mirror the Phase 1 G5 fixture)
// ---------------------------------------------------------------------------

const JPR_SPECS: PlaceSpec[] = [
  {
    id: 'jpr-amber-fort', name: 'Amber Fort', category: 'fort',
    lat: 26.9855, lng: 75.8513, city: 'Jaipur', state: 'Rajasthan',
    rating: 4.7, reviewCount: 3100, popularityScore: 9.3, editorialPriority: 5,
    openingHours: DAILY_9_18, ticketPrice: { basis: 'PER_PERSON', adult: 550 },
    estimatedDurationMinutes: 180,
  },
  {
    id: 'jpr-jaigarh', name: 'Jaigarh Fort', category: 'fort',
    lat: 26.9856, lng: 75.8458, city: 'Jaipur', state: 'Rajasthan',
    rating: 4.3, reviewCount: 900, popularityScore: 7.4, editorialPriority: 3,
    openingHours: DAILY_9_18, ticketPrice: { basis: 'PER_PERSON', adult: 450 },
    estimatedDurationMinutes: 120,
  },
  {
    id: 'jpr-nahargarh', name: 'Nahargarh Fort', category: 'fort',
    lat: 26.9377, lng: 75.8464, city: 'Jaipur', state: 'Rajasthan',
    rating: 4.5, reviewCount: 1400, popularityScore: 7.9, editorialPriority: 4,
    openingHours: DAILY_9_18, ticketPrice: { basis: 'PER_PERSON', adult: 250 },
    estimatedDurationMinutes: 150,
  },
  {
    id: 'jpr-hawa-mahal', name: 'Hawa Mahal', category: 'landmark',
    lat: 26.9239, lng: 75.8267, city: 'Jaipur', state: 'Rajasthan',
    rating: 4.4, reviewCount: 2800, popularityScore: 9.0, editorialPriority: 5,
    openingHours: DAILY_9_18, ticketPrice: { basis: 'PER_PERSON', adult: 200 },
    estimatedDurationMinutes: 60,
  },
  {
    id: 'jpr-city-palace', name: 'City Palace', category: 'palace',
    lat: 26.9258, lng: 75.8237, city: 'Jaipur', state: 'Rajasthan',
    rating: 4.6, reviewCount: 1900, popularityScore: 8.7, editorialPriority: 5,
    openingHours: DAILY_9_18, ticketPrice: { basis: 'PER_PERSON', adult: 700 },
    estimatedDurationMinutes: 150,
  },
  {
    id: 'jpr-jantar-mantar', name: 'Jantar Mantar', category: 'museum',
    lat: 26.9247, lng: 75.8246, city: 'Jaipur', state: 'Rajasthan',
    rating: 4.4, reviewCount: 1200, popularityScore: 7.8, editorialPriority: 4,
    openingHours: DAILY_9_18, ticketPrice: { basis: 'PER_PERSON', adult: 100 },
    estimatedDurationMinutes: 75,
  },
  {
    id: 'jpr-govind-dev-ji', name: 'Govind Dev Ji Temple', category: 'temple',
    lat: 26.9255, lng: 75.8255, city: 'Jaipur', state: 'Rajasthan',
    rating: 4.6, reviewCount: 1600, popularityScore: 8.2, editorialPriority: 4,
    openingHours: { daily: [{ open: 5 * 60, close: 21 * 60 }] },
    ticketPrice: { basis: 'FREE' },
    estimatedDurationMinutes: 45,
  },
  {
    id: 'jpr-jauhari-bazaar', name: 'Johri Bazaar', category: 'market',
    lat: 26.9225, lng: 75.8272, city: 'Jaipur', state: 'Rajasthan',
    rating: 4.2, reviewCount: 800, popularityScore: 7.5, editorialPriority: 3,
    openingHours: { daily: [{ open: 10 * 60, close: 21 * 60 }] },
    ticketPrice: { basis: 'FREE' },
    estimatedDurationMinutes: 60,
  },
];

// ---------------------------------------------------------------------------
// Mumbai records (mirror the Phase 1 G1 fixture)
// ---------------------------------------------------------------------------

const MUM_SPECS: PlaceSpec[] = [
  {
    id: 'mum-gateway', name: 'Gateway of India', category: 'landmark',
    lat: 18.9219, lng: 72.8346, city: 'Mumbai', state: 'Maharashtra',
    rating: 4.6, reviewCount: 2000, popularityScore: 9.1, editorialPriority: 5,
    openingHours: DAILY_9_18, ticketPrice: { basis: 'FREE' },
    estimatedDurationMinutes: 45,
  },
  {
    id: 'mum-taj', name: 'Taj Mahal Palace', category: 'landmark',
    lat: 18.9217, lng: 72.8337, city: 'Mumbai', state: 'Maharashtra',
    rating: 4.7, reviewCount: 1800, popularityScore: 8.8, editorialPriority: 5,
    openingHours: DAILY_9_18, ticketPrice: { basis: 'FREE' },
    estimatedDurationMinutes: 40,
  },
  {
    id: 'mum-marine-drive', name: 'Marine Drive', category: 'scenic',
    lat: 18.9436, lng: 72.8232, city: 'Mumbai', state: 'Maharashtra',
    rating: 4.5, reviewCount: 1500, popularityScore: 8.4, editorialPriority: 4,
    openingHours: { daily: [{ open: 0, close: 24 * 60 }] },
    ticketPrice: { basis: 'FREE' },
    estimatedDurationMinutes: 60,
  },
];

export function jaipurRecords(): PlaceRecord[] {
  return JPR_SPECS.map(makeRecord);
}

export function mumbaiRecords(): PlaceRecord[] {
  return MUM_SPECS.map(makeRecord);
}

export function jaipurMemStore(): PlaceStore {
  return memStore(jaipurRecords());
}

export function mumbaiMemStore(): PlaceStore {
  return memStore(mumbaiRecords());
}

/**
 * Jaipur store plus one far-away day-trip spot (~80 km east, Dausa district).
 * Far enough that the day allocator must use a second day, close enough that
 * a QUICK 1-day trip stays inside the day-capacity budget.
 */
export const JAIPUR_FAR_ID = 'jpr-abhaneri';

const FAR_SPEC: PlaceSpec = {
  id: JAIPUR_FAR_ID, name: 'Abhaneri Stepwell', category: 'historical',
  lat: 27.0076, lng: 76.6111, city: 'Dausa', state: 'Rajasthan',
  rating: 4.5, reviewCount: 600, popularityScore: 7.1, editorialPriority: 2,
  openingHours: DAILY_9_18, ticketPrice: { basis: 'PER_PERSON', adult: 300 },
  estimatedDurationMinutes: 120,
};

export function jaipurWithFarStore(): PlaceStore {
  return memStore([...jaipurRecords(), makeRecord(FAR_SPEC)]);
}

/** Common Jaipur place ids, in fixture order. */
export const JAIPUR_IDS = JPR_SPECS.map((s) => s.id);

// ---------------------------------------------------------------------------
// Intent builder
// ---------------------------------------------------------------------------

export interface IntentOverrides {
  destination?: string;
  origin?: ItineraryIntent['origin'];
  days?: number;
  planningMode?: ItineraryIntent['planningMode'];
  selectedPlaceIds?: string[];
  pinnedPlaceIds?: string[];
  lockedPlaceIds?: string[];
  fixedTimePlaces?: ItineraryIntent['fixedTimePlaces'];
  priorityPlaceIds?: string[];
  excludePlaceIds?: string[];
  interests?: string[];
  pace?: ItineraryIntent['pace'];
  travelers?: number;
  budgetCap?: number | null;
  transportation?: ItineraryIntent['transportation'];
  earliestStartMinutes?: number | null;
  fillWithAi?: boolean;
  allowBudgetOverflow?: boolean;
}

/** Build a Jaipur intent with safe defaults (SELF_BUILD / BALANCED / CAR). */
export function jprIntent(overrides: IntentOverrides = {}): ItineraryIntent {
  return {
    destination: overrides.destination ?? 'Jaipur',
    origin: overrides.origin ?? JAIPUR_ORIGIN,
    startDate: null,
    endDate: null,
    days: overrides.days ?? 1,
    planningMode: overrides.planningMode ?? 'SELF_BUILD',
    selectedPlaceIds: overrides.selectedPlaceIds ?? [],
    pinnedPlaceIds: overrides.pinnedPlaceIds ?? [],
    lockedPlaceIds: overrides.lockedPlaceIds ?? [],
    fixedTimePlaces: overrides.fixedTimePlaces ?? [],
    priorityPlaceIds: overrides.priorityPlaceIds ?? [],
    excludePlaceIds: overrides.excludePlaceIds ?? [],
    interests: overrides.interests ?? [],
    pace: overrides.pace ?? 'BALANCED',
    travelers: overrides.travelers ?? 2,
    budgetTier: null,
    customBudgetAmount: null,
    budgetCap: overrides.budgetCap ?? null,
    timePreference: null,
    avoid: [],
    transportation: overrides.transportation ?? ['CAR'],
    prompt: null,
    earliestStartMinutes: overrides.earliestStartMinutes ?? null,
    fillWithAi: overrides.fillWithAi ?? false,
    allowBudgetOverflow: overrides.allowBudgetOverflow ?? false,
  };
}