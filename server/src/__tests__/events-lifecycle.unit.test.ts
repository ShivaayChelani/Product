import { describe, expect, it } from 'vitest';
import {
  buildEventLifecycleCountsWhere,
  buildEventLifecycleWhere,
  deriveEventLifecycle,
} from '../modules/events/events.lifecycle';

describe('event lifecycle', () => {
  const approved = {
    status: 'APPROVED',
    startDate: '2026-10-10T00:00:00.000Z',
    endDate: '2026-10-12T00:00:00.000Z',
    startTime: '09:30',
    endTime: '18:00',
  };

  it('uses inclusive start and exclusive end instants for approved events', () => {
    expect(deriveEventLifecycle(approved, new Date('2026-10-10T09:29:59.999Z'))).toBe('UPCOMING');
    expect(deriveEventLifecycle(approved, new Date('2026-10-10T09:30:00.000Z'))).toBe('LIVE');
    expect(deriveEventLifecycle(approved, new Date('2026-10-12T17:59:59.999Z'))).toBe('LIVE');
    expect(deriveEventLifecycle(approved, new Date('2026-10-12T18:00:00.000Z'))).toBe('ENDED');
    expect(deriveEventLifecycle({ ...approved, status: 'PENDING' }, new Date('2026-10-10T12:00:00.000Z'))).toBeNull();
  });

  it('treats a date-only end date as inclusive through the end of that UTC day', () => {
    const event = { ...approved, startTime: null, endTime: null };
    expect(deriveEventLifecycle(event, new Date('2026-10-12T23:59:59.999Z'))).toBe('LIVE');
    expect(deriveEventLifecycle(event, new Date('2026-10-13T00:00:00.000Z'))).toBe('ENDED');
  });

  it('builds approved-only filters and three independent count filters', () => {
    const now = new Date('2026-10-10T12:00:00.000Z');
    expect(buildEventLifecycleWhere('UPCOMING', now)).toMatchObject({
      status: 'APPROVED',
      OR: expect.any(Array),
    });
    expect(buildEventLifecycleWhere('LIVE', now)).toMatchObject({
      status: 'APPROVED',
      AND: expect.any(Array),
    });
    expect(buildEventLifecycleWhere('ENDED', now)).toMatchObject({
      status: 'APPROVED',
      OR: expect.any(Array),
    });
    expect(Object.keys(buildEventLifecycleCountsWhere(now))).toEqual(['LIVE', 'UPCOMING', 'ENDED']);
  });
});
