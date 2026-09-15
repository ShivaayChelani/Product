/**
 * Intent normalization (Phase 1).
 *
 * Transforms raw planning input into a canonical, validated ItineraryIntent.
 * Pure and DB-free: place EXISTENCE is deliberately NOT trusted here — ids are
 * only deduplicated and structurally validated; candidate resolution
 * (candidates.ts) resolves them against the PALSAFAR Places DB.
 */

import type {
  AvoidInput,
  BudgetTier,
  FixedTimeSpec,
  ItineraryIntent,
  Pace,
  PlanningMode,
  PlanningWarning,
  TimePreferenceInput,
  TransportModeInput,
} from './types';

export interface RawPlanningInput {
  destination: string;
  origin?: { lat: number; lng: number } | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  days?: number | null;
  planningMode: PlanningMode;
  selectedPlaceIds?: string[];
  pinnedPlaceIds?: string[];
  lockedPlaceIds?: string[];
  /** Start-time entries as "HH:MM" (12h/24h both accepted). */
  fixedTimePlaces?: Array<{ placeId: string; startTime: string }>;
  priorityPlaceIds?: string[];
  excludePlaceIds?: string[];
  interests?: string[];
  pace?: Pace | null;
  travelers?: string | number | null;
  budgetTier?: BudgetTier | null;
  customBudgetAmount?: number | null;
  timePreference?: TimePreferenceInput | null;
  avoid?: AvoidInput[];
  transportation?: TransportModeInput[];
  prompt?: string | null;
  fillWithAi?: boolean | null;
  earliestStartMinutes?: number | null;
  allowBudgetOverflow?: boolean | null;
}

export interface NormalizeResult {
  intent: ItineraryIntent;
  warnings: PlanningWarning[];
  /** Structural validation failures (invalid days, invalid fixed times, ...). */
  errors: string[];
  /** True when no structural errors remain and the intent is usable. */
  ok: boolean;
}

const DAY_MIN = 1;
const DAY_MAX = 21;

const KNOWN_PACE: Pace[] = ['QUICK', 'BALANCED', 'RELAXED', 'VERY_RELAXED'];
const KNOWN_BUDGET_TIERS: BudgetTier[] = ['LOW', 'MEDIUM', 'HIGH'];
const KNOWN_TIME_PREFERENCES: TimePreferenceInput[] = ['MORNING_FOCUSED', 'FULL_DAY', 'EVENING_FRIENDLY'];
const KNOWN_AVOID: AvoidInput[] = ['CROWDED', 'LONG_TRAVEL', 'EXPENSIVE_ENTRY', 'NON_FAMILY_FRIENDLY'];
const KNOWN_TRANSPORT: TransportModeInput[] = ['WALKING', 'BIKE', 'CAR', 'TRAIN', 'FLIGHT'];

/** Canonical interest keys (must match INTEREST_CATEGORY_MAP in scoring.ts). */
export const KNOWN_INTERESTS = new Set([
  'temples', 'heritage', 'history', 'waterfalls', 'nature', 'food',
  'adventure', 'shopping', 'hidden gems', 'hidden_gems',
  'local culture', 'local_culture',
]);

const VALID_START_TIME_RE = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i;

/** "HH:MM" (or "9", "9:30 pm") -> minute-of-day, or null when unparseable. */
export function parseStartTimeToMinutes(raw: string): number | null {
  const m = raw.trim().toLowerCase().match(VALID_START_TIME_RE);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  const meridiem = m[3];
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/** ISO date string from Date or "yyyy-mm-dd". Returns null when invalid. */
export function toIsoDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const str = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(str)) return null;
  const parsed = new Date(`${str.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return str.slice(0, 10);
}

/** Inclusive calendar-day difference between two dates. */
export function daysBetweenInclusive(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T00:00:00Z`).getTime();
  const end = new Date(`${endIso}T00:00:00Z`).getTime();
  return Math.round((end - start) / 86_400_000) + 1;
}

/**
 * Canonical traveler-count resolution for cost math.
 * Mirrors both the mobile app and the legacy engine's resolveTravelerCount.
 */
export function resolveTravelerCount(raw: string | number | null | undefined): number {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
  const key = String(raw || '').toUpperCase();
  if (key === 'COUPLE') return 2;
  if (key === 'FAMILY' || key === 'FRIENDS') return 3;
  return 1;
}

