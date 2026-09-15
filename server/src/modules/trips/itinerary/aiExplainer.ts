/**
 * Plan explanation layer (Phase 2), 100% deterministic and DB-free.
 *
 * The explanation is produced ONLY AFTER a best feasible plan exists and is
 * derived exclusively from the plan, the resolved pool, the zones and the
 * intent — never from an LLM. Strings are constructed from measured values so
 * tests can assert stable phrases ("keeps all 5 selected places", "covers all
 * 3 priority places", "Day 1 — Amber area").
 *
 * `guardAiExplanation` is the seam for a FUTURE external narration provider:
 *   - it never mutates the plan;
 *   - it rejects text that conflicts with the plan (mentions places not in the
 *     plan, or any day outside the trip's range);
 *   - on conflict, the deterministic explanation is returned unchanged and the
 *     AI text is discarded (accepted=false, conflict recorded).
 */

import type {
  EnrichedPlace,
  GeoCoords,
  ItineraryIntent,
  Zone,
} from './types';
import { formatMinutes } from './scheduleBuilder';
import { resolvableMandatoryIds } from './qualityScorer';
import type { ItineraryCandidate, PlanExplanation } from './phase2Types';

export interface ExplainContext {
  intent: ItineraryIntent;
  candidate: ItineraryCandidate;
  resolved: EnrichedPlace[];
  zones: Zone[];
  dayStart: GeoCoords;
  speedKmh: number;
}

/** Human-friendly area label from the zone's hub place ("Amber area"). */
export function zoneAreaLabel(zone: Zone, poolById: Map<string, EnrichedPlace>): string {
  const hub = poolById.get(zone.hubPlaceId);
  return hub ? hub.name : zone.id;
}

function explicitSetFor(intent: ItineraryIntent): Set<string> {
  return new Set([
    ...intent.selectedPlaceIds,
    ...intent.priorityPlaceIds,
    ...intent.pinnedPlaceIds,
    ...intent.lockedPlaceIds,
    ...intent.fixedTimePlaces.map((f) => f.placeId),
  ]);
}

