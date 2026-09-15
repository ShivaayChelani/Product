export type GoogleAuthFailure = Error & {
  status?: number;
  code?: string;
  cancelled?: boolean;
};

function asRecord(error: unknown): Record<string, unknown> {
  if (error && typeof error === 'object') return error as Record<string, unknown>;
  return {};
}

export function isGoogleSignInCancelled(error: unknown): boolean {
  const rec = asRecord(error);
  const code = rec.code;
  const message = String(rec.message || '');
  return (
    rec.cancelled === true ||
    code === 'SIGN_IN_CANCELLED' ||
    code === 12501 ||
    code === '12501' ||
    message.includes('SIGN_IN_CANCELLED') ||
    message.includes('sign in was cancelled') ||
    /cancelled by the user/i.test(message)
  );
}

export function mapGoogleAuthFailure(error: unknown): GoogleAuthFailure {
  if (isGoogleSignInCancelled(error)) {
    const cancelled = new Error('Google Sign-In was cancelled.') as GoogleAuthFailure;
    cancelled.cancelled = true;
    cancelled.code = 'SIGN_IN_CANCELLED';
    return cancelled;
  }

  const rec = asRecord(error);
  const status = typeof rec.status === 'number' ? rec.status : undefined;
  const code = rec.code;
  const message = String(rec.message || '');
  const lower = message.toLowerCase();

  if (
    code === 'PLAY_SERVICES_NOT_AVAILABLE' ||
    code === 2 ||
    code === '2' ||
    lower.includes('play services')
  ) {
    const mapped = new Error(
      'Google Play Services is unavailable. Install or update it, then try again.',
    ) as GoogleAuthFailure;
    mapped.code = 'PLAY_SERVICES_NOT_AVAILABLE';
    mapped.status = 503;
    return mapped;
  }

  if (
    code === 'DEVELOPER_ERROR' ||
    code === 10 ||
    code === '10' ||
    lower.includes('developer_error') ||
    lower.includes('url scheme')
  ) {
    const mapped = new Error(
      'Google Sign-In is not configured for this app build. Please try email sign-in.',
    ) as GoogleAuthFailure;
    mapped.code = 'DEVELOPER_ERROR';
    mapped.status = 500;
    return mapped;
  }

  if (status === 409 || rec.code === 'GOOGLE_IDENTITY_CONFLICT') {
    const mapped = new Error(
      message || 'This Google account is already linked to a different PalSafar user.',
    ) as GoogleAuthFailure;
    mapped.status = 409;
    mapped.code = typeof rec.code === 'string' ? rec.code : 'GOOGLE_IDENTITY_CONFLICT';
    return mapped;
  }

  if (status === 401) {
    const mapped = new Error(
      message || 'Google Sign-In could not be verified. Please try again.',
    ) as GoogleAuthFailure;
    mapped.status = 401;
    return mapped;
  }

  if (status === 429) {
    const mapped = new Error('Too many attempts. Please try again in a few minutes.') as GoogleAuthFailure;
    mapped.status = 429;
    return mapped;
  }

  if (status === 400) {
    const mapped = new Error(message || 'Google Sign-In request was invalid. Please try again.') as GoogleAuthFailure;
    mapped.status = 400;
    return mapped;
  }

  if (status && status >= 500) {
    const mapped = new Error('PalSafar could not complete Google Sign-In. Please try again.') as GoogleAuthFailure;
    mapped.status = status;
    return mapped;
  }

  if (
    rec.name === 'AbortError' ||
    lower.includes('network request failed') ||
    lower.includes('timed out') ||
    lower.includes('failed to fetch') ||
    lower.includes('network error')
  ) {
    const mapped = new Error(
      'Cannot reach the server. Check your connection and try again.',
    ) as GoogleAuthFailure;
    mapped.status = 0;
    return mapped;
  }

  const mapped = new Error(message || 'Google Sign-In failed. Please try again.') as GoogleAuthFailure;
  if (status) mapped.status = status;
  if (typeof code === 'string' || typeof code === 'number') mapped.code = String(code);
  return mapped;
}
