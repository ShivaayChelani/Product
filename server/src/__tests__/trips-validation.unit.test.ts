import { createTripSchema } from '../modules/trips/trips.validation';

describe('createTripSchema validation hardening', () => {
  it('validates a valid trip input', () => {
    const valid = {
      title: 'My Trip',
      destination: 'Goa',
      startDate: '2026-10-10',
      endDate: '2026-10-15',
    };
    expect(() => createTripSchema.parse(valid)).not.toThrow();
  });

  it('rejects missing title', () => {
    expect(() => createTripSchema.parse({
      destination: 'Goa',
      startDate: '2026-10-10',
      endDate: '2026-10-15',
    })).toThrow(/Trip name is required/);
  });

  it('rejects missing destination', () => {
    expect(() => createTripSchema.parse({
      title: 'My Trip',
      startDate: '2026-10-10',
      endDate: '2026-10-15',
    })).toThrow(/Destination is required/);
  });

  it('rejects invalid date format', () => {
    expect(() => createTripSchema.parse({
      title: 'My Trip',
      destination: 'Goa',
      startDate: 'invalid',
      endDate: '2026-10-15',
    })).toThrow(/Invalid datetime/);
  });

  it('maps legacy pace labels correctly to API enum', () => {
    const trip = {
      title: 'My Trip',
      destination: 'Goa',
      startDate: '2026-10-10',
      endDate: '2026-10-15',
      pace: 'FAST'
    };
    const parsed = createTripSchema.parse(trip);
    expect(parsed.pace).toBe('QUICK');
    
    expect(createTripSchema.parse({ ...trip, pace: 'SLOW' }).pace).toBe('RELAXED');
    expect(createTripSchema.parse({ ...trip, pace: 'VERY_CHILL' }).pace).toBe('VERY_RELAXED');
    expect(createTripSchema.parse({ ...trip, pace: 'MODERATE' }).pace).toBe('BALANCED');
  });

  it('maps legacy travelers labels', () => {
    const trip = { title: 'Trip', destination: 'Goa', startDate: '2026-10-10', endDate: '2026-10-15', travelers: 'ALONE' };
    expect(createTripSchema.parse(trip).travelers).toBe('SOLO');
    expect(createTripSchema.parse({ ...trip, travelers: 'GROUP' }).travelers).toBe('FRIENDS');
  });
});
