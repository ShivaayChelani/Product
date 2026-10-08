import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventStatus, EventType, type Event } from '@prisma/client';
import { prisma } from '../config/database';
import { auditService } from '../modules/audit/audit.service';
import { eventsService } from '../modules/events/events.service';
import { eventIdParamsSchema } from '../modules/events/events.validation';
import { ApiError } from '../shared/utils/ApiError';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  auditLog: vi.fn(),
}));

vi.mock('../config/database', () => ({
  prisma: {
    event: {
      findFirst: mocks.findFirst,
      updateMany: mocks.updateMany,
    },
  },
}));

vi.mock('../modules/audit/audit.service', () => ({
  auditService: { log: mocks.auditLog },
}));

function makeEvent(status: EventStatus, schedule: Partial<Pick<Event, 'startDate' | 'endDate' | 'startTime' | 'endTime'>> = {}) {
  const now = new Date();
  return {
    id: 'event-1',
    slug: 'event-1',
    title: 'Test event',
    description: null,
    eventType: EventType.OTHER,
    status,
    startDate: schedule.startDate ?? now,
    endDate: schedule.endDate ?? now,
    startTime: schedule.startTime ?? null,
    endTime: schedule.endTime ?? null,
    latitude: null,
    longitude: null,
    address: null,
    city: 'Test city',
    state: '',
    country: 'India',
    coverImage: null,
    images: [],
    shortDescription: null,
    organizerName: null,
    organizerContact: null,
    websiteUrl: null,
    entryFee: null,
    createdById: null,
    approvedById: null,
    deletedById: null,
    deletedAt: null,
    approvedAt: null,
    rejectedAt: null,
    rejectionReason: null,
    cancelledAt: null,
    cancellationReason: null,
    publishedAt: null,
    isFeatured: true,
    linkedPlaceId: null,
    linkedVendorId: null,
    legacyPlaceEventId: null,
    createdAt: now,
    updatedAt: now,
    _count: { reels: 2 },
  };
}

const endOfUtcDay = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

describe('admin event soft deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.auditLog.mockResolvedValue(undefined);
  });

  it.each([EventStatus.REJECTED, EventStatus.CANCELLED, EventStatus.EXPIRED])(
    'soft-deletes terminal %s events and records the acting admin',
    async (status) => {
      const event = makeEvent(status);
      mocks.findFirst.mockResolvedValue(event);

      await expect(eventsService.adminDeleteEvent(event.id, 'admin-1')).resolves.toEqual({ success: true });

      expect(prisma.event.findFirst).toHaveBeenCalledWith({
        where: { id: event.id, deletedAt: null },
        include: { _count: { select: { reels: true } } },
      });
      expect(prisma.event.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: event.id, deletedAt: null, updatedAt: event.updatedAt },
        data: expect.objectContaining({ deletedById: 'admin-1', isFeatured: false, deletedAt: expect.any(Date) }),
      }));
      expect(auditService.log).toHaveBeenCalledWith(
        'EVENT_DELETED',
        'Event',
        event.id,
        'admin-1',
        null,
        null,
        { title: event.title, status, reelCount: 2 },
      );
    },
  );

  it('allows an approved event only after its actual end time', async () => {
    const now = new Date();
    const today = endOfUtcDay(now);
    const event = makeEvent(EventStatus.APPROVED, {
      startDate: today,
      endDate: today,
      startTime: '00:00',
      endTime: '00:01',
    });
    mocks.findFirst.mockResolvedValue(event);

    await expect(eventsService.adminDeleteEvent(event.id, 'admin-1')).resolves.toEqual({ success: true });
  });

  it.each([
    ['upcoming', () => new Date(Date.now() + 86_400_000), () => new Date(Date.now() + 86_400_000), '00:00', '23:59'],
    ['ongoing', () => new Date(Date.now() - 86_400_000), () => new Date(Date.now() + 86_400_000), null, null],
  ])('protects an approved %s event', async (_label, startDate, endDate, startTime, endTime) => {
    const event = makeEvent(EventStatus.APPROVED, {
      startDate: startDate(),
      endDate: endDate(),
      startTime,
      endTime,
    });
    mocks.findFirst.mockResolvedValue(event);

    await expect(eventsService.adminDeleteEvent(event.id, 'admin-1')).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(prisma.event.updateMany).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('does not allow pending cleanup and returns 404 for deleted or missing IDs', async () => {
    mocks.findFirst.mockResolvedValueOnce(makeEvent(EventStatus.PENDING)).mockResolvedValueOnce(null);

    await expect(eventsService.adminDeleteEvent('event-1', 'admin-1')).rejects.toBeInstanceOf(ApiError);
    await expect(eventsService.adminDeleteEvent('missing', 'admin-1')).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.event.updateMany).not.toHaveBeenCalled();
  });

  it('does not report success if the Event changed during deletion', async () => {
    const event = makeEvent(EventStatus.REJECTED);
    mocks.findFirst.mockResolvedValue(event);
    mocks.updateMany.mockResolvedValue({ count: 0 });

    await expect(eventsService.adminDeleteEvent(event.id, 'admin-1')).rejects.toMatchObject({ statusCode: 409 });
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('validates Event IDs and does not issue a hard delete that cascades itinerary stops', async () => {
    expect(eventIdParamsSchema.safeParse({ id: 'event_123-abc' }).success).toBe(true);
    expect(eventIdParamsSchema.safeParse({ id: '../another-event' }).success).toBe(false);
    expect(eventIdParamsSchema.safeParse({ id: '' }).success).toBe(false);

    const event = makeEvent(EventStatus.REJECTED);
    mocks.findFirst.mockResolvedValue(event);
    await eventsService.adminDeleteEvent(event.id, 'admin-1');

    expect(prisma.event.updateMany).toHaveBeenCalledOnce();
    expect(prisma.event).not.toHaveProperty('delete');
  });
});
