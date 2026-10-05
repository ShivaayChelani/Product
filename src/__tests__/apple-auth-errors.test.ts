import {
  isAppleCredentialRevoked,
  isAppleSignInCancelled,
  mapAppleAuthFailure,
} from '../services/appleAuthErrors';

/**
 * `ASAuthorizationError.Code` raw values, as surfaced by the native module
 * (the bridge rejects with the numeric code as a string).
 */
const APPLE_ERROR = {
  unknown: '1000',
  canceled: '1001',
  invalidResponse: '1002',
  notHandled: '1003',
  failed: '1004',
};

function nativeError(code: string, message = 'Apple error') {
  return Object.assign(new Error(message), { code });
}

function apiError(status: number, message: string, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(message), { status, ...extra });
}

describe('isAppleSignInCancelled', () => {
  it('treats a cancelled sheet as a silent no-op, not an error', () => {
    expect(isAppleSignInCancelled(nativeError(APPLE_ERROR.canceled))).toBe(true);
    expect(isAppleSignInCancelled(nativeError(APPLE_ERROR.notHandled))).toBe(true);
    expect(isAppleSignInCancelled(Object.assign(new Error('User canceled'), {}))).toBe(true);
    expect(isAppleSignInCancelled(Object.assign(new Error('x'), { cancelled: true }))).toBe(true);
  });

  it('does not swallow real failures', () => {
    expect(isAppleSignInCancelled(nativeError(APPLE_ERROR.failed, 'failed'))).toBe(false);
    expect(isAppleSignInCancelled(nativeError(APPLE_ERROR.invalidResponse))).toBe(false);
    expect(isAppleSignInCancelled(apiError(401, 'Invalid Apple token signature.'))).toBe(false);
    expect(isAppleSignInCancelled(apiError(409, 'This Apple ID is already linked.'))).toBe(false);
    expect(isAppleSignInCancelled(new Error('Cannot reach the server.'))).toBe(false);
  });
});

describe('isAppleCredentialRevoked', () => {
  it('recognises an explicit revocation marker', () => {
    expect(isAppleCredentialRevoked(Object.assign(new Error('x'), { credentialRevoked: true }))).toBe(true);
    expect(isAppleCredentialRevoked(nativeError('APPLE_CREDENTIAL_REVOKED'))).toBe(true);
  });

  it('does not invent a revocation from unrelated failures', () => {
    expect(isAppleCredentialRevoked(nativeError(APPLE_ERROR.canceled))).toBe(false);
    expect(isAppleCredentialRevoked(apiError(401, 'Apple token has expired.'))).toBe(false);
    expect(isAppleCredentialRevoked(new Error('Network request failed'))).toBe(false);
  });
});

describe('mapAppleAuthFailure', () => {
  it('returns a tagged cancellation the caller can ignore', () => {
    const mapped = mapAppleAuthFailure(nativeError(APPLE_ERROR.canceled));
    expect(mapped.cancelled).toBe(true);
    expect(mapped.code).toBe('SIGN_IN_CANCELLED');
  });

  it('maps a revoked credential to a re-authentication prompt', () => {
    const mapped = mapAppleAuthFailure(
      Object.assign(new Error('x'), { credentialRevoked: true }),
    );
    expect(mapped.credentialRevoked).toBe(true);
    expect(mapped.status).toBe(401);
    expect(mapped.code).toBe('APPLE_CREDENTIAL_REVOKED');
  });

  it('surfaces the Apple ID conflict so the user is not told to retry blindly', () => {
    const mapped = mapAppleAuthFailure(
      apiError(409, 'This PalSafar account is already linked to a different Apple ID.', {
        code: 'APPLE_IDENTITY_CONFLICT',
      }),
    );
    expect(mapped.status).toBe(409);
    expect(mapped.code).toBe('APPLE_IDENTITY_CONFLICT');
    expect(mapped.message).toMatch(/already linked/i);
  });

  it('keeps the server message for token verification failures', () => {
    const mapped = mapAppleAuthFailure(apiError(401, 'Invalid Apple token nonce.'));
    expect(mapped.status).toBe(401);
    expect(mapped.message).toBe('Invalid Apple token nonce.');
  });

  it('explains the case where Apple shares no email rather than showing a raw error', () => {
    const mapped = mapAppleAuthFailure(
      apiError(400, 'Apple did not share an email address for this sign-in.'),
    );
    expect(mapped.status).toBe(400);
    expect(mapped.message).toMatch(/did not share an email/i);
  });

  it('classifies offline failures distinctly from server errors', () => {
    const offline = mapAppleAuthFailure(new Error('Network request failed'));
    expect(offline.status).toBe(0);
    expect(offline.message).toMatch(/connection/i);

    const serverError = mapAppleAuthFailure(apiError(503, 'Service Unavailable'));
    expect(serverError.status).toBe(503);
  });

  it('rate limits and always produces a user-safe message', () => {
    expect(mapAppleAuthFailure(apiError(429, 'Too many')).status).toBe(429);

    for (const input of [
      nativeError(APPLE_ERROR.unknown),
      nativeError(APPLE_ERROR.notHandled),
      nativeError(APPLE_ERROR.invalidResponse),
      new Error(''),
    ]) {
      const mapped = mapAppleAuthFailure(input);
      expect(typeof mapped.message).toBe('string');
      expect(mapped.message.length).toBeGreaterThan(0);
    }
  });
});
