/**
 * Day allocator (Phase 2). Consumes Phase 1 zones and distributes the resolved
 * pool across trip days.
 *
 * Allocation objective (frozen Phase 0 contract, softened only as specified):
 *   MAXIMIZE  priority coverage + feasibility + area coherence + experience
 *   MINIMIZE  travel burden + backtracking + unnecessary area switching
 *
 * Rules implemented:
 *   - mandatory/priority/pinned/locked/fixed-time places survive first.
 *   - SELF_BUILD candidate set contains ONLY selected places (never adds).
 *   - "one zone per day" is SOFT: adjacent zones may merge when materially
 *     beneficial; non-adjacent switching is penalized, never invented away.
 *   - a zone is placed ONCE where possible (no unnecessary backtrack to an
 *     already-used area); genuine capacity pressure may split it WITH a
 *     disclosure warning.
 *   - fixed-time anchors, locked and pinned positions are preserved.
 *   - daily capacity (PACE stopsPerDay) is respected. Mandatory overflow is
 *     pushed to another day WITH disclosure (PLACE_MOVED_TO_LATER_DAY /
 *     AREA_SPLIT). When no day has any room left the place is reported as
 *     MANDATORY_CANNOT_FIT (never silently dropped, never crammed).
 *   - `singleDay` (regeneration) rebuilds ONLY that day from a caller-supplied
 *     pool; preserved day assignments stay frozen and unchanged.
 *
 * Pure, DB-free, deterministic. `variation` shifts the zone order so alternate
 * arrangements can be generated without randomness.
 */

import type {
  EnrichedPlace,
  GeoCoords,
  ItineraryIntent,
  PlanningWarning,
  Zone,
} from './types';
import { PACE_CONFIG } from './types';
import {
  estimateTravelMinutes,
  haversineKm,
  scoreZone,
  shouldCombineForDay,
  zoneValueOf,
} from './clustering';
import { normalizeOpeningHours } from './enrichment';
import { DEFAULT_DAY_START_MINUTES, LUNCH_END_MINUTES, LUNCH_START_MINUTES } from './scheduleBuilder';
import type { DayAllocation, DayAllocationResult, DayOrderingMode } from './phase2Types';

const ZONE_SWITCH_PENALTY = 100;
const ZONE_ADJACENT_JOIN_PENALTY = 15;
const EXTRA_DISTINCT_ZONE_PENALTY = 60;

export interface AllocateOptions {
  intent: ItineraryIntent;
  pool: EnrichedPlace[];
  zones: Zone[];
  dayStart: GeoCoords;
  speedKmh?: number;
  ordering?: DayOrderingMode;
  /** Deterministic arrangement shift (0 = base). */
  variation?: number;
  /** When set, allocate a SINGLE day from `pool` (regeneration support). */
  singleDay?: number;
  /** Freeze these day assignments (regeneration keeps other days stable). */
  preservedDayAssignments?: ReadonlyMap<number, readonly string[]>;
}

export interface MandatoryInfo {
  ids: string[];
  byId: Map<string, EnrichedPlace>;
}

/** Places the planner may never drop: selected + pin/lock/fixed/priority flags. */
export function mandatoryPlaces(pool: EnrichedPlace[]): MandatoryInfo {
  const ids: string[] = [];
  const byId = new Map<string, EnrichedPlace>();
  for (const p of pool) {
    if (
      p.state.selected
      || p.state.pinned
      || p.state.lockedPosition
      || p.state.fixedTime
      || p.state.priorityAnchor
    ) {
      ids.push(p.id);
      byId.set(p.id, p);
    }
  }
  return { ids, byId };
}

/** Survival rank: which mandatory place wins a scarce slot first. */
export function survivalRankOf(p: EnrichedPlace): number {
  if (p.state.pinned || p.state.lockedPosition) return 4;
  if (p.state.priorityAnchor) return 3;
  if (p.state.fixedTime) return 2;
  if (p.state.selected) return 1;
  return 0;
}

export function zoneMapOf(pool: EnrichedPlace[], zones: Zone[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const zone of zones) {
    for (const id of zone.placeIds) map.set(id, zone.id);
  }
  // A place missing from every zone keeps its own forced zone so per-day
  // coherence math stays honest.
  const known = new Set(map.keys());
  for (const p of pool) {
    if (!known.has(p.id)) map.set(p.id, `zone:${p.id}:forced`);
  }
  return map;
}

export function zoneById(zones: Zone[]): Map<string, Zone> {
  return new Map(zones.map((z) => [z.id, z]));
}

