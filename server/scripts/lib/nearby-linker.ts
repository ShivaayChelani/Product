/**
 * PostGIS proximity linking by POI category. Uses canonical Place records only.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../src/config/database';

export type NearbyCategory =
  | 'attraction'
  | 'hotel'
  | 'restaurant'
  | 'parking'
  | 'hospital'
  | 'fuel';

type CategoryConfig = {
  radiusM: number;
  limit: number;
  /** Match if category/subcategory ILIKE any pattern OR tags overlap. */
  categoryPatterns: string[];
  tagPatterns: string[];
};

export const NEARBY_CATEGORY_CONFIG: Record<NearbyCategory, CategoryConfig> = {
  attraction: {
    radiusM: 15000,
    limit: 8,
    categoryPatterns: ['museum', 'monument', 'temple', 'fort', 'park', 'beach', 'wildlife', 'heritage', 'attraction'],
    tagPatterns: ['museum', 'monument', 'attraction', 'viewpoint', 'archaeological', 'heritage'],
  },
  hotel: {
    radiusM: 8000,
    limit: 6,
    categoryPatterns: ['hotel', 'lodging', 'guest', 'resort', 'hostel'],
    tagPatterns: ['hotel', 'guest_house', 'hostel', 'motel', 'resort'],
  },
  restaurant: {
    radiusM: 5000,
    limit: 6,
    categoryPatterns: ['restaurant', 'food', 'cafe', 'dining'],
    tagPatterns: ['restaurant', 'cafe', 'fast_food', 'food_court'],
  },
  parking: {
    radiusM: 3000,
    limit: 4,
    categoryPatterns: ['parking'],
    tagPatterns: ['parking', 'car_park'],
  },
  hospital: {
    radiusM: 15000,
    limit: 4,
    categoryPatterns: ['hospital', 'clinic', 'medical'],
    tagPatterns: ['hospital', 'clinic', 'doctors', 'healthcare'],
  },
  fuel: {
    radiusM: 10000,
    limit: 4,
    categoryPatterns: ['fuel', 'petrol', 'gas'],
    tagPatterns: ['fuel', 'petrol', 'gas_station'],
  },
};

function buildCategoryFilter(cfg: CategoryConfig): Prisma.Sql {
  const catConds = cfg.categoryPatterns.map(
    (p) => Prisma.sql`(LOWER(p.category) LIKE ${'%' + p.toLowerCase() + '%'} OR LOWER(COALESCE(p.subcategory, '')) LIKE ${'%' + p.toLowerCase() + '%'})`,
  );
  const tagConds = cfg.tagPatterns.map(
    (t) => Prisma.sql`EXISTS (SELECT 1 FROM unnest(p.tags) AS tag WHERE LOWER(tag) LIKE ${'%' + t.toLowerCase() + '%'})`,
  );
  const all = [...catConds, ...tagConds];
  if (!all.length) return Prisma.sql`TRUE`;
  return Prisma.join(all, ' OR ');
}

export async function linkNearbyByCategories(
  placeId: string,
  lat: number,
  lng: number,
  dryRun: boolean,
  categories: NearbyCategory[] = ['attraction', 'hotel', 'restaurant', 'parking', 'hospital', 'fuel'],
): Promise<Record<NearbyCategory, number>> {
  const counts = {} as Record<NearbyCategory, number>;

  for (const cat of categories) {
    const cfg = NEARBY_CATEGORY_CONFIG[cat];
    const categoryFilter = buildCategoryFilter(cfg);

    const neighbors = await prisma.$queryRaw<{ id: string; name: string; dist_m: number }[]>`
      SELECT p.id, p.name,
        ST_Distance(
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ST_SetSRID(ST_MakePoint(p.longitude, p.latitude), 4326)::geography
        ) AS dist_m
      FROM places p
      WHERE p.merged_into_id IS NULL
        AND p.id <> ${placeId}
        AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
        AND ST_DWithin(
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ST_SetSRID(ST_MakePoint(p.longitude, p.latitude), 4326)::geography,
          ${cfg.radiusM}
        )
        AND (${categoryFilter})
      ORDER BY dist_m ASC
      LIMIT ${cfg.limit}`;

    counts[cat] = neighbors.length;

    if (!neighbors.length || dryRun) continue;

    for (const n of neighbors) {
      await prisma.placeRelationship.upsert({
        where: {
          fromPlaceId_toPlaceId_relationshipType: {
            fromPlaceId: placeId,
            toPlaceId: n.id,
            relationshipType: 'NEARBY',
          },
        },
        create: {
          fromPlaceId: placeId,
          toPlaceId: n.id,
          relationshipType: 'NEARBY',
          metadata: {
            distM: Math.round(n.dist_m),
            nearbyCategory: cat,
            source: 'postgis_category_proximity',
          },
        },
        update: {
          metadata: {
            distM: Math.round(n.dist_m),
            nearbyCategory: cat,
            source: 'postgis_category_proximity',
          },
        },
      });
    }
  }

  return counts;
}
