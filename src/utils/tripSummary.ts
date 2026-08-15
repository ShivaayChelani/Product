import type { TripPlan } from '../services/api/trips';
import { normalizeTripDays } from './normalizeTripPlan';

export const ITINERARY_CHECKPOINT_POINTS = 10;
export const ITINERARY_COMPLETION_BONUS_POINTS = 100;

export function resolveTravellerCount(trip: Pick<TripPlan, 'travelers' | 'collaborators'>): number {
  const explicit = String(trip.travelers || '').toUpperCase();
  switch (explicit) {
    case 'COUPLE':
      return 2;
    case 'FAMILY':
    case 'FRIENDS':
      return 3;
    case 'SOLO':
      return 1;
    default:
      return Math.max((trip.collaborators?.length ?? 0) + 1, 1);
  }
}

export function formatTravellerGroup(travelers?: string | null): string {
  switch (String(travelers || '').toUpperCase()) {
    case 'COUPLE':
      return 'Couple';
    case 'FAMILY':
      return 'Family';
    case 'FRIENDS':
      return 'Friends';
    default:
      return 'Solo';
  }
}

export function resolveTripDayCount(trip: Pick<TripPlan, 'days' | 'tripDays'>): number {
  return Math.max(trip.days || trip.tripDays?.length || 1, 1);
}

export function formatDurationOnly(trip: Pick<TripPlan, 'days' | 'tripDays'>): string {
  const days = resolveTripDayCount(trip);
  const nights = Math.max(days - 1, 0);
  return `${days} Day${days !== 1 ? 's' : ''} / ${nights} Night${nights !== 1 ? 's' : ''}`;
}

type DayStopCountSource = {
  stops?: Array<{ skippedAt?: string | null; visitedAt?: string | null }>;
  _count?: { stops?: number };
};

/** 10 PalPoints per place. Prefer listed stops; fall back to `_count.stops` when the list API truncates rows. */
export function resolveDayEligibleStopCount(day: DayStopCountSource): {
  stopCount: number;
  visitedCount: number;
} {
  const listed = day.stops || [];
  const counted = day._count?.stops;
  const truncated = typeof counted === 'number' && listed.length < counted;
  if (truncated) {
    return {
      stopCount: counted,
      visitedCount: listed.filter(stop => !!stop.visitedAt).length,
    };
  }
  const eligible = listed.filter(stop => !stop.skippedAt);
  return {
    stopCount: eligible.length,
    visitedCount: eligible.filter(stop => !!stop.visitedAt).length,
  };
}

export function computeTripPalPoints(trip: TripPlan) {
  const days = normalizeTripDays(trip.tripDays);
  const byDay = days.map(day => {
    const { stopCount, visitedCount } = resolveDayEligibleStopCount(day);
    return {
      dayId: day.id,
      dayNumber: day.dayNumber,
      stopCount,
      visitedCount,
      perVisitPoints: ITINERARY_CHECKPOINT_POINTS,
      potentialPoints: stopCount * ITINERARY_CHECKPOINT_POINTS,
      earnedPoints: visitedCount * ITINERARY_CHECKPOINT_POINTS,
    };
  });

  const listedStopRows = days.reduce((sum, day) => sum + (day.stops?.length || 0), 0);
  const tripStopsCount = typeof trip.stopsCount === 'number' ? trip.stopsCount : null;
  const daysTruncated = tripStopsCount != null && listedStopRows < tripStopsCount;

  const visitPotential = daysTruncated
    ? tripStopsCount * ITINERARY_CHECKPOINT_POINTS
    : byDay.reduce((sum, day) => sum + day.potentialPoints, 0);
  const visitEarned = byDay.reduce((sum, day) => sum + day.earnedPoints, 0);
  const totalStops = daysTruncated
    ? tripStopsCount
    : byDay.reduce((sum, day) => sum + day.stopCount, 0);
  const visitedStops = byDay.reduce((sum, day) => sum + day.visitedCount, 0);
  const completionBonus = totalStops > 0 ? ITINERARY_COMPLETION_BONUS_POINTS : 0;
  const completionEarned = totalStops > 0 && visitedStops === totalStops ? completionBonus : 0;

  return {
    byDay,
    perVisitPoints: ITINERARY_CHECKPOINT_POINTS,
    completionBonus,
    visitPotential,
    visitEarned,
    totalPotential: visitPotential,
    totalEarned: visitEarned,
    completionBonusEarned: completionEarned,
  };
}
