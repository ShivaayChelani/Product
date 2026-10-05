import { describe, it, expect, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const APPLE_ISSUER = 'https://appleid.apple.com';
const BUNDLE_ID = 'com.palsasafar';
const KID = 'apple-signing-key-1';

const signing = (() => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { format: 'jwk' },
    privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
  });
  return { publicKey, privateKey };
})();

/** The JWKS entry Apple would publish: RSA public params plus `kid`/`alg`/`use`. */
const appleJwk = {
  ...(signing.publicKey as crypto.JsonWebKey),
  kid: KID,
  alg: 'RS256',
  use: 'sig',
};

const attacker = (() => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { format: 'jwk' },
    privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
  });
  return { privateKey };
})();

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function signToken(payload: Record<string, unknown>, key = signing.privateKey, kid: string | undefined = KID) {
  return jwt.sign(payload, key, { algorithm: 'RS256', keyid: kid, noTimestamp: true });
}

function claims(overrides: Record<string, unknown> = {}, rawNonce = 'client-nonce') {
  return {
    iss: APPLE_ISSUER,
    sub: '001234.abcdef.1234',
    aud: BUNDLE_ID,
    exp: Math.floor(Date.now() / 1000) + 300,
    nonce: sha256(rawNonce),
    ...overrides,
  };
}

let jwksFetches = 0;

/**
 * `appleIdentity` memoizes JWKS in module scope, so each test gets a pristine module
 * graph. Otherwise a key cached by one test would satisfy another.
 */
async function freshModule(keys: unknown[] = [appleJwk]) {
  vi.resetModules();
  jwksFetches = 0;
  globalThis.fetch = vi.fn(async (url: string | URL) => {
    if (String(url) === 'https://appleid.apple.com/auth/keys') {
      jwksFetches += 1;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ keys }),
      } as unknown as Response;
    }
    throw new Error(`unexpected fetch: ${String(url)}`);
  }) as unknown as typeof fetch;

  return import('../modules/auth/appleIdentity');
}

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.APPLE_CLIENT_IDS;
  delete process.env.APPLE_SERVICE_IDS;
});

describe('Apple audience allow-list', () => {
  it('always accepts the native bundle ID and adds configured ids', async () => {
    const { getAppleAudiences } = await freshModule();
    expect(getAppleAudiences()).toContain(BUNDLE_ID);

    process.env.APPLE_SERVICE_IDS = 'com.palsasafar.web';
    process.env.APPLE_CLIENT_IDS = ' com.palsasafar.ios , com.palsasafar.mac ';
    expect(getAppleAudiences()).toEqual(
      expect.arrayContaining([BUNDLE_ID, 'com.palsasafar.web', 'com.palsasafar.ios', 'com.palsasafar.mac']),
    );
  });
});

describe('Apple private relay detection', () => {
  it('flags only the Apple relay domain, case-insensitively', async () => {
    const { isApplePrivateRelayEmail } = await freshModule();
    expect(isApplePrivateRelayEmail('abc123@privaterelay.appleid.com')).toBe(true);
    expect(isApplePrivateRelayEmail('abc123@PrivateRelay.AppleID.com')).toBe(true);
    expect(isApplePrivateRelayEmail('user@gmail.com')).toBe(false);
    expect(isApplePrivateRelayEmail('not-an-email')).toBe(false);
  });
});

