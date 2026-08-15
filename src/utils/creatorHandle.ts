/** Display / persist a short @handle, even if the stored value is a pasted Instagram URL. */
export function formatCreatorHandle(raw?: string | null): string {
  const extracted = extractCreatorHandle(raw);
  return extracted || 'creator';
}

export function extractCreatorHandle(raw?: string | null): string | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(/(?:instagram\.com|instagr\.am)\/([A-Za-z0-9._]+)/i);
  if (urlMatch?.[1]) return sanitizeHandle(urlMatch[1]);

  const compact = trimmed.replace(/^@/, '').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
  const mashed = compact.match(/^(?:https?)?(?:www)?instagramcom(.+)$/);
  if (mashed?.[1] && mashed[1].length >= 2) return mashed[1].slice(0, 30);

  if (/^https/i.test(trimmed) || compact.startsWith('http')) return null;
  if (compact.length >= 2) return compact.slice(0, 30);
  return null;
}

function sanitizeHandle(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase().slice(0, 30);
}
