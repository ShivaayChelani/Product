/**
 * Planner orchestrator (Phase 2). Canonical pipeline that consumes the Phase 1
 * domain and the Phase 2 layers to produce a fully validated plan:
 *
 *   normalize/validate intent -> resolve candidates -> enrich (already inherent)
 *   -> priority (zone ordering) -> cluster zones -> allocate days
 *   -> schedule each day -> optimize sequence -> validate constraints
 *   -> generate MULTIPLE candidates -> quality-score -> select best feasible
 *   -> explain (deterministic) -> final-validate (with deterministic safe repair)
 *
 * Guarantees:
 *   - NO database reads beyond resolveCandidates (single shared result is
 *     reused for zones, scheduling, scoring, explanation).
 *   - NO LLM in the planning path; explanations are deterministic.
 *   - Bounded candidate generation (strategies x variations).
 *   - Regeneration (`regenerateDayNumber` + `previousPlan`) rebuilds ONLY that
 *     day from the previous plan's stop set; other days stay frozen and the
 *     merged plan is re-validated, re-scored and re-explained.
 *   - Pure-ish: DB-free, deterministic, never mutates its inputs.
 */

import type {
  EnrichedPlace,
  GeoCoords,
  ItineraryIntent,
  PlanningWarning,
  Zone,
} from './types';
import { resolveSpeedKmh } from './types';
import type { PlaceStore } from './candidates';
import { resolveCandidates } from './candidates';
import { buildZones } from './clustering';
import { generateCandidates } from './candidateGenerator';
import { scoreCandidate, selectBestCandidate, type QualityContext } from './qualityScorer';
import { finalValidate, type FinalValidationResult } from './finalValidator';
import { explainPlan } from './aiExplainer';
import { validatePlan } from './constraintValidator';
import { plannedStopsFromSchedule } from './scheduleBuilder';
import { normalizeIntent, type RawPlanningInput } from './intent';
import { zoneMapOf } from './dayAllocator';
import type {
  DayOrderingMode,
  FinalValidationReport,
  ItineraryCandidate,
  PlanExplanation,
  PlanningResult,
} from './phase2Types';

// ---------------------------------------------------------------------------
// Options / helpers
// ---------------------------------------------------------------------------

export interface PlanTripOptions {
  intent: ItineraryIntent;
  store: PlaceStore;
  origin?: GeoCoords | null;
  date?: Date | null;
  maxComplementaryPool?: number;
  strategies?: DayOrderingMode[];
  variations?: number[];
  speedKmh?: number;
  /** Regeneration: re-plan ONLY this day (1-based) from the previous plan. */
  regenerateDayNumber?: number;
  previousPlan?: ItineraryCandidate | null;
  variationSeed?: number;
}

export interface PlanFromRawOptions {
  origin?: GeoCoords | null;
  date?: Date | null;
  maxComplementaryPool?: number;
  strategies?: DayOrderingMode[];
  variations?: number[];
  speedKmh?: number;
  regenerateDayNumber?: number;
  previousPlan?: ItineraryCandidate | null;
  variationSeed?: number;
}

