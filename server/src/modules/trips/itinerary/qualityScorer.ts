/**
 * Canonical candidate quality scorer (Phase 2).
 *
 * Ten dimensions:
 *   1. mandatory/priority coverage      (DOMINANT — hard gating + huge weight)
 *   2. area coherence
 *   3. route efficiency
 *   4. opening-hours compliance
 *   5. schedule feasibility
 *   6. budget compliance
 *   7. travel burden
 *   8. user preference match
 *   9. experience quality
 *  10. warnings/violations penalty
 *
 * Invariants:
 *   - A candidate with ANY hard-constraint violation is `feasible=false` and
 *     can never win selection (planner filters it out).
 *   - Mandatory coverage DOMINATES every optional-quality signal: its weight
 *     is larger than the maximum possible sum of all other terms, so a plan
 *     that covers all mandatory places always outranks one that misses any.
 *   - Scores are explainable: every component and penalty carries a reason.
 *   - Pure and deterministic; no DB, no AI.
 */

import type {
  EnrichedPlace,
  GeoCoords,
  ItineraryIntent,
} from './types';
import { matchesInterests } from './scoring';
import type { ItineraryCandidate, ItineraryQuality, QualityComponent, QualityPenalty } from './phase2Types';

/** Dominance weight: strictly larger than the sum of every other component. */
export const MANDATORY_DOMINANCE_WEIGHT = 1_000_000;

export interface QualityContext {
  intent: ItineraryIntent;
  pool: EnrichedPlace[];
  speedKmh?: number;
  dayStart: GeoCoords;
  earliestStartMinutes?: number;
}

