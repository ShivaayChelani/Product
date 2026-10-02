/**
 * Deep-link helpers for shared Reels.
 *
 * Reels share as `https://palsafar.in/reel/:reelId`, so this module owns that
 * one path shape: parse it, build it, and reject anything that is not a single
 * well-formed id under the verified host.
 *
 * Lives outside `linking.ts` so the rules are unit-testable — React Navigation's
 * `getStateFromPath` needs a live navigator, and these functions must never
 * throw, because a throw inside linking takes down every deep link, not just
 * reels.
 *
 * There is exactly one id rule: `isShareableEntityId` from `shareLinks.ts`, the
 * same predicate `buildReelShareUrl` uses to mint the link. Parsing and sharing
 * therefore cannot disagree about what a valid reel id is.
 */
import { isShareableEntityId } from '../services/sharing/shareLinks';

const SEGMENT = 'reel';

/** Must stay in sync with `linking.ts` prefixes and the manifest/AASA host. */
export const REEL_DEEP_LINK_HOST = 'palsafar.in';

/** The custom scheme mirrors the HTTPS paths; see AndroidManifest. */
export const REEL_DEEP_LINK_SCHEMES = ['https', 'palsafar'] as const;

export type ReelDeepLink = { reelId: string };

/**
 * Normalizes one path segment into a reel id, or returns null.
 *
 * Strips stray slashes and any `?query`/`#hash` leftovers, then defers to the
 * shared id rule. Returning null (never throwing) lets the caller fall through
 * to the screen's own not-found handling instead of throwing inside linking.
 */
export function parseReelId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;

  let value = raw.trim();
  if (!value) return null;

  value = value.replace(/^[/]+|[/]+$/g, '');
  const cut = value.search(/[?#]/);
  if (cut !== -1) value = value.slice(0, cut);
  if (!value) return null;

  // A reel id is exactly one segment. A slash here is either a malformed URL or
  // an attempt to climb into another route.
  if (value.includes('/') || value.includes('\\')) return null;

  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Malformed percent-encoding: keep the raw value and let the id rule reject it.
  }

  return isShareableEntityId(decoded) ? decoded : null;
}

/** Builds the canonical in-app path for a reel id, or null if unusable. */
export function buildReelDeepLinkPath(raw: unknown): string | null {
  const reelId = parseReelId(raw);
  return reelId ? `/${SEGMENT}/${encodeURIComponent(reelId)}` : null;
}

/** True when a pathname addresses a reel, e.g. `/reel/cmumcmr4...`. */
export function isReelDeepLinkPath(pathname: unknown): boolean {
  if (typeof pathname !== 'string') return false;
  const parts = pathname.split('?')[0].split('#')[0].split('/').filter(Boolean);
  return parts.length === 2 && parts[0].toLowerCase() === SEGMENT;
}

/**
 * Parses a full share URL into the exact reel id it addresses.
 *
 * The host is checked against the single verified association host rather than a
 * suffix test: `palsafar.in` is the only host covered by assetlinks.json, the
 * AASA, and `applinks:palsafar.in`, so accepting `www.` or any other domain
 * would hand back a link the OS can never route to the app.
 */
export function parseReelDeepLinkUrl(url: unknown): ReelDeepLink | null {
  if (typeof url !== 'string' || !url.trim()) return null;

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }

  const scheme = parsed.protocol.replace(/:$/, '').toLowerCase();
  if (!(REEL_DEEP_LINK_SCHEMES as readonly string[]).includes(scheme)) return null;

  // The custom scheme carries the same paths, so it is validated identically.
  const isWeb = scheme === 'https';
  if (isWeb && parsed.hostname.toLowerCase() !== REEL_DEEP_LINK_HOST) return null;

  // For a non-special scheme the URL parser reads `palsafar://reel/<id>` as
  // host `reel` + path `/<id>`, so the first segment has to be put back or every
  // custom-scheme link (including the one on the share landing page) is lost.
  const rawPath = isWeb ? parsed.pathname : `${parsed.hostname}${parsed.pathname}`;
  const parts = rawPath.split('/').filter(Boolean);
  if (parts.length !== 2 || parts[0].toLowerCase() !== SEGMENT) return null;

  const reelId = parseReelId(parts[1]);
  return reelId ? { reelId } : null;
}