function dedupeIds(ids: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of (ids || [])) {
    const trimmed = String(id || '').trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function normalizeInterests(raw: readonly string[] | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const interest of (raw || [])) {
    const key = String(interest || '').toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function daysFromDates(startIso: string | null, endIso: string | null): number | null {
  if (!startIso || !endIso) return null;
  const diff = daysBetweenInclusive(startIso, endIso);
  return diff > 0 ? diff : null;
}

/** Clamp earliest start to 05:00-18:00 (mirrors legacy parser). */
function clampEarliestStart(raw: number | null | undefined, warnings: PlanningWarning[]): number | null {
  if (raw == null) return null;
  if (!Number.isFinite(raw) || raw < 0) return null;
  const clamped = Math.max(5 * 60, Math.min(18 * 60, Math.round(raw)));
  if (clamped !== Math.round(raw)) {
    warnings.push({ code: 'EARLIEST_START_CLAMPED', severity: 'INFO', message: `Earliest start clamped to ${clamped}` });
  }
  return clamped;
}

export function normalizeIntent(input: RawPlanningInput): NormalizeResult {
  const warnings: PlanningWarning[] = [];
  const errors: string[] = [];

  const selected = dedupeIds(input.selectedPlaceIds);
  const pinned = dedupeIds(input.pinnedPlaceIds);
  const locked = dedupeIds(input.lockedPlaceIds);
  const priority = dedupeIds(input.priorityPlaceIds);
  const exclude = dedupeIds(input.excludePlaceIds);

  // --- fixed-time anchors: structural validation of "HH:MM"
  const fixedTimePlaces: FixedTimeSpec[] = [];
  const seenFixed = new Set<string>();
  for (const spec of input.fixedTimePlaces || []) {
    const placeId = String(spec?.placeId || '').trim();
    if (!placeId) {
      warnings.push({ code: 'FIXED_TIME_INVALID', severity: 'WARNING', message: 'Fixed-time entry without place id ignored.' });
      continue;
    }
    if (seenFixed.has(placeId)) continue;
    const startMinutes = parseStartTimeToMinutes(spec.startTime || '');
    if (startMinutes == null) {
      errors.push(`Invalid fixed time "${spec.startTime}" for place ${placeId}. Expected HH:MM.`);
      warnings.push({
        code: 'FIXED_TIME_INVALID',
        severity: 'WARNING',
        message: `Invalid fixed time for ${placeId}: "${spec.startTime}".`,
        placeIds: [placeId],
      });
      continue;
    }
    seenFixed.add(placeId);
    fixedTimePlaces.push({ placeId, startMinutes, sourceStartTime: String(spec.startTime).trim() });
  }

  // --- days: explicit > derived from dates > default 1
  let days = 1;
  const startIso = toIsoDate(input.startDate);
  const endIso = toIsoDate(input.endDate);
  if (startIso && endIso && startIso > endIso) {
    errors.push(`startDate (${startIso}) is after endDate (${endIso}).`);
    warnings.push({ code: 'DATES_INVERTED', severity: 'WARNING', message: 'Start date after end date; treating as invalid.' });
  }
  if (typeof input.days === 'number' && Number.isFinite(input.days)) {
    days = Math.floor(input.days);
    if (days < DAY_MIN || days > DAY_MAX) {
      errors.push(`days must be between ${DAY_MIN} and ${DAY_MAX} (got ${days}).`);
      days = Math.min(DAY_MAX, Math.max(DAY_MIN, days));
    }
  } else if (startIso && endIso && startIso <= endIso) {
    const derived = daysFromDates(startIso, endIso);
    if (derived != null) days = derived;
  }
  if (days > DAY_MAX || days < DAY_MIN) {
    errors.push(`Unresolvable day count: ${days}.`);
    days = Math.min(DAY_MAX, Math.max(DAY_MIN, days));
  }

  // --- pace
  const pace: Pace = input.pace && KNOWN_PACE.includes(input.pace) ? input.pace : 'BALANCED';
  if (input.pace && !KNOWN_PACE.includes(input.pace)) {
    errors.push(`Unknown pace "${input.pace}".`);
    warnings.push({ code: 'PACE_UNKNOWN', severity: 'WARNING', message: `Unknown pace "${input.pace}" defaulted to BALANCED.` });
  }

  // --- budget
  let budgetTier: BudgetTier | null = null;
  if (input.budgetTier != null) {
    if (KNOWN_BUDGET_TIERS.includes(input.budgetTier)) budgetTier = input.budgetTier;
    else {
      errors.push(`Unknown budget tier "${input.budgetTier}".`);
      warnings.push({ code: 'BUDGET_TIER_UNKNOWN', severity: 'WARNING', message: `Unknown budget tier "${input.budgetTier}" ignored.` });
    }
  }
  let customBudgetAmount: number | null = null;
  if (typeof input.customBudgetAmount === 'number' && Number.isFinite(input.customBudgetAmount)) {
    const amount = Math.max(0, input.customBudgetAmount);
    if (amount !== input.customBudgetAmount) {
      warnings.push({ code: 'BUDGET_AMOUNT_CLAMPED', severity: 'INFO', message: 'Negative custom budget clamped to 0.' });
    }
    customBudgetAmount = amount;
  }
  const budgetCap = customBudgetAmount != null && customBudgetAmount > 0 ? customBudgetAmount : null;

  // --- time preference
  let timePreference: TimePreferenceInput | null = null;
  if (input.timePreference != null) {
    if (KNOWN_TIME_PREFERENCES.includes(input.timePreference)) timePreference = input.timePreference;
    else {
      errors.push(`Unknown timePreference "${input.timePreference}".`);
      warnings.push({ code: 'TIME_PREFERENCE_UNKNOWN', severity: 'WARNING', message: `Unknown timePreference "${input.timePreference}" ignored.` });
    }
  }

  // --- avoid
  const avoid: AvoidInput[] = [];
  for (const entry of (input.avoid || [])) {
    const key = String(entry || '').toUpperCase() as AvoidInput;
    if (!KNOWN_AVOID.includes(key)) {
      warnings.push({ code: 'AVOID_UNKNOWN', severity: 'WARNING', message: `Unknown avoid option "${entry}" ignored.` });
      continue;
    }
    if (!avoid.includes(key)) avoid.push(key);
  }

  // --- transportation
  const transportation: TransportModeInput[] = [];
  for (const entry of (input.transportation || [])) {
    const key = String(entry || '').toUpperCase() as TransportModeInput;
    if (!KNOWN_TRANSPORT.includes(key)) {
      warnings.push({ code: 'TRANSPORT_UNKNOWN', severity: 'WARNING', message: `Unknown transport mode "${entry}" ignored.` });
      continue;
    }
    if (!transportation.includes(key)) transportation.push(key);
  }

  // --- mode rules
  const mode: PlanningMode = input.planningMode === 'AI_BUILD' ? 'AI_BUILD' : 'SELF_BUILD';
  if (input.planningMode !== 'SELF_BUILD' && input.planningMode !== 'AI_BUILD') {
    errors.push(`Unknown planning mode "${input.planningMode}".`);
  }
  const fillWithAi = mode === 'AI_BUILD' ? (input.fillWithAi !== false) : false;

  const intent: ItineraryIntent = {
    destination: String(input.destination || '').trim(),
    origin: input.origin && Number.isFinite(input.origin.lat) && Number.isFinite(input.origin.lng)
      ? { lat: input.origin.lat, lng: input.origin.lng }
      : null,
    startDate: startIso,
    endDate: endIso,
    days,
    planningMode: mode,
    selectedPlaceIds: selected,
    pinnedPlaceIds: pinned,
    lockedPlaceIds: locked,
    fixedTimePlaces,
    priorityPlaceIds: priority,
    excludePlaceIds: exclude,
    interests: normalizeInterests(input.interests),
    pace,
    travelers: resolveTravelerCount(input.travelers),
    budgetTier,
    customBudgetAmount,
    budgetCap,
    timePreference,
    avoid,
    transportation,
    prompt: input.prompt ? String(input.prompt).slice(0, 2000) : null,
    earliestStartMinutes: clampEarliestStart(input.earliestStartMinutes, warnings),
    fillWithAi,
    allowBudgetOverflow: input.allowBudgetOverflow === true,
  };

  if (!intent.destination && errors.length === 0) {
    warnings.push({ code: 'DESTINATION_EMPTY', severity: 'WARNING', message: 'No destination provided.' });
  }

  // Cross-flag sanity: fixed-time and locked imply pinned (unremovable).
  const fixedIds = new Set(fixedTimePlaces.map((f) => f.placeId));
  const missingFixed = Array.from(fixedIds).filter((id) => !selected.includes(id) && !priority.includes(id));
  if (missingFixed.length) {
    warnings.push({
      code: 'FIXED_TIME_NOT_SELECTED',
      severity: 'INFO',
      message: 'Fixed-time place that is not in the selected/priority set will be force-included.',
      placeIds: missingFixed,
    });
  }

  return { intent, warnings, errors, ok: errors.length === 0 };
}