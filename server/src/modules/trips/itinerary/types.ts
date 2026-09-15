/**
 * Canonical itinerary planning domain types (Phase 1).
 *
 * This module is the single source of truth for the new engine's data shapes.
 * It deliberately imports NOTHING from sibling itinerary modules and NOTHING
 * from @prisma/client, so it can be consumed by pure unit tests and stays
 * decoupled from the DB layer.
 *
 * Trust discipline (per the frozen Phase 0 contract):
 *   - FACTUAL DB DATA  -> DataTrust.VERIFIED
 *   - ENGINE ESTIMATE  -> DataTrust.ESTIMATED
 *   - MISSING / UNKNOWN-> DataTrust.UNKNOWN  (never invented)
 */

// ---------------------------------------------------------------------------
// Input enums (string-literal unions, mirroring Prisma enum VALUES)
// ---------------------------------------------------------------------------

export type PlanningMode = 'SELF_BUILD' | 'AI_BUILD';

export type Pace = 'QUICK' | 'BALANCED' | 'RELAXED' | 'VERY_RELAXED';

export type TimePreferenceInput = 'MORNING_FOCUSED' | 'FULL_DAY' | 'EVENING_FRIENDLY';

export type AvoidInput = 'CROWDED' | 'LONG_TRAVEL' | 'EXPENSIVE_ENTRY' | 'NON_FAMILY_FRIENDLY';

export type TransportModeInput = 'WALKING' | 'BIKE' | 'CAR' | 'TRAIN' | 'FLIGHT';

export type BudgetTier = 'LOW' | 'MEDIUM' | 'HIGH';

/** Canonical transport speeds (km/h). WALKING 4 / BIKE 15 / CAR 35 / TRAIN 45 / FLIGHT 60. */
export const TRANSPORT_SPEED_KMH: Record<TransportModeInput, number> = {
  WALKING: 4,
  BIKE: 15,
  CAR: 35,
  TRAIN: 45,
  FLIGHT: 60,
};

/** Speed used when no transportation mode is provided. */
export const DEFAULT_SPEED_KMH = 30;

/** Fixed parking / walk-in buffer added to every travel leg (minutes). */
export const TRAVEL_BUFFER_MINUTES = 10;

/** Travel cost per km used for budget estimation. */
export const TRANSPORT_COST_PER_KM = 8;

/**
 * Resolve the travel speed for a set of modes. "Fastest usable" wins
 * (CAR + WALKING -> CAR 35), which fixes the legacy first-match precedence bug
 * (CAR + WALKING used to resolve to 4 km/h).
 */
