export const REEL_TAGS = [
  'Travel',
  'Food',
  'Adventure',
  'History',
  'Hidden Gems',
  'Events',
  'Shopping',
  'Temple',
  'Nature',
  'Culture',
] as const;

export const REEL_TAG_SET: ReadonlySet<string> = new Set(REEL_TAGS);

export function normalizeReelTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const t = item.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}