describe('Apple claim assertions', () => {
  it('extracts sub, relay email and verified flag', async () => {
    const { assertAppleIdentityTokenClaims } = await freshModule();
    const identity = assertAppleIdentityTokenClaims(
      claims({ email: 'X9y@privaterelay.appleid.com', email_verified: true }) as never,
    );
    expect(identity).toMatchObject({
      sub: '001234.abcdef.1234',
      email: 'x9y@privaterelay.appleid.com',
      emailVerified: true,
      isPrivateRelay: true,
    });
  });

  it('keeps sub usable when Apple omits email on repeat authorization', async () => {
    const { assertAppleIdentityTokenClaims } = await freshModule();
    const identity = assertAppleIdentityTokenClaims(claims() as never);
    expect(identity).toEqual({
      sub: '001234.abcdef.1234',
      email: null,
      emailVerified: false,
      fullName: null,
      isPrivateRelay: false,
    });
  });

  it('honours email_verified only when Apple sends a true boolean or "true"', async () => {
    const { assertAppleIdentityTokenClaims } = await freshModule();
    const verified = (email_verified: unknown) =>
      assertAppleIdentityTokenClaims(
        claims({ email: 'user@privaterelay.appleid.com', email_verified }) as never,
      ).emailVerified;

    expect(verified(true)).toBe(true);
    expect(verified('true')).toBe(true);
    // Anything else, including the string "false", must not count as verified.
    expect(verified(false)).toBe(false);
    expect(verified('false')).toBe(false);
    expect(verified('1')).toBe(false);
    expect(verified(undefined)).toBe(false);
    expect(verified(null)).toBe(false);
  });

  it('rejects a foreign issuer, wrong audience, expired token and missing sub', async () => {
    const { assertAppleIdentityTokenClaims } = await freshModule();
    expect(() => assertAppleIdentityTokenClaims(claims({ iss: 'https://evil.example' }) as never)).toThrow(
      /issuer/i,
    );
    expect(() => assertAppleIdentityTokenClaims(claims({ aud: 'com.other.app' }) as never)).toThrow(
      /audience/i,
    );
    expect(() =>
      assertAppleIdentityTokenClaims(claims({ exp: Math.floor(Date.now() / 1000) - 1 }) as never),
    ).toThrow(/expired/i);
    expect(() => assertAppleIdentityTokenClaims(claims({ sub: '   ' }) as never)).toThrow(
      /Invalid Apple token/,
    );
    expect(() => assertAppleIdentityTokenClaims(null)).toThrow(/Invalid Apple token/);
  });
});

describe('Apple name enrichment', () => {
  it('joins given and family names and drops empties', async () => {
    const { joinAppleFullName } = await freshModule();
    expect(joinAppleFullName({ firstName: 'Ada', lastName: 'Lovelace' })).toBe('Ada Lovelace');
    expect(joinAppleFullName({ firstName: 'Ada', lastName: '  ' })).toBe('Ada');
    expect(joinAppleFullName({ lastName: 'Lovelace' })).toBe('Lovelace');
    expect(joinAppleFullName({})).toBeNull();
    expect(joinAppleFullName(undefined)).toBeNull();
  });

  it('never puts the name into the identity token payload', async () => {
    // Apple returns the name out of band; identity must stay sub/email only.
    const { assertAppleIdentityTokenClaims } = await freshModule();
    expect(assertAppleIdentityTokenClaims(claims({ name: 'Injected' }) as never).fullName).toBeNull();
  });
});

describe('Apple nonce verification', () => {
  it('accepts the digest of the raw client nonce and rejects anything else', async () => {
    const { verifyAppleNonce } = await freshModule();
    expect(() => verifyAppleNonce(sha256('raw-nonce'), 'raw-nonce')).not.toThrow();
    expect(() => verifyAppleNonce(sha256('other'), 'raw-nonce')).toThrow(/nonce/i);
    expect(() => verifyAppleNonce('raw-nonce', 'raw-nonce')).toThrow(/nonce/i);
    expect(() => verifyAppleNonce(undefined, 'raw-nonce')).toThrow(/nonce/i);
  });
});

