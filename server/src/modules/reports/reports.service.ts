import { prisma } from '../../config/database';

function csvSafe(val: unknown): string {
  const s = String(val ?? '');
  return s.length > 0 && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

/** End-of-day boundary for inclusive `to` filtering (date-only or full ISO). */
function parseToBoundary(value: string | undefined): Date {
  const now = new Date();
  if (!value) return now;
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = new Date(isDateOnly ? `${value}T23:59:59.999Z` : value);
  return Number.isNaN(parsed.getTime()) ? now : parsed;
}

export const reportsService = {
  async generateReport(params: {
    type: 'users' | 'vendors' | 'places' | 'revenue' | 'engagement';
    from?: string;
    to?: string;
    city?: string;
    category?: string;
    format: 'json' | 'csv';
  }) {
    const fromDate = params.from ? new Date(params.from) : new Date(Date.now() - 30 * 86400000);
    const toDate = parseToBoundary(params.to);

    switch (params.type) {
      case 'users': {
        const users = await prisma.user.findMany({
          where: {
            createdAt: { gte: fromDate, lte: toDate },
          },
          select: {
            id: true, name: true, email: true, permission: true, activeMode: true,
            createdAt: true, updatedAt: true,
            _count: { select: { checkIns: true, reviews: true, reelComments: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 5_000,
        });

        const data = users.map(u => ({
          id: u.id, name: u.name, email: u.email, permission: u.permission, activeMode: u.activeMode, role: u.activeMode,
          checkIns: u._count.checkIns, reviews: u._count.reviews, reels: u._count.reelComments,
          createdAt: u.createdAt,
        }));

        if (params.format === 'csv') {
          const header = 'ID,Name,Email,Role,Check-ins,Reviews,Reels,Created At\n';
          const rows = data.map(r => `${r.id},${csvSafe(r.name).replace(/,/g,' ')},${r.email},${r.role},${r.checkIns},${r.reviews},${r.reels},${r.createdAt}`).join('\n');
          return header + rows;
        }
        return { metrics: { total: data.length }, summary: `Users created between ${fromDate.toISOString()} and ${toDate.toISOString()}`, rows: data };
      }

      case 'vendors': {
        const vendors = await prisma.vendor.findMany({
          where: { createdAt: { gte: fromDate, lte: toDate } },
          include: {
            user: { select: { email: true } },
            _count: { select: { offers: true, reels: true } },
          },
          orderBy: { createdAt: 'desc' },
        });

        const data = vendors.map(v => ({
          id: v.id, businessName: v.businessName, email: v.user.email, phone: v.phone,
          city: v.city, state: v.state, status: v.status, category: v.businessType,
          offers: v._count.offers, reels: v._count.reels,
          createdAt: v.createdAt,
        }));

        if (params.format === 'csv') {
          const header = 'ID,Business Name,Email,Phone,City,State,Status,Category,Offers,Reels,Created At\n';
          const rows = data.map(r => `${r.id},${csvSafe(r.businessName).replace(/,/g,' ')},${r.email},${r.phone},${r.city},${r.state},${r.status},${csvSafe(r.category)},${r.offers},${r.reels},${r.createdAt}`).join('\n');
          return header + rows;
        }
        return { metrics: { total: data.length }, summary: `Vendors with activity between ${fromDate.toISOString()} and ${toDate.toISOString()}`, rows: data };
      }

      case 'places': {
        const where: any = { createdAt: { gte: fromDate, lte: toDate } };
        if (params.city) where.city = params.city;
        if (params.category) where.category = params.category;

        const places = await prisma.place.findMany({
          where,
          select: {
            id: true, name: true, category: true, city: true, state: true,
            status: true, source: true, rating: true, reviewCount: true,
            createdAt: true,
            _count: { select: { checkIns: true, reviews: true, reels: true } },
          },
          orderBy: { createdAt: 'desc' },
          // Cap export size so large place catalogs cannot hang the HTTP connection.
          take: 5_000,
        });

        const data = places.map(p => ({
          id: p.id, name: p.name, category: p.category, city: p.city, state: p.state,
          status: p.status, source: p.source, rating: p.rating, reviewCount: p.reviewCount,
          checkIns: p._count.checkIns, reviews: p._count.reviews, reels: p._count.reels,
          createdAt: p.createdAt,
        }));

        if (params.format === 'csv') {
          const header = 'ID,Name,Category,City,State,Status,Source,Rating,Reviews,Check-ins,Reels,Created At\n';
          const rows = data.map(r => `${r.id},${csvSafe(r.name).replace(/,/g,' ')},${csvSafe(r.category)},${r.city},${r.state},${r.status},${r.source},${r.rating||''},${r.reviewCount},${r.checkIns},${r.reviews},${r.reels},${r.createdAt}`).join('\n');
          return header + rows;
        }
        return { metrics: { total: data.length }, summary: `Places created between ${fromDate.toISOString()} and ${toDate.toISOString()}`, rows: data };
      }

      case 'revenue': {
        const redemptions = await prisma.redemption.findMany({
          where: { status: 'VERIFIED', createdAt: { gte: fromDate, lte: toDate } },
          select: {
            id: true, createdAt: true,
            offer: { select: { title: true, discountValue: true, pointsRequired: true } },
            vendor: { select: { businessName: true, city: true, state: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 5_000,
        });

        const data = redemptions.map(r => ({
          id: r.id, offer: r.offer?.title, value: r.offer?.discountValue,
          pointsRequired: r.offer?.pointsRequired,
          vendor: r.vendor?.businessName,
          city: r.vendor?.city, state: r.vendor?.state,
          date: r.createdAt,
        }));

        if (params.format === 'csv') {
          const header = 'ID,Offer,Value,Points,Vendor,City,State,Date\n';
          const rows = data.map(r => `${r.id},${csvSafe(r.offer).replace(/,/g,' ')},${r.value||0},${r.pointsRequired||0},${csvSafe(r.vendor).replace(/,/g,' ')},${r.city||''},${r.state||''},${r.date}`).join('\n');
          return header + rows;
        }
        const totalPoints = data.reduce((sum, r) => sum + Number(r.pointsRequired || 0), 0);
        return { metrics: { redemptions: data.length, pointsRedeemed: totalPoints }, summary: `Verified redemptions between ${fromDate.toISOString()} and ${toDate.toISOString()}`, rows: data };
      }

      case 'engagement': {
        const stats = await prisma.$queryRaw<any[]>`
          SELECT
            DATE(ps.created_at) as date,
            COUNT(*) FILTER (WHERE ps.action = 'view')::int as views,
            COUNT(*) FILTER (WHERE ps.action = 'like')::int as likes,
            COUNT(*) FILTER (WHERE ps.action = 'save')::int as saves,
            COUNT(*) FILTER (WHERE ps.action = 'checkin')::int as checkins
          FROM place_stats ps
          WHERE ps.created_at >= ${fromDate} AND ps.created_at <= ${toDate}
          GROUP BY DATE(ps.created_at)
          ORDER BY date ASC
        `;

        const data = stats.map(s => ({
          date: s.date, views: Number(s.views), likes: Number(s.likes),
          saves: Number(s.saves), checkins: Number(s.checkins),
        }));

        if (params.format === 'csv') {
          const header = 'Date,Views,Likes,Saves,Check-ins\n';
          const rows = data.map(r => `${r.date},${r.views},${r.likes},${r.saves},${r.checkins}`).join('\n');
          return header + rows;
        }
        return {
          metrics: {
            days: data.length,
            views: data.reduce((s, r) => s + r.views, 0),
            likes: data.reduce((s, r) => s + r.likes, 0),
            saves: data.reduce((s, r) => s + r.saves, 0),
            checkins: data.reduce((s, r) => s + r.checkins, 0),
          },
          summary: `Engagement between ${fromDate.toISOString()} and ${toDate.toISOString()}`,
          rows: data,
        };
      }

      default:
        return { metrics: {}, summary: '', rows: [] };
    }
  },
};