/** Resolvable mandatory ids for the mode (Self = selected; AI = priority + elected). */
export function resolvableMandatoryIds(intent: ItineraryIntent, pool: EnrichedPlace[]): string[] {
  const ids = intent.planningMode === 'SELF_BUILD'
    ? intent.selectedPlaceIds
    : [...new Set([...intent.priorityPlaceIds, ...intent.selectedPlaceIds])];
  const inPool = new Set(pool.map((p) => p.id));
  return ids.filter((id) => inPool.has(id));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function component(key: string, label: string, value: number, weight: number): QualityComponent {
  return { key, label, value: Math.round(value * 1000) / 1000, weight, points: Math.round(weight * value) };
}

/** Average travel-leg distance between consecutive stops of a day route. */
function routeTotals(candidate: ItineraryCandidate): { km: number; minutes: number; detours: number[] } {
  let km = 0;
  let minutes = 0;
  const detours: number[] = [];
  for (const stop of candidate.allStops) {
    km += stop.distanceFromPrevKm ?? 0;
    minutes += stop.travelFromPrevMinutes ?? 0;
  }
  for (const day of candidate.days) detours.push(day.detourIndex ?? 1);
  return { km, minutes, detours };
}

/**
 * Score one candidate. Feasibility comes from the candidate's own validated
 * constraint result — the scorer never re-validates and never mutates.
 */
export function scoreCandidate(candidate: ItineraryCandidate, ctx: QualityContext): ItineraryQuality {
  const { intent, pool } = ctx;
  const poolById = new Map(pool.map((p) => [p.id, p]));
  const components: QualityComponent[] = [];
  const penalties: QualityPenalty[] = [];

  // --- 1. Mandatory/priority coverage (DOMINANT) -----------------------------
  const mandatory = resolvableMandatoryIds(intent, pool);
  const stopIdSet = new Set(candidate.allStopIds);
  const covered = mandatory.filter((id) => stopIdSet.has(id));
  const coverage = mandatory.length ? covered.length / mandatory.length : 1;
  const missing = mandatory.filter((id) => !stopIdSet.has(id));
  if (missing.length) {
    penalties.push({
      key: 'MANDATORY_MISSING',
      points: missing.length * 1000,
      reason: `Missing mandatory place(s): ${missing.join(', ')}`,
    });
  }
  components.push(component('mandatoryCoverage', 'Mandatory coverage', coverage, MANDATORY_DOMINANCE_WEIGHT));

  // --- 2. Area coherence ------------------------------------------------------
  let coherenceTotal = 0;
  for (const day of candidate.days) {
    const distinctZones = new Set(day.zoneIds).size;
    coherenceTotal += distinctZones <= 1 ? 1 : (distinctZones === 0 ? 0.5 : 1 / distinctZones);
  }
  const coherence = candidate.days.length ? coherenceTotal / candidate.days.length : 1;
  components.push(component('areaCoherence', 'Area coherence', coherence, 120));

  // --- 3. Route efficiency -----------------------------------------------------
  const detours = routeTotals(candidate).detours;
  const avgDetour = detours.length ? detours.reduce((s, v) => s + v, 0) / detours.length : 1;
  const routeEfficiency = clamp01(1 - Math.max(0, avgDetour - 1) / 1.5);
  components.push(component('routeEfficiency', 'Route efficiency', routeEfficiency, 100));

  // --- 4. Opening-hours compliance ---------------------------------------------
  const resp = candidate.allStops.filter((s) => s.openingHoursRespected != null);
  const openOk = resp.filter((s) => s.openingHoursRespected === true).length;
  const openValue = resp.length ? openOk / resp.length : 0.5;
  const openingViolations = resp.length - openOk;
  if (openingViolations) {
    penalties.push({
      key: 'OPENING_HOURS',
      points: openingViolations * 200,
      reason: `${openingViolations} stop(s) scheduled outside trusted opening hours`,
    });
  }
  components.push(component('openingHoursCompliance', 'Opening-hours compliance', openValue, 90));

  // --- 5. Schedule feasibility --------------------------------------------------
  let overlaps = 0;
  const byDay = new Map<number, typeof candidate.allStops>();
  for (const s of candidate.allStops) {
    const list = byDay.get(s.dayNumber) ?? [];
    list.push(s);
    byDay.set(s.dayNumber, list);
  }
  for (const list of byDay.values()) {
    const sorted = [...list].sort((a, b) => a.order - b.order);
    for (let i = 1; i < sorted.length; i++) {
      if ((sorted[i].startMinutes ?? 0) < (sorted[i - 1].endMinutes ?? 0)) overlaps += 1;
    }
  }
  const scheduleFeasible = clamp01(overlaps ? 0 : 1);
  if (overlaps) {
    penalties.push({ key: 'SCHEDULE_OVERLAP', points: overlaps * 500, reason: `${overlaps} overlapping stop(s)` });
  }
  components.push(component('scheduleFeasibility', 'Schedule feasibility', scheduleFeasible, 80));

  // --- 6. Budget compliance ------------------------------------------------------
  const overBudget = candidate.constraintResult.hardViolations.some((v) => v.id === 'H8_BUDGET_EXCEEDED');
  const budgetValue = overBudget ? 0 : 1;
  if (overBudget) {
    penalties.push({ key: 'BUDGET', points: 800, reason: 'Estimated cost exceeds the explicit budget ceiling' });
  }
  components.push(component('budgetCompliance', 'Budget compliance', budgetValue, 70));

  // --- 7. Travel burden ------------------------------------------------------------
  const travel = routeTotals(candidate).minutes;
  const daysN = candidate.days.length || 1;
  const travelValue = clamp01(1 - travel / (daysN * 360));
  components.push(component('travelBurden', 'Travel burden', travelValue, 60));

  // --- 8. User preference match ------------------------------------------------------
  const interestValue = intent.interests.length && candidate.allStopIds.length
    ? candidate.allStopIds
      .map((id) => poolById.get(id))
      .filter((p): p is EnrichedPlace => !!p)
      .filter((p) => matchesInterests(p, intent.interests)).length / candidate.allStopIds.length
    : 0.5;
  components.push(component('userPreferenceMatch', 'User preference match', interestValue, 50));

  // --- 9. Experience quality -----------------------------------------------------------
  const rated = candidate.allStopIds
    .map((id) => poolById.get(id))
    .filter((p): p is EnrichedPlace => !!p)
    .filter((p) => p.rating != null);
  const avgRating = rated.length ? rated.reduce((s, p) => s + (p.rating ?? 0), 0) / rated.length : 3;
  const avgEditorial = candidate.allStopIds
    .map((id) => poolById.get(id))
    .filter((p): p is EnrichedPlace => !!p)
    .reduce((s, p) => s + (p.editorialPriority ?? 3), 0) / Math.max(1, candidate.allStopIds.length);
  const qualityValue = clamp01(0.6 * (avgRating / 5) + 0.4 * (avgEditorial / 5));
  components.push(component('experienceQuality', 'Experience quality', qualityValue, 40));

  // --- 10. Warnings/violations penalty ---------------------------------------------
  const softWarnings = candidate.constraintResult.softWarnings.length;
  if (softWarnings) {
    penalties.push({
      key: 'SOFT_WARNINGS',
      points: softWarnings * 6,
      reason: `${softWarnings} soft-constraint warning(s)`,
    });
  }

  // --- Feasibility gate ------------------------------------------------------------
  const hard = candidate.constraintResult.hardViolations.filter((v) => v.severity === 'HARD');
  let feasible = hard.length === 0;
  // A missing resolvable mandatory place is automatically infeasible (H6).
  if (missing.length) feasible = false;
  if (!feasible) {
    penalties.push({
      key: 'INFEASIBLE',
      points: 10_000,
      reason: hard.length ? `${hard.length} hard constraint violation(s)` : 'mandatory coverage incomplete',
    });
  }

  const componentPoints = components.reduce((s, c) => s + c.points, 0);
  const penaltyPoints = penalties.reduce((s, p) => s + p.points, 0);
  const totalScore = Math.round(componentPoints - penaltyPoints);

  // Strengths / weaknesses (explainable).
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  if (coverage === 1) strengths.push('covers every mandatory place');
  else if (coverage > 0.66) strengths.push(`covers ${Math.round(coverage * 100)}% of mandatory places`);
  if (coherence >= 0.9) strengths.push('each day stays within one area');
  if (routeEfficiency >= 0.85) strengths.push('efficient routing with little backtracking');
  if (openValue >= 0.9) strengths.push('stops fit trusted opening hours');
  if (interestValue >= 0.75) strengths.push('strongly matches your interests');
  if (missing.length) weaknesses.push(`missing mandatory: ${missing.join(', ')}`);
  if (overlaps) weaknesses.push(`${overlaps} overlapping stop(s)`);
  if (overBudget) weaknesses.push('over the explicit budget');
  if (openingViolations) weaknesses.push('some stops scheduled during trusted closed hours');
  if (!coherence || coherence < 0.66) weaknesses.push('days bounce between areas');

  return {
    totalScore,
    mandatoryCoverage: Math.round(coverage * 1000) / 1000,
    components,
    penalties,
    strengths,
    weaknesses,
    feasible,
  };
}

/** Pick the single best FEASIBLE candidate (highest totalScore, deterministic tie-break).
 *  Ties resolve in a strict, explainable order: mandatoryCoverage ->
 *  fewer penalty points -> fewer weaknesses -> more stops -> stable id. */
export function selectBestCandidate(candidates: ItineraryCandidate[]): ItineraryCandidate | null {
  const penaltyTotal = (q: ItineraryQuality | null): number => q?.penalties?.reduce((s, p) => s + p.points, 0) ?? 0;

  const eligible = candidates
    .filter((c) => !c.isRejected && c.quality?.feasible !== false)
    .sort((a, b) => {
      const qa = a.quality;
      const qb = b.quality;
      const ta = qa?.totalScore ?? -Infinity;
      const tb = qb?.totalScore ?? -Infinity;
      if (tb !== ta) return tb - ta;
      const ca = qa?.mandatoryCoverage ?? 0;
      const cb = qb?.mandatoryCoverage ?? 0;
      if (cb !== ca) return cb - ca;
      const pa = penaltyTotal(qa);
      const pb = penaltyTotal(qb);
      if (pa !== pb) return pa - pb;
      const wa = qa?.weaknesses?.length ?? 0;
      const wb = qb?.weaknesses?.length ?? 0;
      if (wa !== wb) return wa - wb;
      if (b.allStopIds.length !== a.allStopIds.length) return b.allStopIds.length - a.allStopIds.length;
      return a.id.localeCompare(b.id);
    });
  return eligible[0] ?? null;
}