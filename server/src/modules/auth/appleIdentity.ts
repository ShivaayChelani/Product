import crypto from 'crypto';
import jwt, { type JwtHeader, type JwtPayload } from 'jsonwebtoken';
import { ApiError } from '../../shared/utils/ApiError';
import { normalizeEmail } from '../../shared/utils/userEmailLookup';
import { logger } from '../../config/logger';

export const APPLE_PROVIDER = 'apple';

/** Apple's only identity issuer. */
const APPLE_ISSUER = 'https://appleid.apple.com';

/** Apple's published JWKS endpoint. Apple rotates these keys periodically. */
const APPLE_JWKS_URI = 'https://appleid.apple.com/auth/keys';

/**
 * Native iOS sign-in sets `aud` to the App ID (the bundle identifier). A Services
 * ID (app-specific password / web sign-in) is accepted only when explicitly
 * allow-listed, so a token minted for an unrelated app in the same team is rejected.
 */
const DEFAULT_APPLE_AUDIENCES = ['com.palsasafar'];

/** JWKS documents are tiny; anything larger is a proxy/error page, not Apple's key set. */
const MAX_JWKS_BYTES = 64 * 1024;
const JWKS_FETCH_TIMEOUT_MS = 5000;
/** Apple's guidance is to refetch on an unknown `kid`; TTL bounds staleness otherwise. */
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;

export type VerifiedAppleIdentity = {
  /** Apple's stable, team-scoped user identifier. The ONLY key for account identity. */
  sub: string;
  /** Null when the user chose to hide their address and it is not recoverable. */
  email: string | null;
  emailVerified: boolean;
  /** Apple supplies the name only on the very first authorization for an app. */
  fullName: string | null;
  /** Apple's "Hide My Email" relay domain; purely informational. */
  isPrivateRelay: boolean;
};

type AppleJwk = crypto.JsonWebKey & { kid?: string; alg?: string; use?: string };

const PRIVATE_RELAY_DOMAIN = 'privaterelay.appleid.com';

let jwksCache: { keys: AppleJwk[]; fetchedAt: number } | null = null;
let jwksInFlight: Promise<AppleJwk[]> | null = null;

function splitClientIds(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getAppleAudiences(): string[] {
  const ids = new Set<string>(DEFAULT_APPLE_AUDIENCES);
  for (const id of splitClientIds(process.env.APPLE_CLIENT_IDS)) ids.add(id);
  for (const id of splitClientIds(process.env.APPLE_SERVICE_IDS)) ids.add(id);
  return [...ids];
}

export function isApplePrivateRelayEmail(email: string): boolean {
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  return email.slice(at + 1).toLowerCase() === PRIVATE_RELAY_DOMAIN;
}

function mapAppleVerifyError(error: unknown): ApiError {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const lower = message.toLowerCase();
  if (lower.includes('expired')) {
    return new ApiError(401, 'Apple token has expired.');
  }
  if (lower.includes('invalid signature') || lower.includes('verification failed')) {
    return new ApiError(401, 'Invalid Apple token signature.');
  }
  if (lower.includes('malformed') || lower.includes('jwt must be provided')) {
    return new ApiError(401, 'Invalid Apple token.');
  }
  if (lower.includes('not enough') || lower.includes('unable to verify')) {
    return new ApiError(401, 'Invalid Apple token.');
  }
  return new ApiError(401, 'Invalid Apple token.');
}

/**
 * Apple does not publish a Go/Rust-friendly key file ? verification requires its
 * JWKS. Fetched with a strict size cap and short timeout; the response is trusted
 * only because it arrives over TLS from Apple's own host, and every token is still
 * signature-checked against a key from that set before any claim is read.
 */
async function fetchJwks(): Promise<AppleJwk[]> {
  if (jwksInFlight) return jwksInFlight;

  jwksInFlight = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), JWKS_FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(APPLE_JWKS_URI, {
        method: 'GET',
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
      if (!res.ok) {
        throw new Error(`Apple JWKS endpoint returned ${res.status}`);
      }
      const body = await res.text();
      if (body.length > MAX_JWKS_BYTES) {
        throw new Error('Apple JWKS response exceeded the size limit');
      }
      const parsed = JSON.parse(body) as { keys?: unknown };
      if (!Array.isArray(parsed.keys) || parsed.keys.length === 0) {
        throw new Error('Apple JWKS response contained no keys');
      }
      return parsed.keys as AppleJwk[];
    } finally {
      clearTimeout(timer);
      jwksInFlight = null;
    }
  })();

  return jwksInFlight;
}

async function getKeys(forceRefresh = false): Promise<AppleJwk[]> {
  const cached = jwksCache;
  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < JWKS_CACHE_TTL_MS) {
    return cached.keys;
  }

  const keys = await fetchJwks();
  jwksCache = { keys, fetchedAt: Date.now() };
  return keys;
}

function toPem(jwk: AppleJwk): string {
  const key = crypto.createPublicKey({ key: jwk as crypto.JsonWebKey, format: 'jwk' });
  return key.export({ type: 'spki', format: 'pem' }).toString();
}

/**
 * Resolve the signing key for a token. Unknown `kid` triggers exactly one forced
 * refresh (Apple rotates keys without warning, and a stale cache would otherwise
 * reject every sign-in for up to an hour).
 */
