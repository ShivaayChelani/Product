import type { GenerationSource, TripPlan } from '../../../services/api/trips';
import { computeTripPalPoints } from '../../../utils/tripSummary';

export type TripOriginKind = 'ai' | 'manual' | 'unknown';

export interface TripOriginDisplay {
  kind: TripOriginKind;
  label: string;
  sublabel?: string;
}

/**
 * Authoritative trip origin from server `generationSource`.
 * AI_PROMPT / HYBRID → AI-planned; MANUAL → manual; missing/unknown → neutral TRIP.
 */
export function resolveTripOriginDisplay(
  generationSource?: GenerationSource | string | null,
): TripOriginDisplay {
  const source = generationSource ? String(generationSource).toUpperCase() : '';

  if (source === 'AI_PROMPT' || source === 'HYBRID') {
    return { kind: 'ai', label: '✨ AI PLANNED', sublabel: 'Planned with AI' };
  }
  if (source === 'MANUAL') {
    return { kind: 'manual', label: '🗺️ MANUAL TRIP', sublabel: 'Created manually' };
  }
  return { kind: 'unknown', label: 'TRIP' };
}

export function countTripPlaces(trip: TripPlan): number {
  const listed = trip.tripDays?.reduce((sum, day) => {
    const counted = day._count?.stops;
    const rowCount = day.stops?.length || 0;
    return sum + (typeof counted === 'number' && counted > rowCount ? counted : rowCount);
  }, 0) || 0;
  if (typeof trip.stopsCount === 'number' && trip.stopsCount > listed) {
    return trip.stopsCount;
  }
  return listed;
}

export function tripCoverImage(trip: TripPlan): string | null {
  return (
    trip.coverImage ||
    trip.tripDays?.[0]?.stops?.[0]?.place?.thumbnail ||
    trip.tripDays?.[0]?.stops?.[0]?.place?.images?.[0] ||
    null
  );
}

export function formatTripDateRange(start?: string | null, end?: string | null): string {
  if (!start) return 'Dates not set';
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  if (e && !Number.isNaN(e.getTime())) {
    const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
    const month = s.toLocaleDateString('en-US', { month: 'long' });
    const year = e.getFullYear();
    if (sameMonth) {
      return `${s.getDate()} – ${e.getDate()} ${month} ${year}`;
    }
    const endMonth = e.toLocaleDateString('en-US', { month: 'long' });
    return `${s.getDate()} ${month} – ${e.getDate()} ${endMonth} ${year}`;
  }
  return s.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function tripDaysLabel(trip: TripPlan): number {
  return trip.days || trip.tripDays?.length || 1;
}

export function tripLocationsLabel(trip: TripPlan): string {
  const stops = trip.tripDays?.flatMap(d => d.stops || []) || [];
  const names = [
    ...new Set(
      stops
        .map(s => s.place?.name || s.place?.city)
        .filter((name): name is string => Boolean(name)),
    ),
  ];
  if (names.length > 0) return names.slice(0, 3).join(' • ');
  return trip.destination || 'Locations TBD';
}

export function computeTripProgressPercent(trip: TripPlan): number {
  const stops = trip.tripDays?.flatMap(d => d.stops || []) || [];
  if (stops.length === 0) return 0;
  const visited = stops.filter(s => !!s.visitedAt).length;
  return Math.round((visited / stops.length) * 100);
}

/** PalPoints if the traveller visits every itinerary place (10 per place). */
export function estimateTripPalPoints(trip: TripPlan): number {
  return computeTripPalPoints(trip).totalPotential;
}

export function tripDaysAwayLabel(startDate?: string | null): string | undefined {
  if (!startDate) return undefined;
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return undefined;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  const diff = Math.round((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return undefined;
  if (diff === 0) return 'TODAY';
  if (diff === 1) return 'TOMORROW';
  return `IN ${diff} DAYS`;
}

export type TripBadgeType = 'CONFIRMED' | 'UPCOMING' | 'BOOKING_PENDING';

export function tripStatusBadge(trip: TripPlan): { label: string; type: TripBadgeType } {
  switch (trip.status) {
    case 'DRAFT':
      return { label: 'BOOKING PENDING', type: 'BOOKING_PENDING' };
    case 'UPCOMING':
      return { label: 'UPCOMING', type: 'UPCOMING' };
    case 'ACTIVE':
      return { label: 'CONFIRMED', type: 'CONFIRMED' };
    case 'COMPLETED':
      return { label: 'COMPLETED', type: 'CONFIRMED' };
    default:
      return { label: 'UPCOMING', type: 'UPCOMING' };
  }
}

function normalizeTripStatus(status?: TripPlan['status'] | string | null): string {
  return status ? String(status).toUpperCase() : '';
}

export function filterTripsByTab(
  trips: TripPlan[],
  tab: 'UPCOMING' | 'DRAFT' | 'COMPLETED',
): TripPlan[] {
  if (tab === 'DRAFT') return trips.filter(t => normalizeTripStatus(t.status) === 'DRAFT');
  if (tab === 'COMPLETED') return trips.filter(t => normalizeTripStatus(t.status) === 'COMPLETED');
  return trips.filter(t => {
    const s = normalizeTripStatus(t.status);
    return s === 'UPCOMING' || s === 'ACTIVE';
  });
}