/**
 * Phase 5: estimate the wall-clock minutes a set of places would occupy on one
 * day — visit durations + Haversine travel legs + the fixed per-leg buffer
 * (identical guardrails to scheduleBuilder). Used as a capacity-driven cap so
 * complementary stops are added only while they still fit the pace budget
 * (never crammed, never silently dropped later).
 */
export function estimateDayMinutes(
  placeIds: readonly string[],
  poolById: ReadonlyMap<string, EnrichedPlace>,
  dayStart: GeoCoords | null,
  speedKmh: number,
): number {
  if (!placeIds.length) return 0;
  // Mirrors buildDaySchedule's timeline: a day starts at the default morning
  // window and a visit that would straddle the natural lunch window is paused
  // there exactly like scheduleBuilder.insertLunchBuffer does.
  let cursor = DEFAULT_DAY_START_MINUTES;
  let prev: GeoCoords | null = dayStart && Number.isFinite(dayStart.lat) && Number.isFinite(dayStart.lng)
    ? dayStart
    : null;
  for (const id of placeIds) {
    const place = poolById.get(id);
    if (!place) continue;
    const travel = prev
      ? estimateTravelMinutes(haversineKm(prev.lat, prev.lng, place.coordinates.lat, place.coordinates.lng), speedKmh)
      : 0;
    let start = cursor + travel;
    let end = start + Math.max(1, place.durationMinutes);
    // Identical lunch guardrail to scheduleBuilder: if a full visit would
    // straddle the lunch window, shift it to just after the window.
    if (end > LUNCH_START_MINUTES && start < LUNCH_END_MINUTES) {
      const from = Math.max(start, LUNCH_START_MINUTES);
      const to = Math.min(end, LUNCH_END_MINUTES);
      if (from < to) {
        start = Math.max(start, to);
        end = start + Math.max(1, place.durationMinutes);
      }
    }
    cursor = end;
    prev = { lat: place.coordinates.lat, lng: place.coordinates.lng };
  }
  return Math.max(0, cursor - DEFAULT_DAY_START_MINUTES);
}

/** Priority-ordered members: highest survival rank first, then draw value. */
export function orderMembersByPriority(members: EnrichedPlace[]): EnrichedPlace[] {
  return [...members].sort((a, b) =>
    survivalRankOf(b) - survivalRankOf(a) || zoneValueOf(b) - zoneValueOf(a),
  );
}

// ---------------------------------------------------------------------------
// Deterministic variation helpers
// ---------------------------------------------------------------------------

/** Deterministically shift an array using an integer seed (no RNG). */
export function variationShift<T>(items: T[], variation: number): T[] {
  if (!variation) return [...items];
  const k = Math.abs(variation) % Math.max(1, items.length);
  return [...items.slice(k), ...items.slice(0, k)];
}

// ---------------------------------------------------------------------------
// Zone ordering per strategy
// ---------------------------------------------------------------------------

interface ZoneOrderInput {
  zone: Zone;
  mandatoryCount: number;
  earliestFixedTime: number | null;
  earliestOpenMinute: number | null;
}

function earliestOpenOf(place: EnrichedPlace): number | null {
  const hours = place.openingHours ?? normalizeOpeningHours(place.openingHours);
  if (!hours) return null;
  const daily = hours.daily ?? hours.all ?? hours.everyday ?? hours.every_day;
  if (!daily || !daily.length) return null;
  return Math.min(...daily.map((w) => w.open));
}

