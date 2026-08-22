import { describe, expect, it } from 'vitest';
import { createPlaceSchema, updatePlaceSchema } from '../modules/places/places.validation';

const basePlace = {
  name: 'Test Waterfall',
  description: 'A scenic waterfall for validation testing.',
  latitude: 23.13,
  longitude: 79.8,
  category: 'waterfall',
};

describe('openingHoursWriteSchema (corruption guard)', () => {
  it('accepts the production per-day window shape', () => {
    const res = createPlaceSchema.safeParse({
      ...basePlace,
      openingHours: {
        Monday: [{ open: '09:00', close: '18:00' }],
        Tuesday: [{ open: '7:00am', close: '6pm' }],
        Wednesday: [],
      },
    });
    expect(res.success).toBe(true);
  });

  it('rejects zero-length windows (the audit corruption class)', () => {
    const res = createPlaceSchema.safeParse({
      ...basePlace,
      openingHours: { Friday: [{ open: '07:00', close: '07:00' }] },
    });
    expect(res.success).toBe(false);
  });

  it('rejects unparseable time tokens', () => {
    const res = createPlaceSchema.safeParse({
      ...basePlace,
      openingHours: { Friday: [{ open: 'garbage', close: '18:00' }] },
    });
    expect(res.success).toBe(false);
  });

  it('rejects unknown day keys the engine would ignore', () => {
    const res = createPlaceSchema.safeParse({
      ...basePlace,
      openingHours: { Funday: [{ open: '09:00', close: '18:00' }] },
    });
    expect(res.success).toBe(false);
  });

  it('allows overnight windows where close is earlier than open', () => {
    const res = createPlaceSchema.safeParse({
      ...basePlace,
      openingHours: { Friday: [{ open: '21:00', close: '02:00' }] },
    });
    expect(res.success).toBe(true);
  });

  it('still accepts legacy freeform strings per key', () => {
    const res = createPlaceSchema.safeParse({
      ...basePlace,
      openingHours: { friday: '09:00 - 18:00', monday: 'Closed' },
    });
    expect(res.success).toBe(true);
  });
});

describe('estimatedDurationMinutes field', () => {
  it('persists through update and enforces sane bounds', () => {
    expect(updatePlaceSchema.safeParse({ estimatedDurationMinutes: 90 }).success).toBe(true);
    expect(updatePlaceSchema.safeParse({ estimatedDurationMinutes: null }).success).toBe(true);
    expect(updatePlaceSchema.safeParse({ estimatedDurationMinutes: 2 }).success).toBe(false);
    expect(updatePlaceSchema.safeParse({ estimatedDurationMinutes: 9999 }).success).toBe(false);
  });
});
