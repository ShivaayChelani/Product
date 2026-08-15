import { Prisma } from '@prisma/client';

/** Admin Places search: ignore 1-character noise; 2+ is a real query. */
export const MIN_ADMIN_PLACE_SEARCH_LENGTH = 2;

export const ADMIN_PLACE_SORT_FIELDS = {
  name: 'name',
  category: 'category',
  city: 'city',
  state: 'state',
  status: 'status',
  priority: 'editorialPriority',
  editorialPriority: 'editorialPriority',
} as const;

export type AdminPlaceSortKey = keyof typeof ADMIN_PLACE_SORT_FIELDS;

export function normalizeAdminPlaceSearch(raw?: string | null): string {
  return String(raw ?? '').trim();
}

/**
 * Places-only search: name, city, state. Case-insensitive, trimmed, word-AND.
 * Does not search vendors, users, reels, trips, or place descriptions.
 */
export function buildAdminPlaceSearchWhere(
  search?: string | null,
): Prisma.PlaceWhereInput | undefined {
  const q = normalizeAdminPlaceSearch(search);
  if (q.length < MIN_ADMIN_PLACE_SEARCH_LENGTH) return undefined;
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length === 0) return undefined;
  return {
    AND: words.map((word) => ({
      OR: [
        { name: { contains: word, mode: 'insensitive' as const } },
        { city: { contains: word, mode: 'insensitive' as const } },
        { state: { contains: word, mode: 'insensitive' as const } },
      ],
    })),
  };
}

export function buildAdminPlaceOrderBy(
  sort?: string | null,
  sortDir?: string | null,
): Prisma.PlaceOrderByWithRelationInput[] {
  const field = ADMIN_PLACE_SORT_FIELDS[sort as AdminPlaceSortKey];
  const dir = sortDir === 'asc' || sortDir === 'desc' ? sortDir : undefined;

  if (field && dir) {
    const secondary: Prisma.PlaceOrderByWithRelationInput =
      field === 'name' ? { city: 'asc' } : { name: 'asc' };
    return [{ [field]: dir } as Prisma.PlaceOrderByWithRelationInput, secondary];
  }

  if (sort === 'city') {
    return [{ state: 'asc' }, { city: 'asc' }, { editorialPriority: 'desc' }, { name: 'asc' }];
  }

  return [{ editorialPriority: 'desc' }, { state: 'asc' }, { city: 'asc' }, { name: 'asc' }];
}
