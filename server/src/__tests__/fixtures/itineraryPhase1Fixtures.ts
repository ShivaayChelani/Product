/**
 * Golden fixtures for the Phase 1 itinerary engine (deterministic, DB-free).
 *
 * Three golden destinations mirror the approved Phase 0 scenarios:
 *   G1  Mumbai  — South Mumbai heritage/food day (Compact outing)
 *   G4  Jabalpur— Bhedaghat + Dhuandhar day (evening affinity anchors)
 *   G5  Jaipur  — Amber→Old-City spine (locked order + fixed-time anchor)
 *
 * No production place ids are hardcoded here — ids are stable synthetic keys.
 * Every number is authored (rating, popularity, fees, hours, durations), so
 * tests never depend on live data.
 */

import type { EnrichedPlace, PlaceRecord, PlaceState } from '../../modules/trips/itinerary/types';
import { enrichPlace } from '../../modules/trips/itinerary/enrichment';
import type { PlaceStore } from '../../modules/trips/itinerary/candidates';

export interface PlaceSpec {
  id: string;
  name: string;
  category: string;
  tags?: string[];
  lat: number;
  lng: number;
  city?: string;
  state?: string;
  country?: string;
  rating?: number | null;
  reviewCount?: number;
  popularityScore?: number | null;
  hiddenGemScore?: number | null;
  editorialPriority?: number;
  /** Normalized opening hours (open/close minutes-of-day), or null. */
  openingHours?: Record<string, Array<{ open: number; close: number }>> | null;
  ticketPrice?: unknown;
  estimatedDurationMinutes?: number | null;
  recommendedDuration?: string | null;
  stateFlags?: Partial<PlaceState>;
  belongsToDestination?: boolean;
  travelers?: number;
  date?: Date | null;
}

const HOURS_DAILY_9_18: Record<string, Array<{ open: number; close: number }>> = {
  daily: [{ open: 9 * 60, close: 18 * 60 }],
};
const HOURS_DAILY_8_19: Record<string, Array<{ open: number; close: number }>> = {
  daily: [{ open: 8 * 60, close: 19 * 60 }],
};

export function makeRecord(spec: PlaceSpec): PlaceRecord {
  return {
    id: spec.id,
    name: spec.name,
    category: spec.category,
    tags: spec.tags ?? [],
    city: spec.city ?? null,
    state: spec.state ?? null,
    country: spec.country ?? 'India',
    latitude: spec.lat,
    longitude: spec.lng,
    rating: spec.rating ?? null,
    reviewCount: spec.reviewCount ?? 0,
    popularityScore: spec.popularityScore ?? null,
    hiddenGemScore: spec.hiddenGemScore ?? null,
    editorialPriority: spec.editorialPriority ?? 3,
    openingHours: spec.openingHours ?? null,
    ticketPrice: spec.ticketPrice ?? null,
    estimatedDurationMinutes: spec.estimatedDurationMinutes ?? null,
    recommendedDuration: spec.recommendedDuration ?? null,
  };
}

export function enriched(spec: PlaceSpec): EnrichedPlace {
  const place = enrichPlace(makeRecord(spec), {
    travelerCount: spec.travelers ?? 2,
    date: spec.date ?? null,
    state: spec.stateFlags,
  });
  return {
    ...place,
    belongsToDestination: spec.belongsToDestination ?? true,
  };
}

// ---------------------------------------------------------------------------
// G1 Mumbai — South Mumbai (Colaba–Fort) heritage/food compact outing
// ---------------------------------------------------------------------------

export interface MumbaiPlaces {
  gateway: EnrichedPlace;
  taj: EnrichedPlace;
  marineDrive: EnrichedPlace;
  museum: EnrichedPlace;
  colabaMarket: EnrichedPlace;
  elephanta: EnrichedPlace;
}

