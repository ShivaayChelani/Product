import crypto from 'crypto';
import { env } from '../../config/env';

/**
 * Stateless, signed read-only trip share tokens.
 *
 * Format: `<base64url(payload)>.<hex(hmac)>` where payload is
 * `{ v: 1, tripId, exp }`. The HMAC uses the same server secret as JWT tokens,
 * so a forged/tampered token is rejected with constant-time comparison and an
 * expired token is refused. No DB rows or schema migration required.
 */
const VERSION = 1;
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const TRIP_SHARE_TOKEN_TTL_MS = DEFAULT_TTL_MS;

function sign(payload: string): string {
  return crypto
    .createHmac('sha256', env.jwt.secret)
    .update(`trip-share:${payload}`)
    .digest('hex');
}

/** Create a signed read-only token granting access until `exp`. */
export function createTripShareToken(
  tripId: string,
  ttlMs: number = DEFAULT_TTL_MS,
): string {
  const payload = Buffer.from(
    JSON.stringify({ v: VERSION, tripId, exp: Date.now() + ttlMs }),
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

/** Verify a token and return its decoded trip id, or null when invalid. */
export function verifyTripShareToken(token: string): { tripId: string; exp: number } | null {
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  if (sig.length !== expected.length) return null;
  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      v?: number;
      tripId?: string;
      exp?: number;
    };
    if (parsed.v !== VERSION || typeof parsed.tripId !== 'string' || typeof parsed.exp !== 'number') {
      return null;
    }
    if (parsed.exp < Date.now()) return null;
    return { tripId: parsed.tripId, exp: parsed.exp };
  } catch {
    return null;
  }
}