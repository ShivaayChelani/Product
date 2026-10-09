import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { publicVerifiedRawSqlSuffix } from '../places/services/places-public-visibility';
import {
  filterEligiblePublicOffers,
  publicVendorOffersWhere,
} from '../rewards/offer-eligibility';
import { getPublicVendorListingWhere } from '../vendors/vendor-public-visibility';
import { collapseRepeats, scoreAdminMatch, scorePlaceSearchMatch } from './search-ranking';
import { publicEventWhere } from '../events/events-public-visibility';

async function searchPlacesFuzzy(opts: {
  q: string;
  qCollapsed: string;
  fuzzyMin: number;
  limit: number;
  hiddenGem: boolean;
}) {
  const { q, qCollapsed, fuzzyMin, limit, hiddenGem } = opts;
  const verifiedSuffix = publicVerifiedRawSqlSuffix({ includeApprovedHiddenGems: hiddenGem });
  const sourceClause = hiddenGem
    ? `source = 'HIDDEN_GEM'`
    : `source != 'HIDDEN_GEM'`;

  try {
    return await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT id, name, slug, short_description as "shortDescription", thumbnail, category, city, state, district,
             canonical_name as "canonicalName", rating, review_count as "reviewCount",
             GREATEST(
               CASE WHEN lower(name) = lower($1) OR lower(COALESCE(canonical_name, '')) = lower($1) THEN 4.0 ELSE 0 END,
               CASE WHEN lower(name) LIKE lower($1) || '%' THEN 3.4 ELSE 0 END,
               CASE WHEN name ILIKE '%' || $1 || '%' THEN 3.0 ELSE 0 END,
               CASE WHEN lower(COALESCE(city, '')) = lower($1) THEN 2.6 ELSE 0 END,
               CASE WHEN lower(COALESCE(district, '')) = lower($1) THEN 2.4 ELSE 0 END,
               CASE WHEN lower(COALESCE(state, '')) = lower($1) THEN 2.2 ELSE 0 END,
               CASE WHEN city ILIKE '%' || $1 || '%' THEN 1.9 ELSE 0 END,
               CASE WHEN district ILIKE '%' || $1 || '%' THEN 1.7 ELSE 0 END,
               CASE WHEN state ILIKE '%' || $1 || '%' THEN 1.5 ELSE 0 END,
               CASE WHEN EXISTS (
                 SELECT 1 FROM place_aliases pa
                 WHERE pa.place_id = places.id
                   AND pa.normalized_alias = lower(regexp_replace(trim($1), '[^[:alnum:][:space:]]+', ' ', 'g'))
               ) THEN 2.5 ELSE 0 END,
               CASE WHEN EXISTS (
                 SELECT 1 FROM place_aliases pa
                 WHERE pa.place_id = places.id
                   AND pa.alias ILIKE '%' || $1 || '%'
               ) THEN 1.6 ELSE 0 END,
               0.7 * COALESCE(ts_rank(search_vector, plainto_tsquery('english', $1)), 0),
               0.4 * COALESCE(word_similarity($1, name), 0),
               0.3 * COALESCE(similarity(lower(name), lower($1)), 0)
             ) AS rank
      FROM places
      WHERE status = 'APPROVED'
        AND merged_into_id IS NULL${verifiedSuffix}
        AND ${sourceClause}
        AND category::text NOT IN ('SHOPPING', 'RESTAURANT', 'HOTEL')
        AND (
          search_vector @@ plainto_tsquery('english', $1)
          OR city ILIKE '%' || $1 || '%'
          OR district ILIKE '%' || $1 || '%'
          OR state ILIKE '%' || $1 || '%'
          OR name ILIKE '%' || $1 || '%'
          OR lower(COALESCE(canonical_name, '')) LIKE lower($1) || '%'
          OR regexp_replace(lower(name), '([a-z])\\1+', '\\1', 'g') LIKE '%' || $2 || '%'
          OR word_similarity($1, name) >= $3
          OR similarity(lower(name), lower($1)) >= $3
          OR EXISTS (
            SELECT 1 FROM place_aliases pa
            WHERE pa.place_id = places.id
              AND (
                pa.normalized_alias = lower(regexp_replace(trim($1), '[^[:alnum:][:space:]]+', ' ', 'g'))
                OR pa.alias ILIKE '%' || $1 || '%'
                OR word_similarity($1, pa.alias) >= $3
              )
          )
          OR public_place_id ILIKE '%' || $1 || '%'
        )
      ORDER BY rank DESC NULLS LAST, name ASC
      LIMIT $4
      `,
      q,
      qCollapsed,
      fuzzyMin,
      limit,
    );
  } catch {
    // pg_trgm not available — still match soft spellings via collapsed letters
    return prisma.$queryRawUnsafe<any[]>(
      `
      SELECT id, name, slug, short_description as "shortDescription", thumbnail, category, city, state, district,
             canonical_name as "canonicalName", rating, review_count as "reviewCount",
             GREATEST(
               CASE WHEN lower(name) = lower($1) OR lower(COALESCE(canonical_name, '')) = lower($1) THEN 4.0 ELSE 0 END,
               CASE WHEN lower(name) LIKE lower($1) || '%' THEN 3.4 ELSE 0 END,
               CASE WHEN name ILIKE '%' || $1 || '%' THEN 3.0 ELSE 0 END,
               CASE WHEN lower(COALESCE(city, '')) = lower($1) THEN 2.6 ELSE 0 END,
               CASE WHEN lower(COALESCE(district, '')) = lower($1) THEN 2.4 ELSE 0 END,
               CASE WHEN lower(COALESCE(state, '')) = lower($1) THEN 2.2 ELSE 0 END,
               CASE WHEN city ILIKE '%' || $1 || '%' THEN 1.9 ELSE 0 END,
               CASE WHEN district ILIKE '%' || $1 || '%' THEN 1.7 ELSE 0 END,
               CASE WHEN state ILIKE '%' || $1 || '%' THEN 1.5 ELSE 0 END,
               COALESCE(ts_rank(search_vector, plainto_tsquery('english', $1)), 0)
             ) AS rank
      FROM places
      WHERE status = 'APPROVED'
        AND merged_into_id IS NULL${verifiedSuffix}
        AND ${sourceClause}
        AND category::text NOT IN ('SHOPPING', 'RESTAURANT', 'HOTEL')
        AND (
          search_vector @@ plainto_tsquery('english', $1)
          OR city ILIKE '%' || $1 || '%'
          OR district ILIKE '%' || $1 || '%'
          OR state ILIKE '%' || $1 || '%'
          OR name ILIKE '%' || $1 || '%'
          OR lower(COALESCE(canonical_name, '')) LIKE lower($1) || '%'
          OR regexp_replace(lower(name), '([a-z])\\1+', '\\1', 'g') LIKE '%' || $2 || '%'
        )
      ORDER BY rank DESC NULLS LAST, name ASC
      LIMIT $3
      `,
      q,
      qCollapsed,
      limit,
    );
  }
}

export const searchService = {
  async universalSearch(userId: string | undefined, query: any) {
    const q = query.q?.trim();
    if (!q) {
      return {
        places: [],
        vendors: [],
        reels: [],
        creators: [],
        events: [],
        offers: [],
      };
    }

    const parsed = parseInt(query.limit || '10', 10);
    const limit = Number.isFinite(parsed) ? Math.min(50, Math.max(1, parsed)) : 10;
    const qCollapsed = collapseRepeats(q);
    // Fuzzy threshold: keep controlled typo tolerance (nidaan ↔ Nidan) while
    // rejecting unrelated near-miss names (e.g. Kundalpur for "Jabalpur").
    const fuzzyMin = q.length <= 4 ? 0.5 : 0.45;

    // Parallel searches
    const [
      placesRaw,
      hiddenGemsRaw,
      reelsRaw,
      vendors,
      creators,
      events,
      offersRaw,
    ] = await Promise.all([
      searchPlacesFuzzy({ q, qCollapsed, fuzzyMin, limit, hiddenGem: false }),
      searchPlacesFuzzy({ q, qCollapsed, fuzzyMin, limit, hiddenGem: true }),

      // Reels
      (async () => {
        try {
          return await prisma.$queryRaw<any[]>`
            SELECT id, video_url as "videoUrl", thumbnail, title, description, views, likes, category, tags, created_at as "createdAt",
                   ts_rank(search_vector, plainto_tsquery('english', ${q})) AS rank
            FROM reels
            WHERE status = 'APPROVED'
              AND (
                search_vector @@ plainto_tsquery('english', ${q})
                OR title ILIKE ${'%' + q + '%'}
                OR regexp_replace(lower(COALESCE(title, '')), '([a-z])\\1+', '\\1', 'g')
                     LIKE ${'%' + qCollapsed + '%'}
              )
            ORDER BY rank DESC NULLS LAST
            LIMIT ${limit}
          `;
        } catch {
          return [] as any[];
        }
      })(),

      // Vendors
      (async () => {
        try {
          return await prisma.$queryRawUnsafe<any[]>(
            `
            SELECT id, business_name as "businessName", business_type as "businessType", city, image_url as "imageUrl", description
            FROM vendors
            WHERE status = 'APPROVED'
              AND suspended_at IS NULL
              AND EXISTS (
                SELECT 1 FROM user_subscriptions us
                WHERE us.user_id = vendors.user_id
                  AND us.audience = 'VENDOR'
                  AND us.status IN ('ACTIVE', 'TRIALING')
                  AND us.current_period_end >= NOW()
              )
              AND (
                business_name ILIKE '%' || $1 || '%'
                OR description ILIKE '%' || $1 || '%'
                OR city ILIKE '%' || $1 || '%'
                OR word_similarity($1, business_name) >= $3
                OR regexp_replace(lower(business_name), '([a-z])\\1+', '\\1', 'g') LIKE '%' || $2 || '%'
              )
            ORDER BY word_similarity($1, business_name) DESC NULLS LAST, business_name ASC
            LIMIT $4
            `,
            q,
            qCollapsed,
            fuzzyMin,
            limit,
          );
        } catch {
          return prisma.vendor.findMany({
            where: {
              ...getPublicVendorListingWhere(),
              AND: [
                {
                  OR: [
                    { businessName: { contains: q, mode: 'insensitive' } },
                    { description: { contains: q, mode: 'insensitive' } },
                    { city: { contains: q, mode: 'insensitive' } },
                  ],
                },
              ],
            },
            select: { id: true, businessName: true, businessType: true, city: true, imageUrl: true, description: true },
            take: limit,
          });
        }
      })(),

      // Creators
      prisma.creatorProfile.findMany({
        where: {
          status: 'APPROVED',
          OR: [
            { username: { contains: q, mode: 'insensitive' } },
            { fullName: { contains: q, mode: 'insensitive' } },
            { bio: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, username: true, fullName: true, avatar: true, bio: true, followerCount: true, verified: true },
        take: limit,
      }),

      // Events — read from the standalone `events` table, NOT the archived
      // `place_events`. Searching the legacy table was one of the audit's
      // contract defects: it returned rows with no moderation status and no
      // coordinates, and it silently missed every event created through the
      // Community Events API. `publicEventWhere()` supplies the same gate the
      // map and list use, so search can never surface a PENDING event.
      prisma.event.findMany({
        where: {
          ...publicEventWhere(),
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
            { city: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          eventType: true,
          startDate: true,
          endDate: true,
          startTime: true,
          endTime: true,
          latitude: true,
          longitude: true,
          coverImage: true,
          city: true,
          state: true,
          linkedPlaceId: true,
          linkedVendorId: true,
        },
        orderBy: [{ startDate: 'asc' }],
        take: limit,
      }),

      // Offers — same public eligibility as rewards catalog
      prisma.vendorOffer.findMany({
        where: {
          ...publicVendorOffersWhere(),
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
          ],
        },
        include: {
          vendor: {
            select: {
              id: true,
              businessName: true,
              city: true,
              state: true,
              status: true,
              subscriptionStatus: true,
              suspendedAt: true,
              latitude: true,
              longitude: true,
            },
          },
        },
        take: Math.min(limit * 3, 60),
      }),
    ]);

    const offers = filterEligiblePublicOffers(offersRaw).slice(0, limit).map((o) => ({
      id: o.id,
      title: o.title,
      description: o.description,
      imageUrl: o.imageUrl,
      discountValue: o.discountValue,
      discountType: o.discountType,
      pointsRequired: o.pointsRequired,
    }));

    // Normalize the event rows onto the field names the client already consumes
    // (`imageUrl`, `placeId`) while exposing the new ones. Emitting the raw
    // `events` columns instead would break SearchScreen, which destructures
    // `imageUrl` — one of the audit's reported contract mismatches.
    const normalizedEvents = events.map((e) => ({
      id: e.id,
      slug: e.slug,
      title: e.title,
      description: e.description,
      imageUrl: e.coverImage,
      coverImage: e.coverImage,
      eventType: e.eventType,
      startDate: e.startDate,
      endDate: e.endDate,
      startTime: e.startTime,
      endTime: e.endTime,
      latitude: e.latitude,
      longitude: e.longitude,
      city: e.city,
      state: e.state,
      placeId: e.linkedPlaceId,
      vendorId: e.linkedVendorId,
    }));

    // Deterministic final ordering: exact/prefix/containment on the name or the
    // city/district/state must always beat a weak fuzzy name-only match, so a
    // result is never surfaced merely for sharing a coincidental substring.
    const rerankPlaces = (rows: any[]) =>
      [...rows]
        .map((row, index) => ({ row, index, score: scorePlaceSearchMatch(q, row) }))
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map((entry) => entry.row);
    const places = rerankPlaces(placesRaw);
    const hiddenGems = rerankPlaces(hiddenGemsRaw);

    const totalResults = places.length + hiddenGems.length + reelsRaw.length + vendors.length + creators.length + normalizedEvents.length + offers.length;

    // Log the search
    await prisma.searchQueryLog.create({
      data: {
        query: q,
        userId: userId || null,
        resultCount: totalResults,
      },
    }).catch(err => logger.warn({ err, query: q }, 'Failed to log search query'));

    return {
      places,
      hiddenGems,
      reels: reelsRaw,
      vendors,
      creators,
      events: normalizedEvents,
      offers,
      meta: {
        query: q,
        totalResults,
      }
    };
  },

  async getTrendingKeywords() {
    // Basic trending: count recent queries
    const recentLogs = await prisma.searchQueryLog.groupBy({
      by: ['query'],
      _count: { query: true },
      orderBy: { _count: { query: 'desc' } },
      take: 10,
    });
    
    return recentLogs.map(l => ({ keyword: l.query, count: l._count.query }));
  },

  async getSearchAnalytics() {
    const totalSearches = await prisma.searchQueryLog.count();
    const failedSearches = await prisma.searchQueryLog.count({ where: { resultCount: 0 } });
    
    const failedLogs = await prisma.searchQueryLog.groupBy({
      by: ['query'],
      where: { resultCount: 0 },
      _count: { query: true },
      orderBy: { _count: { query: 'desc' } },
      take: 20,
    });

    const popularLogs = await prisma.searchQueryLog.groupBy({
      by: ['query'],
      where: { resultCount: { gt: 0 } },
      _count: { query: true },
      orderBy: { _count: { query: 'desc' } },
      take: 20,
    });

    return {
      totalSearches,
      failedSearches,
      failedKeywords: failedLogs.map(l => ({ keyword: l.query, count: l._count.query })),
      popularKeywords: popularLogs.map(l => ({ keyword: l.query, count: l._count.query })),
    };
  },

  async adminGlobalSearch(q: string) {
    const query = q?.trim();
    if (!query) {
      return { places: [], users: [], vendors: [] };
    }
    const [places, users, vendors] = await Promise.all([
      prisma.place.findMany({
        where: {
          mergedIntoId: null,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { publicPlaceId: { contains: query, mode: 'insensitive' } },
            { city: { contains: query, mode: 'insensitive' } },
            { state: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          publicPlaceId: true,
          name: true,
          state: true,
          city: true,
          dataQuality: true,
          status: true,
        },
        take: 25,
      }),
      prisma.user.findMany({
        where: {
          OR: [
            { email: { contains: query, mode: 'insensitive' } },
            { name: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: { id: true, email: true, name: true, permission: true },
        take: 15,
      }),
      prisma.vendor.findMany({
        where: { businessName: { contains: query, mode: 'insensitive' } },
        select: { id: true, businessName: true, city: true, status: true },
        take: 15,
      }),
    ]);

    // Rank each list by relevance (exact → prefix → token → substring) so a
    // precise name match surfaces before loose "contains" hits. Entity limits
    // (25/15/15) are preserved exactly.
    const rankedPlaces = [...places].sort(
      (a, b) =>
        scoreAdminMatch(query, b.name, b.publicPlaceId, b.city, b.state)
        - scoreAdminMatch(query, a.name, a.publicPlaceId, a.city, a.state),
    );
    const rankedUsers = [...users].sort(
      (a, b) =>
        scoreAdminMatch(query, b.name, b.email)
        - scoreAdminMatch(query, a.name, a.email),
    );
    const rankedVendors = [...vendors].sort(
      (a, b) =>
        scoreAdminMatch(query, b.businessName, b.city)
        - scoreAdminMatch(query, a.businessName, a.city),
    );

    return {
      places: rankedPlaces.slice(0, 25),
      users: rankedUsers.slice(0, 15),
      vendors: rankedVendors.slice(0, 15),
    };
  },
};