function buildZoneOrder(
  zones: Zone[],
  pool: EnrichedPlace[],
  intent: ItineraryIntent,
  ordering: DayOrderingMode,
  variation: number,
): Zone[] {
  const poolById = new Map(pool.map((p) => [p.id, p]));
  const mandatory = mandatoryPlaces(pool).ids;
  const mandatorySet = new Set(mandatory);
  const fixedTimes = new Map(intent.fixedTimePlaces.map((f) => [f.placeId, f.startMinutes]));

  const rows: ZoneOrderInput[] = zones.map((zone) => {
    const members = zone.placeIds
      .map((id) => poolById.get(id))
      .filter((p): p is EnrichedPlace => !!p);
    const mandatoryCount = members.filter((p) => mandatorySet.has(p.id)).length;
    let earliestFixedTime: number | null = null;
    let earliestOpenMinute: number | null = null;
    for (const m of members) {
      const ft = fixedTimes.get(m.id);
      if (ft != null && (earliestFixedTime == null || ft < earliestFixedTime)) earliestFixedTime = ft;
      const open = earliestOpenOf(m);
      if (open != null && (earliestOpenMinute == null || open < earliestOpenMinute)) earliestOpenMinute = open;
    }
    return { zone, mandatoryCount, earliestFixedTime, earliestOpenMinute };
  });

  let ordered: ZoneOrderInput[];
  if (ordering === 'PRIORITY') {
    ordered = [...rows].sort(
      (a, b) =>
        b.mandatoryCount - a.mandatoryCount
        || b.zone.totalValue - a.zone.totalValue
        || a.zone.id.localeCompare(b.zone.id),
    );
  } else if (ordering === 'OPENING_HOURS') {
    const key = (r: ZoneOrderInput): number => {
      if (r.earliestFixedTime != null) return r.earliestFixedTime;
      if (r.earliestOpenMinute != null) return r.earliestOpenMinute;
      return 9 * 60;
    };
    ordered = [...rows].sort(
      (a, b) =>
        key(a) - key(b)
        || b.mandatoryCount - a.mandatoryCount
        || a.zone.id.localeCompare(b.zone.id),
    );
  } else {
    ordered = [...rows].sort(
      (a, b) =>
        b.zone.totalValue - a.zone.totalValue
        || b.mandatoryCount - a.mandatoryCount
        || a.zone.id.localeCompare(b.zone.id),
    );
  }
  return variationShift(ordered.map((r) => r.zone), variation);
}

// ---------------------------------------------------------------------------
// Allocation
// ---------------------------------------------------------------------------

/** Cost of adding a zone to a partially-populated day. */
function zoneJoinCost(zone: Zone, day: { zoneIds: string[]; placeIds: string[] }): number {
  if (!day.placeIds.length) return 0;
  if (day.zoneIds.includes(zone.id)) return 0;
  const adjacent = new Set(zone.adjacentZoneIds);
  if (day.zoneIds.some((zid) => adjacent.has(zid))) {
    return ZONE_ADJACENT_JOIN_PENALTY;
  }
  return ZONE_SWITCH_PENALTY + (day.zoneIds.length >= 2 ? EXTRA_DISTINCT_ZONE_PENALTY : 0);
}

