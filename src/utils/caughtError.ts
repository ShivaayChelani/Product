/** Surface the real HTTP/storage message instead of a generic success-looking failure. */
export function caughtErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    const e = err as {
      message?: unknown;
      errors?: Array<{ message?: string; field?: string }>;
      data?: { message?: unknown; errors?: Array<{ message?: string; field?: string }> };
    };
    const fieldErrors = Array.isArray(e.errors)
      ? e.errors
      : Array.isArray(e.data?.errors)
        ? e.data.errors
        : [];
    if (fieldErrors.length > 0) {
      const joined = fieldErrors
        .map(item => item.message || (item.field ? `${item.field} is invalid` : null))
        .filter(Boolean)
        .join('\n');
      if (joined) return joined;
    }
    const errMessage = typeof e.message === 'string' ? e.message.trim() : '';
    const dataMessage = typeof e.data?.message === 'string' ? e.data.message.trim() : '';
    if (errMessage && (!dataMessage || dataMessage === 'Validation failed' || errMessage.length > dataMessage.length)) {
      return errMessage;
    }
    if (dataMessage) return dataMessage;
  }
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  return fallback;
}
