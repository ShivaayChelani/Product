import type { TripPlan, TripPlanStop } from '../../../services/api/trips';
import { getMapMarkerConfig, normalizeCategory } from '../../../utils/mapMarkerUtils';
import { computeTripBudget } from '../../../utils/tripBudget';

export type SortMode =
  | 'default'
  | 'distance'
  | 'rating'
  | 'morning'
  | 'afternoon'
  | 'evening'
  | 'category';

export function countAllStops(trip: TripPlan): number {
  const listed =
    trip.tripDays?.reduce((n, d) => {
      const counted = d._count?.stops;
      const rowCount = d.stops?.length || 0;
      return n + (typeof counted === 'number' && counted > rowCount ? counted : rowCount);
    }, 0) || 0;
  if (typeof trip.stopsCount === 'number' && trip.stopsCount > listed) {
    return trip.stopsCount;
  }
  return listed;
}

export function formatVisitDuration(stop: TripPlanStop): string {
  const mins = stop.duration ?? stop.place?.estimatedDurationMinutes ?? 60;
  const low = Math.max(30, Math.floor(mins * 0.85));
  const high = Math.ceil(mins * 1.15);
  const fmt = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`);
  return `${fmt(low)} — ${fmt(high)}`;
}

export function formatOpeningHours(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === 'string') return raw.length > 48 ? `${raw.slice(0, 45)}…` : raw;
  if (typeof raw === 'object' && raw !== null) {
    const o = raw as Record<string, unknown>;
    if (typeof o.from === 'string' || typeof o.to === 'string' || typeof o.till === 'string') {
      const from = String(o.from || '');
      const to = String(o.to || o.till || '');
      const label = [from, to].filter(Boolean).join(' – ');
      return label || null;
    }
    const todayLong = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    const todayShort = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()];
    const dayKey =
      Object.keys(o).find((k) => k.toLowerCase() === todayLong.toLowerCase()) ||
      Object.keys(o).find((k) => k.toLowerCase().startsWith(todayShort));
    if (dayKey) {
      const val = o[dayKey];
      if (Array.isArray(val)) {
        if (val.length === 0) return 'Closed today';
        return val
          .map((s) => {
            const shift = s as { open?: string; close?: string };
            return [shift.open, shift.close].filter(Boolean).join(' – ');
          })
          .filter(Boolean)
          .join(', ');
      }
      if (typeof val === 'string') return val || 'Closed today';
    }
    const first = Object.values(o)[0];
    return typeof first === 'string' ? first : null;
  }
  return null;
}

export function categoryBadge(category?: string | null): { label: string; color: string } {
  const cfg = getMapMarkerConfig(normalizeCategory(category || 'default'));
  return { label: cfg.label, color: cfg.color };
}

export function formatLeg(minutes: number, km: number): string {
  const minLabel = minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes} min`;
  return `🚗 ${minLabel} (${km.toFixed(1)} km)`;
}

export function sumVisitMinutes(stops: TripPlanStop[]): number {
  return stops.reduce(
    (s, stop) => s + (stop.duration ?? stop.place?.estimatedDurationMinutes ?? 60),
    0,
  );
}

export function formatTotalDuration(visitMins: number, travelMins: number): string {
  const total = visitMins + travelMins;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m}m (approx.)`;
  return `${h}h ${m > 0 ? `${m}m ` : ''}(approx.)`;
}

export function tripBudgetLabel(trip: TripPlan): string {
  const summary = computeTripBudget(trip);
  if (summary.grandTotal > 0) {
    return `₹ ${Math.round(summary.grandTotal).toLocaleString('en-IN')} est.`;
  }
  switch ((trip.budget || '').toUpperCase()) {
    case 'LOW':
      return 'Budget-friendly';
    case 'HIGH':
      return 'Comfortable';
    case 'CUSTOM':
      return 'Luxury';
    default:
      return 'Balanced spend';
  }
}

export function sortStops(stops: TripPlanStop[], mode: SortMode): TripPlanStop[] {
  const list = [...stops];
  switch (mode) {
    case 'rating':
      return list.sort(
        (a, b) => (b.place?.rating ?? 0) - (a.place?.rating ?? 0),
      );
    case 'distance':
      return list.sort(
        (a, b) => (a.distanceFromPrev ?? 999) - (b.distanceFromPrev ?? 999),
      );
    case 'morning':
      return list.sort((a, b) => slotRank(a) - slotRank(b));
    case 'afternoon':
    case 'evening':
      return list.sort((a, b) => slotRank(a, mode) - slotRank(b, mode));
    case 'category':
      return list.sort((a, b) =>
        (a.place?.category || '').localeCompare(b.place?.category || ''),
      );
    default:
      return list.sort((a, b) => a.order - b.order);
  }
}

function slotRank(stop: TripPlanStop, prefer?: 'morning' | 'afternoon' | 'evening'): number {
  const slot = (stop.timeSlot || '').toLowerCase();
  const map: Record<string, number> = {
    sunrise: 0,
    morning: 1,
    afternoon: 2,
    evening: 3,
    sunset: 4,
    night: 5,
  };
  let r = map[slot] ?? 2;
  if (prefer === 'morning') r = slot.includes('morning') || slot.includes('sunrise') ? -1 : r;
  if (prefer === 'afternoon') r = slot.includes('afternoon') ? -1 : r;
  if (prefer === 'evening') r = slot.includes('evening') || slot.includes('sunset') ? -1 : r;
  return r;
}
