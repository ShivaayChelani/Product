/**
 * Deep-link helpers for Community Events.
 *
 * Events share as `https://palsafar.in/event/:eventSlugOrId`, mirroring the
 * one-segment shape used by Reels (`/reel/:reelId`). This module owns that path
 * shape: parse it, build it, and reject anything that is not a single
 * well-formed identifier under the verified host.
 *
 * Lives outside `linking.ts` for the same reason `reelDeepLink.ts` does — React
 * Navigation's `getStateFromPath` needs a live navigator, and these functions
 * must never throw, because a throw inside linking takes down every deep link.
 *
 * The server resolves `GET /api/v1/events/:idOrSlug`, so the slug and the cuid
 * are both valid and both parse through the same rule.
 */
import { isShareableEntityId } from '../services/sharing/shareLinks';

const SEGMENT = 'event';

/** Must stay in sync with `linking.ts` prefixes and the manifest/AASA host. */
export const EVENT_DEEP_LINK_HOST = 'palsafar.in';

/** The custom scheme mirrors the HTTPS paths; see AndroidManifest. */
export const EVENT_DEEP_LINK_SCHEMES = ['https', 'palsafar'] as const;

export type EventDeepLink = { eventIdOrSlug: string };

/**
 * Normalizes one path segment into an event id or slug, or returns null.
 *
 * Never throws: a malformed link must resolve to EventDetail with an empty id
 * so the screen renders its own not-found state, not fall through to Home.
 */
export function parseEventIdOrSlug(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;

  let value = raw.trim();
  if (!value) return null;

  value = value.replace(/^[/]+|[/]+$/g, '');
  const cut = value.search(/[?#]/);
  if (cut !== -1) value = value.slice(0, cut);
  if (!value) return null;

  // Exactly one segment. A slash here is a malformed URL or an attempt to
  // climb into another route.
  if (value.includes('/') || value.includes('\\')) return null;

  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Malformed percent-encoding: keep the raw value and let the id rule reject it.
  }

  return isShareableEntityId(decoded) ? decoded : null;
}

/** Builds the canonical in-app path for an event id/slug, or null if unusable. */
export function buildEventDeepLinkPath(raw: unknown): string | null {
  const id = parseEventIdOrSlug(raw);
  return id ? `/${SEGMENT}/${encodeURIComponent(id)}` : null;
}

/** True when a pathname addresses an event, e.g. `/event/dussehra-x1y2z3a4`. */
export function isEventDeepLinkPath(pathname: unknown): boolean {
  if (typeof pathname !== 'string') return false;
  const parts = pathname.split('?')[0].split('#')[0].split('/').filter(Boolean);
  return parts.length === 2 && parts[0].toLowerCase() === SEGMENT;
}

/**
 * Parses a full share URL into the exact event it addresses.
 *
 * The host is checked against the single verified association host rather than
 * a suffix test: `palsafar.in` is the only host covered by assetlinks.json, the
 * AASA, and `applinks:palsafar.in`.
 */
export function parseEventDeepLinkUrl(url: unknown): EventDeepLink | null {
  if (typeof url !== 'string' || !url.trim()) return null;

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }

  const scheme = parsed.protocol.replace(/:$/, '').toLowerCase();
  if (!(EVENT_DEEP_LINK_SCHEMES as readonly string[]).includes(scheme)) return null;

  const isWeb = scheme === 'https';
  if (isWeb && parsed.hostname.toLowerCase() !== EVENT_DEEP_LINK_HOST) return null;

  // For a non-special scheme the URL parser reads `palsafar://event/<id>` as
  // host `event` + path `/<id>`, so the first segment has to be put back.
  const rawPath = isWeb ? parsed.pathname : `${parsed.hostname}${parsed.pathname}`;
  const parts = rawPath.split('/').filter(Boolean);
  if (parts.length !== 2 || parts[0].toLowerCase() !== SEGMENT) return null;

  const eventIdOrSlug = parseEventIdOrSlug(parts[1]);
  return eventIdOrSlug ? { eventIdOrSlug } : null;
}