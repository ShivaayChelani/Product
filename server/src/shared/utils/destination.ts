/**
 * Destination normalization + membership checks for accurate itinerary place selection.
 * Keeps AI plans rooted in the city/region the user actually asked for.
 */

import {
  INDIA_DESTINATION_ALIASES,
  INDIA_REGION_DESTINATIONS,
} from '../../../shared/indiaDestinationAliases';

const DESTINATION_ALIASES = INDIA_DESTINATION_ALIASES;
const REGION_DESTINATIONS = INDIA_REGION_DESTINATIONS;

export function normalizeDestinationKey(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b(india|city|town|district)\b/g, '')
    .trim();
}

/** Word-boundary match — avoids "kashi" matching "Uttarkashi", "goa" matching "Ongole", etc. */
export function destinationMatchesInText(haystack: string, dest: string): boolean {
  if (!haystack || !dest) return false;
  if (haystack === dest) return true;
  if (dest.length < 4) return false;
  const escaped = dest.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(haystack);
}

export function canonicalizeDestination(raw: string): string {
  const key = normalizeDestinationKey(raw);
  if (!key) return '';
  if (DESTINATION_ALIASES[key]) return DESTINATION_ALIASES[key];
  // Partial alias match (e.g. "trip around bangalore outskirts") — word-boundary safe.
  const aliasKeys = Object.keys(DESTINATION_ALIASES).sort((a, b) => b.length - a.length);
  for (const alias of aliasKeys) {
    if (alias.length >= 4 && (key === alias || destinationMatchesInText(key, alias))) {
      return DESTINATION_ALIASES[alias];
    }
  }
  return key;
}

export function isRegionDestination(destination: string): boolean {
  const key = canonicalizeDestination(destination);
  return REGION_DESTINATIONS.has(key);
}

/** Display-friendly title case for trip titles. */
export function formatDestinationLabel(raw: string): string {
  const key = canonicalizeDestination(raw) || normalizeDestinationKey(raw);
  if (!key) return raw?.trim() || '';
  return key.replace(/\b\w/g, (c) => c.toUpperCase());
}

const GENERIC_DESTINATION_KEYS = new Set(['', 'my trip', 'my itinerary']);

/** True for empty / placeholder destinations that are not a real city. */
export function isGenericDestination(raw?: string | null): boolean {
  const key = normalizeDestinationKey(raw || '');
  return !key || GENERIC_DESTINATION_KEYS.has(key);
}

/** Canonical city key from place.city, falling back to place.state. */
export function cityKeyFromPlace(place: { city?: string | null; state?: string | null }): string {
  const city = canonicalizeDestination(place.city || '');
  if (city) return city;
  return canonicalizeDestination(place.state || '');
}

/** True when a trip destination is the same canonical city as cityKey. */
export function destinationMatchesCity(
  destination: string | null | undefined,
  cityKey: string,
): boolean {
  if (!cityKey) return false;
  if (isGenericDestination(destination)) return false;
  return canonicalizeDestination(destination || '') === cityKey;
}

/**
 * One itinerary = one destination city.
 * Unknown/empty place city may only join an empty generic draft.
 */
export function tripCanAcceptPlaceCity(
  tripDestination: string | null | undefined,
  existingStopCityKeys: string[],
  placeCityKey: string,
): boolean {
  const stopKeys = [
    ...new Set(
      (existingStopCityKeys || [])
        .map((k) => canonicalizeDestination(k))
        .filter(Boolean),
    ),
  ];

  if (!placeCityKey) {
    return isGenericDestination(tripDestination) && stopKeys.length === 0;
  }

  if (stopKeys.some((k) => k !== placeCityKey)) {
    return false;
  }

  if (destinationMatchesCity(tripDestination, placeCityKey)) {
    return true;
  }

  if (!isGenericDestination(tripDestination)) {
    return false;
  }

  return stopKeys.length === 0 || stopKeys.every((k) => k === placeCityKey);
}

function canonicalPlaceField(value: string | null | undefined): string {
  const normalized = normalizeDestinationKey(value || '');
  if (!normalized) return '';
  return canonicalizeDestination(normalized) || normalized;
}

/**
 * True when a place clearly belongs to the asked destination.
 * Exact city match wins; soft contains only when the city token is substantial.
 */
export function placeBelongsToDestination(
  place: { city?: string | null; state?: string | null; name?: string | null },
  destination: string,
): boolean {
  const dest = canonicalizeDestination(destination);
  if (!dest || dest.length < 2) return false;

  const city = canonicalPlaceField(place.city);
  const state = canonicalPlaceField(place.state);
  const name = normalizeDestinationKey(place.name || '');

  if (city === dest || state === dest) return true;

  if (dest.length >= 4) {
    if (destinationMatchesInText(city, dest) || (destinationMatchesInText(dest, city) && city.length >= 4)) return true;
    if (isRegionDestination(dest) && (destinationMatchesInText(state, dest) || (destinationMatchesInText(dest, state) && state.length >= 4))) return true;
  }

  if (dest.length >= 4 && destinationMatchesInText(name, dest)) return true;

  return false;
}

/**
 * Pull likely must-visit place name hints from free-text prompts.
 */
export function extractMustVisitHints(prompt: string | undefined | null, destination: string): string[] {
  if (!prompt?.trim()) return [];
  const dest = canonicalizeDestination(destination);
  const destLabel = formatDestinationLabel(destination).toLowerCase();

  const text = prompt.trim()
    .replace(/(?:plan|book|make)\s+(?:a\s+)?(?:\d+-?\s*day\s+)?(?:trip|itinerary|holiday|vacation)\s+(?:to|in|around|for)\s+[a-zA-Z]+(?:\s+[a-zA-Z]+)?(?=\s*(?:,|\/|&|\bwith\b|\bincluding\b|\band\b|\bplus\b|$))/gi, ' ')
    .replace(/\b(india|trip|travel|visit|plan|explore|itinerary|holiday|vacation|days?|day|relaxed|balanced|quick|solo|couple|family|friends|budget|morning|evening|afternoon)\b/gi, ' ')
    .replace(/\bin\s+[a-zA-Z]+(?:\s+[a-zA-Z]+)?\s*$/i, ' ');

  const hints = new Set<string>();
  for (const q of text.match(/"([^"]{3,60})"|'([^']{3,60})'/g) || []) {
    const cleaned = q.replace(/['"]/g, '').trim();
    if (cleaned.length >= 3) hints.add(cleaned);
  }

  const chunks = text
    .split(/,|\/|&|\band\b|\bwith\b|\bincluding\b|\bplus\b/i)
    .map((c) => c.trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    const cleaned = chunk
      .replace(/[^\w\s.-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length < 3 || cleaned.length > 60) continue;
    const words = cleaned.split(' ').filter(Boolean);
    if (words.length === 0) continue;
    if (words.length === 1 && words[0].length < 5) continue;
    const lower = cleaned.toLowerCase();
    if (lower === dest || lower === destLabel) continue;
    if (/^(temples?|heritage|nature|food|adventure|shopping|culture|waterfalls?)$/i.test(cleaned)) continue;
    hints.add(cleaned);
  }

  return Array.from(hints).slice(0, 12);
}
