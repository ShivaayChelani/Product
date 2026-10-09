/**
 * Relevance ranking for admin dashboard entity search.
 * Pure helpers — no DB access, easy to unit test.
 */

/** Collapse doubled letters (nidaan → nidan) for soft spelling matches. */
export function collapseRepeats(value: string): string {
  return value.toLowerCase().replace(/([a-z])\1+/g, '$1');
}

/**
 * Relevance score for admin entity search: exact > prefix > token-prefix >
 * collapsed-prefix > substring. The first field (name-like) weighs more than
 * secondary fields (city/state/id), so a name match outranks a city match.
 * Returns 0 when nothing matches.
 */
export function scoreAdminMatch(query: string, ...fields: Array<string | null | undefined>): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const scoreFor = (value: string | null | undefined, base: number): number => {
    const v = String(value ?? '').toLowerCase();
    if (!v) return 0;
    if (v === q) return base + 30;
    if (v.startsWith(q)) return base + 20;
    if (v.split(/[\s,.-]+/).some((token) => token.startsWith(q))) return base + 10;
    if (collapseRepeats(v).startsWith(collapseRepeats(q))) return base + 5;
    if (v.includes(q)) return base; // substring
    return 0;
  };
  let best = 0;
  fields.forEach((field, i) => {
    const scored = scoreFor(field, i === 0 ? 40 : 10);
    if (scored > best) best = scored;
  });
  return best;
}

export interface PlaceSearchFields {
  name?: string | null;
  canonicalName?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
}

/**
 * Relevance score for public place search. Text matches on the name (or its
 * canonical form) always outweigh location matches, and both always outweigh
 * weak/fuzzy name-only hits. Used to re-rank candidate rows so a place is never
 * surfaced above a genuine match merely because it shares a coincidental
 * substring (e.g. Kundalpur for the query "Jabalpur").
 */
export function scorePlaceSearchMatch(query: string, place: PlaceSearchFields): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const qCollapsed = collapseRepeats(q);

  const textScore = (value: string | null | undefined): number => {
    const v = String(value ?? '').toLowerCase();
    if (!v) return 0;
    if (v === q) return 4;
    if (v.startsWith(q)) return 3.4;
    if (v.split(/[\s,.-]+/).some((token) => token.startsWith(q))) return 3.1;
    if (collapseRepeats(v).includes(qCollapsed)) return 3.0;
    if (v.includes(q)) return 3.0;
    return 0;
  };

  const locationScore = (value: string | null | undefined, exact: number, contains: number): number => {
    const v = String(value ?? '').toLowerCase();
    if (!v) return 0;
    if (v === q) return exact;
    if (v.includes(q)) return contains;
    return 0;
  };

  return Math.max(
    textScore(place.name),
    textScore(place.canonicalName),
    locationScore(place.city, 2.6, 1.9),
    locationScore(place.district, 2.4, 1.7),
    locationScore(place.state, 2.2, 1.5),
  );
}