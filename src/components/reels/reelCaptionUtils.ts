const HASHTAG_RE = /#[\w\u0900-\u097F]+/g;

export function splitCaptionAndHashtags(raw: string | null | undefined): {
  caption: string;
  hashtags: string[];
} {
  if (!raw?.trim()) return { caption: '', hashtags: [] };
  const hashtags = [...new Set(raw.match(HASHTAG_RE) ?? [])];
  const caption = raw.replace(HASHTAG_RE, '').replace(/\s+/g, ' ').trim();
  return { caption, hashtags };
}

export function buildReelHashtags(
  description: string | null | undefined,
  placeCity?: string | null,
  placeName?: string | null,
): string[] {
  const { hashtags } = splitCaptionAndHashtags(description);
  if (hashtags.length > 0) return hashtags.slice(0, 5);

  const derived: string[] = ['#PalSafar', '#ExploreIndia'];
  if (placeCity) derived.unshift(`#${placeCity.replace(/\s+/g, '')}`);
  else if (placeName) derived.unshift(`#${placeName.replace(/\s+/g, '')}`);
  return derived.slice(0, 4);
}
