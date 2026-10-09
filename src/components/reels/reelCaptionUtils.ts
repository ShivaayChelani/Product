const HASHTAG_RE = /#[\w\u0900-\u097F]+/g;

/** Keys a structured vendor-reel payload may carry its human caption under. */
const CAPTION_KEYS = ['caption', 'text', 'description'] as const;

const INTERNAL_MARKERS = ['_isStructuredVendorReel', '[object Object]'];

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function isStructuredVendorPayload(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  if (obj._isStructuredVendorReel === true) return true;
  if ('settings' in obj || 'category' in obj) return CAPTION_KEYS.some((key) => key in obj);
  return CAPTION_KEYS.some((key) => key in obj);
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
    return looksLikeInternalMetadata(trimmed) ? null : trimmed;
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

export function looksLikeInternalMetadata(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed === 'undefined' || trimmed === 'null' || trimmed === '[object Object]') return true;
  return INTERNAL_MARKERS.some((marker) => trimmed.includes(marker));
}

/**
 * Normalizes a reel caption/description before it is rendered.
 *
 * Vendor reels store a structured payload (`_isStructuredVendorReel`, category,
 * settings, ...) stringified into the caption field. Rendering that string shows
 * raw JSON to the user, so unwrap it to the human-readable caption only.
 * Plain-text captions pass through untouched and malformed JSON never crashes.
 */
export function normalizeReelCaption(raw: unknown, depth = 0): string {
  if (raw == null || depth > 3) return '';
  if (typeof raw === 'object') {
    if (Array.isArray(raw)) return '';
    return captionFromValue(raw, depth) ?? '';
  }
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const looksStructured =
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'));

  if (looksStructured) {
    const parsed = tryParseJson(trimmed);
    if (parsed !== undefined) {
      if (parsed && typeof parsed === 'object') {
        const extracted = captionFromValue(parsed, depth);
        if (extracted) return extracted;
        // Structured vendor payloads must never leak as raw JSON. Other
        // JSON-looking user text (no caption keys) is preserved.
        return isStructuredVendorPayload(parsed) ? '' : raw;
      }
      if (typeof parsed === 'string') {
        // Double-encoded JSON caption.
        return normalizeReelCaption(parsed, depth + 1);
      }
      return '';
    }
  }

  // Truncated or otherwise invalid JSON that still carries our vendor payload
  // keys: pull the caption out so braces and internal fields never leak.
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

  return looksLikeInternalMetadata(raw) ? '' : raw;
}

/** Best user-facing caption for share sheets and cards. Never returns raw JSON. */
export function reelUserFacingCaption(description?: unknown, title?: unknown): string {
  const fromDescription = normalizeReelCaption(description).trim();
  if (fromDescription && !looksLikeInternalMetadata(fromDescription)) return fromDescription;
  const fromTitle = normalizeReelCaption(title).trim();
  if (fromTitle && !looksLikeInternalMetadata(fromTitle)) return fromTitle;
  return '';
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
