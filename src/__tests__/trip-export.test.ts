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

  it('has the polished header with bold title and destination', () => {
    expect(text).toContain('✨ *My Jabalpur Trip* — PalSafar');
    expect(text).toContain('📍 *Jabalpur*');
  });

  it('shows humanized travellers, budget, and duration', () => {
    expect(text).toContain('👨‍👩‍👧‍👦 *Friends*');
    expect(text).toContain('💰 *Low Budget*');
    expect(text).toContain('📅 *3 Days*');
  });

  it('shows total distance', () => {
    expect(text).toContain('🚗 *32.8 km*');
  });

  it('renders day headers with DAY N format', () => {
    expect(text).toContain('📅 *DAY 1*');
    expect(text).toContain('*Chausath Yogini & Jabalpur Highlights*');
  });

  it('renders stops with bold numbered names', () => {
    expect(text).toContain('📍 *1. Ghughra Falls*');
    expect(text).toContain('📍 *2. Lamheta Ghat*');
  });

  it('shows category labels and emoji', () => {
    expect(text).toContain('💧 waterfall');
    expect(text).toContain('🌊 • 🌿 riverfront / nature');
  });

  it('shows entry fee as Free', () => {
    expect(text).toContain('🎟️ Entry: *Free*');
  });

  it('uses horizontal separators between days', () => {
    expect(text).toContain('━━━━━━━━━━━━━━');
  });

  it('has the PalSafar branding footer', () => {
    expect(text).toContain('✨ *Planned with PalSafar*');
  });

  it('includes time, duration, and from-prev in the shared itinerary', () => {
    expect(text).toMatch(/9:10 AM – 10:10 AM/);
    expect(text).toMatch(/1 hr/);
    expect(text).toMatch(/0\.7 km from previous stop/);
    expect(text).not.toMatch(/Why:/);
    expect(text).not.toContain('Day start near trip-origin');
  });

  it('does not contain raw debug separators', () => {
    expect(text).not.toMatch(/--- Day \d/);
  });
});

describe('trip share export — edge cases', () => {
  it('handles 1-day trip', () => {
    const single = {
      ...trip,
      days: 1,
      tripDays: [{ ...trip.tripDays[0], dayNumber: 1 }],
    } as unknown as TripPlan;
    const text = buildTripExportText(single);
    expect(text).toContain('📅 *1 Day*');
    expect(text).toContain('📅 *DAY 1*');
  });

  it('handles missing optional fields gracefully', () => {
    const minimal = {
      id: 'min',
      days: 2,
      tripDays: [
        {
          dayNumber: 1,
          stops: [
            {
              order: 0,
              place: { name: 'Test Place' },
            },
          ],
        },
        {
          dayNumber: 2,
          stops: [],
        },
      ],
    } as unknown as TripPlan;
    const text = buildTripExportText(minimal);
    expect(text).toContain('✨ *My Trip* — PalSafar');
    expect(text).toContain('📅 *DAY 1*');
    expect(text).toContain('📍 *1. Test Place*');
    expect(text).toContain('📅 *DAY 2*');
    expect(text).toContain('(no stops)');
    expect(text).not.toContain('Travellers:');
    expect(text).not.toContain('Budget:');
    expect(text).not.toContain('Distance:');
  });

  it('handles entry fee with non-zero value', () => {
    const withFee = {
      ...trip,
      days: 1,
      tripDays: [
        {
          dayNumber: 1,
          stops: [
            {
              order: 0,
              entryFee: 150,
              place: { name: 'Paid Attraction', category: 'museum' },
            },
          ],
        },
      ],
    } as unknown as TripPlan;
    const text = buildTripExportText(withFee);
    expect(text).toContain('🎟️ Entry: *₹150*');
    expect(text).toContain('🏛️ museum');
  });

  it('escapes special WhatsApp characters in place names', () => {
    const special = {
      ...trip,
      days: 1,
      tripDays: [
        {
          dayNumber: 1,
          stops: [
            {
              order: 0,
              place: { name: 'O\'Brien *Adventure* _Park_' },
            },
          ],
        },
      ],
    } as unknown as TripPlan;
    const text = buildTripExportText(special);
    expect(text).toContain(`O'Brien \\*Adventure\\* \\_Park\\_`);
  });
});
