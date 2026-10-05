export type AppleAuthFailure = Error & {
  status?: number;
  code?: string;
  cancelled?: boolean;
  /** Apple reported the credential as revoked ? the account must re-authenticate. */
  credentialRevoked?: boolean;
};

function asRecord(error: unknown): Record<string, unknown> {
  if (error && typeof error === 'object') return error as Record<string, unknown>;
  return {};
}

function readCode(error: unknown): string {
  const rec = asRecord(error);
  const raw = rec.code;
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number') return String(raw);
  return '';
}

function readMessage(error: unknown): string {
  return String(asRecord(error).message || '');
}

/**
 * `ASAuthorizationError` codes surfaced by the native module.
 * 1000 unknown ? 1001 canceled ? 1002 invalid response ? 1003 not handled ? 1004 failed
 */
const APPLE_ERROR_UNKNOWN = '1000';
const APPLE_ERROR_CANCELED = '1001';
const APPLE_ERROR_INVALID_RESPONSE = '1002';
const APPLE_ERROR_NOT_HANDLED = '1003';
const APPLE_ERROR_FAILED = '1004';

export function isAppleSignInCancelled(error: unknown): boolean {
  const rec = asRecord(error);
  const code = readCode(error);
  const message = readMessage(error).toLowerCase();

  if (rec.cancelled === true) return true;
  if (code === APPLE_ERROR_CANCELED || code === '1001') return true;
  // The sheet reports a tap-outside dismissal as "not handled" in some OS versions.
  if (code === APPLE_ERROR_NOT_HANDLED || code === '1003') return true;
  if (
    message.includes('canceled') ||
    message.includes('cancelled') ||
    message.includes('user canceled') ||
    message.includes('user did not complete')
  ) {
    return true;
  }
  return false;
}

/** True when Apple no longer vouches for this `sub` (the user unlinked the app). */
export function isAppleCredentialRevoked(error: unknown): boolean {
  const rec = asRecord(error);
  if (rec.credentialRevoked === true) return true;
  const code = readCode(error);
  if (code === 'APPLE_CREDENTIAL_REVOKED') return true;
  const message = readMessage(error).toLowerCase();
  return (
    message.includes('credentialrevoked') ||
    message.includes('credential revoked') ||
    message.includes('revoked the authorization')
  );
}

export function mapAppleAuthFailure(error: unknown): AppleAuthFailure {
  if (isAppleSignInCancelled(error)) {
    const cancelled = new Error('Sign in with Apple was cancelled.') as AppleAuthFailure;
    cancelled.cancelled = true;
    cancelled.code = 'SIGN_IN_CANCELLED';
    return cancelled;
  }

  if (isAppleCredentialRevoked(error)) {
    const revoked = new Error(
      'Your Apple ID access to PalSafar was revoked. Please sign in again.',
    ) as AppleAuthFailure;
    revoked.code = 'APPLE_CREDENTIAL_REVOKED';
    revoked.credentialRevoked = true;
    revoked.status = 401;
    return revoked;
  }

  const rec = asRecord(error);
  const code = readCode(error);
  const status = typeof rec.status === 'number' ? rec.status : undefined;
  const message = readMessage(error);
  const lower = message.toLowerCase();

  if (code === APPLE_ERROR_NOT_HANDLED || code === APPLE_ERROR_UNKNOWN || code === APPLE_ERROR_FAILED) {
    const mapped = new Error('Sign in with Apple did not complete. Please try again.') as AppleAuthFailure;
    mapped.code = code || APPLE_ERROR_UNKNOWN;
    mapped.status = 502;
    return mapped;
  }

  if (code === APPLE_ERROR_INVALID_RESPONSE) {
    const mapped = new Error(
      'Apple returned an incomplete response. Please try signing in again.',
    ) as AppleAuthFailure;
    mapped.code = code;
    mapped.status = 502;
    return mapped;
  }

  if (status === 409 || rec.code === 'APPLE_IDENTITY_CONFLICT') {
    const mapped = new Error(
      message || 'This Apple ID is already linked to a different PalSafar account.',
    ) as AppleAuthFailure;
    mapped.status = 409;
    mapped.code = typeof rec.code === 'string' ? rec.code : 'APPLE_IDENTITY_CONFLICT';
    return mapped;
  }

  if (status === 401) {
    const mapped = new Error(
      message || 'Apple Sign-In could not be verified. Please try again.',
    ) as AppleAuthFailure;
    mapped.status = 401;
    return mapped;
  }

  if (status === 429) {
    const mapped = new Error(
      'Too many attempts. Please try again in a few minutes.',
    ) as AppleAuthFailure;
    mapped.status = 429;
    return mapped;
  }

  if (status === 400) {
    const mapped = new Error(
      message || 'Apple Sign-In request was invalid. Please try again.',
    ) as AppleAuthFailure;
    mapped.status = 400;
    return mapped;
  }

  if (status !== undefined && status >= 500) {
    const mapped = new Error(
      'PalSafar could not complete Apple Sign-In. Please try again.',
    ) as AppleAuthFailure;
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
    ) as AppleAuthFailure;
    mapped.status = 0;
    return mapped;
  }

  const mapped = new Error(message || 'Sign in with Apple failed. Please try again.') as AppleAuthFailure;
  if (status !== undefined) mapped.status = status;
  if (code) mapped.code = code;
  return mapped;
}
