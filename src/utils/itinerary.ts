import { TouristSpot, ItinerarySpot } from '../types';
import { haversineDistance } from './location';

const TIME_PRIORITY: Record<string, number> = {
  sunrise: 1,
  morning: 2,
  afternoon: 3,
  evening: 4,
  sunset: 5,
  night: 6,
  any: 7,
  monsoon: 8,
};

interface DayPlan {
  day: number;
  label: string;
  spots: {
    timeSlot: string;
    timeLabel: string;
    spot: ItinerarySpot;
    reason?: string;
  }[];
  totalDurationMin: number;
  totalDistanceKm?: number;
}

interface SmartItineraryParams {
  spots: TouristSpot[];
  userLocation?: { latitude: number; longitude: number } | null;
  interests?: string[];
  budget?: number;
  travelPace?: 'relaxed' | 'moderate' | 'fast';
}

export function sortItinerarySpots({
  spots,
  userLocation,
  interests = [],
  budget,
  travelPace = 'moderate',
}: SmartItineraryParams): ItinerarySpot[] {
  let filtered = spots;

  // Filter by budget
  if (budget !== undefined) {
    filtered = spots.filter(spot => {
      const cost = spot.entryFee ?? spot.averageCost ?? 0;
      return cost <= budget;
    });
  }

  if (filtered.length === 0) return [];

  const _maxDurationPerDay = travelPace === 'relaxed' ? 480 : travelPace === 'fast' ? 360 : 420;

  // 10-point sorting priority
  const sorted = [...filtered].sort((a, b) => {
    // 1. Verified places first
    const vA = a.verificationStatus === 'verified' ? 1 : 0;
    const vB = b.verificationStatus === 'verified' ? 1 : 0;
    if (vA !== vB) return vB - vA;

    // 2. Best time to visit
    const timeA = TIME_PRIORITY[a.bestTimeToVisit || 'any'] ?? 7;
    const timeB = TIME_PRIORITY[b.bestTimeToVisit || 'any'] ?? 7;
    if (timeA !== timeB) return timeA - timeB;

    // 3. Must-visit priority
    if (a.mustVisit && !b.mustVisit) return -1;
    if (!a.mustVisit && b.mustVisit) return 1;

    // 4. Interest match
    if (interests.length > 0) {
      const matchA = (a.tags || []).some(t => interests.some(i => t.includes(i))) ? 1 : 0;
      const matchB = (b.tags || []).some(t => interests.some(i => t.includes(i))) ? 1 : 0;
      if (matchA !== matchB) return matchB - matchA;
    }

    // 5. Hidden gem relevance
    if (a.isHiddenGem && !b.isHiddenGem) return -1;
    if (!a.isHiddenGem && b.isHiddenGem) return 1;

    // 6. Distance from user
    if (userLocation) {
      const distA = haversineDistance(userLocation.latitude, userLocation.longitude, a.latitude, a.longitude) / 1000;
      const distB = haversineDistance(userLocation.latitude, userLocation.longitude, b.latitude, b.longitude) / 1000;
      if (Math.abs(distA - distB) > 0.5) return distA - distB;
    }

    // 7. Estimated duration (shorter first to fit more in a day)
    const durA = a.estimatedDuration ?? 999;
    const durB = b.estimatedDuration ?? 999;
    if (durA !== durB) return durA - durB;

    // 8. Budget suitability
    if (budget !== undefined) {
      const costA = a.entryFee ?? a.averageCost ?? 0;
      const costB = b.entryFee ?? b.averageCost ?? 0;
      if (costA !== costB) return costA - costB;
    }

    // 9. Travel pace feasibility
    if (a.difficulty === 'hard' && b.difficulty !== 'hard' && travelPace === 'fast') return 1;
    if (a.difficulty !== 'hard' && b.difficulty === 'hard' && travelPace === 'fast') return -1;

    // 10. Points reward (higher points later in day)
    const ptsA = a.points || 0;
    const ptsB = b.points || 0;
    return ptsB - ptsA;
  });

  // Apply nearest-neighbor within same time slots for optimal routing
  const timeGrouped: TouristSpot[][] = [];
  const timeKeys = [...new Set(sorted.map(s => s.bestTimeToVisit || 'any'))];

  timeKeys.forEach(timeKey => {
    const group = sorted.filter(s => (s.bestTimeToVisit || 'any') === timeKey);
    if (group.length > 1 && userLocation) {
      const nnSorted = nearestNeighborSort(group, userLocation.latitude, userLocation.longitude);
      timeGrouped.push(nnSorted);
    } else {
      timeGrouped.push(group);
    }
  });

  const flatOrdered = timeGrouped.flat();

  const final = flatOrdered.map((spot, index) => {
    const distanceFromPrevious = index > 0
      ? haversineDistance(
          flatOrdered[index - 1].latitude,
          flatOrdered[index - 1].longitude,
          spot.latitude,
          spot.longitude
        ) / 1000
      : undefined;

    return {
      ...spot,
      order: index + 1,
      distanceFromPrevious: distanceFromPrevious ? distanceFromPrevious * 1000 : undefined,
    } as ItinerarySpot;
  });

  return final;
}