export function mumbaiPlaces(stateFlags?: PlaceState): MumbaiPlaces {
  const flags = stateFlags ?? {};
  return {
    gateway: enriched({
      id: 'mum-gateway',
      name: 'Gateway of India',
      category: 'landmark',
      tags: ['heritage', 'colonial', 'iconic'],
      lat: 18.9219,
      lng: 72.8346,
      city: 'Mumbai',
      state: 'Maharashtra',
      rating: 4.6,
      reviewCount: 2000,
      popularityScore: 9.1,
      editorialPriority: 5,
      openingHours: HOURS_DAILY_9_18,
      ticketPrice: { basis: 'FREE' },
      estimatedDurationMinutes: 45,
      stateFlags: flags,
    }),
    taj: enriched({
      id: 'mum-taj',
      name: 'Taj Mahal Palace',
      category: 'landmark',
      tags: ['heritage', 'hotel', 'iconic'],
      lat: 18.9217,
      lng: 72.8337,
      city: 'Mumbai',
      state: 'Maharashtra',
      rating: 4.7,
      reviewCount: 1800,
      popularityScore: 8.8,
      editorialPriority: 5,
      openingHours: HOURS_DAILY_9_18,
      ticketPrice: { basis: 'FREE' },
      estimatedDurationMinutes: 40,
      stateFlags: flags,
    }),
    marineDrive: enriched({
      id: 'mum-marine-drive',
      name: 'Marine Drive',
      category: 'scenic',
      tags: ['sunset', 'promenade', 'viewpoint'],
      lat: 18.9436,
      lng: 72.8232,
      city: 'Mumbai',
      state: 'Maharashtra',
      rating: 4.5,
      reviewCount: 1500,
      popularityScore: 8.4,
      editorialPriority: 4,
      openingHours: { daily: [{ open: 0, close: 24 * 60 }] },
      ticketPrice: { basis: 'FREE' },
      estimatedDurationMinutes: 60,
      stateFlags: flags,
    }),
    museum: enriched({
      id: 'mum-museum',
      name: 'Chhatrapati Shivaji Maharaj Vastu Sangrahalaya',
      category: 'museum',
      tags: ['heritage', 'art', 'museum'],
      lat: 18.9268,
      lng: 72.8325,
      city: 'Mumbai',
      state: 'Maharashtra',
      rating: 4.5,
      reviewCount: 900,
      popularityScore: 7.6,
      editorialPriority: 4,
      openingHours: HOURS_DAILY_9_18,
      ticketPrice: { basis: 'PER_PERSON', adult: 100 },
      estimatedDurationMinutes: 90,
      stateFlags: flags,
    }),
    colabaMarket: enriched({
      id: 'mum-colaba-market',
      name: 'Colaba Causeway Market',
      category: 'market',
      tags: ['shopping', 'food', 'street'],
      lat: 18.9155,
      lng: 72.8272,
      city: 'Mumbai',
      state: 'Maharashtra',
      rating: 4.2,
      reviewCount: 700,
      popularityScore: 7.2,
      editorialPriority: 3,
      openingHours: { daily: [{ open: 10 * 60, close: 21 * 60 }] },
      ticketPrice: { basis: 'FREE' },
      estimatedDurationMinutes: 60,
      stateFlags: flags,
    }),
    elephanta: enriched({
      id: 'mum-elephanta',
      name: 'Elephanta Caves',
      category: 'heritage',
      tags: ['cave', 'unesco', 'heritage'],
      lat: 18.9631,
      lng: 72.9309,
      city: 'Mumbai',
      state: 'Maharashtra',
      rating: 4.6,
      reviewCount: 1100,
      popularityScore: 7.9,
      editorialPriority: 4,
      openingHours: HOURS_DAILY_9_18,
      ticketPrice: { basis: 'PER_PERSON', adult: 600 },
      estimatedDurationMinutes: 240,
      stateFlags: flags,
    }),
  };
}

// ---------------------------------------------------------------------------
// G4 Jabalpur — Bhedaghat / Dhuandhar falls + river ghats evening
// ---------------------------------------------------------------------------