async function resolveVerificationKey(token: string): Promise<{ pem: string; alg: string }> {
  const decoded = jwt.decode(token, { complete: true });
  const header = (decoded?.header ?? {}) as JwtHeader;
  const kid = typeof header.kid === 'string' ? header.kid : '';
  const alg = typeof header.alg === 'string' ? header.alg : '';

  // Apple signs identity tokens with RS256 only. Reject `none` and HMAC up front so a
  // forged token can never reach the claim layer.
  if (alg !== 'RS256') {
    throw new ApiError(401, 'Invalid Apple token algorithm.');
  }
  if (!kid) {
    throw new ApiError(401, 'Invalid Apple token.');
  }

  let keys = await getKeys();
  let jwk = keys.find((candidate) => candidate.kid === kid && candidate.use === 'sig');
  if (!jwk) {
    keys = await getKeys(true);
    jwk = keys.find((candidate) => candidate.kid === kid && candidate.use === 'sig');
  }
  if (!jwk) {
    throw new ApiError(401, 'Invalid Apple token.');
  }

  try {
    return { pem: toPem(jwk), alg };
  } catch {
    throw new ApiError(401, 'Invalid Apple token.');
  }
}

function audienceMatches(aud: JwtPayload['aud'], allowed: string[]): boolean {
  const values = Array.isArray(aud) ? aud : [aud];
  return values.some((value) => typeof value === 'string' && allowed.includes(value));
}

function isAppleEmailVerified(value: unknown): boolean {
  return value === true || value === 'true';
}

/**
 * Apple ships the user's name OUT OF BAND ? it is never inside the identity token.
 * It is only attached to the first authorization for an app, so the caller forwards
 * it and it is treated as best-effort enrichment, never as identity.
 */
export function joinAppleFullName(parts?: {
  firstName?: string | null;
  lastName?: string | null;
}): string | null {
  const given = (parts?.firstName ?? '').trim();
  const family = (parts?.lastName ?? '').trim();
  const full = [given, family].filter(Boolean).join(' ').trim();
  return full ? full.slice(0, 120) : null;
}

export function assertAppleIdentityTokenClaims(
  payload: JwtPayload | null | undefined,
  audiences: string[] = getAppleAudiences(),
): VerifiedAppleIdentity {
  if (!payload) {
    throw new ApiError(401, 'Invalid Apple token.');
  }

  if (payload.iss !== APPLE_ISSUER) {
    throw new ApiError(401, 'Invalid Apple token issuer.');
  }

  if (!audienceMatches(payload.aud, audiences)) {
    throw new ApiError(401, 'Invalid Apple token audience.');
  }

  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) {
    throw new ApiError(401, 'Apple token has expired.');
  }

  const sub = typeof payload.sub === 'string' ? payload.sub.trim() : '';
  if (!sub) {
    throw new ApiError(401, 'Invalid Apple token.');
  }

  const emailRaw = typeof payload.email === 'string' ? payload.email.trim() : '';
  const email = emailRaw ? normalizeEmail(emailRaw) : null;

  // Apple omits `email` for repeat authorizations when the app did not persist it,
  // and omits it entirely when the user declines the email scope. `sub` remains valid.
  const emailVerified = email ? isAppleEmailVerified(payload.email_verified) : false;

  return {
    sub,
    email,
    emailVerified,
    fullName: null,
    isPrivateRelay: email ? isApplePrivateRelayEmail(email) : false,
  };
}

/**
 * Constant-time nonce comparison. The client sends the RAW nonce; the library
 * SHA-256 hashes it before handing it to Apple, so the token carries the digest.
 */
export function verifyAppleNonce(tokenNonce: unknown, clientNonce: string): void {
  const expected = crypto.createHash('sha256').update(clientNonce).digest('hex');
  const actual = typeof tokenNonce === 'string' ? tokenNonce : '';

  const actualBuf = Buffer.from(actual, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (actualBuf.length !== expectedBuf.length) {
    throw new ApiError(401, 'Invalid Apple token nonce.');
  }
  if (!crypto.timingSafeEqual(actualBuf, expectedBuf)) {
    throw new ApiError(401, 'Invalid Apple token nonce.');
  }
}

export async function verifyAppleIdentityToken(
  identityToken: string,
  expectedNonce: string | null | undefined,
): Promise<VerifiedAppleIdentity> {
  if (typeof identityToken !== 'string' || !identityToken.trim()) {
    throw new ApiError(401, 'Invalid Apple token.');
  }

  // Mandatory, not optional. The client chooses this value and Apple only echoes its
  // SHA-256 digest back, so a token captured from another app, or replayed into this
  // endpoint by something that never saw the client's request, cannot verify.
  if (typeof expectedNonce !== 'string' || !expectedNonce.trim()) {
    throw new ApiError(401, 'Invalid Apple token nonce.');
  }

  const audiences = getAppleAudiences();
  if (audiences.length === 0) {
    throw new ApiError(503, 'Sign in with Apple is not configured.');
  }

  const token = identityToken.trim();
  const { pem } = await resolveVerificationKey(token);

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, pem, { algorithms: ['RS256'] }) as JwtPayload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.warn({ err: error instanceof Error ? error.message : 'unknown' }, 'Apple identity token signature verification failed');
    throw mapAppleVerifyError(error);
  }

  const identity = assertAppleIdentityTokenClaims(payload, audiences);

  verifyAppleNonce(payload.nonce, expectedNonce.trim());

  return identity;
}
