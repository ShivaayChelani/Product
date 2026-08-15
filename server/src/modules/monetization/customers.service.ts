import { prisma } from '../../config/database';
import { ApiError } from '../../shared/utils/ApiError';

export const customersService = {
  async forVendor(userId: string, opts: { q?: string; page?: number; limit?: number } = {}) {
    const vendor = await prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) throw new ApiError(404, 'Vendor profile not found');

    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 50, 200);

    const redemptions = await prisma.redemption.findMany({
      where: { vendorId: vendor.id },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
        offer: { select: { id: true, title: true } },
      },
    });

    const byUser = new Map<string, {
      userId: string;
      name: string;
      email: string;
      avatar: string | null;
      visits: number;
      palPointsRedeemed: number;
      lastVisitAt: string;
      firstVisitAt: string;
      recentOffers: string[];
    }>();

    for (const r of redemptions) {
      if (!r.userId || !r.user) continue;
      const existing = byUser.get(r.userId);
      if (!existing) {
        byUser.set(r.userId, {
          userId: r.userId,
          name: r.user.name,
          email: r.user.email,
          avatar: r.user.avatar,
          visits: 1,
          palPointsRedeemed: r.pointsSpent || 0,
          lastVisitAt: r.createdAt.toISOString(),
          firstVisitAt: r.createdAt.toISOString(),
          recentOffers: r.offer?.title ? [r.offer.title] : [],
        });
      } else {
        existing.visits += 1;
        existing.palPointsRedeemed += r.pointsSpent || 0;
        if (r.offer?.title && existing.recentOffers.length < 5) {
          existing.recentOffers.push(r.offer.title);
        }
      }
    }

    let customers = Array.from(byUser.values());
    if (opts.q) {
      const q = opts.q.toLowerCase();
      customers = customers.filter(
        (c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q),
      );
    }

    customers.sort((a, b) => +new Date(b.lastVisitAt) - +new Date(a.lastVisitAt));
    const total = customers.length;
    const data = customers.slice((page - 1) * limit, page * limit);
    const repeatVisitors = customers.filter((c) => c.visits > 1).length;

    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);

    const thisMonthCustomerIds = new Set<string>();
    for (const r of redemptions) {
      if (!r.userId || r.status !== 'VERIFIED') continue;
      const eventAt = r.verifiedAt ?? r.createdAt;
      if (eventAt >= startOfMonth) thisMonthCustomerIds.add(r.userId);
    }

    return {
      data,
      summary: {
        totalCustomers: total,
        thisMonthCustomers: thisMonthCustomerIds.size,
        repeatVisitors,
        totalPalPoints: customers.reduce((s, c) => s + c.palPointsRedeemed, 0),
        totalVisits: customers.reduce((s, c) => s + c.visits, 0),
      },
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  },

  async exportCsv(userId: string) {
    const { data } = await this.forVendor(userId, { page: 1, limit: 10000 });
    const header = 'Name,Email,Visits,PalPoints,FirstVisit,LastVisit,Repeat';
    const rows = data.map((c) =>
      [
        JSON.stringify(c.name),
        JSON.stringify(c.email),
        c.visits,
        c.palPointsRedeemed,
        c.firstVisitAt,
        c.lastVisitAt,
        c.visits > 1 ? 'yes' : 'no',
      ].join(','),
    );
    return [header, ...rows].join('\n');
  },
};
