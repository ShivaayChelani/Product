import { Platform } from 'react-native';
import { appleAuth } from '@invertase/react-native-apple-authentication';
// Installs `crypto.getRandomValues` backed by the OS CSPRNG (SecRandomCopyBytes on
// iOS). Sign in with Apple requires an unpredictable nonce, and Hermes ships no
// WebCrypto ? without this polyfill the only source left would be Math.random().
// Imported here (not in index.js) so the module is self-contained and the polyfill
// is guaranteed to be installed before any nonce is generated.
import 'react-native-get-random-values';

/**
 * The App ID (bundle identifier) Apple scopes the identity token's `aud` claim to.
 * Public identifier, not a secret. Must match the target's bundle ID exactly.
 */
export const APPLE_BUNDLE_ID = 'com.palsasafar';

/** 32 bytes ? 64 hex characters. Comfortably inside the server's 8?256 bound. */
const APPLE_NONCE_BYTES = 32;

function randomBytesHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  const source = globalThis.crypto;
  if (!source || typeof source.getRandomValues !== 'function') {
    throw new Error('Secure random generation is unavailable on this device.');
  }
  source.getRandomValues(bytes);

  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Single-use nonce for one Sign in with Apple authorization.
 *
 * The native module SHA-256 hashes this before handing it to Apple, so the value
 * that lands in the identity token is the digest. The server re-derives the digest
 * from this same raw value and compares ? that is what makes a captured identity
 * token unusable anywhere else.
 */
export function generateAppleNonce(): string {
  return randomBytesHex(APPLE_NONCE_BYTES);
}

/**
 * Whether the official Apple button should be rendered at all.
 *
 * Apple requires the option to be hidden where the framework is unavailable
 * (Guideline 4.8 / HIG). `isSupported` is false on Android and on iOS < 13.
 */
export function canUseSignInWithApple(): boolean {
  if (Platform.OS !== 'ios') return false;
  try {
    return appleAuth.isSupported === true;
  } catch {
    return false;
  }
}

export { appleAuth };
