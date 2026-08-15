import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { cache, cacheKey } from '../../config/cache';

function csvSafe(val: unknown): string {
  const s = String(val ?? '');
  return s.length > 0 && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function joinConditions(conditions: Prisma.Sql[]): Prisma.Sql {
  if (conditions.length === 0) return Prisma.sql`TRUE`;
  return conditions.reduce((acc, c) => Prisma.sql`${acc} AND ${c}`);
}

export const revenueAnalyticsService = {
  async getDashboard(params: {
    from?: string;
    to?: string;
    city?: string;
    category?: string;
  }) {
    const ck = cacheKey('revenue-analytics', params.city || 'all', params.category || 'all', params.from || 'all', params.to || 'all');
    const cached = await cache.get(ck);
    if (cached) return cached;

    const now = new Date();
    const fromDate = params.from ? new Date(params.from) : new Date(now.getTime() - 30 * 86400000);
    const toDate = params.to ? new Date(params.to + 'T23:59:59.999Z') : now;

    const filters: Prisma.Sql[] = [];
    filters.push(Prisma.sql`r.created_at >= ${fromDate}`);
    filters.push(Prisma.sql`r.created_at <= ${toDate}`);
    if (params.city) filters.push(Prisma.sql`v.city = ${params.city}`);
    if (params.category) filters.push(Prisma.sql`vo.category = ${params.category}`);
    const whereSQL = joinConditions(filters);

    // Total Redemptions & Value
    const redemptionStats = await prisma.$queryRaw<{ total: bigint; value: number }[]>`
      SELECT COUNT(*)::int as total, COALESCE(SUM(vo.discount_value), 0) as value
      FROM redemptions r
      JOIN vendor_offers vo ON r.offer_id = vo.id
      WHERE r.status = 'VERIFIED' AND ${whereSQL}
    `;

    // Revenue by City
    const revenueByCity = await prisma.$queryRaw<{ city: string; redemptions: bigint; value: number }[]>`
      SELECT v.city, COUNT(*)::int as redemptions, COALESCE(SUM(vo.discount_value), 0) as value
      FROM redemptions r
      JOIN vendor_offers vo ON r.offer_id = vo.id
      JOIN vendors v ON r.vendor_id = v.id
      WHERE r.status = 'VERIFIED' AND ${whereSQL}
      GROUP BY v.city
      ORDER BY value DESC
    `;

    // Revenue by Category
    const revenueByCategory = await prisma.$queryRaw<{ category: string; redemptions: bigint; value: number }[]>`
      SELECT vo.category, COUNT(*)::int as redemptions, COALESCE(SUM(vo.discount_value), 0) as value
      FROM redemptions r
      JOIN vendor_offers vo ON r.offer_id = vo.id
      WHERE r.status = 'VERIFIED' AND ${whereSQL}
      GROUP BY vo.category
      ORDER BY value DESC
    `;

    // Most Redeemed Offers
    const topOffers = await prisma.$queryRaw<{ offer_id: string; title: string; vendor_name: string; redemptions: bigint; value: number }[]>`
      SELECT
        vo.id as offer_id, vo.title, v.business_name as vendor_name,
        COUNT(*)::int as redemptions, COALESCE(SUM(vo.discount_value), 0) as value
      FROM redemptions r
      JOIN vendor_offers vo ON r.offer_id = vo.id
      JOIN vendors v ON vo.vendor_id = v.id
      WHERE r.status = 'VERIFIED' AND ${whereSQL}
      GROUP BY vo.id, vo.title, v.business_name
      ORDER BY redemptions DESC
      LIMIT 20
    `;

    // Vendor Performance
    const vendorPerformance = await prisma.$queryRaw<{ vendor_id: string; business_name: string; city: string; redemptions: bigint; revenue: number; offers_count: bigint }[]>`
      SELECT
        v.id as vendor_id, v.business_name, v.city,
        COUNT(DISTINCT r.id)::int as redemptions,
        COALESCE(SUM(vo.discount_value), 0) as revenue,
        COUNT(DISTINCT vo.id)::int as offers_count
      FROM vendors v
      LEFT JOIN vendor_offers vo ON vo.vendor_id = v.id
      LEFT JOIN redemptions r ON r.offer_id = vo.id AND r.status = 'VERIFIED'
        AND r.created_at >= ${fromDate} AND r.created_at <= ${toDate}
      WHERE v.status = 'APPROVED'
      GROUP BY v.id, v.business_name, v.city
      ORDER BY revenue DESC
      LIMIT 20
    `;

    // Revenue Trend
    const revenueTrend = await prisma.$queryRaw<{ date: string; redemptions: bigint; value: number }[]>`
      SELECT DATE(r.created_at) as date, COUNT(*)::int as redemptions, COALESCE(SUM(vo.discount_value), 0) as value
      FROM redemptions r
      JOIN vendor_offers vo ON r.offer_id = vo.id
      WHERE r.status = 'VERIFIED' AND r.created_at >= ${fromDate} AND r.created_at <= ${toDate}
      GROUP BY DATE(r.created_at)
      ORDER BY date ASC
    `;

    // Offer Usage Stats
    const offerStats = await prisma.$queryRaw<{ total_offers: bigint; active_offers: bigint; avg_redemptions: number }[]>`
      SELECT
        COUNT(*)::int as total_offers,
        COUNT(*) FILTER (WHERE vo.is_active = true)::int as active_offers,
        COALESCE(ROUND(AVG(r_count.cnt)), 0)::int as avg_redemptions
      FROM vendor_offers vo
      LEFT JOIN (
        SELECT offer_id, COUNT(*) as cnt
        FROM redemptions
        WHERE status = 'VERIFIED'
        GROUP BY offer_id
      ) r_count ON r_count.offer_id = vo.id
    `;

    const result = {
      metrics: {
        totalRedemptions: Number(redemptionStats[0]?.total || 0),
        redemptionValue: Number(redemptionStats[0]?.value || 0),
        totalOffers: Number(offerStats[0]?.total_offers || 0),
        activeOffers: Number(offerStats[0]?.active_offers || 0),
        avgRedemptions: Number(offerStats[0]?.avg_redemptions || 0),
      },
      revenueByCity: revenueByCity.map(r => ({
        city: r.city,
        redemptions: Number(r.redemptions),
        value: Number(r.value),
      })),
      revenueByCategory: revenueByCategory.map(r => ({
        category: r.category,
        redemptions: Number(r.redemptions),
        value: Number(r.value),
      })),
      topOffers: topOffers.map(r => ({
        offerId: r.offer_id,
        title: r.title,
        vendorName: r.vendor_name,
        redemptions: Number(r.redemptions),
        value: Number(r.value),
      })),
      vendorPerformance: vendorPerformance.map(r => ({
        vendorId: r.vendor_id,
        businessName: r.business_name,
        city: r.city,
        redemptions: Number(r.redemptions),
        revenue: Number(r.revenue),
        offersCount: Number(r.offers_count),
      })),
      revenueTrend: revenueTrend.map(r => ({
        date: r.date,
        redemptions: Number(r.redemptions),
        value: Number(r.value),
      })),
    };
    await cache.set(ck, result, 300);
    return result;
  },

  async getExportCSV(params: {
    from?: string;
    to?: string;
    type: 'redemptions' | 'vendors' | 'offers';
  }) {
    const now = new Date();
    const fromDate = params.from ? new Date(params.from) : new Date(now.getTime() - 30 * 86400000);
    const toDate = params.to ? new Date(params.to + 'T23:59:59.999Z') : now;

    if (params.type === 'redemptions') {
      const data = await prisma.$queryRaw<any[]>`
        SELECT r.id, r.created_at as date, vo.title as offer, v.business_name as vendor,
               v.city, vo.discount_value as value
        FROM redemptions r
        JOIN vendor_offers vo ON r.offer_id = vo.id
        JOIN vendors v ON vo.vendor_id = v.id
        WHERE r.status = 'VERIFIED' AND r.created_at >= ${fromDate} AND r.created_at <= ${toDate}
        ORDER BY r.created_at DESC
      `;
      const header = 'ID,Date,Offer,Vendor,City,Value\n';
      const rows = data.map(r => `${r.id},${r.date},${csvSafe(r.offer).replace(/,/g,'')},${csvSafe(r.vendor).replace(/,/g,'')},${r.city},${r.value}`).join('\n');
      return header + rows;
    }

    if (params.type === 'vendors') {
      const data = await prisma.$queryRaw<any[]>`
        SELECT v.id, v.business_name, v.city, v.status, v.created_at as date,
               COUNT(DISTINCT vo.id) as offers, COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'VERIFIED') as redemptions
        FROM vendors v
        LEFT JOIN vendor_offers vo ON vo.vendor_id = v.id
        LEFT JOIN redemptions r ON r.offer_id = vo.id
        GROUP BY v.id, v.business_name, v.city, v.status, v.created_at
        ORDER BY redemptions DESC
      `;
      const header = 'ID,Business Name,City,Status,Date,Offers,Redemptions\n';
      const rows = data.map(r => `${r.id},${csvSafe(r.business_name).replace(/,/g,'')},${r.city},${r.status},${r.date},${r.offers},${r.redemptions}`).join('\n');
      return header + rows;
    }

    return '';
  },
};
