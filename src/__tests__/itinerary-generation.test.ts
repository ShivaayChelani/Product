import { normalizeTripDays, normalizeTripPlan, dayListKey, stopListKey } from '../utils/normalizeTripPlan';

describe('normalizeTripDays', () => {
  it('handles empty response safely', () => {
    expect(normalizeTripDays(null)).toEqual([]);
    expect(normalizeTripDays(undefined)).toEqual([]);
    expect(normalizeTripDays([])).toEqual([]);
  });

  it('removes duplicate days by id and duplicate stops by id', () => {
    const days: any[] = [
      {
        id: 'day-1',
        dayNumber: 1,
        stops: [
          { id: 'stop-1', order: 1 },
          { id: 'stop-1', order: 2 }, // duplicate
          { id: 'stop-2', order: 3 }
        ]
      },
      {
        id: 'day-1', // duplicate day
        dayNumber: 1,
        stops: []
      },
      {
        id: 'day-2',
        dayNumber: 2,
        stops: null // malformed stops
      }
    ];
    const result = normalizeTripDays(days);
    expect(result.length).toBe(2);
    expect(result[0].id).toBe('day-1');
    expect(result[0].stops.length).toBe(2);
    expect(result[0].stops[0].id).toBe('stop-1');
    expect(result[0].stops[1].id).toBe('stop-2');
    expect(result[1].id).toBe('day-2');
    expect(result[1].stops).toEqual([]);
  });

  it('handles days without id falling back to dayNumber', () => {
    const days: any[] = [
      { dayNumber: 1, stops: [] },
      { dayNumber: 1, stops: [] }, // duplicate dayNumber
      { dayNumber: 2, stops: [] }
    ];
    const result = normalizeTripDays(days);
    expect(result.length).toBe(2);
    expect(result[0].dayNumber).toBe(1);
    expect(result[1].dayNumber).toBe(2);
  });

  it('sorts days by dayNumber and stops by order', () => {
    const days: any[] = [
      {
        dayNumber: 3,
        stops: [{ order: 2, id: 'b' }, { order: 1, id: 'a' }]
      },
      {
        dayNumber: 1,
        stops: []
      },
      {
        dayNumber: 2,
        stops: []
      }
    ];
    const result = normalizeTripDays(days);
    expect(result.length).toBe(3);
    expect(result[0].dayNumber).toBe(1);
    expect(result[1].dayNumber).toBe(2);
    expect(result[2].dayNumber).toBe(3);
    expect(result[2].stops[0].id).toBe('a');
    expect(result[2].stops[1].id).toBe('b');
  });
});

describe('dayListKey and stopListKey', () => {
  it('generates stable keys', () => {
    expect(dayListKey({ id: 'day-1' } as any, 0)).toBe('day-day-1-0');
    expect(dayListKey({ dayNumber: 5 } as any, 2)).toBe('day-num-5-2');
    expect(stopListKey({ id: 'stop-abc' } as any, 1)).toBe('stop-stop-abc-1');
    expect(stopListKey({ order: 4 } as any, 3)).toBe('stop-ord-4-3');
  });
});

describe('normalizeTripPlan', () => {
  it('normalizes the whole plan without crashing on missing days', () => {
    const trip: any = {
      id: 'trip-1',
      title: 'My Trip',
      tripDays: null
    };
    const result = normalizeTripPlan(trip);
    expect(result.id).toBe('trip-1');
    expect(result.tripDays).toEqual([]);
  });
});
