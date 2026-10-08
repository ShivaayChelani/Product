/**
 * Canonical PalSafar public URLs for share sheets and App Links.
 * Must stay in sync with `src/navigation/linking.ts` prefixes + path config.
 *
 * HTTPS: https://palsafar.in/...
 * Custom scheme (same paths): palsafar://...
 *
 * Required host config (already declared in AndroidManifest / linking.ts):
 * - Digital Asset Links at https://palsafar.in/.well-known/assetlinks.json
 * - iOS associated domain applinks:palsafar.in
 */
export const PALSAFAR_WEB_ORIGIN = 'https://palsafar.in';

const CUID_OR_UUID =
  /^[a-z0-9][a-z0-9_-]{7,127}$/i;

export function isShareableEntityId(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  const trimmed = id.trim();
  if (!trimmed || trimmed.length > 128) return false;
  if (!isSafePathSegment(trimmed)) return false;
  return CUID_OR_UUID.test(trimmed);
}

/** A path segment that can be embedded verbatim without restructuring the URL. */
function isSafePathSegment(value: string): boolean {
  if (value.includes('/') || value.includes('?') || value.includes('#')) return false;
  if (value.includes('://')) return false;
  return true;
}

export function buildReelShareUrl(reelId: string): string | null {
  if (!isShareableEntityId(reelId)) return null;
  return `${PALSAFAR_WEB_ORIGIN}/reel/${encodeURIComponent(reelId)}`;
}

/**
 * Public Community Event URL: https://palsafar.in/event/:id
 *
 * Event shares use the stable event id. Public slug routes remain supported by
 * website links and inbound deep links; they are not used for share payloads.
 */
export function buildEventShareUrl(idOrSlug: string): string | null {
  if (!isShareableEntityId(idOrSlug)) return null;
  return `${PALSAFAR_WEB_ORIGIN}/event/${encodeURIComponent(idOrSlug)}`;
}

/**
 * Mirrors the server's username rule (social.validation.ts: 3-30 chars of
 * `[a-zA-Z0-9_.]`) narrowed to what is safe as a single path segment.
 */
const PUBLIC_CREATOR_USERNAME = /^[a-zA-Z0-9_.]{3,30}$/;

/**
 * Public creator profile URL: https://palsafar.in/creator/:identifier
 *
 * Prefers the stable `CreatorProfile.id`. Legacy rows can hold a pasted
 * Instagram URL in `username`, and deriving a handle from that would mint a
 * link that does not resolve, so the username is only used when it already
 * satisfies the app's own username rule. The server accepts either identifier.
 */
export function buildCreatorShareUrl(creator: {
  id?: string | null;
  username?: string | null;
}): string | null {
  if (isShareableEntityId(creator.id)) {
    return `${PALSAFAR_WEB_ORIGIN}/creator/${encodeURIComponent(creator.id!.trim())}`;
  }
  const username = typeof creator.username === 'string' ? creator.username.trim() : '';
  if (!PUBLIC_CREATOR_USERNAME.test(username)) return null;
  return `${PALSAFAR_WEB_ORIGIN}/creator/${encodeURIComponent(username)}`;
}

/**
 * Signed, expiring read-only trip URL: https://palsafar.in/trip/shared/:token.
 * The token is opaque to the client — it is minted and verified server-side.
 * Falls back to null when the token is unsafe to embed in a URL.
 */
export function buildSharedTripUrl(token: string): string | null {
  if (typeof token !== 'string' || !token.trim()) return null;
  const trimmed = token.trim();
  if (trimmed.length > 2048) return null;
  if (trimmed.includes('/') || trimmed.includes('?') || trimmed.includes('#') || trimmed.includes('://')) {
    return null;
  }
  return `${PALSAFAR_WEB_ORIGIN}/trip/shared/${encodeURIComponent(trimmed)}`;
}

export function isPublicShareableReel(reel: {
  id?: string | null;
  status?: string | null;
}): boolean {
  if (!isShareableEntityId(reel.id)) return false;
  if (reel.status && reel.status !== 'APPROVED') return false;
  return true;
}

export function buildReelShareMessage(reel: {
  id: string;
  status?: string | null;
  title?: string | null;
  description?: string | null;
}): string | null {
  if (!isPublicShareableReel(reel)) return null;
  const url = buildReelShareUrl(reel.id);
  if (!url) return null;
  const caption = (reel.description || reel.title || '').trim();
  if (caption) {
    return `Check out this reel on PalSafar! 🎬\n${caption}\n${url}`;
  }
  return `Check out this reel on PalSafar! 🎬\n${url}`;
}

/**
 * Share text for a Community Event.
 *
 * Only APPROVED events are shareable: a PENDING/REJECTED/CANCELLED event would
 * produce a link that resolves to a not-found page for whoever receives it.
 */
export function isPublicShareableEvent(event: {
  id?: string | null;
  status?: string | null;
}): boolean {
  if (event.status && event.status !== 'APPROVED') return false;
  return isShareableEntityId(event.id);
}

export function buildEventShareMessage(event: {
  id: string;
  status?: string | null;
  title?: string | null;
}): string | null {
  if (!isPublicShareableEvent(event)) return null;
  const url = buildEventShareUrl(event.id.trim());
  if (!url) return null;
  const title = (event.title || '').trim();
  return title
    ? `Check out this event on PalSafar: ${title}\n${url}`
    : `Check out this event on PalSafar\n${url}`;
}

export function buildTripShareMessage(trip: {
  id: string;
  title?: string | null;
  destination?: string | null;
}, shareToken: string): string | null {
  const url = buildSharedTripUrl(shareToken);
  if (!url) return null;
  const title = (trip.title || '').trim();
  const destination = (trip.destination || '').trim();
  const label = title && destination && title !== destination
    ? `${title} — ${destination}`
    : title || destination || 'my trip';
  return `Check out my PalSafar trip: ${label}\n${url}`;
}

/** True when a share payload accidentally embeds an auth secret. */
export function shareMessageContainsAuthToken(message: string): boolean {
  return /(?:bearer\s+[a-z0-9._-]+|accessToken|refreshToken|jwt)/i.test(message);
}
