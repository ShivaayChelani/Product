/** Map HTTP / network failures to user-visible reel upload messages. */
export function mapReelUploadError(err: unknown): string {
  const status = (err as { status?: number })?.status;
  const code = (err as { code?: string })?.code;
  const message = extractMessage(err);

  if (status === 400) {
    return message || 'Invalid reel details. Please check your caption and try again.';
  }
  if (status === 401) {
    return 'Please sign in again to post your reel.';
  }
  if (status === 403) {
    return message || 'You do not have permission to post reels.';
  }
  if (status === 413) {
    return 'Video is too large. Please choose a smaller video.';
  }
  if (status === 415) {
    return 'This video format is not supported.';
  }
  if (status === 429) {
    return 'Too many uploads right now. Please wait a moment and try again.';
  }
  if (status === 502 || status === 503) {
    return 'Server could not process your reel. Please try again.';
  }
  if (status && status >= 500) {
    return 'Server could not process your reel. Please try again.';
  }
  if ((err as Error)?.name === 'AbortError') {
    return 'Upload interrupted. Check your connection and tap Retry.';
  }
  if (/network|fetch|connection|timed out/i.test(message)) {
    return 'Upload interrupted. Check your connection and tap Retry.';
  }
  if (code === 'UNSUPPORTED_VIDEO') {
    return 'This video format is not supported.';
  }
  return message || 'Reel upload failed. Tap to retry.';
}

function extractMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; data?: { message?: unknown } };
    const fromData = e.data?.message;
    if (typeof fromData === 'string' && fromData.trim()) return fromData.trim();
    if (typeof e.message === 'string' && e.message.trim()) return e.message.trim();
  }
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  return '';
}
