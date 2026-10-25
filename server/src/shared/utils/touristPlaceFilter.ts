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
  'mall',
] as const;

/**
 * Shops, cafés, restaurants and hotels are vendor businesses and live in the
 * Vendors module. The one exception is a market area / mall: tourists travel
 * to Sarojini Nagar, Johari Bazaar or a city's main mall, so those stay Places.
 */
export const COMMERCIAL_BUSINESS_CATEGORIES = ['SHOPPING', 'RESTAURANT', 'HOTEL'] as const;

/** Place categories that describe a market area rather than a single shop. */
export const MARKET_AREA_CATEGORIES = ['market', 'mall', 'shopping_mall', 'bazaar'] as const;

/** Words that mark a SHOPPING-category row as a market area / mall, not one shop. */
const MARKET_AREA_WORDS = ['mall', 'market', 'bazaar', 'bazar', 'haat', 'chowk', 'emporium'] as const;
const MARKET_AREA_NAME = new RegExp(`\\b(${MARKET_AREA_WORDS.join('|')})\\b`, 'i');

export const VENDOR_PLACE_EXTERNAL_ID_PREFIX = 'vendor:';

export type CommercialPlaceLike = {
  name?: string | null;
  category?: string | null;
  subcategory?: string | null;
  tags?: string[] | null;
  source?: string | null;
  externalId?: string | null;
};

/** A Place row that mirrors a Vendor business (created for itinerary quick-add). */
export function isVendorPlace(place: Pick<CommercialPlaceLike, 'source' | 'externalId'>): boolean {
  if (String(place.source || '').toUpperCase() === PlaceSource.VENDOR) return true;
  return String(place.externalId || '').startsWith(VENDOR_PLACE_EXTERNAL_ID_PREFIX);
}

/** Markets, bazaars and malls are destinations; a single shop is not. */
export function isMarketArea(place: CommercialPlaceLike): boolean {
  const cat = String(place.category || '').toLowerCase().trim();
  if ((MARKET_AREA_CATEGORIES as readonly string[]).includes(cat)) return true;
  if (cat !== 'shopping') return false;
  if (MARKET_AREA_NAME.test(String(place.name || ''))) return true;
  if (MARKET_AREA_NAME.test(String(place.subcategory || ''))) return true;
  return (place.tags || []).some((tag) => MARKET_AREA_NAME.test(String(tag)));
}

/**
 * True when the row is a vendor business (shop / restaurant / hotel) that
 * belongs in the Vendors tab, never in Places. Malls and market areas pass.
 */
export function isCommercialBusinessPlace(place: CommercialPlaceLike): boolean {
  if (isVendorPlace(place)) return true;
  const cat = String(place.category || '').toUpperCase().trim();
  if (!(COMMERCIAL_BUSINESS_CATEGORIES as readonly string[]).includes(cat)) return false;
  return !isMarketArea(place);
}

/**
 * Prisma filter equivalent of `!isCommercialBusinessPlace`. Safe to spread into
 * a `where` that has no `AND` of its own, or merge with `mergePlaceWhere`.
 */
export function nonCommercialPlaceWhere(): Prisma.PlaceWhereInput {
  const marketAreaName: Prisma.PlaceWhereInput[] = MARKET_AREA_WORDS.flatMap((word) => [
    { name: { contains: word, mode: 'insensitive' } },
    { subcategory: { contains: word, mode: 'insensitive' } },
  ]);
  return {
    AND: [
      { NOT: { source: PlaceSource.VENDOR } },
      {
        OR: [
          { externalId: null },
          { NOT: { externalId: { startsWith: VENDOR_PLACE_EXTERNAL_ID_PREFIX } } },
        ],
      },
      {
        OR: [
          { NOT: { category: { in: [...COMMERCIAL_BUSINESS_CATEGORIES], mode: 'insensitive' } } },
          {
            AND: [
              { category: { equals: 'shopping', mode: 'insensitive' } },
              { OR: marketAreaName },
            ],
          },
        ],
      },
    ],
  };
}

const MARKET_AREA_SQL_REGEX = `(^|[^[:alpha:]])(${MARKET_AREA_WORDS.join('|')})([^[:alpha:]]|$)`;

/**
 * Raw-SQL twin of `nonCommercialPlaceWhere` as plain text, for `$queryRawUnsafe`
 * strings. `alias` is the places table alias in the query (e.g. `p`, `places`)
 * and must be a code constant, never user input.
 */
export function nonCommercialPlaceSqlText(alias: string = 'p'): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error(`Invalid SQL alias: ${alias}`);
  const cats = COMMERCIAL_BUSINESS_CATEGORIES.map((c) => `'${c}'`).join(', ');
  return `(
    ${alias}.source::text <> 'VENDOR'
    AND COALESCE(${alias}.external_id, '') NOT LIKE 'vendor:%'
    AND (
      UPPER(${alias}.category::text) NOT IN (${cats})
      OR (
        UPPER(${alias}.category::text) = 'SHOPPING'
        AND (
          ${alias}.name ~* '${MARKET_AREA_SQL_REGEX}'
          OR COALESCE(${alias}.subcategory, '') ~* '${MARKET_AREA_SQL_REGEX}'
        )
      )
    )
  )`;
}

/** Tagged-template version of `nonCommercialPlaceSqlText` for `prisma.$queryRaw`. */
export function nonCommercialPlaceSqlFor(alias: string = 'p'): Prisma.Sql {
  return Prisma.raw(nonCommercialPlaceSqlText(alias));
}

/** Shared clause for the `p`-aliased places queries. */
export const nonCommercialPlaceSql = nonCommercialPlaceSqlFor('p');

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
  externalId?: string | null;
  subcategory?: string | null;
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

  // Vendor businesses (shops, cafés, hotels) belong to the Vendors module.
  if (isCommercialBusinessPlace(place)) return false;

  const slugCat = String(place.category || '').toLowerCase();
  if (isSmallLocalPark(place)) return false;

  const src = String(place.source || '').toUpperCase();
  const isTrusted = TRUSTED_SOURCES.includes(src as PlaceSource);

  // Wikidata/OSM must pass name quality; curated/admin get more leeway
  if (!isTrusted && isJunkPlaceName(name)) return false;

  // Market areas and malls are destinations even when categorised as SHOPPING.
  if (isMarketArea(place)) return true;

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
    AND: [
      nonCommercialPlaceWhere(),
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