export function resolveSpeedKmh(transportation: readonly TransportModeInput[]): number {
  if (!transportation.length) return DEFAULT_SPEED_KMH;
  let best = DEFAULT_SPEED_KMH;
  for (const mode of transportation) {
    const speed = TRANSPORT_SPEED_KMH[mode] ?? 0;
    if (speed > best) best = speed;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Coordinates / geometry
// ---------------------------------------------------------------------------

/** Verifiable geographic coordinate pair. */
export interface GeoCoords {
  lat: number;
  lng: number;
}

// ---------------------------------------------------------------------------
// Data trust
// ---------------------------------------------------------------------------

/** VERIFIED = factual DB value; ESTIMATED = engine-computed; UNKNOWN = missing/illegible. */
export type DataTrust = 'VERIFIED' | 'ESTIMATED' | 'UNKNOWN';

// ---------------------------------------------------------------------------
// Place state (Phase 0 contract: canonical place states)
// ---------------------------------------------------------------------------

/**
 * Which user/engine role a place plays in the itinerary. Multiple flags may be
 * set simultaneously (a place can be pinned AND fixed-time AND locked). The
 * strict precedence between these states is defined by `rankForState` in
 * scoring.ts and enforced as hard constraints in constraintValidator.ts.
 */
export interface PlaceState {
  /** User explicitly added the place (Self Build candidate set, or AI Build user pick). */
  selected: boolean;
  /** Unremovable (may be reordered). */
  pinned: boolean;
  /** Position fixed (unremovable, un-reordered). */
  lockedPosition: boolean;
  /** Schedule anchor with an exact start time. */
  fixedTime: boolean;
  /** Explicit must-visit anchor in AI Build. */
  priorityAnchor: boolean;
  /** Engine-discovered companion place from the PALSAFAR place DB. */
  complementary: boolean;
  /** Low-value filler that is first to be dropped under pressure. */
  optional: boolean;
}

/** Fixed-time anchor spec: place + exact start minute-of-day. */
export interface FixedTimeSpec {
  placeId: string;
  /** 0..1439 minute-of-day, e.g. 540 = 09:00. */
  startMinutes: number;
  /** Original "HH:MM" string as supplied by the user. */
  sourceStartTime: string;
}

/** Verified vs estimated vs unknown resolution of a place's core facts. */
export interface PlaceFactsTrust {
  statusVerified: boolean;
  coordinatesVerified: boolean;
  categoryVerified: boolean;
  ratingVerified: boolean;
  openingHoursDelivered: boolean;
  ticketPriceDelivered: boolean;
}

// ---------------------------------------------------------------------------
// Opening hours
// ---------------------------------------------------------------------------

export interface HoursWindow {
  open: number;
  close: number;
}

/** Normalized weekday -> windows. Generic keys 'daily'/'all'/'everyday'/'every_day' allowed. */
export type NormalizedHours = Record<string, HoursWindow[]>;

// ---------------------------------------------------------------------------
// Entry fee
// ---------------------------------------------------------------------------

export type FeeBasis = 'FREE' | 'PER_PERSON' | 'PER_VEHICLE' | 'PER_GROUP' | 'FLAT_RATE' | 'UNKNOWN';

export interface EntryFeeEstimate {
  /** Party-level cost amount in host currency (already multiplied by traveler count for PER_PERSON). */
  amount: number;
  basis: FeeBasis;
  trust: DataTrust;
  /** true when a paid fee could not be determined (must never be silently free). */
  unknownFee: boolean;
}

// ---------------------------------------------------------------------------
// Factual DB row (canonical column subset)
// ---------------------------------------------------------------------------

/**
 * The factual column truth from the PALSAFAR Places DB. Only this shape may be
 * turned into an EnrichedPlace; the engine never invents Place records.
 */
export interface PlaceRecord {
  id: string;
  name: string;
  category: string;
  tags: string[];
  city: string | null;
  state: string | null;
  country?: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  reviewCount?: number | null;
  popularityScore: number | null;
  hiddenGemScore: number | null;
  editorialPriority: number;
  openingHours: unknown;
  ticketPrice: unknown;
  estimatedDurationMinutes: number | null;
  recommendedDuration: string | null;
}

// ---------------------------------------------------------------------------
// Time-of-day suitability
// ---------------------------------------------------------------------------

/** 0..1 soft score of how well a place fits each canonical day slot. */
export interface TimeOfDaySuitability {
  MORNING: number;
  AFTERNOON: number;
  EVENING: number;
}

// ---------------------------------------------------------------------------
// Enriched place
// ---------------------------------------------------------------------------

/**
 * A DB place enriched with engine estimates. Every field carrying an *estimate*
 * or *unknown* carries it explicitly; no fabricated facts.
 */
export interface EnrichedPlace {
  id: string;
  name: string;
  category: string;
  tags: string[];
  city: string | null;
  country?: string | null;
  coordinates: GeoCoords;
  rating: number | null;
  reviewCount: number;
  popularityScore: number | null;
  hiddenGemScore: number | null;
  editorialPriority: number;
  /** Estimated visit duration in minutes. */
  durationMinutes: number;
  durationTrust: DataTrust;
  /** Entry fee for the whole party. */
  entryFee: EntryFeeEstimate;
  /** Normalized opening hours, or null when unknown/unparseable. */
  openingHours: NormalizedHours | null;
  hoursTrust: DataTrust;
  timeOfDaySuitability: TimeOfDaySuitability;
  /** User/engine state flags (from intent + candidate resolution). */
  state: PlaceState;
  /** Backing of the canonical Factual-DB row used (verification flags). */
  factsTrust: PlaceFactsTrust;
  /** True when the place clearly belongs to the asked destination. */
  belongsToDestination: boolean;
}

// ---------------------------------------------------------------------------
// Place candidate (post-resolution, pre-enrichment is PlaceRecord; here post-enrich)
// ---------------------------------------------------------------------------

/** Same shape as EnrichedPlace — kept as an explicit alias for planning clarity. */
export type PlaceCandidate = EnrichedPlace;

/** Resolved priority information for a place. */
export interface PriorityInfo {
  state: PlaceState;
  /** 0..11 canonical hierarchy rank (see scoring.ts RANK_LABELS). */
  rank: number;
  rankLabel: string;
  /** False when the place could not be resolved against the DB (must be reported). */
  resolved: boolean;
  droppedReason?: string;
}

// ---------------------------------------------------------------------------
// Travel estimate
// ---------------------------------------------------------------------------

export type TravelProvider = 'haversine' | 'road' | 'unknown';

export interface TravelEstimate {
  distanceKm: number;
  durationMinutes: number;
  /** Haversine-derived durations are always ESTIMATED — never presented as road truth. */
  trust: DataTrust;
  provider: TravelProvider;
  speedKmh: number;
}

// ---------------------------------------------------------------------------
// Zones / areas
// ---------------------------------------------------------------------------

/**
 * A ZONE is one real sightseeing area — the set of attractions a local would
 * describe with a single name ("Bhedaghat side"). "One zone per day" is a SOFT
 * preference; adjacent zones may share a day when that materially improves it.
 */
export interface Zone {
  id: string;
  hubPlaceId: string;
  placeIds: string[];
  center: GeoCoords;
  diameterKm: number;
  /** Aggregate draw of the zone's members (documented in clustering.ts). */
  totalValue: number;
  /** Ids of zones whose centers sit within the adjacency threshold. */
  adjacentZoneIds: string[];
  /** contiguous geographic cluster = places a human would combine in one outing. */
  compact: boolean;
}

// ---------------------------------------------------------------------------
// Scheduled stops / days
// ---------------------------------------------------------------------------

export interface WarningSource {
  placeId?: string;
  dayNumber?: number;
}

export interface PlanningWarning {
  code: string;
  message: string;
  severity: 'INFO' | 'WARNING';
  placeIds?: string[];
  dayNumber?: number;
}

/** A stop placed in a day with concrete start/end minutes-of-day. */
export interface ScheduledStop {
  placeId: string;
  order: number;
  dayNumber: number;
  startMinutes: number;
  endMinutes: number;
  /** minutes of travel from the previous stop (approach for the first stop). */
  travelFromPrevMinutes: number;
  distanceFromPrevKm: number;
  fixedTimeAnchor: boolean;
  /** true=within trusted hours, false=violates trusted hours, null=unknown hours. */
  openingHoursRespected: boolean | null;
  warnings: PlanningWarning[];
}

/** A planned (not yet scheduled) stop used as input to the validator. */
export interface PlannedStop {
  placeId: string;
  dayNumber: number;
  order: number;
  startMinutes: number | null;
  endMinutes: number | null;
  travelFromPrevMinutes?: number;
  distanceFromPrevKm?: number;
}

export interface DayCandidate {
  dayNumber: number;
  zoneIds: string[];
  stops: ScheduledStop[];
  theme?: string;
  totalMinutes: number;
  visitMinutes: number;
  travelMinutes: number;
  detourIndex: number;
  warnings: PlanningWarning[];
}

// ---------------------------------------------------------------------------
// Constraint results
// ---------------------------------------------------------------------------

export type ConstraintSeverity = 'HARD' | 'SOFT';

export interface ConstraintViolation {
  id: string;
  severity: ConstraintSeverity;
  /** e.g. 'H7' | 'S4' */
  constraint: string;
  message: string;
  placeIds?: string[];
  /** Optional day context for day-scoped violations/warnings. */
  dayNumber?: number;
}

export type RepairAction =
  | 'DROP_PLACE'
  | 'REORDER'
  | 'RESCHEDULE'
  | 'PICK_ALTERNATIVE'
  | 'NONE';

export interface SuggestedRepair {
  id: string;
  action: RepairAction;
  message: string;
  placeIds?: string[];
}

export interface ConstraintResult {
  feasible: boolean;
  hardViolations: ConstraintViolation[];
  softWarnings: ConstraintViolation[];
  suggestedRepairs: SuggestedRepair[];
  validationWarnings: PlanningWarning[];
}

// ---------------------------------------------------------------------------
// Canonical itinerary intent (normalized planning input)
// ---------------------------------------------------------------------------

/**
 * The fully normalized, validated planning request. Every user-supplied id is
 * deduplicated here; candidate resolution (candidates.ts) later resolves ids
 * against the PALSAFAR Places DB and never trusts client-existence claims.
 */
export interface ItineraryIntent {
  destination: string;
  origin: GeoCoords | null;
  /** ISO date (yyyy-mm-dd) or null. */
  startDate: string | null;
  endDate: string | null;
  /** 1..21 inclusive. */
  days: number;
  planningMode: PlanningMode;
  selectedPlaceIds: string[];
  pinnedPlaceIds: string[];
  lockedPlaceIds: string[];
  fixedTimePlaces: FixedTimeSpec[];
  priorityPlaceIds: string[];
  excludePlaceIds: string[];
  interests: string[];
  pace: Pace;
  /** Resolved party size (SOLO=1, COUPLE=2, FAMILY/FRIENDS=3, or numeric). */
  travelers: number;
  budgetTier: BudgetTier | null;
  customBudgetAmount: number | null;
  /**
   * Hard budget ceiling for the whole trip, or null when the user gave no
   * explicit maximum. H8 only binds when this is non-null.
   */
  budgetCap: number | null;
  timePreference: TimePreferenceInput | null;
  avoid: AvoidInput[];
  transportation: TransportModeInput[];
  prompt: string | null;
  /** Earliest allowed day start, minutes-of-day (clamped 05:00-18:00). */
  earliestStartMinutes: number | null;
  /** AI_BUILD fills remaining slots with complementary places; SELF_BUILD never does. */
  fillWithAi: boolean;
  /** Whether the user explicitly allowed exceeding the budget ceiling. */
  allowBudgetOverflow: boolean;
}

/** Pace-level day capacity (mirrors legacy PACE_CONFIG; extracted for reuse). */
export const PACE_CONFIG: Record<Pace, { stopsPerDay: number; maxMinutesPerDay: number }> = {
  QUICK: { stopsPerDay: 7, maxMinutesPerDay: 540 },
  BALANCED: { stopsPerDay: 6, maxMinutesPerDay: 480 },
  RELAXED: { stopsPerDay: 5, maxMinutesPerDay: 420 },
  VERY_RELAXED: { stopsPerDay: 4, maxMinutesPerDay: 390 },
};