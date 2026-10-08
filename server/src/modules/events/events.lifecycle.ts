import { EventStatus, Prisma } from '@prisma/client';

export type EventLifecycle = 'LIVE' | 'UPCOMING' | 'ENDED';

function utcDayAndTime(now: Date) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const time = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
  return { today, tomorrow, time };
}

export function deriveEventLifecycle(
  event: {
    status: string;
    startDate: Date | string;
    endDate: Date | string;
    startTime?: string | null;
    endTime?: string | null;
  },
  now = new Date(),
): EventLifecycle | null {
  if (event.status !== EventStatus.APPROVED) return null;
  const startDay = new Date(event.startDate);
  const endDay = new Date(event.endDate);
  if (Number.isNaN(startDay.getTime()) || Number.isNaN(endDay.getTime())) return null;
  const [startHour = 0, startMinute = 0] = event.startTime?.split(':').map(Number) ?? [];

  const start = Date.UTC(
    startDay.getUTCFullYear(),
    startDay.getUTCMonth(),
    startDay.getUTCDate(),
    startHour,
    startMinute,
  );
  const [endHour = 0, endMinute = 0] = event.endTime?.split(':').map(Number) ?? [];
  const end = event.endTime
    ? Date.UTC(endDay.getUTCFullYear(), endDay.getUTCMonth(), endDay.getUTCDate(), endHour, endMinute)
    : Date.UTC(endDay.getUTCFullYear(), endDay.getUTCMonth(), endDay.getUTCDate() + 1);

  if (now.getTime() < start) return 'UPCOMING';
  if (now.getTime() < end) return 'LIVE';
  return 'ENDED';
}

export function buildEventLifecycleWhere(
  lifecycle: EventLifecycle,
  now = new Date(),
): Prisma.EventWhereInput {
  const { today, tomorrow, time } = utcDayAndTime(now);
  const sameDayStart = { startDate: { gte: today, lt: tomorrow } };
  const sameDayEnd = { endDate: { gte: today, lt: tomorrow } };

  if (lifecycle === 'UPCOMING') {
    return {
      status: EventStatus.APPROVED,
      deletedAt: null,
      OR: [
        { startDate: { gte: tomorrow } },
        { AND: [sameDayStart, { startTime: { gt: time } }] },
      ],
    };
  }

  if (lifecycle === 'LIVE') {
    return {
      status: EventStatus.APPROVED,
      deletedAt: null,
      AND: [
        {
          OR: [
            { startDate: { lt: today } },
            {
              AND: [
                sameDayStart,
                { OR: [{ startTime: null }, { startTime: { lte: time } }] },
              ],
            },
          ],
        },
        {
          OR: [
            { endDate: { gte: tomorrow } },
            {
              AND: [
                sameDayEnd,
                { OR: [{ endTime: null }, { endTime: { gt: time } }] },
              ],
            },
          ],
        },
      ],
    };
  }

  return {
    status: EventStatus.APPROVED,
    deletedAt: null,
    OR: [
      { endDate: { lt: today } },
      {
        AND: [sameDayEnd, { endTime: { lte: time } }],
      },
    ],
  };
}

export function isAdminEventDeletable(
  event: {
    status: EventStatus;
    startDate: Date;
    endDate: Date;
    startTime: string | null;
    endTime: string | null;
  },
  now = new Date(),
): boolean {
  if (
    event.status === EventStatus.REJECTED ||
    event.status === EventStatus.CANCELLED ||
    event.status === EventStatus.EXPIRED
  ) {
    return true;
  }
  return event.status === EventStatus.APPROVED && deriveEventLifecycle(event, now) === 'ENDED';
}

export function buildEventLifecycleCountsWhere(now = new Date()) {
  return {
    LIVE: buildEventLifecycleWhere('LIVE', now),
    UPCOMING: buildEventLifecycleWhere('UPCOMING', now),
    ENDED: buildEventLifecycleWhere('ENDED', now),
  } satisfies Record<EventLifecycle, Prisma.EventWhereInput>;
}