/** Complementary = in the plan but not explicit/selected by the user (AI-only). */
function complementaryCount(intent: ItineraryIntent, stopIds: string[]): number {
  const explicit = explicitSetFor(intent);
  return stopIds.filter((id) => !explicit.has(id)).length;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Build the deterministic, plan-derived explanation. */
export function explainPlan(ctx: ExplainContext): PlanExplanation {
  const { intent, candidate, resolved } = ctx;
  const poolById = new Map(resolved.map((p) => [p.id, p]));
  const stopIds = candidate.allStopIds;
  const days = [...candidate.days].sort((a, b) => a.dayNumber - b.dayNumber);
  const n = stopIds.length;

  const mandatory = resolvableMandatoryIds(intent, resolved);
  const covered = mandatory.filter((id) => stopIds.includes(id)).length;
  const mandatoryCount = mandatory.length;
  const complements = complementaryCount(intent, stopIds);

  // --- Summary ---------------------------------------------------------------
  let summary: string;
  if (n === 0) {
    summary = `No itinerary could be built for ${intent.destination}.`;
  } else if (intent.planningMode === 'SELF_BUILD' && mandatoryCount > 0) {
    if (covered === mandatoryCount) {
      summary = `A ${plural(days.length, 'day')} self-built itinerary for ${intent.destination} with ${plural(n, 'stop')} that keeps all ${mandatoryCount} selected places.`;
    } else {
      summary = `A ${plural(days.length, 'day')} self-built itinerary for ${intent.destination} with ${plural(n, 'stop')} that kept ${covered} of ${mandatoryCount} selected places.`;
    }
  } else if (intent.planningMode === 'AI_BUILD' && mandatoryCount > 0) {
    if (covered === mandatoryCount) {
      summary = `A ${plural(days.length, 'day')} itinerary for ${intent.destination} with ${plural(n, 'stop')} that covers all ${mandatoryCount} priority places.`;
    } else {
      summary = `A ${plural(days.length, 'day')} itinerary for ${intent.destination} with ${plural(n, 'stop')} that covered ${covered} of ${mandatoryCount} priority places.`;
    }
  } else {
    summary = `A ${plural(days.length, 'day')} itinerary for ${intent.destination} with ${plural(n, 'stop')}.`;
  }
  if (complements > 0) {
    summary = `${summary} Round out: ${plural(complements, 'complementary place')} from the PALSAFAR catalog were added.`;
  } else if (intent.planningMode === 'SELF_BUILD') {
    summary = `${summary} No additional places were added.`;
  }

  // --- Per-day details ---------------------------------------------------------
  const dayDetails = days.map((day) => {
    const names = day.placeIds
      .map((id) => poolById.get(id)?.name ?? id)
      .filter((name) => name.trim().length > 0);
    const zones = day.zoneIds
      .filter((zid, i, arr) => arr.indexOf(zid) === i)
      .map((zid) => {
        const zone = ctx.zones.find((z) => z.id === zid);
        return zone ? zoneAreaLabel(zone, poolById) : zid;
      });
    const areaText = zones.length ? zones.join(', ') : 'mixed areas';
    const km = Math.round(day.stops.reduce((s, stop) => s + (stop.distanceFromPrevKm ?? 0), 0) * 10) / 10;
    const first = [...day.stops].sort((a, b) => a.order - b.order)[0];
    const startText = first ? ` starts ${formatMinutes(first.startMinutes)}` : '';
    const text = `Day ${day.dayNumber} — ${areaText}: ${plural(day.placeIds.length, 'stop')}${names.length ? ` — ${names.join(', ')}` : ''}${startText}, ~${km} km.`;
    return { dayNumber: day.dayNumber, text };
  });

  // --- Notes --------------------------------------------------------------------
  const notes: string[] = [];
  notes.push('Travel distances and timings are estimates (Haversine); actual driving routes may differ.');
  if (complements > 0) {
    notes.push('Complementary places come from the approved PALSAFAR place catalog only — nothing is invented.');
  }
  if (candidate.warnings.length) {
    const messages = [...new Set(candidate.warnings.map((w) => w.message))];
    notes.push(...messages.slice(0, 5).map((m) => `Note: ${m}`));
  }

  return {
    summary,
    dayDetails,
    notes,
    provider: 'deterministic',
  };
}

// ---------------------------------------------------------------------------
// AI narration guard (future provider seam; plan is never mutated)
// ---------------------------------------------------------------------------

export interface GuardExplanationResult {
  /** true when the AI text was consistent with the plan and may be used. */
  accepted: boolean;
  /** Canonical (deterministic) explanation always returned. */
  explanation: PlanExplanation;
  /** Why an AI text was rejected (empty when accepted). */
  conflictReasons: string[];
}

export const MAX_AI_EXPLANATION_CHARS = 4000;

/** Book the place names/ids a guard scan must look for against the plan. */
function findConflicts(text: string, ctx: ExplainContext): string[] {
  const lower = text.toLowerCase();
  const conflicts: string[] = [];
  const stopSet = new Set(ctx.candidate.allStopIds);

  // An AI text must not claim a place the plan does not include.
  for (const p of ctx.resolved) {
    if (stopSet.has(p.id)) continue;
    const nameHit = p.name && p.name.length >= 3 && lower.includes(p.name.toLowerCase());
    const idHit = text.includes(p.id);
    if (nameHit || idHit) {
      conflicts.push(`mentions "${p.name}" (${p.id}) which is not in the plan`);
      break;
    }
  }

  // An AI text must not reference a day outside the trip's range.
  const dayRe = /day\s+(\d{1,2})/gi;
  let m: RegExpExecArray | null;
  while ((m = dayRe.exec(text))) {
    const dayNumber = Number(m[1]);
    if (!Number.isFinite(dayNumber) || dayNumber < 1 || dayNumber > ctx.intent.days) {
      conflicts.push(`mentions day ${dayNumber} outside the ${ctx.intent.days}-day trip`);
      break;
    }
  }
  return conflicts;
}

/**
 * Vet untrusted external-AI narration. Deterministic, read-only, bounded.
 * On ANY conflict the AI text is discarded and the deterministic explanation is
 * returned; otherwise the AI text is adopted as a NON-authoritative summary.
 */
export function guardAiExplanation(
  aiText: string | null | undefined,
  ctx: ExplainContext,
): GuardExplanationResult {
  const base = explainPlan(ctx);

  const trimmed = (aiText ?? '').trim();
  if (!trimmed) {
    return { accepted: false, explanation: base, conflictReasons: ['no AI explanation text supplied'] };
  }
  if (trimmed.length > MAX_AI_EXPLANATION_CHARS) {
    return {
      accepted: false,
      explanation: { ...base, notes: [...base.notes, `AI explanation rejected: exceeds ${MAX_AI_EXPLANATION_CHARS} characters.`] },
      conflictReasons: [`text exceeds ${MAX_AI_EXPLANATION_CHARS} characters`],
    };
  }

  const conflicts = findConflicts(trimmed, ctx);
  if (conflicts.length) {
    return {
      accepted: false,
      explanation: { ...base, notes: [...base.notes, `AI explanation rejected: ${conflicts[0]}.`] },
      conflictReasons: conflicts,
    };
  }

  return {
    accepted: true,
    explanation: {
      summary: trimmed,
      dayDetails: base.dayDetails,
      notes: [...base.notes, 'AI narration was provided by an external model; facts are not verified by the engine.'],
      provider: 'ai',
    },
    conflictReasons: [],
  };
}