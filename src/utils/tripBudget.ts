import type { TripPlan, TripPlanStop } from '../services/api/trips';
import { resolveTravellerCount } from './tripSummary';

export const TRANSPORT_COST_PER_KM = 8;
const FOOD_PER_DAY = 600;

export function parseEntryFee(ticketPrice: unknown): number | null {
  if (!ticketPrice || typeof ticketPrice !== 'object') return null;
  const tp = ticketPrice as { adult?: number; child?: number; foreigner?: number };
  if (typeof tp.adult === 'number') return tp.adult;
  if (typeof tp.foreigner === 'number') return tp.foreigner;
  if (typeof tp.child === 'number') return tp.child;
  return null;
}

export function getStopEntryFee(stop: TripPlanStop): number | null {
  if (typeof stop.entryFee === 'number') return stop.entryFee;
  if (typeof stop.cost === 'number' && stop.cost > 0) return stop.cost;
  return parseEntryFee(stop.place?.ticketPrice);
}

export function formatInr(amount: number): string {
  return `₹ ${Math.round(amount).toLocaleString('en-IN')}`;
}

export type BudgetLineItem = {
  stopId: string;
  dayNumber: number;
  name: string;
  entryFee: number | null;
  transportKm: number;
  transportCost: number;
};

export type DayBudget = {
  dayNumber: number;
  dayId: string;
  entryTotal: number;
  entryTotalPerPerson: number;
  transportTotal: number;
  foodEstimate: number;
  dayTotal: number;
  items: BudgetLineItem[];
};

export type TripBudgetSummary = {
  entryTotal: number;
  entryTotalPerPerson: number;
  transportTotal: number;
  foodTotal: number;
  grandTotal: number;
  totalDistanceKm: number;
  paidStops: number;
  freeStops: number;
  travellerCount: number;
  byDay: DayBudget[];
  lineItems: BudgetLineItem[];
};

export function computeTripBudget(trip: TripPlan): TripBudgetSummary {
  const days = trip.tripDays || [];
  const travellerCount = resolveTravellerCount(trip);
  const byDay: DayBudget[] = [];
  const lineItems: BudgetLineItem[] = [];
  let entryTotalPerPerson = 0;
  let transportTotal = 0;
  let totalDistanceKm = 0;
  let paidStops = 0;
  let freeStops = 0;

  for (const day of days) {
    const items: BudgetLineItem[] = [];
    let dayEntry = 0;
    let dayTransport = 0;

    for (const stop of day.stops || []) {
      const fee = getStopEntryFee(stop);
      const km = stop.distanceFromPrev || 0;
      const transportCost = km > 0 ? Math.round(km * TRANSPORT_COST_PER_KM) : 0;

      if (fee === null) {
        /* unknown */
      } else if (fee <= 0) {
        freeStops += 1;
      } else {
        paidStops += 1;
        dayEntry += fee;
        entryTotalPerPerson += fee;
      }

      dayTransport += transportCost;
      transportTotal += transportCost;
      totalDistanceKm += km;

      const item: BudgetLineItem = {
        stopId: stop.id,
        dayNumber: day.dayNumber,
        name: stop.place?.name || 'Place',
        entryFee: fee,
        transportKm: km,
        transportCost,
      };
      items.push(item);
      lineItems.push(item);
    }

    const foodEstimate = (day.stops?.length || 0) > 0 ? FOOD_PER_DAY * travellerCount : 0;
    byDay.push({
      dayNumber: day.dayNumber,
      dayId: day.id,
      entryTotal: dayEntry * travellerCount,
      entryTotalPerPerson: dayEntry,
      transportTotal: dayTransport,
      foodEstimate,
      dayTotal: (dayEntry * travellerCount) + dayTransport + foodEstimate,
      items,
    });
  }

  const entryTotal = entryTotalPerPerson * travellerCount;
  const foodTotal = byDay.reduce((s, d) => s + d.foodEstimate, 0);
  const computedGrand = entryTotal + transportTotal + foodTotal;

  return {
    entryTotal,
    entryTotalPerPerson,
    transportTotal,
    foodTotal,
    grandTotal: computedGrand,
    totalDistanceKm: trip.totalDistance ?? totalDistanceKm,
    paidStops,
    freeStops,
    travellerCount,
    byDay,
    lineItems,
  };
}
