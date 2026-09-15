/**
 * Canonical planner <-> trips.service mapping (Phase 3).
 *
 * Pure helpers that translate between the API request contract, the canonical
 * engine's RawPlanningInput, and the legacy TripPlan/TripPlanStop persistence
 * shape. Nothing here touches Prisma, the network, or the engine itself, so the
 * orchestration in trips.service.ts stays thin and these rules are unit-tested.
 */

import type {
  AvoidInput,
  EnrichedPlace,
  ItineraryIntent,
  Pace,
  PlanningWarning,
  ScheduledStop,
  TimePreferenceInput,
  TransportModeInput,
} from './itinerary/types';
import type { RawPlanningInput } from './itinerary/intent';
import type { PlanDay } from './itinerary/phase2Types';
import { matchesInterests } from './itinerary/scoring';

export type PlanningModeApi = 'SELF_BUILD' | 'AI_BUILD';

/** Normalized /plan request shape (output of planSchema). */
export interface CanonicalPlanRequest {
  tripId?: string;
  destination: string;
  origin?: { lat: number; lng: number } | null;
  startDate?: string | null;
  endDate?: string | null;
  days?: number | null;
  mode: PlanningModeApi;
  selectedPlaceIds?: string[];
  pinnedPlaceIds?: string[];
  lockedPlaceIds?: string[];
  fixedTimePlaces?: Array<{ placeId: string; startTime: string }>;
  excludePlaceIds?: string[];
  interests?: string[];
  pace?: string | null;
  travelers?: string | number | null;
  budget?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CUSTOM' | null;
  customBudgetAmount?: number | null;
  timePreference?: string | null;
  avoid?: string[];
  transportation?: string[];
  prompt?: string | null;
  regenerateDayNumber?: number | null;
  variationSeed?: number | null;
}

/**
 * Map an API planning request onto the canonical engine's raw input.
 * `extraPriorityIds` (Phase 5) are prompt-resolved place ids merged into the
 * AI Build priority anchors on top of the user's explicit selections.
 */
export function toRawPlanningInput(input: CanonicalPlanRequest, extraPriorityIds: string[] = []): RawPlanningInput {
  const mode: PlanningModeApi = input.mode === 'AI_BUILD' ? 'AI_BUILD' : 'SELF_BUILD';
  const selected = input.selectedPlaceIds ?? [];
  return {
    destination: String(input.destination || '').trim(),
    origin: input.origin && Number.isFinite(input.origin.lat) && Number.isFinite(input.origin.lng)
      ? { lat: input.origin.lat, lng: input.origin.lng }
      : null,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    days: input.days ?? null,
    planningMode: mode,
    selectedPlaceIds: selected,
    pinnedPlaceIds: input.pinnedPlaceIds ?? [],
    lockedPlaceIds: input.lockedPlaceIds ?? [],
    fixedTimePlaces: (input.fixedTimePlaces ?? []).map((f) => ({
      placeId: f.placeId,
      startTime: f.startTime,
    })),
    // AI Build never invents ids: the user's picks are the priority anchors,
    // and prompt-resolved mentions (already DB-approved) join them.
    priorityPlaceIds: mode === 'AI_BUILD' ? [...selected, ...extraPriorityIds] : [],
    excludePlaceIds: input.excludePlaceIds ?? [],
    interests: input.interests ?? [],
    pace: (input.pace as Pace | undefined) ?? undefined,
    travelers: input.travelers ?? null,
    budgetTier: input.budget && input.budget !== 'CUSTOM' ? input.budget : null,
    customBudgetAmount: input.customBudgetAmount ?? null,
    timePreference: (input.timePreference as TimePreferenceInput | undefined) ?? undefined,
    avoid: (input.avoid ?? []) as AvoidInput[],
    transportation: (input.transportation ?? []) as TransportModeInput[],
    prompt: input.prompt ?? null,
    fillWithAi: mode === 'AI_BUILD',
    allowBudgetOverflow: false,
    earliestStartMinutes: null,
  };
}

/** Structural subset of the legacy /ai-generate request (trip domain shape). */
export interface AiGenerateLikeInput {
  destination: string;
  days: number;
  pace?: string | null;
  travelers?: string | number | null;
  budget?: string | null;
  customBudgetAmount?: number | null;
  interests?: string[];
  timePreference?: string | null;
  avoid?: string[];
  prompt?: string | null;
  manualPlaceIds?: string[];
  startDate?: string | null;
  transportation?: string[];
  regenerateDayNumber?: number | null;
  variationSeed?: number | null;
}

/** Bridge the legacy /ai-generate request onto the canonical /plan contract. */
export function toCanonicalPlanRequest(input: AiGenerateLikeInput): CanonicalPlanRequest {
  const budget = (input.budget ?? null) as CanonicalPlanRequest['budget'];
  return {
    destination: String(input.destination || '').trim(),
    days: input.days,
    mode: 'AI_BUILD',
    // Legacy manual ids become the AI Build priority anchors (never invented).
    selectedPlaceIds: Array.isArray(input.manualPlaceIds) ? input.manualPlaceIds : [],
    interests: Array.isArray(input.interests) ? input.interests : [],
    pace: input.pace ?? null,
    travelers: input.travelers ?? null,
    budget,
    customBudgetAmount: input.customBudgetAmount ?? null,
    timePreference: input.timePreference ?? null,
    avoid: Array.isArray(input.avoid) ? input.avoid : [],
    prompt: input.prompt ?? null,
    startDate: input.startDate ?? null,
    transportation: input.transportation,
    regenerateDayNumber: input.regenerateDayNumber ?? undefined,
    variationSeed: input.variationSeed ?? undefined,
  };
}

