import { prisma } from '../../config/database';
import { Prisma } from '@prisma/client';
import { ApiError } from '../../shared/utils/ApiError';

export const customersService = {
  async forVendor(userId: string, opts: { q?: string; page?: number; limit?: number } = {}) {
    const vendor = await prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) throw new ApiError(404, 'Vendor profile not found');

    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 50, 200);
    const offset = (page - 1) * limit;
    const q = opts.q ? `%${opts.q}%` : null;
    
    // Summary metrics query
    const summaryRows = await prisma.$queryRaw<any[]>`
      SELECT 
        COUNT(DISTINCT r."user_id")::int as "totalCustomers",
        SUM(CASE WHEN r.status = 'VERIFIED' AND COALESCE(r."verified_at", r."created_at") >= date_trunc('month', now()) THEN 1 ELSE 0 END)::int as "thisMonthVisits",
        COUNT(r.id)::int as "totalVisits",
        SUM(COALESCE(r."points_spent", 0))::int as "totalPalPoints"
      FROM "redemptions" r
      WHERE r."vendor_id" = ${vendor.id}
    `;

    // Repeat visitors query
    const repeatVisitorsRow = await prisma.$queryRaw<any[]>`
      SELECT COUNT(*)::int as "repeatVisitors"
      FROM (
        SELECT "user_id" FROM "redemptions"
        WHERE "vendor_id" = ${vendor.id}
        GROUP BY "user_id"
        HAVING COUNT(id) > 1
      ) as rv
    `;

    const summary = {
      totalCustomers: summaryRows[0]?.totalCustomers || 0,
      thisMonthCustomers: summaryRows[0]?.thisMonthVisits || 0, // Using visits as an approximation or we'd need another subquery
      repeatVisitors: repeatVisitorsRow[0]?.repeatVisitors || 0,
      totalPalPoints: summaryRows[0]?.totalPalPoints || 0,
      totalVisits: summaryRows[0]?.totalVisits || 0,
    };

    // Paginated list
    const conditions = q ? Prisma.sql`AND (u.name ILIKE ${'%' + q + '%'} OR u.email ILIKE ${'%' + q + '%'})` : Prisma.empty;
    
    const customers = await prisma.$queryRaw<any[]>`
      SELECT 
        u.id as "userId", u.name, u.email, u.avatar,
        COUNT(r.id)::int as "visits",
        SUM(COALESCE(r."points_spent", 0))::int as "palPointsRedeemed",
        MAX(r."created_at") as "lastVisitAt",
        MIN(r."created_at") as "firstVisitAt",
        (
          SELECT array_agg(DISTINCT o.title)
          FROM "redemptions" r2
          LEFT JOIN "vendor_offers" o ON r2."offer_id" = o.id
          WHERE r2."user_id" = u.id AND r2."vendor_id" = ${vendor.id} AND o.title IS NOT NULL
        ) as "recentOffers"
      FROM "redemptions" r
      JOIN "users" u ON r."user_id" = u.id
      WHERE r."vendor_id" = ${vendor.id} ${conditions}
      GROUP BY u.id
      ORDER BY "lastVisitAt" DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    let total = summary.totalCustomers;
    if (q) {
      const searchCount = await prisma.$queryRaw<any[]>`
        SELECT COUNT(DISTINCT u.id)::int as count
        FROM "redemptions" r
        JOIN "users" u ON r."user_id" = u.id
        WHERE r."vendor_id" = ${vendor.id} ${conditions}
      `;
      total = searchCount[0]?.count || 0;
    }

    return {
      data: customers.map(c => ({
        ...c,
        lastVisitAt: c.lastVisitAt?.toISOString(),
        firstVisitAt: c.firstVisitAt?.toISOString(),
        recentOffers: c.recentOffers || []
      })),
      summary,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  },

  async exportCsv(userId: string) {
    const { data } = await this.forVendor(userId, { page: 1, limit: 10000 });
    const header = 'Name,Email,Visits,PalPoints,FirstVisit,LastVisit,Repeat';
    const rows = data.map((c: any) =>
      [
        JSON.stringify(c.name || ''),
        JSON.stringify(c.email || ''),
        c.visits || 0,
        c.palPointsRedeemed || 0,
        c.firstVisitAt || '',
        c.lastVisitAt || '',
        (c.visits > 1) ? 'yes' : 'no',
      ].join(','),
    );
    return [header, ...rows].join('\n');
  },
};
