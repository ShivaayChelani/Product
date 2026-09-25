import { describe, expect, it } from 'vitest';
import {
  createTripShareToken,
  verifyTripShareToken,
  TRIP_SHARE_TOKEN_TTL_MS,
} from '../modules/trips/shareToken';

describe('trip share tokens', () => {
  const tripId = 'trip_1a2b3c4d';

  it('round-trips a valid token into the same trip id', () => {
    const token = createTripShareToken(tripId);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(2);
    const parsed = verifyTripShareToken(token);
    expect(parsed).not.toBeNull();
    expect(parsed!.tripId).toBe(tripId);
    expect(parsed!.exp).toBeGreaterThan(Date.now());
    expect(parsed!.exp - Date.now()).toBeLessThanOrEqual(TRIP_SHARE_TOKEN_TTL_MS);
  });

  it('rejects a tampered payload with a valid-looking signature', () => {
    const token = createTripShareToken(tripId);
    const [payload, sig] = token.split('.');
    const tamperedPayload = payload.slice(0, payload.length - 2) + 'xx';
    expect(verifyTripShareToken(`${tamperedPayload}.${sig}`)).toBeNull();
  });

  it('rejects a token whose signature was replaced', () => {
    const token = createTripShareToken(tripId);
    const [payload] = token.split('.');
    expect(verifyTripShareToken(`${payload}.${'a'.repeat(64)}`)).toBeNull();
  });

  it('rejects an expired token', () => {
    const token = createTripShareToken(tripId, -20_000);
    expect(verifyTripShareToken(token)).toBeNull();
  });

  it('rejects empty / malformed input', () => {
    expect(verifyTripShareToken('')).toBeNull();
    expect(verifyTripShareToken('no-dot')).toBeNull();
    expect(verifyTripShareToken('a.b.c')).toBeNull();
    expect(verifyTripShareToken('too-many.parts.here')).toBeNull();
  });

  it('produces different tokens for different trips', () => {
    const a = createTripShareToken(tripId);
    const b = createTripShareToken('trip_999999999999999999999');
    expect(a).not.toBe(b);
    expect(verifyTripShareToken(b)!.tripId).toBe('trip_999999999999999999999');
  });

  it('never lets the trip id leak unsecured into the token', () => {
    const token = createTripShareToken(tripId);
    expect(token).not.toContain(tripId);
  });
});

describe('TRIP_SHARE_TOKEN_TTL_MS', () => {
  it('is a positive portable lifetime', () => {
    expect(TRIP_SHARE_TOKEN_TTL_MS).toBeGreaterThan(0);
    expect(Number.isFinite(TRIP_SHARE_TOKEN_TTL_MS)).toBe(true);
  });
});