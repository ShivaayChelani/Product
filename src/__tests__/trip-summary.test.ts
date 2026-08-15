import { computeTripBudget } from '../utils/tripBudget';
import {
  computeTripPalPoints,
  formatDurationOnly,
  resolveTravellerCount,
} from '../utils/tripSummary';
import { estimateTripPalPoints } from '../features/myTrips/utils/tripFormatting';

const makeTrip = (overrides: Record<string, unknown> = {}) => ({
  id: 'trip-1',
  title: 'Jabalpur Trip',
  userId: 'user-1',
  days: 3,
  travelers: 'FAMILY',
  transportation: ['CAR'],
  interests: [],
  pace: 'BALANCED',
  avoid: [],
  generationSource: 'AI_PROMPT',
  isPublished: false,
  createdAt: '',
  updatedAt: '',
  collaborators: [],
  user: { id: 'user-1', name: 'User' },
  tripDays: [
    {
      id: 'day-1',
      tripPlanId: 'trip-1',
      dayNumber: 1,
      stops: [
        { id: 's1', placeId: 'p1', order: 0, isPinned: false, photoAttachments: [], voiceNotes: [], entryFee: 50, distanceFromPrev: 2, place: { name: 'A' } },
        { id: 's2', placeId: 'p2', order: 1, isPinned: false, photoAttachments: [], voiceNotes: [], entryFee: 0, distanceFromPrev: 3, place: { name: 'B' } },
      ],
    },
    {
      id: 'day-2',
      tripPlanId: 'trip-1',
      dayNumber: 2,
      stops: [
        { id: 's3', placeId: 'p3', order: 0, isPinned: false, photoAttachments: [], voiceNotes: [], entryFee: 100, distanceFromPrev: 0, place: { name: 'C' } },
      ],
    },
    { id: 'day-3', tripPlanId: 'trip-1', dayNumber: 3, stops: [] },
  ],
  ...overrides,
} as any);

describe('trip summary calculations', () => {
  it('uses travelers enum for consistent traveller count', () => {
    expect(resolveTravellerCount(makeTrip({ travelers: 'FAMILY', collaborators: [] }))).toBe(3);
    expect(resolveTravellerCount(makeTrip({ travelers: 'COUPLE', collaborators: [] }))).toBe(2);
    expect(resolveTravellerCount(makeTrip({ travelers: 'SOLO', collaborators: [{ id: 'c1' }] }))).toBe(1);
  });

  it('calculates day-wise and total itinerary PalPoints from checkpoint rules', () => {
    const points = computeTripPalPoints(makeTrip());
    expect(points.perVisitPoints).toBe(10);
    expect(points.byDay.map(day => day.potentialPoints)).toEqual([20, 10, 0]);
    expect(points.completionBonus).toBe(100);
    expect(points.totalPotential).toBe(30);
  });

  it('awards 10 PalPoints per place so 4 places = 40 and 5 places = 50', () => {
    const fourPlaces = makeTrip({
      days: 1,
      tripDays: [{
        id: 'day-1',
        tripPlanId: 'trip-1',
        dayNumber: 1,
        stops: [1, 2, 3, 4].map(n => ({
          id: `s${n}`, placeId: `p${n}`, order: n, isPinned: false, photoAttachments: [], voiceNotes: [],
        })),
      }],
    });
    const fivePlaces = makeTrip({
      days: 1,
      tripDays: [{
        id: 'day-1',
        tripPlanId: 'trip-1',
        dayNumber: 1,
        stops: [1, 2, 3, 4, 5].map(n => ({
          id: `s${n}`, placeId: `p${n}`, order: n, isPinned: false, photoAttachments: [], voiceNotes: [],
        })),
      }],
    });
    expect(computeTripPalPoints(fourPlaces).totalPotential).toBe(40);
    expect(computeTripPalPoints(fourPlaces).byDay[0].potentialPoints).toBe(40);
    expect(estimateTripPalPoints(fourPlaces)).toBe(40);
    expect(computeTripPalPoints(fivePlaces).totalPotential).toBe(50);
    expect(computeTripPalPoints(fivePlaces).byDay[0].potentialPoints).toBe(50);
    expect(estimateTripPalPoints(fivePlaces)).toBe(50);
  });

  it('uses per-day _count.stops when the list payload truncates stop rows', () => {
    const truncated = makeTrip({
      days: 2,
      tripDays: [
        {
          id: 'day-1',
          tripPlanId: 'trip-1',
          dayNumber: 1,
          _count: { stops: 4 },
          stops: [{ id: 's1', placeId: 'p1', order: 0, isPinned: false, photoAttachments: [], voiceNotes: [] }],
        },
        {
          id: 'day-2',
          tripPlanId: 'trip-1',
          dayNumber: 2,
          _count: { stops: 5 },
          stops: [{ id: 's2', placeId: 'p2', order: 0, isPinned: false, photoAttachments: [], voiceNotes: [] }],
        },
      ],
    });
    const points = computeTripPalPoints(truncated);
    expect(points.byDay.map(day => day.potentialPoints)).toEqual([40, 50]);
    expect(points.totalPotential).toBe(90);
    expect(estimateTripPalPoints(truncated)).toBe(90);
  });

  it('uses trip.stopsCount when the list payload truncates days themselves', () => {
    const truncatedDays = makeTrip({
      days: 3,
      stopsCount: 9,
      tripDays: [{
        id: 'day-1',
        tripPlanId: 'trip-1',
        dayNumber: 1,
        _count: { stops: 1 },
        stops: [{ id: 's1', placeId: 'p1', order: 0, isPinned: false, photoAttachments: [], voiceNotes: [] }],
      }],
    });
    expect(computeTripPalPoints(truncatedDays).totalPotential).toBe(90);
  });

  it('computes budget from entry, route transport, food, and traveller count', () => {
    const budget = computeTripBudget(makeTrip({ estimatedBudget: 105 }));
    expect(budget.travellerCount).toBe(3);
    expect(budget.entryTotal).toBe(450);
    expect(budget.foodTotal).toBe(3600);
    expect(budget.transportTotal).toBe(40);
    expect(budget.grandTotal).toBe(4090);
  });

  it('formats duration without requiring calendar dates', () => {
    expect(formatDurationOnly(makeTrip())).toBe('3 Days / 2 Nights');
  });
});
