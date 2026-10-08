import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../config/database';
import { eventsService } from '../modules/events/events.service';

vi.mock('../config/database', () => ({
  prisma: {
    event: {
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    eventReport: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe('admin event queue pagination and filters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.event.findMany).mockResolvedValue([]);
    vi.mocked(prisma.event.count).mockResolvedValue(0);
    vi.mocked(prisma.event.groupBy).mockResolvedValue([]);
    vi.mocked(prisma.eventReport.findMany).mockResolvedValue([]);
    vi.mocked(prisma.eventReport.count).mockResolvedValue(0);
  });

  it('combines lifecycle, search, date, and city filters while applying real event pagination', async () => {
    await eventsService.adminListEvents({
      page: '3',
      limit: '10',
      status: 'APPROVED',
      lifecycle: 'LIVE',
      q: 'music',
      city: 'Jabalpur',
      from: '2026-10-01',
      to: '2026-10-31',
    });

    expect(prisma.event.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 20,
      take: 10,
      where: {
        deletedAt: null,
        AND: expect.arrayContaining([
          expect.objectContaining({ status: 'APPROVED', AND: expect.any(Array) }),
          expect.objectContaining({ city: { contains: 'Jabalpur', mode: 'insensitive' } }),
          expect.objectContaining({ OR: expect.any(Array) }),
          expect.objectContaining({ AND: expect.any(Array) }),
        ]),
      },
    }));
  });

  it('paginates event reports and filters the requested report status', async () => {
    const result = await eventsService.listReports({ page: '2', limit: '5', status: 'PENDING' });

    expect(prisma.eventReport.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'PENDING' },
      skip: 5,
      take: 5,
    }));
    expect(result.pagination).toMatchObject({ page: 2, limit: 5, total: 0, totalPages: 0 });
  });
});
