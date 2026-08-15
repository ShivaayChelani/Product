import { Prisma, PlaceSource } from '@prisma/client';
import { hasProperPlaceName, isJunkPlaceName } from './placeNameQuality';

/** Categories people actually travel for — not neighbourhood parks or shops. */
export const TOURIST_CATEGORIES = [
  'monument',
  'fort',
  'palace',
  'temple',
  'mosque',
  'church',
  'gurudwara',
  'waterfall',
  'beach',
  'lake',
  'museum',
  'trek',
  'ghat',
  'market',
  'adventure',
  'heritage',
  'national_park',
  'wildlife',
  'sanctuary',
  'cave',
  'caves',
  'dam',
  'viewpoint',
  'hill_station',
  'island',
  'pilgrimage',
  'zoo',
  'fortress',
  'ruins',
  'archaeological_site',
] as const;

const SMALL_PARK_NAME = [
  /neighbourhood\s+park/i,
  /neighborhood\s+park/i,
  /children'?s?\s+park/i,
  /community\s+park/i,
  /local\s+park/i,
  /municipal\s+park/i,
  /play\s*ground/i,
  /jogging\s+track/i,
  /ward\s+\d+\s+park/i,
  /sector\s+\d+\s+park/i,
];

const MAJOR_PARK_SIGNAL = [
  /national\s+park/i,
  /wildlife\s+sanctuary/i,
  /bird\s+sanctuary/i,
  /tiger\s+reserve/i,
  /biosphere/i,
  /zoo/i,
  /safari/i,
  /botanical\s+garden/i,
  /heritage\s+park/i,
  /marine\s+park/i,
];

const TRUSTED_SOURCES: PlaceSource[] = [
  PlaceSource.CURATED,
  PlaceSource.ADMIN,
];

export type TouristPlaceLike = {
  name: string;
  category: string;
  source?: string | null;
  editorialPriority?: number | null;
  tags?: string[] | null;
  description?: string | null;
};

export function isMajorParkOrWildlife(name: string, tags?: string[] | null): boolean {
  if (MAJOR_PARK_SIGNAL.some((re) => re.test(name))) return true;
  const tagStr = (tags || []).join(' ').toLowerCase();
  return /national_park|wildlife|sanctuary|tiger|unesco|heritage/.test(tagStr);
}

export function isSmallLocalPark(place: TouristPlaceLike): boolean {
  const cat = String(place.category || '').toLowerCase();
  if (cat !== 'park' && cat !== 'garden' && cat !== 'other') return false;

  const name = String(place.name || '');
  if (isMajorParkOrWildlife(name, place.tags)) return false;

  if (SMALL_PARK_NAME.some((re) => re.test(name))) return true;

  const src = String(place.source || '').toUpperCase();
  if (TRUSTED_SOURCES.includes(src as PlaceSource)) return false;

  const priority = place.editorialPriority ?? 3;
  if (priority >= 4) return false;

  if (cat === 'park' || cat === 'garden') return true;

  if (cat === 'other' && name.length < 12 && (place.description?.length ?? 0) < 40) return true;

  return false;
}

export function isTouristWorthyPlace(place: TouristPlaceLike): boolean {
  const name = String(place.name || '').trim();
  if (!hasProperPlaceName(name)) return false;

  const catUpper = String(place.category || '').toUpperCase();
  if (['SHOPPING', 'RESTAURANT', 'HOTEL'].includes(catUpper)) return false;

  const slugCat = String(place.category || '').toLowerCase();
  if (isSmallLocalPark(place)) return false;

  const src = String(place.source || '').toUpperCase();
  const isTrusted = TRUSTED_SOURCES.includes(src as PlaceSource);

  // Wikidata/OSM must pass name quality; curated/admin get more leeway
  if (!isTrusted && isJunkPlaceName(name)) return false;

  if ((TOURIST_CATEGORIES as readonly string[]).includes(slugCat)) {
    // Temple/mosque etc. from bulk imports still need a real name, not "108 temples"
    if (!isTrusted && !hasProperPlaceName(name)) return false;
    return true;
  }

  if (isMajorParkOrWildlife(name, place.tags)) return true;

  if (isTrusted) return true;

  if ((place.editorialPriority ?? 0) >= 4) return true;

  return false;
}

/** Prisma filter — coarse DB pre-filter; name junk is refined in filterTouristPlaces(). */
export function touristPlacePrismaWhere(): Prisma.PlaceWhereInput {
  return {
    NOT: { category: { in: ['shopping', 'restaurant', 'hotel'], mode: 'insensitive' } },
    AND: [
      {
        NOT: {
          OR: [
            { name: { contains: 'neighbourhood park', mode: 'insensitive' } },
            { name: { contains: 'neighborhood park', mode: 'insensitive' } },
            { name: { contains: 'children park', mode: 'insensitive' } },
            { name: { contains: 'community park', mode: 'insensitive' } },
            { name: { contains: 'playground', mode: 'insensitive' } },
            { name: { contains: 'jogging track', mode: 'insensitive' } },
          ],
        },
      },
      {
        OR: [
          { category: { in: [...TOURIST_CATEGORIES], mode: 'insensitive' } },
          { source: { in: TRUSTED_SOURCES } },
          { editorialPriority: { gte: 4 } },
          { name: { contains: 'National Park', mode: 'insensitive' } },
          { name: { contains: 'Wildlife', mode: 'insensitive' } },
          { name: { contains: 'Sanctuary', mode: 'insensitive' } },
          { name: { contains: 'Tiger', mode: 'insensitive' } },
          { name: { contains: 'Fort', mode: 'insensitive' } },
          { name: { contains: 'Palace', mode: 'insensitive' } },
          { name: { contains: 'Temple', mode: 'insensitive' } },
          { name: { contains: 'Waterfall', mode: 'insensitive' } },
          { name: { contains: 'Beach', mode: 'insensitive' } },
          {
            AND: [
              { category: { equals: 'park', mode: 'insensitive' } },
              {
                OR: [
                  { source: { in: TRUSTED_SOURCES } },
                  { editorialPriority: { gte: 4 } },
                  { name: { contains: 'National', mode: 'insensitive' } },
                  { name: { contains: 'Wildlife', mode: 'insensitive' } },
                  { name: { contains: 'Zoo', mode: 'insensitive' } },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

export function filterTouristPlaces<T extends TouristPlaceLike>(rows: T[]): T[] {
  return rows.filter(isTouristWorthyPlace);
}

function flattenWhereParts(where: Prisma.PlaceWhereInput): Prisma.PlaceWhereInput[] {
  if (!where || Object.keys(where).length === 0) return [];
  const parts: Prisma.PlaceWhereInput[] = [];
  if (where.AND) {
    const nested = Array.isArray(where.AND) ? where.AND : [where.AND];
    for (const part of nested) {
      parts.push(...flattenWhereParts(part));
    }
  }
  const { AND: _omit, ...rest } = where;
  if (Object.keys(rest).length > 0) parts.push(rest);
  return parts;
}

export function mergePlaceWhere(
  base: Prisma.PlaceWhereInput,
  extra: Prisma.PlaceWhereInput,
): Prisma.PlaceWhereInput {
  const andParts = [...flattenWhereParts(base), ...flattenWhereParts(extra)];
  if (andParts.length === 0) return {};
  if (andParts.length === 1) return andParts[0];
  return { AND: andParts };
}
