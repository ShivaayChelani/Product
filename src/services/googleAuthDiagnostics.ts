/**
 * Development-only diagnostics for the Google Sign-In pipeline.
 *
 * Native Google sign-in fails in ways the JS layer cannot see: the OS rejects
 * the ID-token exchange before any network call happens. When that happens the
 * only useful signal is the native error code, so it is logged here instead of
 * being flattened into one generic message.
 *
 * Nothing secret is ever passed to the logger. Tokens are reduced to a boolean
 * (`hasIdToken`) at the call site, and `redact` drops any token-shaped key as a
 * second line of defence, so a stray field cannot leak an ID or access token
 * into a device log.
 */

/** Where in the pipeline the failure happened; also used for happy-path traces. */
export type GoogleAuthStage =
  | 'configure'
  | 'play-services'
  | 'sign-in'
  | 'id-token'
  | 'backend-auth'
  | 'session'
  | 'cancelled'
  | 'unknown';

const REDACTED = '[redacted]';

/** Any key that could carry a credential is replaced wholesale. */
const SECRET_KEY = /(token|secret|password|passwd|authorization|auth|credential|apikey|api_key|cookie)/i;

function isDev(): boolean {
  try {
    // React Native defines __DEV__; fall back for plain Node (jest, scripts).
    return typeof __DEV__ !== 'undefined' ? Boolean(__DEV__) : process.env.NODE_ENV !== 'production';
  } catch {
    return false;
  }
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[deep]';
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(v => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY.test(key) ? REDACTED : redact(val, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string') return value.length > 300 ? `${value.slice(0, 300)}…` : value;
  return value;
}

function asRecord(error: unknown): Record<string, unknown> {
  return error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
}

/**
 * Reduces an error to safe, loggable fields.
 *
 * Deliberately reports whether an ID token was *present* rather than any part
 * of its contents.
 */
export function describeGoogleAuthError(error: unknown): Record<string, unknown> {
  const rec = asRecord(error);
  const causeRec = asRecord(rec.cause);

  // The native code from the cause chain wins: `mapGoogleAuthFailure` replaces it
  // with a lossy label (DEVELOPER_ERROR), and the native 10 is the number that
  // actually identifies the unregistered signing SHA-1.
  const rawCode = causeRec.code ?? rec.code;
  const message = rec.message ?? causeRec.message;

  // Allowlist, not a passthrough: an unexpected field on the error can never be
  // logged, so `redact` here only has to shorten a long native message.
  const safe = redact({
    name: rec.name ?? causeRec.name,
    code: typeof rawCode === 'string' || typeof rawCode === 'number' ? String(rawCode) : undefined,
    status: typeof rec.status === 'number' ? rec.status : undefined,
    message: message ? String(message) : undefined,
  }) as Record<string, unknown>;

  // Presence only, appended after redact so the token-shaped key name is not
  // itself mistaken for a secret.
  safe.hasIdToken = Boolean(
    rec.idToken ?? causeRec.idToken ?? rec.hasIdToken ?? causeRec.hasIdToken,
  );
  return safe;
}

/**
 * Turns a native/Google error into an actionable cause.
 *
 * DEVELOPER_ERROR (10) is the one that matters most here: it means the running
 * build's package name + signing certificate SHA-1 are not registered as an
 * Android OAuth client, which no amount of client-side code can fix.
 */
export function explainGoogleAuthFailure(error: unknown): string | null {
  const rec = asRecord(error);
  const causeRec = asRecord(rec.cause);
  const rawCode = rec.code ?? causeRec.code;
  const code = rawCode === undefined || rawCode === null ? '' : String(rawCode).toLowerCase();
  const message = String(rec.message ?? causeRec.message ?? '').toLowerCase();
  const status = typeof rec.status === 'number' ? rec.status : undefined;

  if (code === '10' || code === 'developer_error' || message.includes('developer_error')) {
    return 'Native rejected the ID-token exchange (DEVELOPER_ERROR 10): this build\'s package name + signing certificate SHA-1 are not registered as an Android OAuth client in the Firebase/Google Cloud project. Check google-services.json certificate_hash entries against the installed build\'s SHA-1.';
  }
  if (code === '12500' || code === '8' || message.includes('update google play services')) {
    return 'Google Play Services is outdated or missing. Update it and retry.';
  }
  if (code === '2' || code === 'play_services_not_available' || message.includes('play services')) {
    return 'Google Play Services is unavailable on this device.';
  }
  if (code === '12501' || code === 'sign_in_cancelled' || message.includes('cancel')) {
    return 'The user dismissed the Google account chooser.';
  }
  if (code === '12502' || message.includes('network error')) {
    return 'Network error during the native sign-in handshake.';
  }
  if (status === 401) {
    return 'Backend rejected the ID token (401): check the token audience/webClientId, the server GOOGLE_*_CLIENT_ID env values, and device clock skew.';
  }
  if (status === 400) {
    return 'Backend could not verify the ID token (400).';
  }
  if (status === 403) {
    return 'Backend refused the account (403).';
  }
  if (status === 429) {
    return 'Rate limited by the backend (429).';
  }
  if (status !== undefined && status >= 500) {
    return `Backend unavailable (${status}).`;
  }
  if (rec.name === 'AbortError' || message.includes('network request failed') || message.includes('timed out')) {
    return 'Could not reach the PalSafar API. Check connectivity.';
  }
  return null;
}

/** Logs a happy-path stage marker. No-op in release builds. */
export function logGoogleAuthStage(stage: GoogleAuthStage, detail?: Record<string, unknown>): void {
  if (!isDev()) return;
  console.log(`[google-auth] ${stage}`, redact(detail ?? {}) ?? {});
}

/** Logs a stage failure with its code, status and actionable cause. No-op in release builds. */
export function logGoogleAuthFailure(stage: GoogleAuthStage, error: unknown): void {
  if (!isDev()) return;
  console.warn(`[google-auth] ${stage} failed`, {
    ...describeGoogleAuthError(error),
    cause: explainGoogleAuthFailure(error),
  });
}
