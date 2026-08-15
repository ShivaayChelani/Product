import { prisma } from '../../../config/database';
import { cache, cacheKey } from '../../../config/cache';
import { mapViewportRow, placeApproved, resolvePlace } from './places.helpers';

export const placesRecommendationService = {
  async getRecommendations(placeIdOrSlug: string, limit: number = 10) {
    const { id: placeId } = await resolvePlace(placeIdOrSlug);
    const ck = cacheKey('places', 'recommendations', placeId);
    const cached = await cache.get<any[]>(ck);
    if (cached) return cached;

    const raw: any[] = await prisma.$queryRaw`
      WITH likers AS (
        SELECT DISTINCT ps."userId"
        FROM place_stats ps
        WHERE ps."placeId" = ${placeId}
          AND ps.action IN ('like', 'save')
          AND ps."userId" IS NOT NULL
      ),
      similar_places AS (
        SELECT
          ps."placeId" AS place_id,
          COUNT(DISTINCT ps."userId") AS affinity
        FROM place_stats ps
        JOIN likers l ON l."userId" = ps."userId"
        JOIN places ps_other ON ps_other.id = ps."placeId"
        WHERE ps."placeId" != ${placeId}
          AND ps.action IN ('like', 'save')
          AND ps_other.status = ${placeApproved}
          AND ps_other.category::text NOT IN ('SHOPPING', 'RESTAURANT', 'HOTEL')
        GROUP BY ps."placeId"
      )
      SELECT
        p.id, p.name, p.slug, p.short_description, p.latitude, p.longitude,
        p.category, p.images, p.thumbnail, p.tags, p.city, p.state, p.country,
        p.rating, p.review_count, p.popularity_score,
        p.best_time_to_visit, p.best_time_reason, p.created_at,
        sp.affinity
      FROM similar_places sp
      JOIN places p ON p.id = sp.place_id
      ORDER BY sp.affinity DESC
      LIMIT ${limit}
    `;

    const result = raw.map((r: any) => ({
      ...mapViewportRow(r),
      affinity: Number(r.affinity),
    }));

    await cache.set(ck, result, 600);
    return result;
  },
};