export interface JabalpurPlaces {
  dhuandhar: EnrichedPlace;
  marbleRocks: EnrichedPlace;
  balancingRocks: EnrichedPlace;
  chausathYogini: EnrichedPlace;
  raniDurgavatiMuseum: EnrichedPlace;
  gwarighat: EnrichedPlace;
  riverCruise: EnrichedPlace;
}

export function jabalpurPlaces(stateFlags?: PlaceState): JabalpurPlaces {
  const flags = stateFlags ?? {};
  return {
    dhuandhar: enriched({
      id: 'jbp-dhuandhar',
      name: 'Dhuandhar Falls',
      category: 'waterfall',
      tags: ['bhedaghat', 'waterfall', 'evening'],
      lat: 23.1278,
      lng: 79.7995,
      city: 'Jabalpur',
      state: 'Madhya Pradesh',
      rating: 4.6,
      reviewCount: 2400,
      popularityScore: 8.9,
      editorialPriority: 5,
      openingHours: HOURS_DAILY_8_19,
      ticketPrice: { basis: 'PER_PERSON', adult: 100 },
      estimatedDurationMinutes: 90,
      stateFlags: flags,
    }),
    marbleRocks: enriched({
      id: 'jbp-marble-rocks',
      name: 'Marble Rocks',
      category: 'scenic',
      tags: ['bhedaghat', 'marble', 'cruise'],
      lat: 23.1248,
      lng: 79.7979,
      city: 'Jabalpur',
      state: 'Madhya Pradesh',
      rating: 4.5,
      reviewCount: 2100,
      popularityScore: 8.6,
      editorialPriority: 4,
      openingHours: HOURS_DAILY_8_19,
      ticketPrice: { basis: 'PER_PERSON', adult: 200 },
      estimatedDurationMinutes: 90,
      stateFlags: flags,
    }),
    balancingRocks: enriched({
      id: 'jbp-balancing-rocks',
      name: 'Balancing Rocks',
      category: 'sightseeing',
      tags: ['geology', 'bhedaghat'],
      lat: 23.1295,
      lng: 79.8501,
      city: 'Jabalpur',
      state: 'Madhya Pradesh',
      rating: 4.3,
      reviewCount: 600,
      popularityScore: 7.0,
      editorialPriority: 3,
      openingHours: HOURS_DAILY_8_19,
      ticketPrice: { basis: 'FREE' },
      estimatedDurationMinutes: 50,
      stateFlags: flags,
    }),
    chausathYogini: enriched({
      id: 'jbp-chausath-yogini',
      name: 'Chausath Yogini Temple',
      category: 'temple',
      tags: ['temple', 'bhedaghat', 'heritage'],
      lat: 23.1332,
      lng: 79.7976,
      city: 'Jabalpur',
      state: 'Madhya Pradesh',
      rating: 4.4,
      reviewCount: 400,
      popularityScore: 6.8,
      hiddenGemScore: 7.5,
      editorialPriority: 3,
      openingHours: HOURS_DAILY_8_19,
      ticketPrice: { basis: 'FREE' },
      estimatedDurationMinutes: 60,
      stateFlags: flags,
    }),
    raniDurgavatiMuseum: enriched({
      id: 'jbp-rani-museum',
      name: 'Rani Durgavati Museum',
      category: 'museum',
      tags: ['museum', 'history'],
      lat: 23.1465,
      lng: 79.9488,
      city: 'Jabalpur',
      state: 'Madhya Pradesh',
      rating: 4.4,
      reviewCount: 750,
      popularityScore: 7.3,
      editorialPriority: 3,
      openingHours: { daily: [{ open: 10 * 60, close: 17 * 60 }] },
      ticketPrice: { basis: 'PER_PERSON', adult: 50 },
      estimatedDurationMinutes: 90,
      stateFlags: flags,
    }),
    gwarighat: enriched({
      id: 'jbp-gwarighat',
      name: 'Gwarighat',
      category: 'sightseeing',
      tags: ['ghat', 'river', 'evening'],
      lat: 23.1782,
      lng: 79.9987,
      city: 'Jabalpur',
      state: 'Madhya Pradesh',
      rating: 4.1,
      reviewCount: 350,
      popularityScore: 6.4,
      editorialPriority: 2,
      openingHours: { daily: [{ open: 5 * 60, close: 21 * 60 }] },
      ticketPrice: { basis: 'FREE' },
      estimatedDurationMinutes: 45,
      stateFlags: flags,
    }),
    riverCruise: enriched({
      id: 'jbp-river-cruise',
      name: 'Narmada River Cruise',
      category: 'scenic',
      tags: ['river', 'sunset', 'cruise', 'evening'],
      lat: 23.1812,
      lng: 79.9952,
      city: 'Jabalpur',
      state: 'Madhya Pradesh',
      rating: 4.2,
      reviewCount: 500,
      popularityScore: 6.9,
      editorialPriority: 3,
      openingHours: { daily: [{ open: 8 * 60, close: 20 * 60 }] },
      ticketPrice: { basis: 'PER_PERSON', adult: 350 },
      estimatedDurationMinutes: 60,
      stateFlags: flags,
    }),
  };
}

