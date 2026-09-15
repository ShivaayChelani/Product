/**
 * Day scheduling primitives (Phase 1). Turns an optimized stop sequence into
 * concrete ScheduledStop rows (minutes-of-day start/end).
 *
 * Rules honored (Phase 0 contract §4):
 *   - fixed-time anchors ALWAYS start at their exact user-given minute.
 *   - trusted opening hours are respected; when a stop would land during closed
 *     hours we try the next open minute and, if that breaks later anchors, the
 *     stop is flagged (openingHoursRespected=false) — never invented around.
 *   - travel legs add a 10-minute buffer (TRAVEL_BUFFER_MINUTES) over the
 *     Haversine estimate; results are ESTIMATED by definition.
 */

import type {
  EnrichedPlace,
  PlannedStop,
  PlanningWarning,
  ScheduledStop,
} from './types';
import { estimateTravelMinutes, haversineKm } from './clustering';
import { isPlaceOpenAt, nextOpenMinuteAt } from './enrichment';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const LUNCH_START_MINUTES = 13 * 60;
export const LUNCH_END_MINUTES = 15 * 60;
export const LUNCH_GRACE_WINDOW_MINUTES = 30;
export const DEFAULT_DAY_START_MINUTES = 9 * 60;
export const DEFAULT_DAY_END_MINUTES = 21 * 60;

// ---------------------------------------------------------------------------
// Window helpers
// ---------------------------------------------------------------------------

export interface VisitWindow {
  /** Enough time for the stop's visit duration, or null when impossible. */
  feasible: boolean;
  earliestStartMinutes: number | null;
  latestStartMinutes: number | null;
  recommendedStartMinutes: number | null;
  openingHoursRespected: boolean | null;
  warnings: PlanningWarning[];
  reason: string;
}

/**
 * Compute the feasible visit window for one stop between a hard window and its
 * opening hours. Pure — no mutation, no time-of-day bias (slot suitability is
 * handled by scoring, not scheduling).
 */
export function planVisitWindow(
  place: EnrichedPlace,
  options: {
    windowStart: number;
    windowEnd: number;
    /** Exact start the user demanded (anchors). Ignored when null. */
    anchorStart?: number | null;
    /** Trusted closing minutes that must not push past. */
    hardCloseMinutes?: number | null;
    /** Earliest usable opening for the stop (from its own hours). */
    openingFrom?: number | null;
    date?: Date | null;
  },
): VisitWindow {
  const { windowStart, windowEnd, anchorStart, hardCloseMinutes, openingFrom } = options;
  const duration = place.durationMinutes;
  const warnings: PlanningWarning[] = [];

  if (windowEnd - windowStart < duration) {
    return {
      feasible: false,
      earliestStartMinutes: null,
      latestStartMinutes: null,
      recommendedStartMinutes: null,
      openingHoursRespected: null,
      warnings: [...warnings, { code: 'WINDOW_TOO_SMALL', message: `Window ${windowStart}-${windowEnd} cannot fit a ${duration}-minute visit.`, severity: 'WARNING' }],
      reason: 'window too small for visit duration',
    };
  }

  const clamp = hardCloseMinutes != null ? Math.min(windowEnd, hardCloseMinutes - duration) : windowEnd;
  const latest = Math.max(windowStart, clamp);

  if (latest < windowStart) {
    warnings.push({
      code: 'HARD_CLOSE_PREEMPTED',
      message: `Closing time ${hardCloseMinutes} leaves no room for a ${duration}-minute visit.`,
      severity: 'WARNING',
    });
    return {
      feasible: false,
      earliestStartMinutes: null,
      latestStartMinutes: null,
      recommendedStartMinutes: null,
      openingHoursRespected: null,
      warnings,
      reason: 'hard close preempts visit',
    };
  }

  const recommended = anchorStart != null
    ? Math.max(windowStart, anchorStart)
    : Math.max(windowStart, openingFrom ?? windowStart);

  let respected: boolean | null = null;
  if (place.hoursTrust === 'VERIFIED' && place.openingHours) {
    const atRecommended = isPlaceOpenAt(place.openingHours, options.date ?? null, recommended);
    if (atRecommended === false) {
      const shifted = nextOpenMinuteAt(place.openingHours, options.date ?? null, recommended);
      if (shifted == null || shifted + duration > latest) {
        respected = false;
        warnings.push({
          code: 'OPENING_HOURS_UNRESOLVABLE',
          message: `"${place.name}" cannot open before the recommended window (${
            shifted == null ? 'no open time found' : `next open ${shifted / 60}:${String(shifted % 60).padStart(2, '0')} exceeds window`
          }).`,
          severity: 'WARNING',
          placeIds: [place.id],
        });
      } else {
        // Shift into the next open minute but keep it feasible.
        const shiftedStart = Math.max(windowStart, shifted);
        return {
          feasible: true,
          earliestStartMinutes: shiftedStart,
          latestStartMinutes: latest,
          recommendedStartMinutes: shiftedStart,
          openingHoursRespected: true,
          warnings: [...warnings, {
            code: 'OPENING_HOURS_SHIFT',
            message: `"${place.name}" shifted to ${Math.floor(shiftedStart / 60)}:${String(shiftedStart % 60).padStart(2, '0')} to respect its opening hours.`,
            severity: 'INFO',
            placeIds: [place.id],
          }],
          reason: `opening hours shifted to ${shiftedStart}`,
        };
      }
    } else {
      respected = atRecommended === null ? null : atRecommended;
    }
  }

  return {
    feasible: true,
    earliestStartMinutes: Math.max(windowStart, openingFrom ?? windowStart),
    latestStartMinutes: latest,
    recommendedStartMinutes: Math.min(latest, Math.max(windowStart, recommended)),
    openingHoursRespected: respected,
    warnings,
    reason: respected === false ? 'opening hours violated' : 'feasible',
  };
}

