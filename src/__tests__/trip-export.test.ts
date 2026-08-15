import { buildTripExportText } from '../utils/tripExport';
import type { TripPlan } from '../services/api/trips';

const trip = {
  id: 'cmsuc4dcl005q9m01l5ystmk9',
  title: 'Jabalpur Trip',
  destination: 'Jabalpur',
  days: 3,
  travelers: 'FRIENDS',
  budget: 'LOW',
  totalDistance: 32.8,
  tripDays: [
    {
      dayNumber: 1,
      theme: 'Chausath Yogini & Jabalpur Highlights',
      stops: [
        {
          order: 0,
          startTime: '09:10',
          endTime: '10:10',
          duration: 60,
          entryFee: 0,
          distanceFromPrev: 0,
          reason: 'Day start near trip-origin. Popular waterfall.',
          place: { name: 'Ghughra Falls', category: 'waterfall' },
        },
        {
          order: 1,
          startTime: '10:15',
          endTime: '11:15',
          duration: 60,
          entryFee: 0,
          distanceFromPrev: 0.7,
          reason: 'Nearby in the same region (0.7 km). Popular riverfront_/_nature.',
          place: { name: 'Lamheta Ghat', category: 'riverfront_/_nature' },
        },
      ],
    },
  ],
} as unknown as TripPlan;

describe('trip share export text', () => {
  const text = buildTripExportText(trip);

  it('keeps trip header, stop names, category, and entry', () => {
    expect(text).toContain('PalSafar Trip: Jabalpur Trip');
    expect(text).toContain('Ghughra Falls');
    expect(text).toContain('Lamheta Ghat');
    expect(text).toContain('Category: waterfall');
    expect(text).toContain('Category: riverfront / nature');
    expect(text).toContain('Entry: Free');
  });

  it('omits time, from-prev, and why from the shared itinerary', () => {
    expect(text).not.toMatch(/Time:/);
    expect(text).not.toMatch(/09:10/);
    expect(text).not.toMatch(/From prev/i);
    expect(text).not.toMatch(/Why:/);
    expect(text).not.toContain('Day start near trip-origin');
  });
});
