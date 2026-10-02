/**
 * Focused coverage for Google Sign-In failure diagnostics.
 *
 * The regression these guard: native DEVELOPER_ERROR (10) used to be collapsed
 * into one generic message with the original native error discarded, so an
 * unregistered OAuth SHA-1 looked like an app bug instead of a config problem.
 */
import {
  describeGoogleAuthError,
  explainGoogleAuthFailure,
  logGoogleAuthFailure,
  logGoogleAuthStage,
} from '../services/googleAuthDiagnostics';
import { isGoogleSignInCancelled, mapGoogleAuthFailure } from '../services/googleAuthErrors';

describe('explainGoogleAuthFailure maps codes to actionable causes', () => {
  it('explains DEVELOPER_ERROR 10 as a signing/package registration problem', () => {
    // The exact failure captured in the device log for the Play-installed build.
    const native = Object.assign(new Error('Server returned error: 10'), { code: 10 });
    const cause = explainGoogleAuthFailure(native);
    expect(cause).toMatch(/DEVELOPER_ERROR 10/);
    expect(cause).toMatch(/SHA-1/);
    expect(cause).toMatch(/google-services\.json/);
  });

  it('recognises DEVELOPER_ERROR delivered as a string code or a message', () => {
    expect(explainGoogleAuthFailure({ code: '10' })).toMatch(/SHA-1/);
    expect(explainGoogleAuthFailure({ message: 'DEVELOPER_ERROR' })).toMatch(/SHA-1/);
  });

  it.each([
    [{ code: 12500 }, /Play Services is outdated/],
    [{ code: 2 }, /Play Services is unavailable/],
    [{ code: 12501 }, /account chooser/],
    [{ status: 401 }, /audience\/webClientId/],
    [{ status: 429 }, /Rate limited/],
    [{ status: 503 }, /Backend unavailable/],
    [{ name: 'AbortError' }, /Could not reach the PalSafar API/],
  ])('maps %p to an actionable cause', (error, expected) => {
    expect(explainGoogleAuthFailure(error)).toMatch(expected);
  });

  it('returns null when there is nothing specific to say', () => {
    expect(explainGoogleAuthFailure(new Error('something odd'))).toBeNull();
  });
});

describe('describeGoogleAuthError is safe to log', () => {
  it('reports whether an ID token exists without exposing it', () => {
    const described = describeGoogleAuthError({ idToken: 'ya29.super-secret-value', code: 10 });
    expect(described.hasIdToken).toBe(true);
    expect(JSON.stringify(described)).not.toContain('ya29');
    expect(JSON.stringify(described)).not.toContain('super-secret');
  });

  it('drops unexpected fields entirely rather than relying on redaction', () => {
    // Allowlist behaviour: only known-safe keys are ever emitted, so a stray
    // token on the error object cannot reach a device log.
    const described = describeGoogleAuthError({
      code: 10,
      nested: { accessToken: 'abc123', refreshToken: 'r1', safe: 'keep-me' },
    });
    const serialized = JSON.stringify(described);
    expect(serialized).not.toContain('abc123');
    expect(serialized).not.toContain('r1');
    expect(serialized).not.toContain('keep-me');
  });

  it('unwraps the cause chain so a mapped error still reports the native code', () => {
    const native = Object.assign(new Error('not registered to use OAuth2.0'), { code: 10 });
    const mapped = mapGoogleAuthFailure(native);
    expect(describeGoogleAuthError(mapped).code).toBe('10');
  });
});

describe('mapGoogleAuthFailure keeps the original native error reachable', () => {
  it('preserves the native error as cause instead of discarding it', () => {
    const native = Object.assign(new Error('not registered to use OAuth2.0'), { code: 10 });
    const mapped = mapGoogleAuthFailure(native);
    expect(mapped.code).toBe('DEVELOPER_ERROR');
    expect((mapped as Error & { cause?: unknown }).cause).toBe(native);
  });

  it('still classifies a cancelled sign-in so the UI stays silent', () => {
    const cancelled = mapGoogleAuthFailure({ code: 'SIGN_IN_CANCELLED' });
    expect(isGoogleSignInCancelled(cancelled)).toBe(true);
    expect(cancelled.cancelled).toBe(true);
  });
});

describe('logging is development-only and never throws', () => {
  const originalLog = console.log;
  const originalWarn = console.warn;

  afterEach(() => {
    console.log = originalLog;
    console.warn = originalWarn;
  });

  it('logs stages and failures when __DEV__ is on', () => {
    const logs: string[] = [];
    const warns: string[] = [];
    console.log = (...a: any[]) => logs.push(a.join(' '));
    console.warn = (...a: any[]) => warns.push(a.join(' '));

    logGoogleAuthStage('sign-in');
    logGoogleAuthFailure('id-token', { code: 10, idToken: 'ya29.leak' });

    expect(logs.join('\n')).toContain('[google-auth] sign-in');
    expect(warns.join('\n')).toContain('[google-auth] id-token failed');
    expect(warns.join('\n')).not.toContain('ya29.leak');
  });

  it('never throws on hostile input', () => {
    console.log = () => {};
    console.warn = () => {};
    for (const hostile of [null, undefined, 0, '', [], new Error('x'), { cause: { code: 10 } }]) {
      expect(() => logGoogleAuthStage('sign-in')).not.toThrow();
      expect(() => logGoogleAuthFailure('unknown', hostile)).not.toThrow();
      expect(() => describeGoogleAuthError(hostile)).not.toThrow();
    }
  });
});