export function allocateDays(options: AllocateOptions): DayAllocationResult {
  const {
    intent,
    pool,
    zones,
    ordering = 'PRIORITY',
    variation = 0,
    preservedDayAssignments,
  } = options;

  const warnings: PlanningWarning[] = [];
  const reasons: string[] = [];
  const poolById = new Map(pool.map((p) => [p.id, p]));
  const zoneMap = zoneMapOf(pool, zones);

  const maxStopsPerDay = PACE_CONFIG[intent.pace]?.stopsPerDay ?? 6;
  const maxMinutesPerDay = PACE_CONFIG[intent.pace]?.maxMinutesPerDay ?? 480;
  const dayStart = options.dayStart && Number.isFinite(options.dayStart.lat) && Number.isFinite(options.dayStart.lng)
    ? options.dayStart
    : null;
  const speedKmh = options.speedKmh ?? 30;
  const totalDays = Math.max(1, Math.min(intent.days, 21));

  const mandatory = mandatoryPlaces(pool).ids;
  const mandatorySet = new Set(mandatory);

  const zonesOf = (ids: string[]): string[] =>
    Array.from(new Set(ids.map((id) => zoneMap.get(id) ?? `zone:${id}:forced`)));

  const placeByDay = new Map<number, string[]>();

  const assignToDay = (placeId: string, dayNumber: number): void => {
    const list = placeByDay.get(dayNumber) ?? [];
    list.push(placeId);
    placeByDay.set(dayNumber, list);
  };
  const placedIds = (): Set<string> => new Set(Array.from(placeByDay.values()).flat());

  const canFit = (d: number): boolean => (placeByDay.get(d)?.length ?? 0) < maxStopsPerDay;

  // --- Regeneration: rebuild ONLY the requested day -------------------------
  if (options.singleDay != null) {
    const dayNumber = options.singleDay;
    const frozenAll = new Set<string>();
    if (preservedDayAssignments) {
      for (const ids of preservedDayAssignments.values()) {
        for (const id of ids) if (!frozenAll.has(id)) frozenAll.add(id);
      }
    }
    const free = pool.filter((p) => !frozenAll.has(p.id));
    const mand = orderMembersByPriority(free.filter((p) => mandatorySet.has(p.id)));
    const opt = free
      .filter((p) => !mandatorySet.has(p.id))
      .sort((a, b) => zoneValueOf(b) - zoneValueOf(a));

    const placeIds: string[] = [];
    const unplacedIds: string[] = [];
    for (const m of mand) placeIds.push(m.id);
    if (placeIds.length > maxStopsPerDay) {
      const overflow = placeIds.splice(maxStopsPerDay);
      unplacedIds.push(...overflow);
      warnings.push({
        code: 'DAY_OVERCONSTRAINED',
        message: `Day ${dayNumber} can hold at most ${maxStopsPerDay} stops but requires ${placeIds.length + overflow.length} mandatory placement(s).`,
        severity: 'WARNING',
        placeIds: overflow,
        dayNumber,
      });
    }
    let remaining = maxStopsPerDay - placeIds.length;
    for (const o of opt) {
      if (remaining <= 0) break;
      // Capacity-driven optional top-up: only add while the whole day still
      // fits the pace minute budget (skip, never cram).
      if (estimateDayMinutes([...placeIds, o.id], poolById, dayStart, speedKmh) > maxMinutesPerDay) {
        continue;
      }
      placeIds.push(o.id);
      remaining -= 1;
    }

    const days: DayAllocation[] = placeIds.length
      ? [{ dayNumber, zoneIds: zonesOf(placeIds), placeIds }]
      : [];

    return {
      days,
      warnings,
      unplacedIds,
      zoneSplits: [],
      feasible: unplacedIds.length === 0,
      reasons: [`generated day ${dayNumber} (regeneration)`],
    };
  }

  // --- Normal (full) planning ------------------------------------------------

  // Freeze any caller-preserved assignments before the loop starts.
  if (preservedDayAssignments) {
    for (const [dn, ids] of preservedDayAssignments) {
      const list = placeByDay.get(dn) ?? [];
      for (const id of ids) {
        if (pool.some((p) => p.id === id) && !list.includes(id)) list.push(id);
      }
      placeByDay.set(dn, list);
    }
  }

  const pickDay = (zone: Zone, prefer?: number | null): number | null => {
    if (prefer != null && canFit(prefer)) return prefer;
    let best: number | null = null;
    let bestCost = Infinity;
    for (let d = 1; d <= totalDays; d++) {
      if (!canFit(d)) continue;
      if (prefer != null && d === prefer) continue;
      const existingIds = placeByDay.get(d) ?? [];
      const existing = { zoneIds: zonesOf(existingIds), placeIds: existingIds };
      const cost = existingIds.length === 0 ? 0 : zoneJoinCost(zone, existing);
      const tie = existingIds.length * 0.01 + d * 0.0001;
      if (cost + tie < bestCost) {
        bestCost = cost + tie;
        best = d;
      }
    }
    return best;
  };

  /** Place one place on its best available day, preferring a target day. */
  const placeOnBestDay = (zone: Zone, place: EnrichedPlace, prefer: number | null, movedNote: string): boolean => {
    const day = pickDay(zone, prefer);
    if (day == null || !canFit(day)) return false;
    assignToDay(place.id, day);
    if (prefer != null && day !== prefer) {
      warnings.push({
        code: 'PLACE_MOVED_TO_LATER_DAY',
        message: movedNote,
        severity: 'WARNING',
        placeIds: [place.id],
        dayNumber: day,
      });
    }
    return true;
  };

  const orderedZones = buildZoneOrder(zones, pool, intent, ordering, variation);
  const unplacedIds: string[] = [];

  for (const zone of orderedZones) {
    const members = zone.placeIds
      .map((id) => poolById.get(id))
      .filter((p): p is EnrichedPlace => !!p)
      .filter((p) => !placedIds().has(p.id))
      .filter((p) => zoneMap.get(p.id) === zone.id);

    const sorted = orderMembersByPriority(members);
    if (!sorted.length) continue;

    const mandatoryMembers = sorted.filter((m) => mandatorySet.has(m.id));
    const optionalMembers = sorted.filter((m) => !mandatorySet.has(m.id));
    const primaryDay = pickDay(zone, null);

    // Mandatory survival is king: keep each on the zone's primary day, spill
    // with disclosure only when that day is genuinely full.
    for (const m of mandatoryMembers) {
      const primary = primaryDay != null && canFit(primaryDay) ? primaryDay : null;
      const placed = placeOnBestDay(
        zone,
        m,
        primary,
        `"${m.name}" could not fit its area's primary day and was moved to another day.`,
      );
      if (!placed) {
        unplacedIds.push(m.id);
        warnings.push({
          code: 'MANDATORY_CANNOT_FIT',
          message: `Mandatory place "${m.name}" cannot fit any day (capacity exhausted everywhere).`,
          severity: 'WARNING',
          placeIds: [m.id],
        });
      }
    }

    // Optional top-ups stay with the zone's primary day where room allows.
    for (const o of optionalMembers) {
      const minutesFit = (d: number): boolean =>
        estimateDayMinutes([...(placeByDay.get(d) ?? []), o.id], poolById, dayStart, speedKmh)
          <= maxMinutesPerDay;
      const target = primaryDay != null && canFit(primaryDay) && minutesFit(primaryDay)
        ? primaryDay
        : (() => {
            const alt = pickDay(zone, primaryDay);
            return alt != null && minutesFit(alt) ? alt : null;
          })();
      if (target == null) continue; // no day fits minutes/capacity — skip optional quietly
      const placed = placeOnBestDay(
        zone,
        o,
        target,
        `"${o.name}" could not fit its area's primary day and was moved to another day.`,
      );
      if (!placed) continue;
    }
  }

  // Build the ordered day result.
  const days: DayAllocation[] = [];
  for (let d = 1; d <= totalDays; d++) {
    const ids = placeByDay.get(d) ?? [];
    if (!ids.length) continue;
    days.push({
      dayNumber: d,
      zoneIds: zonesOf(ids),
      placeIds: ids,
    });
  }
  const orderedDays = days.sort((a, b) => a.dayNumber - b.dayNumber);

  // Zone-split disclosure computed from the final assignment (a zone that had
  // to be spread over several days is surfaced, never hidden).
  const zoneDays = new Map<string, number[]>();
  for (const [d, ids] of placeByDay) {
    for (const id of ids) {
      const zid = zoneMap.get(id) ?? `zone:${id}:forced`;
      const arr = zoneDays.get(zid) ?? [];
      if (!arr.includes(d)) arr.push(d);
      zoneDays.set(zid, arr);
    }
  }
  const zoneSplitInfo = Array.from(zoneDays.entries())
    .filter(([, ds]) => ds.length > 1)
    .map(([zoneId, dayNumbers]) => ({
      zoneId,
      dayNumbers: dayNumbers.sort((a, b) => a - b),
    }));
  for (const split of zoneSplitInfo) {
    warnings.push({
      code: 'AREA_SPLIT',
      message: `Area "${split.zoneId}" was split across days (${split.dayNumbers.join(', ')}) to fit the requested itinerary.`,
      severity: 'WARNING',
    });
  }

  // Belt-and-suspenders: any mandatory place left out entirely is reported.
  for (const id of mandatory) {
    const placed = orderedDays.some((d) => d.placeIds.includes(id));
    if (!placed && pool.some((p) => p.id === id) && !unplacedIds.includes(id)) {
      unplacedIds.push(id);
    }
  }

  const total = orderedDays.reduce((s, d) => s + d.placeIds.length, 0);
  if (total === 0) reasons.push('nothing allocated');

  const feasible = unplacedIds.length === 0;
  if (!feasible) {
    reasons.push(`mandatory cannot fit: ${unplacedIds.length} place(s)`);
    warnings.push({
      code: 'DAY_OVERCONSTRAINED',
      message: `Days x capacity are insufficient for the mandatory selections (unplaced: ${unplacedIds.join(', ')}).`,
      severity: 'WARNING',
      placeIds: unplacedIds,
    });
  }

  return {
    days: orderedDays,
    warnings,
    unplacedIds,
    zoneSplits: zoneSplitInfo,
    feasible,
    reasons,
  };
}

export interface ZoneScoreRow {
  zone: Zone;
  score: number;
}

/** Cheap per-zone richness used for human-like "which area tomorrow" reasoning. */
export function rankZones(zones: Zone[], pool: EnrichedPlace[], dayStart: GeoCoords, speedKmh: number): ZoneScoreRow[] {
  const poolById = new Map(pool.map((p) => [p.id, p]));
  return zones
    .map((zone) => ({ zone, score: scoreZone(zone, poolById, dayStart, speedKmh).score }))
    .sort((a, b) => b.score - a.score);
}

/** Exported for tests: is a secondary zone a natural same-day top-up? */
export function isAdjacentTopUp(primary: Zone, secondary: Zone, pool: EnrichedPlace[]): boolean {
  const ctx = {
    poolById: new Map(pool.map((p) => [p.id, p])),
    dayStart: primary.center,
  };
  const decision = shouldCombineForDay(primary, secondary, ctx);
  return decision.combine;
}

export { estimateTravelMinutes, haversineKm };