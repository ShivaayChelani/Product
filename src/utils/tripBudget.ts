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

export function formatBudgetApprox(amount: number): string {
  return `${formatInr(amount)} approx`;
}

const LOCAL_TRANSPORT = new Set(['WALKING', 'WALK', 'BIKE', 'CYCLE', 'SCOOTER']);
const LONG_HAUL_TRANSPORT = new Set(['CAR', 'TRAIN', 'FLIGHT', 'BUS', 'CAB']);

function normalizeCity(value?: string | null): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function citiesMatch(a?: string | null, b?: string | null): boolean {
  const left = normalizeCity(a);
  const right = normalizeCity(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

/** Local traveller: lives in the trip city, or only uses walking/bike. */
export function isLocalTraveler(trip: TripPlan, travelerCity?: string | null): boolean {
  const city = travelerCity?.trim() || '';
  if (city && citiesMatch(city, trip.destination)) return true;

  const stopCities = (trip.tripDays || [])
    .flatMap(day => day.stops || [])
    .map(stop => stop.place?.city)
    .filter((name): name is string => !!name);
  if (city && stopCities.length > 0 && stopCities.every(name => citiesMatch(city, name))) {
    return true;
  }

  const modes = (trip.transportation || []).map(mode => String(mode).toUpperCase());
  if (
    modes.length > 0
    && modes.every(mode => LOCAL_TRANSPORT.has(mode))
    && !modes.some(mode => LONG_HAUL_TRANSPORT.has(mode))
  ) {
    return true;
  }
  return false;
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
  isLocal: boolean;
  includesTravel: boolean;
  scopeLabel: string;
  byDay: DayBudget[];
  lineItems: BudgetLineItem[];
};

export function computeTripBudget(
  trip: TripPlan,
  opts?: { travelerCity?: string | null },
): TripBudgetSummary {
  const days = trip.tripDays || [];
  const travellerCount = resolveTravellerCount(trip);
  const isLocal = isLocalTraveler(trip, opts?.travelerCity);
  const includesTravel = !isLocal;
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
    const dayEntryTotal = dayEntry * travellerCount;
    const dayTravel = includesTravel ? dayTransport : 0;
    byDay.push({
      dayNumber: day.dayNumber,
      dayId: day.id,
      entryTotal: dayEntryTotal,
      entryTotalPerPerson: dayEntry,
      transportTotal: dayTravel,
      foodEstimate,
      dayTotal: dayEntryTotal + foodEstimate + dayTravel,
      items: includesTravel
        ? items
        : items.map(item => ({ ...item, transportKm: 0, transportCost: 0 })),
    });
  }

  const entryTotal = entryTotalPerPerson * travellerCount;
  const foodTotal = byDay.reduce((s, d) => s + d.foodEstimate, 0);
  const travelCost = includesTravel ? transportTotal : 0;

  return {
    entryTotal,
    entryTotalPerPerson,
    transportTotal: travelCost,
    foodTotal,
    grandTotal: entryTotal + travelCost + foodTotal,
    totalDistanceKm: trip.totalDistance ?? totalDistanceKm,
    paidStops,
    freeStops,
    travellerCount,
    isLocal,
    includesTravel,
    scopeLabel: includesTravel ? 'Entry + food + travel' : 'Entry + food',
    byDay,
    lineItems: includesTravel
      ? lineItems
      : lineItems.map(item => ({ ...item, transportKm: 0, transportCost: 0 })),
  };
}
