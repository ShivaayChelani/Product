/** Surface the real HTTP/storage message instead of a generic success-looking failure. */
export function caughtErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; data?: { message?: unknown } };
    const fromData = e.data?.message;
    if (typeof fromData === 'string' && fromData.trim()) return fromData.trim();
    if (typeof e.message === 'string' && e.message.trim()) return e.message.trim();
  }
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  return fallback;
}