/** "HH:MM" (or "H:MM") -> minute-of-day, or null when unparseable. */
export function minutesFromTimeString(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(raw).trim());
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/** minute-of-day -> "HH:MM" (same format the legacy schema persists). */
export function timeStringFromMinutes(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60).toString().padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}`;
}

function residualMinutes(minutes: number): number {
  return ((Math.round(minutes) % 1440) + 1440) % 1440;
}

export type TimeSlotWrite = 'MORNING' | 'AFTERNOON' | 'EVENING';

export function timeSlotFromMinutes(minutes: number): TimeSlotWrite {
  const m = residualMinutes(minutes);
  if (m < 720) return 'MORNING';
  if (m < 1020) return 'AFTERNOON';
  return 'EVENING';
}

/** The persistence row written for one stop of a canonical plan. */
export interface LegacyStopWrite {
  placeId: string;
  order: number;
  timeSlot: TimeSlotWrite;
  startTime: string;
  endTime: string;
  duration: number;
  entryFee?: number;
  distanceFromPrev?: number;
  reason: string;
  isPinned: boolean;
}

export function stopReasonFor(place: EnrichedPlace, intent: ItineraryIntent, destination: string): string {
  if (place.state.fixedTime) {
    const spec = intent.fixedTimePlaces.find((f) => f.placeId === place.id);
    return `Fixed time at ${spec?.sourceStartTime ?? timeStringFromMinutes(spec?.startMinutes ?? 0)}.`;
  }
  if (place.state.pinned) return 'You pinned this place.';
  if (place.state.lockedPosition) return 'You locked this place into position.';
  if (place.state.priorityAnchor) return `High-priority pick for your ${destination} trip.`;
  if (place.state.selected) return `One of the places you selected for ${destination}.`;
  if (place.state.complementary) {
    const matched = firstMatchingInterest(place, intent.interests);
    return matched
      ? `Recommended to complete your ${destination} itinerary — a great fit for your ${matched} interest.`
      : `Recommended to complete your ${destination} itinerary.`;
  }
  return `Planned stop in ${destination}.`;
}

/** First intent interest that this place actually supports (deterministic). */
function firstMatchingInterest(place: EnrichedPlace, interests: string[]): string | null {
  const meaningful = Array.isArray(interests) ? interests.map(String) : [];
  for (const interest of meaningful) {
    if (matchesInterests(place, [interest])) return interest;
  }
  return null;
}

export function isStopPinned(place: EnrichedPlace): boolean {
  return place.state.pinned || place.state.lockedPosition || place.state.fixedTime;
}

/** Convert a scheduled canonical stop to the legacy stop-write shape. */
export function scheduledStopToWrite(
  stop: ScheduledStop,
  place: EnrichedPlace,
  intent: ItineraryIntent,
  destination: string,
): LegacyStopWrite {
  const write: LegacyStopWrite = {
    placeId: stop.placeId,
    order: stop.order,
    timeSlot: timeSlotFromMinutes(stop.startMinutes),
    startTime: timeStringFromMinutes(stop.startMinutes),
    endTime: timeStringFromMinutes(stop.endMinutes),
    duration: Math.max(30, stop.endMinutes - stop.startMinutes),
    distanceFromPrev: stop.distanceFromPrevKm > 0 ? stop.distanceFromPrevKm : undefined,
    reason: stopReasonFor(place, intent, destination),
    isPinned: isStopPinned(place),
  };
  const fee = place.entryFee;
  if (fee.basis !== 'FREE' && fee.trust !== 'UNKNOWN' && fee.amount > 0) {
    write.entryFee = fee.amount;
  }
  return write;
}

/** Map a whole planned day to ordered legacy stop writes. */
export function plannedDayToWrites(
  day: PlanDay,
  intent: ItineraryIntent,
  placeById: Map<string, EnrichedPlace>,
  destination: string,
): LegacyStopWrite[] {
  const writes: LegacyStopWrite[] = [];
  for (const stop of day.stops) {
    const place = placeById.get(stop.placeId);
    if (!place) continue;
    writes.push(scheduledStopToWrite(stop, place, intent, destination));
  }
  return writes;
}

/** Sum of party-level entry fees across the chosen stop set (estimatedBudget). */
export function estimatedBudgetOf(placeById: Map<string, EnrichedPlace>, allStopIds: string[]): number {
  let total = 0;
  for (const id of allStopIds) {
    const place = placeById.get(id);
    if (!place) continue;
    const fee = place.entryFee;
    if (fee.trust !== 'UNKNOWN' && fee.amount > 0) total += fee.amount;
  }
  return Math.round(total * 100) / 100;
}

/** De-duplicated warning messages for the API payload. */
export function warningMessages(warnings: readonly PlanningWarning[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of warnings) {
    const msg = w.message.trim();
    if (!msg || seen.has(msg)) continue;
    seen.add(msg);
    out.push(msg);
  }
  return out;
}

/** Drop/legacy-style "note" fallback when the engine did not yield one. */
export function planNoteOf(chosenDays: number, stopCount: number, destination: string, ok: boolean): string {
  if (!ok) return 'The itinerary could not be planned feasibly as requested.';
  return `Planned ${chosenDays} day(s) with ${stopCount} stops in ${destination}.`;
}

/** True when the plan is genuinely empty of resolvable places (INSUFFICIENT_PLACES). */
export function isDegeneratePlan(
  ok: boolean,
  chosenCount: number,
  poolCount: number,
  hasInfeasibleCandidates: boolean,
): boolean {
  if (poolCount === 0) return true;
  if (ok && chosenCount > 0) return false;
  return !hasInfeasibleCandidates;
}