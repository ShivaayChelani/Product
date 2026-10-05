import AsyncStorage from '@react-native-async-storage/async-storage';
import { appleAuth, canUseSignInWithApple } from '../config/appleAuth';

/**
 * Apple's `ASAuthorizationCredentialState`, taken from the native module so the
 * values cannot drift from the SDK.
 *
 * Note that `revoked` is 0 ? a truthiness check on this value silently mis-handles
 * the revoked case, which is the one that matters here.
 */
export const APPLE_CREDENTIAL_STATE = {
  revoked: appleAuth.State.REVOKED,
  authorized: appleAuth.State.AUTHORIZED,
  notFound: appleAuth.State.NOT_FOUND,
  transferred: appleAuth.State.TRANSFERRED,
} as const;

export type AppleCredentialState = (typeof APPLE_CREDENTIAL_STATE)[keyof typeof APPLE_CREDENTIAL_STATE];

/**
 * The Apple `sub` for the signed-in account.
 *
 * Sign in with Apple does not return a credential on subsequent launches, so the
 * identifier has to be stored for `getCredentialStateForUser` to be callable later.
 * It is a provider-scoped opaque identifier with no personal data, and it is removed
 * on sign-out together with the rest of the session.
 */
const APPLE_USER_ID_KEY = '@palsafar/auth/appleUserId';

export async function rememberAppleUserId(userId: string | null | undefined): Promise<void> {
  const trimmed = typeof userId === 'string' ? userId.trim() : '';
  if (!trimmed) return;
  try {
    await AsyncStorage.setItem(APPLE_USER_ID_KEY, trimmed);
  } catch {
    // Non-fatal: revocation checking degrades to the OS notification only.
  }
}

export async function readRememberedAppleUserId(): Promise<string | null> {
  try {
    const value = await AsyncStorage.getItem(APPLE_USER_ID_KEY);
    return value?.trim() || null;
  } catch {
    return null;
  }
}

export async function forgetAppleUserId(): Promise<void> {
  try {
    await AsyncStorage.removeItem(APPLE_USER_ID_KEY);
  } catch {
    // Nothing to do ? the key is scoped to this device's app sandbox.
  }
}

/**
 * Asks Apple whether it still vouches for the stored Apple ID.
 *
 * Returns `null` when the answer cannot be obtained (no stored ID, Apple
 * unavailable, or a failed IPC call) so callers can distinguish "Apple says the
 * access was revoked" from "we could not check", and never sign a user out on the
 * strength of an inconclusive answer.
 */
export async function checkAppleCredentialState(): Promise<AppleCredentialState | null> {
  if (!canUseSignInWithApple()) return null;

  const userId = await readRememberedAppleUserId();
  if (!userId) return null;

  try {
    const state = await appleAuth.getCredentialStateForUser(userId);
    return typeof state === 'number' ? (state as AppleCredentialState) : null;
  } catch {
    return null;
  }
}

export function isAppleAccessRevoked(state: AppleCredentialState | null): boolean {
  return state === APPLE_CREDENTIAL_STATE.revoked;
}

/**
 * `transferred` means the user moved their Apple ID to a different Apple account,
 * so the identifier we hold no longer represents them.
 */
export function isAppleIdentityTransferred(state: AppleCredentialState | null): boolean {
  return state === APPLE_CREDENTIAL_STATE.transferred;
}

/**
 * Subscribes to Apple's credential-revoked notification.
 *
 * The OS only tells us that *something* changed, so the listener re-queries the
 * stored identifier instead of trusting the event ? a transferred or still-authorized
 * state must not trigger a sign-out. Returns a no-op unsubscribe when unavailable.
 */
export function observeAppleCredentialRevocation(onRevoked: () => void): () => void {
  if (!canUseSignInWithApple()) return () => undefined;

  try {
    const unsubscribe = appleAuth.onCredentialRevoked(() => {
      void checkAppleCredentialState().then((state) => {
        if (isAppleAccessRevoked(state) || isAppleIdentityTransferred(state)) onRevoked();
      });
    });
    return typeof unsubscribe === 'function' ? unsubscribe : () => undefined;
  } catch {
    return () => undefined;
  }
}