describe('verifyAppleIdentityToken ? signature and claims over the wire', () => {
  const RAW_NONCE = '0f8a-client-nonce-4a2b';

  it('accepts a correctly signed Apple token', async () => {
    const { verifyAppleIdentityToken } = await freshModule();
    const token = signToken(claims({ email: 'user@gmail.com', email_verified: true }, RAW_NONCE));
    await expect(verifyAppleIdentityToken(token, RAW_NONCE)).resolves.toMatchObject({
      sub: '001234.abcdef.1234',
      email: 'user@gmail.com',
      emailVerified: true,
    });
  });

  it('rejects a token signed by a key outside the JWKS', async () => {
    const { verifyAppleIdentityToken } = await freshModule();
    const token = signToken(claims({}, RAW_NONCE), attacker.privateKey);
    await expect(verifyAppleIdentityToken(token, RAW_NONCE)).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid Apple token signature.',
    });
  });

  it('rejects alg=none and HMAC before any claim is read', async () => {
    const { verifyAppleIdentityToken } = await freshModule();
    const header = Buffer.from(JSON.stringify({ alg: 'none', kid: KID })).toString('base64url');
    const body = Buffer.from(JSON.stringify(claims({}, RAW_NONCE))).toString('base64url');
    await expect(verifyAppleIdentityToken(`${header}.${body}.`, RAW_NONCE)).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid Apple token algorithm.',
    });

    const hs = jwt.sign(claims({}, RAW_NONCE), 'secret', { algorithm: 'HS256', keyid: KID });
    await expect(verifyAppleIdentityToken(hs, RAW_NONCE)).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid Apple token algorithm.',
    });
  });

  it('refetches JWKS once when kid is unknown (Apple key rotation)', async () => {
    const { verifyAppleIdentityToken } = await freshModule();
    const token = signToken(claims({}, RAW_NONCE), signing.privateKey, 'rotated-kid');
    await expect(verifyAppleIdentityToken(token, RAW_NONCE)).rejects.toMatchObject({ statusCode: 401 });
    // cached (1) + forced refresh after unknown kid (1)
    expect(jwksFetches).toBe(2);
  });

  it('caches JWKS within the TTL so normal traffic does not hammer Apple', async () => {
    const { verifyAppleIdentityToken } = await freshModule();
    const token = signToken(claims({}, RAW_NONCE));
    await verifyAppleIdentityToken(token, RAW_NONCE);
    await verifyAppleIdentityToken(token, RAW_NONCE);
    await verifyAppleIdentityToken(token, RAW_NONCE);
    expect(jwksFetches).toBe(1);
  });

  it('rejects an expired token and a nonce mismatch', async () => {
    const { verifyAppleIdentityToken } = await freshModule();
    const expired = signToken(claims({ exp: Math.floor(Date.now() / 1000) - 1 }, RAW_NONCE));
    await expect(verifyAppleIdentityToken(expired, RAW_NONCE)).rejects.toMatchObject({ statusCode: 401 });

    const good = signToken(claims({}, RAW_NONCE));
    await expect(verifyAppleIdentityToken(good, 'a-different-nonce')).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid Apple token nonce.',
    });
  });

  it('requires a client nonce ? an omitted one must not skip verification', async () => {
    const { verifyAppleIdentityToken } = await freshModule();
    const token = signToken(claims({}, RAW_NONCE));
    await expect(verifyAppleIdentityToken(token, undefined)).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid Apple token nonce.',
    });
    await expect(verifyAppleIdentityToken(token, '')).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid Apple token nonce.',
    });
  });

  it('rejects a malformed or empty token without a network call', async () => {
    const { verifyAppleIdentityToken } = await freshModule();
    await expect(verifyAppleIdentityToken('', RAW_NONCE)).rejects.toMatchObject({ statusCode: 401 });
    await expect(verifyAppleIdentityToken('not-a-jwt', RAW_NONCE)).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('fails closed when Apple serves an empty or non-JSON key set', async () => {
    const { verifyAppleIdentityToken } = await freshModule([]);
    await expect(verifyAppleIdentityToken(signToken(claims({}, RAW_NONCE)), RAW_NONCE)).rejects.toThrow();

    const broken = await freshModule();
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => '<html>maintenance</html>',
    })) as unknown as typeof fetch;
    await expect(
      broken.verifyAppleIdentityToken(signToken(claims({}, RAW_NONCE)), RAW_NONCE),
    ).rejects.toThrow();
  });
});

describe('appleLoginSchema', () => {
  it('accepts only provider-verified inputs and rejects client-forged identity', async () => {
    const { appleLoginSchema } = await import('../modules/auth/auth.validation');
    const valid = { identityToken: 'abc.def.ghi', nonce: '0f8a-client-nonce-4a2b' };
    expect(appleLoginSchema.parse(valid)).toEqual(valid);

    // A nonce too short to be a real client nonce must not pass validation.
    expect(() => appleLoginSchema.parse({ ...valid, nonce: 'short' })).toThrow();

    expect(() =>
      appleLoginSchema.parse({
        ...valid,
        email: 'admin@palsafar.com',
        sub: 'forged',
        userId: 'forged',
        role: 'ADMIN',
        emailVerified: true,
        isPrivateRelay: false,
        fullName: 'Forged',
      }),
    ).toThrow();
  });
});
