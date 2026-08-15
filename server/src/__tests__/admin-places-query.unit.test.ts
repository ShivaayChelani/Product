import { describe, expect, it } from 'vitest';
import {
  buildAdminPlaceOrderBy,
  buildAdminPlaceSearchWhere,
  MIN_ADMIN_PLACE_SEARCH_LENGTH,
  normalizeAdminPlaceSearch,
} from '../modules/places/services/places.adminQuery';

describe('admin places search query', () => {
  it('trims and ignores queries shorter than 2 characters', () => {
    expect(MIN_ADMIN_PLACE_SEARCH_LENGTH).toBe(2);
    expect(normalizeAdminPlaceSearch('  Dhuandhar  ')).toBe('Dhuandhar');
    expect(buildAdminPlaceSearchWhere('D')).toBeUndefined();
    expect(buildAdminPlaceSearchWhere('  ')).toBeUndefined();
  });

  it('searches name, city, and state only (case-insensitive contains)', () => {
    const where = buildAdminPlaceSearchWhere('Dhuandhar');
    expect(where).toBeDefined();
    const or = (where as { AND: { OR: object[] }[] }).AND[0].OR;
    expect(or).toEqual([
      { name: { contains: 'Dhuandhar', mode: 'insensitive' } },
      { city: { contains: 'Dhuandhar', mode: 'insensitive' } },
      { state: { contains: 'Dhuandhar', mode: 'insensitive' } },
    ]);
    expect(JSON.stringify(where)).not.toMatch(/description/);
    expect(JSON.stringify(where)).not.toMatch(/vendor/);
    expect(JSON.stringify(where)).not.toMatch(/reel/);
  });

  it('matches partial place names via contains', () => {
    const where = buildAdminPlaceSearchWhere('Falls');
    expect(JSON.stringify(where)).toContain('Falls');
  });

  it('ANDs multiple words so city + state queries still hit those fields', () => {
    const where = buildAdminPlaceSearchWhere('Madhya Pradesh');
    const and = (where as { AND: unknown[] }).AND;
    expect(and).toHaveLength(2);
  });

  it('is case-insensitive', () => {
    const where = buildAdminPlaceSearchWhere('jabalpur');
    expect(JSON.stringify(where)).toContain('"mode":"insensitive"');
  });
});

describe('admin places priority orderBy', () => {
  it('sorts editorialPriority ascending', () => {
    expect(buildAdminPlaceOrderBy('priority', 'asc')[0]).toEqual({ editorialPriority: 'asc' });
  });

  it('sorts editorialPriority descending', () => {
    expect(buildAdminPlaceOrderBy('editorialPriority', 'desc')[0]).toEqual({ editorialPriority: 'desc' });
  });

  it('uses the canonical editorialPriority field, not rating', () => {
    const json = JSON.stringify(buildAdminPlaceOrderBy('priority', 'asc'));
    expect(json).toContain('editorialPriority');
    expect(json).not.toContain('rating');
    expect(json).not.toContain('reviewCount');
  });
});
