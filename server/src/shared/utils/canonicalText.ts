/**
 * Normalization for duplicate detection and alias lookup.
 * Keeps Unicode letters/numbers (Devanagari etc.) — strips punctuation only.
 */
export function normalizeForMatch(text: string): string {
  return text
    .trim()
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Latin-centric fold for fuzzy English search variants. */
export function normalizeLatinFold(text: string): string {
  return normalizeForMatch(text).replace(/([a-z])\1+/g, '$1');
}

export function nameSimilarityScore(a: string, b: string): number {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.92;
  const ta = new Set(na.split(' '));
  const tb = new Set(nb.split(' '));
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  const union = ta.size + tb.size - inter;
  return union > 0 ? inter / union : 0;
}
