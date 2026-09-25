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