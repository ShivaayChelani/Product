/**
 * Phase 2 orchestration types (canonical planner layer).
 *
 * Everything below consumes the Phase 1 domain (types.ts) and adds the
 * multi-day / multi-candidate / quality / validation / explanation shapes.
 * Pure types only — no runtime behavior, no Prisma, no sibling imports beyond
 * the canonical domain, so unit tests stay DB-free.
 */

import type {
  ConstraintResult,
  ConstraintViolation,
  EnrichedPlace,
  GeoCoords,
  PlanningWarning,
  ScheduledStop,
  SuggestedRepair,
  Zone,
} from './types';

// ---------------------------------------------------------------------------
// Day allocation
// ---------------------------------------------------------------------------

/**
 * How a candidate orders zones/places before day assignment. Strategies only
 * change ordering/allocation emphasis — the resolved pool stays identical.
 */
export type DayOrderingMode = 'PRIORITY' | 'AREA' | 'OPENING_HOURS';

/** One allocated day: which places (ids) live on which day, grouped by zone. */
export interface DayAllocation {
  dayNumber: number;
  zoneIds: string[];
  placeIds: string[];
}

export interface ZoneSplitInfo {
  zoneId: string;
  dayNumbers: number[];
}

export interface DayAllocationResult {
  days: DayAllocation[];
  warnings: PlanningWarning[];
  /** Mandatory place ids that could not be placed (physically impossible). */
  unplacedIds: string[];
  zoneSplits: ZoneSplitInfo[];
  feasible: boolean;
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Scheduled plan day / candidate
// ---------------------------------------------------------------------------

/** A fully scheduled, route-optimized plan day. */
export interface PlanDay {
  dayNumber: number;
  zoneIds: string[];
  placeIds: string[];
  /** Route-optimized sequence order (EnrichedPlace rows). */
  sequence: EnrichedPlace[];
  stops: ScheduledStop[];
  totalMinutes: number;
  visitMinutes: number;
  travelMinutes: number;
  detourIndex: number;
  openingHoursFeasible: boolean;
  warnings: PlanningWarning[];
}

export interface CandidateMeta {
  strategy: DayOrderingMode | 'MIXED';
  /** Deterministic variation index (0 = base arrangement). */
  variation: number;
  label: string;
  description: string;
}

export interface ItineraryCandidate {
  id: string;
  meta: CandidateMeta;
  days: PlanDay[];
  /** Flat stop stream ordered by (dayNumber, order). */
  allStops: ScheduledStop[];
  allStopIds: string[];
  zoneByPlaceId: Map<string, string>;
  constraintResult: ConstraintResult;
  quality: ItineraryQuality | null;
  warnings: PlanningWarning[];
  /** true = rejected for a hard constraint; never eligible to win. */
  isRejected: boolean;
  rejectionReasons: string[];
}

// ---------------------------------------------------------------------------
// Quality scoring
// ---------------------------------------------------------------------------

export interface QualityComponent {
  key: string;
  label: string;
  /** Normalized 0..1 before weighting. */
  value: number;
  /** Relative importance of this dimension. */
  weight: number;
  /** weight * value — the score this component contributes. */
  points: number;
}

export interface QualityPenalty {
  key: string;
  points: number;
  reason: string;
}

export interface ItineraryQuality {
  totalScore: number;
  /** 0..1 — fraction of resolvable mandatory places included. DOMINANT. */
  mandatoryCoverage: number;
  components: QualityComponent[];
  penalties: QualityPenalty[];
  strengths: string[];
  weaknesses: string[];
  feasible: boolean;
}

// ---------------------------------------------------------------------------
// Explanation / final validation / result
// ---------------------------------------------------------------------------

export interface DayExplanation {
  dayNumber: number;
  text: string;
}

export interface PlanExplanation {
  summary: string;
  dayDetails: DayExplanation[];
  notes: string[];
  provider: 'deterministic' | 'ai';
}

export interface FinalValidationReport {
  feasible: boolean;
  hardViolations: ConstraintViolation[];
  warnings: PlanningWarning[];
  repairs: SuggestedRepair[];
  /** Explicit repaired duplicate when a deterministic safe repair was applied. */
  repaired?: {
    candidateId: string;
    description: string;
  } | null;
}

export interface PlanningResult {
  ok: boolean;
  errors: string[];
  warnings: PlanningWarning[];
  dropped: Array<{ placeId: string; reason: string }>;
  candidateStats: { generated: number; feasible: number; rejected: number };
  candidates: ItineraryCandidate[];
  /** Best feasible candidate; null when none is feasible. */
  chosen: ItineraryCandidate | null;
  explanation: PlanExplanation | null;
  finalValidation: FinalValidationReport | null;
  regions: {
    zones: Zone[];
    pool: EnrichedPlace[];
    origin: GeoCoords | null;
  };
  messages: string[];
}

/** Shared planning context passed between pipeline stages (no DB, no LLM). */
export interface PlanningContext {
  intent: import('./types').ItineraryIntent;
  resolved: EnrichedPlace[];
  suggested: EnrichedPlace[];
  zones: Zone[];
  dayStart: GeoCoords;
  origin: GeoCoords | null;
  speedKmh: number;
  date: Date | null;
}

export type { ConstraintViolation, PlanningWarning, ScheduledStop, SuggestedRepair, Zone };