export function generateDayPlan(
  sortedSpots: ItinerarySpot[],
  travelPace: 'relaxed' | 'moderate' | 'fast' = 'moderate'
): DayPlan[] {
  const maxMinutes = travelPace === 'relaxed' ? 480 : travelPace === 'fast' ? 360 : 420;
  const days: DayPlan[] = [];
  let currentDay: ItinerarySpot[] = [];
  let currentDayMinutes = 0;

  sortedSpots.forEach(spot => {
    const duration = spot.estimatedDuration || 60;
    if (currentDayMinutes + duration > maxMinutes && currentDay.length > 0) {
      days.push(buildDayPlan(days.length + 1, currentDay));
      currentDay = [spot];
      currentDayMinutes = duration;
    } else {
      currentDay.push(spot);
      currentDayMinutes += duration;
    }
  });

  if (currentDay.length > 0) {
    days.push(buildDayPlan(days.length + 1, currentDay));
  }

  return days;
}

function buildDayPlan(dayNum: number, spots: ItinerarySpot[]): DayPlan {
  const timeSlots: { timeSlot: string; timeLabel: string; spot: ItinerarySpot; reason?: string }[] = [];

  const timeOrder = ['sunrise', 'morning', 'afternoon', 'evening', 'sunset', 'night', 'any', 'monsoon'];
  const timeLabels: Record<string, string> = {
    sunrise: '🌄 Sunrise (5AM-6AM)',
    morning: '🌅 Morning (6AM-12PM)',
    afternoon: '☀️ Afternoon (12PM-4PM)',
    evening: '🌆 Evening (4PM-7PM)',
    sunset: '🌅 Sunset (6PM-7PM)',
    night: '🌙 Night (7PM-5AM)',
    any: '🕐 Flexible',
    monsoon: '🌧️ Monsoon',
  };

  timeOrder.forEach(slot => {
    const slotSpots = spots.filter(s => (s.bestTimeToVisit || 'any') === slot);
    slotSpots.forEach(spot => {
      const reasons: string[] = [];
      if (spot.bestTimeReason) reasons.push(spot.bestTimeReason);
      if (spot.isHiddenGem) reasons.push('Hidden gem - explore offbeat');
      if (spot.mustVisit) reasons.push('Top-rated attraction');
      if (spot.entryFee === 0) reasons.push('Free entry');

      timeSlots.push({
        timeSlot: slot,
        timeLabel: timeLabels[slot] || slot,
        spot,
        reason: reasons.length > 0 ? reasons[0] : undefined,
      });
    });
  });

  const totalDuration = spots.reduce((sum, s) => sum + (s.estimatedDuration || 60), 0);
  const totalKm = spots.reduce((sum, s) => sum + ((s as any).distanceFromPrevious || 0), 0);

  return {
    day: dayNum,
    label: `Day ${dayNum}`,
    spots: timeSlots,
    totalDurationMin: totalDuration,
    totalDistanceKm: totalKm / 1000,
  };
}

export function groupByTimeSlot(spots: ItinerarySpot[]): Record<string, ItinerarySpot[]> {
  const groups: Record<string, ItinerarySpot[]> = {
    morning: [],
    afternoon: [],
    evening: [],
    night: [],
  };

  spots.forEach(spot => {
    const slot = spot.bestTimeToVisit || 'morning';
    if (groups[slot]) {
      groups[slot].push(spot);
    } else {
      groups['morning'].push(spot);
    }
  });

  return groups;
}

export function formatTimeSlot(slot: string): string {
  const labels: Record<string, string> = {
    sunrise: '🌄 Sunrise (5AM - 6AM)',
    morning: '🌅 Morning (6AM - 12PM)',
    afternoon: '☀️ Afternoon (12PM - 4PM)',
    evening: '🌆 Evening (4PM - 7PM)',
    sunset: '🌅 Sunset (6PM - 7PM)',
    night: '🌙 Night (7PM - 5AM)',
  };
  return labels[slot] || slot;
}

export interface ScheduledItineraryItem {
  spot: TouristSpot;
  scheduledTime: string;
  startMinutes: number;
  endMinutes: number;
  order: number;
  distanceFromPrevious?: number;
  timeSlot: string;
  timeLabel: string;
}

