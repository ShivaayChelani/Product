const HASHTAG_RE = /#[\w\u0900-\u097F]+/g;

/** Keys a structured vendor-reel payload may carry its human caption under. */
const CAPTION_KEYS = ['caption', 'text', 'description'] as const;

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function captionFromValue(value: unknown, depth: number): string | null {
  if (depth > 3) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const nested = tryParseJson(trimmed);
      if (nested && typeof nested === 'object') {
        return captionFromValue(nested, depth + 1);
      }
    }
    return trimmed;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    for (const key of CAPTION_KEYS) {
      const found = captionFromValue(obj[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Normalizes a reel caption/description before it is rendered.
 *
 * Vendor reels store a structured payload (`_isStructuredVendorReel`, category,
 * settings, ...) stringified into the caption field. Rendering that string shows
 * raw JSON to the user, so unwrap it to the human-readable caption only.
 * Plain-text captions pass through untouched and malformed JSON never crashes.
 */
export function normalizeReelCaption(raw: string | null | undefined, depth = 0): string {
  if (!raw || depth > 3) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const looksStructured =
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'));

  if (looksStructured) {
    const parsed = tryParseJson(trimmed);
    if (parsed !== undefined) {
      if (parsed && typeof parsed === 'object') {
        // Structured payload: return only the human-readable caption (never raw JSON).
        return captionFromValue(parsed, depth) ?? '';
      }
      if (typeof parsed === 'string') {
        // Double-encoded JSON caption.
        return normalizeReelCaption(parsed, depth + 1);
      }
      return '';
    }

    // Malformed JSON that still looks like our structured payload: best-effort
    // extraction of the caption value so braces/keys are never shown.
    if (
      /"(?:caption|text|description|_isStructuredVendorReel)"\s*:/.test(trimmed) ||
      trimmed.includes('_isStructuredVendorReel')
    ) {
      const match = trimmed.match(/"caption"\s*:\s*"((?:\\.|[^"\\])*)"/);
      if (match) {
        try {
          return normalizeReelCaption(JSON.parse(`"${match[1]}"`), depth + 1);
        } catch {
          return match[1].replace(/\\(.)/g, '$1').trim();
        }
      }
      return '';
    }
  }

  return raw;
}

export function splitCaptionAndHashtags(raw: string | null | undefined): {
  caption: string;
  hashtags: string[];
} {
  if (!raw?.trim()) return { caption: '', hashtags: [] };
  const extracted = normalizeReelCaption(raw);
  if (!extracted.trim()) return { caption: '', hashtags: [] };
  const hashtags = [...new Set(extracted.match(HASHTAG_RE) ?? [])];
  const caption = extracted.replace(HASHTAG_RE, '').replace(/\s+/g, ' ').trim();
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
