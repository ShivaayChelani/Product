import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { TokenPayload } from 'google-auth-library';

const { verifyIdTokenMock } = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
}));

vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    verifyIdToken(args: unknown) {
      return verifyIdTokenMock(args);
    }
  },
}));

import {
  assertGoogleIdTokenClaims,
  getGoogleOAuthAudiences,
  DEFAULT_GOOGLE_OAUTH_CLIENT_IDS,
  verifyGoogleIdToken,
} from '../modules/auth/googleIdentity';
import { googleLoginSchema } from '../modules/auth/auth.validation';
import { ApiError } from '../shared/utils/ApiError';

const WEB_AUD = DEFAULT_GOOGLE_OAUTH_CLIENT_IDS[0];

function payload(overrides: Partial<TokenPayload> = {}): TokenPayload {
  return {
    iss: 'https://accounts.google.com',
    sub: 'google-sub-1',
    aud: WEB_AUD,
    email: 'explorer@gmail.com',
    email_verified: true,
    name: 'Explorer',
    picture: 'https://lh3.googleusercontent.com/a/pic',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

describe('Google ID token claims', () => {
  const saved: Record<string, string | undefined> = {};
  const envKeys = [
    'GOOGLE_WEB_CLIENT_ID',
    'GOOGLE_IOS_CLIENT_ID',
    'GOOGLE_ANDROID_CLIENT_IDS',
    'GOOGLE_OAUTH_CLIENT_IDS',
  ];

  beforeEach(() => {
    for (const key of envKeys) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    verifyIdTokenMock.mockReset();
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('includes the server web client ID in the default audience list', () => {
    const audiences = getGoogleOAuthAudiences();
    expect(audiences).toContain(WEB_AUD);
    expect(audiences).toEqual(expect.arrayContaining([...DEFAULT_GOOGLE_OAUTH_CLIENT_IDS]));
  });

  it('accepts extra client IDs from env without dropping defaults', () => {
    process.env.GOOGLE_IOS_CLIENT_ID = 'ios-client.apps.googleusercontent.com';
    expect(getGoogleOAuthAudiences()).toContain('ios-client.apps.googleusercontent.com');
    expect(getGoogleOAuthAudiences()).toContain(WEB_AUD);
  });

  it('extracts trusted Google identity from a valid payload', () => {
    const identity = assertGoogleIdTokenClaims(payload());
    expect(identity).toEqual({
      sub: 'google-sub-1',
      email: 'explorer@gmail.com',
      emailVerified: true,
      name: 'Explorer',
      picture: 'https://lh3.googleusercontent.com/a/pic',
    });
  });

  it('rejects an unverified Google email', () => {
    expect(() => assertGoogleIdTokenClaims(payload({ email_verified: false }))).toThrow(ApiError);
    try {
      assertGoogleIdTokenClaims(payload({ email_verified: false }));
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 401, message: 'Google email is not verified.' });
    }
  });

  it('rejects a missing issuer or non-Google issuer', () => {
    expect(() => assertGoogleIdTokenClaims(payload({ iss: 'https://evil.example' }))).toThrow(/issuer/i);
  });

  it('rejects the wrong audience', () => {
    expect(() =>
      assertGoogleIdTokenClaims(payload({ aud: 'wrong-client.apps.googleusercontent.com' })),
    ).toThrow(/audience/i);
  });

  it('rejects an expired token', () => {
    expect(() =>
      assertGoogleIdTokenClaims(payload({ exp: Math.floor(Date.now() / 1000) - 60 })),
    ).toThrow(/expired/i);
  });

  it('never trusts an email-less payload', () => {
    expect(() => assertGoogleIdTokenClaims(payload({ email: undefined }))).toThrow(/email/i);
  });

  it('verifyGoogleIdToken maps library expiry errors', async () => {
    verifyIdTokenMock.mockRejectedValue(new Error('Token used too late, 0 > 1'));
    await expect(verifyGoogleIdToken('header.payload.sig')).rejects.toMatchObject({
      statusCode: 401,
      message: 'Google token has expired.',
    });
  });

  it('verifyGoogleIdToken maps wrong-audience library errors', async () => {
    verifyIdTokenMock.mockRejectedValue(new Error('Wrong recipient, payload audience != requiredAudience'));
    await expect(verifyGoogleIdToken('header.payload.sig')).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid Google token audience.',
    });
  });

  it('verifyGoogleIdToken maps other verification failures as invalid', async () => {
    verifyIdTokenMock.mockRejectedValue(new Error('Invalid token signature'));
    await expect(verifyGoogleIdToken('forged')).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid Google token.',
    });
  });

  it('verifyGoogleIdToken returns claims from a verified ticket', async () => {
    verifyIdTokenMock.mockResolvedValue({ getPayload: () => payload() });
    await expect(verifyGoogleIdToken('real-token')).resolves.toMatchObject({
      sub: 'google-sub-1',
      email: 'explorer@gmail.com',
    });
    expect(verifyIdTokenMock).toHaveBeenCalledWith(
      expect.objectContaining({ idToken: 'real-token', audience: expect.arrayContaining([WEB_AUD]) }),
    );
  });
});

describe('googleLoginSchema', () => {
  it('accepts only idToken and rejects client-forged identity fields', () => {
    expect(googleLoginSchema.parse({ idToken: 'abc' })).toEqual({ idToken: 'abc' });
    expect(() =>
      googleLoginSchema.parse({
        idToken: 'abc',
        email: 'admin@palsafar.com',
        userId: 'forged',
        role: 'ADMIN',
        permission: 'ADMIN',
        points: 99999,
        activeMode: 'ADMIN',
      }),
    ).toThrow();
  });
});