const BASE_TIMES: Record<string, number> = {
  sunrise: 5 * 60 + 30,
  morning: 8 * 60,
  afternoon: 13 * 60,
  evening: 17 * 60,
  sunset: 17 * 60 + 30,
  night: 19 * 60,
  any: 9 * 60,
};

const TIME_SLOT_ORDER = ['sunrise', 'morning', 'afternoon', 'evening', 'sunset', 'night', 'any'];

const TIME_SLOT_LABELS: Record<string, string> = {
  sunrise: '🌄 Sunrise',
  morning: '🌅 Morning',
  afternoon: '☀️ Afternoon',
  evening: '🌆 Evening',
  sunset: '🌅 Sunset',
  night: '🌙 Night',
  any: '🕐 Anytime',
};

const PACE_MULTIPLIER: Record<string, number> = {
  relaxed: 1.5,
  moderate: 1.0,
  fast: 0.75,
};

export function getBestTimeReason(spot: TouristSpot): string | undefined {
  if (spot.bestTimeVisit) {
    return `${spot.bestTimeVisit.from} – ${spot.bestTimeVisit.to}`;
  }
  if (spot.bestTimeReason) return spot.bestTimeReason;
  const reasons: Record<string, string> = {
    sunrise: 'Best at sunrise',
    morning: 'Ideal in the morning',
    afternoon: 'Perfect for afternoon',
    evening: 'Best in the evening',
    sunset: 'Beautiful at sunset',
    night: 'Best at night',
  };
  return spot.bestTimeToVisit ? reasons[spot.bestTimeToVisit] : undefined;
}

export function formatTimeDisplay(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
  return `${displayHours}:${mins.toString().padStart(2, '0')} ${ampm}`;
}

export function groupSpotsByTimeSlot(
  items: ScheduledItineraryItem[]
): Record<string, ScheduledItineraryItem[]> {
  const groups: Record<string, ScheduledItineraryItem[]> = {};
  TIME_SLOT_ORDER.forEach(slot => {
    const filtered = items.filter(i => i.timeSlot === slot);
    if (filtered.length > 0) groups[slot] = filtered;
  });
  return groups;
}

export function generateItinerarySchedule(
  spots: TouristSpot[],
  userLocation?: { latitude: number; longitude: number } | null,
  pace: 'relaxed' | 'moderate' | 'fast' = 'moderate'
): ScheduledItineraryItem[] {
  if (spots.length === 0) return [];

  const multiplier = PACE_MULTIPLIER[pace] || 1.0;
  const groups: Record<string, TouristSpot[]> = {};

  spots.forEach(spot => {
    const slot = spot.bestTimeToVisit || 'morning';
    if (!groups[slot]) groups[slot] = [];
    groups[slot].push(spot);
  });

  const result: ScheduledItineraryItem[] = [];
  let order = 1;

  TIME_SLOT_ORDER.forEach(slot => {
    const group = groups[slot];
    if (!group || group.length === 0) return;

    let currentMinutes = BASE_TIMES[slot] || 8 * 60;

    group.forEach((spot, index) => {
      const duration = Math.round((spot.estimatedDuration || 60) * multiplier);
      const startMinutes = currentMinutes;
      const endMinutes = currentMinutes + duration;

      let distanceFromPrevious: number | undefined;
      if (index > 0 && group[index - 1]) {
        distanceFromPrevious = haversineDistance(
          group[index - 1].latitude,
          group[index - 1].longitude,
          spot.latitude,
          spot.longitude
        );
      } else if (index === 0 && userLocation) {
        distanceFromPrevious = haversineDistance(
          userLocation.latitude,
          userLocation.longitude,
          spot.latitude,
          spot.longitude
        );
      }

      result.push({
        spot,
        scheduledTime: formatTimeDisplay(startMinutes),
        startMinutes,
        endMinutes,
        order: order++,
        distanceFromPrevious,
        timeSlot: slot,
        timeLabel: TIME_SLOT_LABELS[slot] || slot,
      });

      currentMinutes = endMinutes + (10 * multiplier);
    });
  });

  return result;
}

function nearestNeighborSort<T extends { id: string; latitude: number; longitude: number }>(
  spots: T[],
  startLat: number,
  startLon: number
): T[] {
  if (spots.length === 0) return [];
  const sorted: T[] = [];
  const remaining = [...spots];
  let currentLat = startLat;
  let currentLon = startLon;

  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const dist = haversineDistance(currentLat, currentLon, remaining[i].latitude, remaining[i].longitude) / 1000;
      if (dist < nearestDistance) {
        nearestDistance = dist;
        nearestIndex = i;
      }
    }
    const nearest = remaining.splice(nearestIndex, 1)[0];
    sorted.push(nearest);
    currentLat = nearest.latitude;
    currentLon = nearest.longitude;
  }

  return sorted;
}