export interface MergeRegenerateContext {
  intent: ItineraryIntent;
  resolved: EnrichedPlace[];
  zones: Zone[];
  dayStart: GeoCoords;
  speedKmh: number;
  date: Date | null;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function pushUniqueWarnings(target: PlanningWarning[], incoming: PlanningWarning[]): void {
  for (const w of incoming) {
    if (!target.some((x) => x.code === w.code && x.message === w.message)) target.push(w);
  }
}

function dayBaseFor(intent: ItineraryIntent, resolved: EnrichedPlace[], providedOrigin?: GeoCoords | null): GeoCoords {
  const finite = (c?: GeoCoords | null): c is GeoCoords =>
    !!c && Number.isFinite(c.lat) && Number.isFinite(c.lng);
  if (finite(providedOrigin)) return providedOrigin as GeoCoords;
  if (finite(intent.origin)) return intent.origin as GeoCoords;
  if (resolved.length) {
    return {
      lat: resolved.reduce((s, p) => s + p.coordinates.lat, 0) / resolved.length,
      lng: resolved.reduce((s, p) => s + p.coordinates.lng, 0) / resolved.length,
    };
  }
  return { lat: 0, lng: 0 };
}

/** Re-run independent constraint validation on a (potentially repaired) candidate. */
export function revalidateCandidate(
  candidate: ItineraryCandidate,
  ctx: MergeRegenerateContext,
): ItineraryCandidate {
  const zoneMap = zoneMapOf(ctx.resolved, ctx.zones);
  const plannedStops = plannedStopsFromSchedule(candidate.allStops);
  const constraintResult = validatePlan({
    intent: ctx.intent,
    resolvedPlaces: ctx.resolved,
    plannedStops,
    scheduledStops: candidate.allStops,
    zoneByPlaceId: zoneMap,
    date: ctx.date ?? null,
  });
  return { ...candidate, zoneByPlaceId: zoneMap, constraintResult };
}

/**
 * Merge a freshly regenerated day into a previous plan. Other days are kept
 * byte-for-byte; the merged plan is re-validated independently (so mandatory /
 * fixed-time / locked guarantees hold across EVERY day).
 */
export function mergeRegeneratedCandidate(
  previous: ItineraryCandidate,
  regenerated: ItineraryCandidate,
  regenDay: number,
  ctx: MergeRegenerateContext,
): ItineraryCandidate {
  const newDay = regenerated.days.find((d) => d.dayNumber === regenDay);
  const kept = previous.days.filter((d) => d.dayNumber !== regenDay);
  const days = [...kept, ...(newDay ? [newDay] : [])].sort((a, b) => a.dayNumber - b.dayNumber);
  const allStops = days.flatMap((d) => d.stops).sort((a, b) => a.dayNumber - b.dayNumber || a.order - b.order);
  const allStopIds = allStops.map((s) => s.placeId);
  const zoneMap = zoneMapOf(ctx.resolved, ctx.zones);

  const merged: ItineraryCandidate = {
    id: `${previous.id}-regen-day-${regenDay}`,
    meta: { ...regenerated.meta, label: `regenerated-day-${regenDay}` },
    days,
    allStops,
    allStopIds,
    zoneByPlaceId: zoneMap,
    constraintResult: { feasible: true, hardViolations: [], softWarnings: [], suggestedRepairs: [], validationWarnings: [] },
    quality: null,
    warnings: [],
    isRejected: false,
    rejectionReasons: [],
  };

  const reValidated = revalidateCandidate(merged, ctx);

  const warnings: PlanningWarning[] = [];
  const seen = new Set<string>();
  for (const w of [...previous.warnings, ...regenerated.warnings, ...reValidated.constraintResult.validationWarnings]) {
    if (seen.has(w.message)) continue;
    seen.add(w.message);
    warnings.push(w);
  }

  return { ...reValidated, warnings };
}

function regenStrategyOf(strategy: DayOrderingMode | 'MIXED' | undefined): DayOrderingMode {
  if (strategy === 'PRIORITY' || strategy === 'AREA' || strategy === 'OPENING_HOURS') return strategy;
  return 'PRIORITY';
}

function toReport(r: FinalValidationResult): FinalValidationReport {
  return {
    feasible: r.feasible,
    hardViolations: r.hardViolations,
    warnings: r.warnings,
    repairs: r.repairs,
    repaired: r.repairedCandidate
      ? {
        candidateId: r.repairedCandidate.id,
        description: r.repairedReason ?? 'Deterministic safe repair applied (lowest-value optional place dropped).',
      }
      : null,
  };
}

function qualityContextFor(intent: ItineraryIntent, resolved: EnrichedPlace[], speedKmh: number, dayStart: GeoCoords): QualityContext {
  return {
    intent,
    pool: resolved,
    speedKmh,
    dayStart,
    earliestStartMinutes: intent.earliestStartMinutes ?? undefined,
  };
}

interface FinalizationInput {
  intent: ItineraryIntent;
  resolved: EnrichedPlace[];
  zones: Zone[];
  dayStart: GeoCoords;
  speedKmh: number;
  dropped: Array<{ placeId: string; reason: string }>;
  date: Date | null;
}

/** Final validation with deterministic safe repair (≤2 bounded iterations). */
function finalizeWithSafeRepairs(
  candidate: ItineraryCandidate,
  input: FinalizationInput,
): { candidate: ItineraryCandidate; report: FinalValidationReport } {
  let current = candidate;
  let report: FinalValidationReport | null = null;

  for (let iteration = 0; iteration < 2; iteration++) {
    const ctx: MergeRegenerateContext = {
      intent: input.intent,
      resolved: input.resolved,
      zones: input.zones,
      dayStart: input.dayStart,
      speedKmh: input.speedKmh,
      date: input.date,
    };
    const result = finalValidate({
      intent: input.intent,
      candidate: current,
      resolved: input.resolved,
      zones: input.zones,
      dayStart: input.dayStart,
      speedKmh: input.speedKmh,
      dropped: input.dropped,
      applySafeRepairs: true,
    });
    report = toReport(result);
    if (!report.feasible && result.repairedCandidate) {
      current = revalidateCandidate(result.repairedCandidate, ctx);
      current.quality = scoreCandidate(current, qualityContextFor(input.intent, input.resolved, input.speedKmh, input.dayStart));
      current.isRejected = false;
      continue;
    }
    return { candidate: current, report };
  }
  return { candidate: current, report: report! };
}

function emptyFailure(message: string, warnings: PlanningWarning[], origin: GeoCoords | null): PlanningResult {
  return {
    ok: false,
    errors: [],
    warnings,
    dropped: [],
    candidateStats: { generated: 0, feasible: 0, rejected: 0 },
    candidates: [],
    chosen: null,
    explanation: null,
    finalValidation: null,
    regions: { zones: [], pool: [], origin },
    messages: [message],
  };
}

// ---------------------------------------------------------------------------
// planTrip
// ---------------------------------------------------------------------------

export async function planTrip(options: PlanTripOptions): Promise<PlanningResult> {
  const { intent, store } = options;
  const date = options.date ?? null;
  const speedKmh = options.speedKmh ?? resolveSpeedKmh(intent.transportation);
  const warnings: PlanningWarning[] = [];
  const messages: string[] = [];
  const origin = options.origin ?? intent.origin ?? null;

  const resolution = await resolveCandidates({
    intent,
    store,
    origin,
    date,
    maxComplementaryPool: options.maxComplementaryPool,
  });
  pushUniqueWarnings(warnings, resolution.warnings);
  const dropped = resolution.dropped;
  const resolved = resolution.resolved;

  if (resolved.length === 0) {
    return emptyFailure(
      'No places could be resolved for this request — nothing to plan.',
      warnings,
      origin,
    );
  }

  const zones = buildZones(resolved, {
    includePlaceIds: [...intent.lockedPlaceIds, ...intent.pinnedPlaceIds],
  });
  const dayStart = dayBaseFor(intent, resolved, origin);
  const scoreCtx = qualityContextFor(intent, resolved, speedKmh, dayStart);

  const regenerate = options.regenerateDayNumber != null && options.previousPlan != null;

  // ---------------- Regeneration path --------------------------------------
  if (regenerate) {
    const previous = options.previousPlan as ItineraryCandidate;
    const regenDay = clampInt(options.regenerateDayNumber as number, 1, intent.days);
    const previousStopById = new Map(previous.allStopIds.map((id) => [id, id]));
    const priorDayIds = new Set(previous.days.find((d) => d.dayNumber === regenDay)?.placeIds ?? []);
    const regenPool = resolved.filter((p) => previousStopById.has(p.id));
    for (const id of priorDayIds) {
      if (!regenPool.some((p) => p.id === id)) {
        const p = resolved.find((x) => x.id === id);
        if (p) regenPool.push(p);
      }
    }

    const preserved = new Map<number, string[]>();
    for (const d of previous.days) {
      if (d.dayNumber !== regenDay) preserved.set(d.dayNumber, [...d.placeIds]);
    }

    const seed = options.variationSeed ?? 0;
    const regenResult = generateCandidates({
      intent,
      resolved: regenPool,
      zones,
      dayStart,
      speedKmh,
      date,
      singleDay: regenDay,
      preservedDayAssignments: preserved,
      strategies: [regenStrategyOf(previous.meta.strategy)],
      variations: [seed],
    });
    pushUniqueWarnings(warnings, regenResult.warnings);

    // Single-day selection must be scored against the DAY it rebuilds, not the
    // whole trip (full-plan mandatory coverage would reject every candidate).
    const dayLocalIntent: ItineraryIntent = {
      ...intent,
      selectedPlaceIds: [...priorDayIds],
    };
    const dayScoreCtx = qualityContextFor(dayLocalIntent, regenPool, speedKmh, dayStart);
    for (const c of regenResult.candidates) c.quality = scoreCandidate(c, dayScoreCtx);

    const bestDay = selectBestCandidate(regenResult.candidates);
    let merged: ItineraryCandidate;
    if (bestDay) {
      merged = mergeRegeneratedCandidate(
        previous,
        bestDay,
        regenDay,
        { intent, resolved, zones, dayStart, speedKmh, date },
      );
    } else {
      messages.push(`Day ${regenDay} could not be regenerated feasibly — the previous arrangement is kept.`);
      warnings.push({
        code: 'REGEN_INFEASIBLE',
        message: `Day ${regenDay} could not be regenerated feasibly; previous day retained.`,
        severity: 'WARNING',
        dayNumber: regenDay,
      });
      merged = previous;
    }

    merged.quality = scoreCandidate(merged, scoreCtx);
    const finalized = finalizeWithSafeRepairs(merged, { intent, resolved, zones, dayStart, speedKmh, dropped, date });
    const chosen = finalized.candidate;
    const finalValidation = finalized.report;

    const explanation: PlanExplanation | null = chosen
      ? explainPlan({ intent, candidate: chosen, resolved, zones, dayStart, speedKmh })
      : null;

    const feasibleCount = finalValidation?.feasible === true ? 1 : 0;
    const ok = !!chosen && feasibleCount === 1;
    messages.push(
      ok
        ? `Regenerated day ${regenDay}: ${chosen.days.find((d) => d.dayNumber === regenDay)?.placeIds.length ?? 0} stops.`
        : 'Day regeneration left the plan in an infeasible state.',
    );

    return {
      ok,
      errors: [],
      warnings,
      dropped,
      candidateStats: {
        generated: regenResult.candidates.length + 1,
        feasible: feasibleCount,
        rejected: regenResult.candidates.length - regenResult.feasible,
      },
      candidates: [...regenResult.candidates, merged],
      chosen,
      explanation,
      finalValidation,
      regions: { zones, pool: resolved, origin },
      messages,
    };
  }

  // ---------------- Full planning path --------------------------------------
  const seed = options.variationSeed ?? 0;
  const variations = (options.variations ?? [0]).map((v) => v + seed);

  const generation = generateCandidates({
    intent,
    resolved,
    zones,
    dayStart,
    speedKmh,
    date,
    strategies: options.strategies,
    variations,
  });
  pushUniqueWarnings(warnings, generation.warnings);
  for (const c of generation.candidates) c.quality = scoreCandidate(c, scoreCtx);

  const selected = selectBestCandidate(generation.candidates);

  let chosen: ItineraryCandidate | null = null;
  let finalValidation: FinalValidationReport | null = null;
  let explanation: PlanExplanation | null = null;
  let allCandidates = generation.candidates;

  if (selected) {
    const finalized = finalizeWithSafeRepairs(selected, { intent, resolved, zones, dayStart, speedKmh, dropped, date });
    chosen = finalized.candidate;
    finalValidation = finalized.report;
    if (chosen !== selected) allCandidates = [...allCandidates, chosen];
    explanation = explainPlan({ intent, candidate: chosen, resolved, zones, dayStart, speedKmh });
    if (finalValidation.repaired) {
      messages.push(finalValidation.repaired.description);
    }
  }

  if (!chosen) {
    messages.push('The trip could not be planned feasibly as requested.');
    if (generation.candidates.length) {
      const reasons = generation.candidates
        .flatMap((c) => c.rejectionReasons.map((r) => `${c.id}: ${r}`))
        .slice(0, 3);
      messages.push(`Most infeasible arrangement reasons: ${reasons.join(' | ') || 'unknown'}.`);
    }
  } else {
    messages.push(`Planned ${chosen.days.length} day(s) with ${chosen.allStopIds.length} stops in ${intent.destination}.`);
    if (finalValidation && !finalValidation.feasible) {
      messages.push('The plan has remaining hard-constraint notes; see finalValidation for details.');
    }
  }

  const ok = !!chosen && (!finalValidation || finalValidation.feasible);

  return {
    ok,
    errors: [],
    warnings,
    dropped,
    candidateStats: {
      generated: allCandidates.length,
      feasible: generation.feasible,
      rejected: generation.rejected,
    },
    candidates: allCandidates,
    chosen,
    explanation,
    finalValidation,
    regions: { zones, pool: resolved, origin },
    messages,
  };
}

// ---------------------------------------------------------------------------
// planFromRaw
// ---------------------------------------------------------------------------

export async function planFromRaw(
  input: RawPlanningInput,
  store: PlaceStore,
  options: PlanFromRawOptions = {},
): Promise<PlanningResult> {
  const normalized = normalizeIntent(input);
  if (!normalized.ok) {
    return {
      ok: false,
      errors: normalized.errors,
      warnings: normalized.warnings,
      dropped: [],
      candidateStats: { generated: 0, feasible: 0, rejected: 0 },
      candidates: [],
      chosen: null,
      explanation: null,
      finalValidation: null,
      regions: { zones: [], pool: [], origin: options.origin ?? null },
      messages: ['Request is structurally invalid.'],
    };
  }
  return planTrip({
    intent: normalized.intent,
    store,
    origin: options.origin,
    date: options.date,
    maxComplementaryPool: options.maxComplementaryPool,
    strategies: options.strategies,
    variations: options.variations,
    speedKmh: options.speedKmh,
    regenerateDayNumber: options.regenerateDayNumber,
    previousPlan: options.previousPlan,
    variationSeed: options.variationSeed,
  });
}