// ---------------------------------------------------------------------------
// Day scheduling
// ---------------------------------------------------------------------------

export interface ScheduleDayOptions {
  places: EnrichedPlace[];
  /** day index 1..n */
  dayNumber: number;
  dayStart: { lat: number; lng: number };
  /** minutes-of-day */
  windowStart: number;
  windowEnd: number;
  /** Fixed-time anchors: placeId -> exact startMinutes. */
  fixedTime?: Map<string, number>;
  speedKmh?: number;
  date?: Date | null;
  /** Reserve a lunch window when the outing spans midday. */
  insertLunchBuffer?: boolean;
}

export interface ScheduleDayResult {
  stops: ScheduledStop[];
  totalMinutes: number;
  visitMinutes: number;
  travelMinutes: number;
  detourIndex: number;
  warnings: PlanningWarning[];
}

/**
 * Build a full day schedule. Respects anchors and opening hours; travel legs
 * are Haversine + buffer. Deterministic, no mutation of input.
 */
export function buildDaySchedule(options: ScheduleDayOptions): ScheduleDayResult {
  const {
    places,
    dayNumber,
    dayStart,
    windowStart,
    windowEnd,
    fixedTime,
    speedKmh,
    date,
    insertLunchBuffer,
  } = options;

  const speed = speedKmh ?? 30;
  const warnings: PlanningWarning[] = [];
  const stops: ScheduledStop[] = [];

  let cursor = windowStart;
  let prev = dayStart;
  let totalTravel = 0;
  let lastEnd: number | null = null;

  // An anchor schedules at ITS exact time; it may only be pushed later by a
  // hard upper bound (never by predecessors, whose travel the anchor absorbs).
  const applyAnchor = (place: EnrichedPlace, proposedStart: number): number => {
    const anchor = fixedTime?.get(place.id);
    if (anchor == null) return proposedStart;
    if (anchor < proposedStart) {
      warnings.push({
        code: 'FIXED_TIME_TIGHT',
        message: `Fixed-time "${place.name}" at ${formatMinutes(anchor)} is earlier than the previously occupied ${formatMinutes(proposedStart)} — the anchor still wins.`,
        severity: 'WARNING',
        placeIds: [place.id],
      });
    }
    return anchor;
  };

  // Lunch: if a full visit would straddle a natural lunch window, pause there.
  const lunchPause = (start: number, end: number): { from: number; to: number } | null => {
    if (!insertLunchBuffer) return null;
    if (end <= LUNCH_START_MINUTES) return null;
    if (start >= LUNCH_END_MINUTES) return null;
    const from = Math.max(start, LUNCH_START_MINUTES);
    const to = Math.min(end, LUNCH_END_MINUTES);
    return from < to ? { from, to } : null;
  };

  for (let i = 0; i < places.length; i++) {
    const place = places[i];
    if (!place || !place.coordinates) continue;

    const legKm = haversineKm(prev.lat, prev.lng, place.coordinates.lat, place.coordinates.lng);
    // estimateTravelMinutes already includes the fixed parking/walk-in buffer.
    const travel = estimateTravelMinutes(legKm, speed);
    totalTravel += travel;

    let start = applyAnchor(place, cursor + travel);
    let end = start + place.durationMinutes;

    if (place.hoursTrust === 'VERIFIED' && place.openingHours) {
      // Open-check the concrete start; shift to next open minute when needed.
      if (isPlaceOpenAt(place.openingHours, date ?? null, start) === false) {
        const next = nextOpenMinuteAt(place.openingHours, date ?? null, start);
        if (next != null && next <= windowEnd - place.durationMinutes) {
          warnings.push({
            code: 'OPENING_HOURS_SHIFT',
            message: `"${place.name}" shifted from ${formatMinutes(start)} to ${formatMinutes(next)} for its opening hours.`,
            severity: 'INFO',
            placeIds: [place.id],
          });
          start = Math.max(start, next);
          end = start + place.durationMinutes;
        } else {
          warnings.push({
            code: 'OPENING_HOURS_VIOLATED',
            message: `"${place.name}" cannot be scheduled inside its trusted hours (${formatMinutes(start)}).`,
            severity: 'WARNING',
            placeIds: [place.id],
          });
        }
      }
    }

    let respected: boolean | null = null;
    if (place.hoursTrust === 'VERIFIED' && place.openingHours) {
      const openAtStart = isPlaceOpenAt(place.openingHours, date ?? null, start);
      respected = openAtStart;
    }

    const lunch = lunchPause(start, end);
    if (lunch) {
      start = applyAnchor(place, lunch.to);
      end = start + place.durationMinutes;
    }

    const isAnchor = fixedTime?.get(place.id) != null || place.state.fixedTime;
    // Travel time may still use the day-start origin; displayed previous-stop
    // distance is only consecutive stops in the final itinerary order.
    const isFirstOfDay = stops.length === 0;
    stops.push({
      placeId: place.id,
      order: i + 1,
      dayNumber,
      startMinutes: start,
      endMinutes: end,
      travelFromPrevMinutes: Math.round(travel),
      distanceFromPrevKm: isFirstOfDay ? 0 : Math.round(legKm * 100) / 100,
      fixedTimeAnchor: !!isAnchor,
      openingHoursRespected: respected,
      warnings: [],
    });
    lastEnd = end;
    cursor = end;
    prev = place.coordinates;
  }

  const totalMinutes = lastEnd != null ? lastEnd - windowStart : 0;
  const visitMinutes = stops.reduce((sum, s) => sum + (s.endMinutes - s.startMinutes), 0);

  const pts = places
    .filter((p) => p && p.coordinates)
    .map((p) => ({ latitude: p.coordinates.lat, longitude: p.coordinates.lng }));
  let detourIndex = 1;
  if (pts.length >= 3) {
    let chain = 0;
    for (let i = 1; i < pts.length; i++) {
      chain += haversineKm(pts[i - 1].latitude, pts[i - 1].longitude, pts[i].latitude, pts[i].longitude);
    }
    const p0 = pts[0];
    const pn = pts[pts.length - 1];
    const direct = haversineKm(p0.latitude, p0.longitude, pn.latitude, pn.longitude);
    detourIndex = direct < 0.5 ? (chain > 2 ? 1.5 : 1) : Math.round((chain / direct) * 100) / 100;
  }

  return { stops, totalMinutes, visitMinutes, travelMinutes: Math.round(totalTravel), detourIndex, warnings };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map fixed-time specs to { placeId -> startMinutes }. */
export function fixedTimeMap(specs: ReadonlyArray<{ placeId: string; startMinutes: number }>): Map<string, number> {
  return new Map(specs.map((s) => [s.placeId, s.startMinutes]));
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** Convert a fully scheduled day to PlannedStop[] for the validator. */
export function plannedStopsFromSchedule(stops: ScheduledStop[]): PlannedStop[] {
  return stops.map((s) => ({
    placeId: s.placeId,
    dayNumber: s.dayNumber,
    order: s.order,
    startMinutes: s.startMinutes,
    endMinutes: s.endMinutes,
    travelFromPrevMinutes: s.travelFromPrevMinutes,
    distanceFromPrevKm: s.distanceFromPrevKm,
  }));
}