// ---------------------------------------------------------------------------
// G5 Jaipur — Amber → old-city spine (locked order + fixed-time anchor)
// ---------------------------------------------------------------------------

export interface JaipurPlaces {
  amberFort: EnrichedPlace;
  jaigarhFort: EnrichedPlace;
  nahargarhFort: EnrichedPlace;
  hawaMahal: EnrichedPlace;
  cityPalace: EnrichedPlace;
  jantarMantar: EnrichedPlace;
  govindDevJi: EnrichedPlace;
  jauharlalMarket: EnrichedPlace;
}

export function jaipurPlaces(stateFlags?: PlaceState): JaipurPlaces {
  const flags = stateFlags ?? {};
  return {
    amberFort: enriched({
      id: 'jpr-amber-fort',
      name: 'Amber Fort',
      category: 'fort',
      tags: ['fort', 'heritage', 'palace'],
      lat: 26.9855,
      lng: 75.8513,
      city: 'Jaipur',
      state: 'Rajasthan',
      rating: 4.7,
      reviewCount: 3100,
      popularityScore: 9.3,
      editorialPriority: 5,
      openingHours: HOURS_DAILY_9_18,
      ticketPrice: { basis: 'PER_PERSON', adult: 550 },
      estimatedDurationMinutes: 180,
      stateFlags: flags,
    }),
    jaigarhFort: enriched({
      id: 'jpr-jaigarh',
      name: 'Jaigarh Fort',
      category: 'fort',
      tags: ['fort', 'cannon', 'views'],
      lat: 26.9856,
      lng: 75.8458,
      city: 'Jaipur',
      state: 'Rajasthan',
      rating: 4.3,
      reviewCount: 900,
      popularityScore: 7.4,
      editorialPriority: 3,
      openingHours: HOURS_DAILY_9_18,
      ticketPrice: { basis: 'PER_PERSON', adult: 450 },
      estimatedDurationMinutes: 120,
      stateFlags: flags,
    }),
    nahargarhFort: enriched({
      id: 'jpr-nahargarh',
      name: 'Nahargarh Fort',
      category: 'fort',
      tags: ['fort', 'sunset', 'viewpoint'],
      lat: 26.9377,
      lng: 75.8464,
      city: 'Jaipur',
      state: 'Rajasthan',
      rating: 4.5,
      reviewCount: 1400,
      popularityScore: 7.9,
      editorialPriority: 4,
      openingHours: HOURS_DAILY_9_18,
      ticketPrice: { basis: 'PER_PERSON', adult: 250 },
      estimatedDurationMinutes: 150,
      stateFlags: flags,
    }),
    hawaMahal: enriched({
      id: 'jpr-hawa-mahal',
      name: 'Hawa Mahal',
      category: 'landmark',
      tags: ['palace', 'iconic', 'photo'],
      lat: 26.9239,
      lng: 75.8267,
      city: 'Jaipur',
      state: 'Rajasthan',
      rating: 4.4,
      reviewCount: 2800,
      popularityScore: 9.0,
      editorialPriority: 5,
      openingHours: HOURS_DAILY_9_18,
      ticketPrice: { basis: 'PER_PERSON', adult: 200 },
      estimatedDurationMinutes: 60,
      stateFlags: flags,
    }),
    cityPalace: enriched({
      id: 'jpr-city-palace',
      name: 'City Palace',
      category: 'palace',
      tags: ['palace', 'museum', 'heritage'],
      lat: 26.9258,
      lng: 75.8237,
      city: 'Jaipur',
      state: 'Rajasthan',
      rating: 4.6,
      reviewCount: 1900,
      popularityScore: 8.7,
      editorialPriority: 5,
      openingHours: HOURS_DAILY_9_18,
      ticketPrice: { basis: 'PER_PERSON', adult: 700 },
      estimatedDurationMinutes: 150,
      stateFlags: flags,
    }),
    jantarMantar: enriched({
      id: 'jpr-jantar-mantar',
      name: 'Jantar Mantar',
      category: 'museum',
      tags: ['observatory', 'unesco', 'science'],
      lat: 26.9247,
      lng: 75.8246,
      city: 'Jaipur',
      state: 'Rajasthan',
      rating: 4.4,
      reviewCount: 1200,
      popularityScore: 7.8,
      editorialPriority: 4,
      openingHours: HOURS_DAILY_9_18,
      ticketPrice: { basis: 'PER_PERSON', adult: 100 },
      estimatedDurationMinutes: 75,
      stateFlags: flags,
    }),
    govindDevJi: enriched({
      id: 'jpr-govind-dev-ji',
      name: 'Govind Dev Ji Temple',
      category: 'temple',
      tags: ['temple', 'devotional'],
      lat: 26.9255,
      lng: 75.8255,
      city: 'Jaipur',
      state: 'Rajasthan',
      rating: 4.6,
      reviewCount: 1600,
      popularityScore: 8.2,
      editorialPriority: 4,
      openingHours: { daily: [{ open: 5 * 60, close: 21 * 60 }] },
      ticketPrice: { basis: 'FREE' },
      estimatedDurationMinutes: 45,
      stateFlags: flags,
    }),
    jauharlalMarket: enriched({
      id: 'jpr-jauhari-bazaar',
      name: 'Johri Bazaar',
      category: 'market',
      tags: ['shopping', 'jewellery', 'food'],
      lat: 26.9225,
      lng: 75.8272,
      city: 'Jaipur',
      state: 'Rajasthan',
      rating: 4.2,
      reviewCount: 800,
      popularityScore: 7.5,
      editorialPriority: 3,
      openingHours: { daily: [{ open: 10 * 60, close: 21 * 60 }] },
      ticketPrice: { basis: 'FREE' },
      estimatedDurationMinutes: 60,
      stateFlags: flags,
    }),
  };
}

// ---------------------------------------------------------------------------
// In-memory PlaceStore for candidate-resolution tests
// ---------------------------------------------------------------------------

export function memStore(records: PlaceRecord[]): PlaceStore {
  const byId = new Map(records.map((r) => [r.id, r]));
  const destMatch = (r: PlaceRecord, destination: string): boolean => {
    const key = (r.city ?? r.state ?? '').toLowerCase();
    return key.includes(destination.toLowerCase()) || (r.name ?? '').toLowerCase().includes(destination.toLowerCase());
  };
  return {
    async findApprovedByIds(ids) {
      return ids.map((id) => byId.get(id)).filter((r): r is PlaceRecord => !!r);
    },
    async findApprovedByDestination(destination, opts) {
      const rows = records.filter((r) => destMatch(r, destination));
      return opts?.limit ? rows.slice(0, opts.limit) : rows;
    },
    async findApprovedNear(_lat, _lng, _radiusKm, opts) {
      const rows = records;
      return opts?.limit ? rows.slice(0, opts.limit) : rows;
    },
  };
}
