/**
 * Creator handle helpers.
 *
 * PalSafar usernames are the only legitimate source for a creator's @handle.
 * Legacy rows can still hold a pasted social URL (e.g. an Instagram profile
 * link, sometimes with the punctuation stripped) in the `username` column.
 * Such values must NEVER be shown as a handle and must never be converted into
 * one by stripping punctuation — Instagram content is not part of the product.
 */

/** The app's own username rule: 3-30 chars of letters, digits, `_` or `.`. */
const PALSAFAR_USERNAME_RE = /^[a-z0-9_.]{3,30}$/;

/** Anything that smells like a URL or a social profile is never a username. */
const NON_USERNAME_RE = /instagram|^https?|www\./i;

/**
 * True only when `raw` is a genuine PalSafar username — not a URL, not a
 * social handle, not an Instagram-derived value.
 */
export function isValidPalSafarUsername(raw?: string | null): boolean {
  const trimmed = String(raw ?? '').trim().replace(/^@+/, '');
  if (!trimmed) return false;
  if (NON_USERNAME_RE.test(trimmed)) return false;
  return PALSAFAR_USERNAME_RE.test(trimmed.toLowerCase());
}

/**
 * Returns the creator's genuine PalSafar username, or `null` when the stored
 * value is missing or is not a real username (e.g. a pasted social URL).
 */
export function extractCreatorHandle(raw?: string | null): string | null {
  const trimmed = String(raw ?? '').trim();
  if (!isValidPalSafarUsername(trimmed)) return null;
  return trimmed.toLowerCase().replace(/^@+/, '');
}

/**
 * A bare handle for headings. Returns the genuine username, else `fallback`.
 * Never returns an Instagram URL or a value derived from one.
 */
export function formatCreatorHandle(raw?: string | null, fallback = 'creator'): string {
  return extractCreatorHandle(raw) || fallback;
}

/**
 * A ready-to-render `@handle`. Returns `@username` for a genuine PalSafar
 * username, otherwise the provided `fallback` text (never a URL).
 */
export function creatorAtHandle(raw?: string | null, fallback = 'Creator'): string {
  const handle = extractCreatorHandle(raw);
  return handle ? `@${handle}` : fallback;
}
