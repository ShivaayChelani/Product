/**
 * Canonical PalSafar public URLs for share sheets and App Links.
 * Must stay in sync with `src/navigation/linking.ts` prefixes + path config.
 *
 * HTTPS: https://palsafar.com/...
 * Custom scheme (same paths): palsafar://...
 *
 * Required host config (already declared in AndroidManifest / linking.ts):
 * - Digital Asset Links at https://palsafar.com/.well-known/assetlinks.json
 * - iOS associated domain applinks:palsafar.com
 */
export const PALSAFAR_WEB_ORIGIN = 'https://palsafar.com';

const CUID_OR_UUID =
  /^[a-z0-9][a-z0-9_-]{7,127}$/i;

export function isShareableEntityId(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  const trimmed = id.trim();
  if (!trimmed || trimmed.length > 128) return false;
  if (trimmed.includes('/') || trimmed.includes('?') || trimmed.includes('#')) return false;
  if (trimmed.includes('://')) return false;
  return CUID_OR_UUID.test(trimmed);
}

export function buildReelShareUrl(reelId: string): string | null {
  if (!isShareableEntityId(reelId)) return null;
  return `${PALSAFAR_WEB_ORIGIN}/reel/${encodeURIComponent(reelId)}`;
}

export function buildTripShareUrl(tripId: string): string | null {
  if (!isShareableEntityId(tripId)) return null;
  return `${PALSAFAR_WEB_ORIGIN}/trip/${encodeURIComponent(tripId)}`;
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

export function buildTripShareMessage(trip: {
  id: string;
  title?: string | null;
  destination?: string | null;
}): string | null {
  const url = buildTripShareUrl(trip.id);
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
