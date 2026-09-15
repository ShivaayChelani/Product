import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { Platform } from 'react-native';

/**
 * Google OAuth Web client ID. Public (not a secret). Required so the mobile
 * SDK returns an ID token the PalSafar API can verify.
 */
export const GOOGLE_WEB_CLIENT_ID =
  '27219212015-kocrm1ig6vs0nkar7mjjial0gctbd1nj.apps.googleusercontent.com';

/**
 * Optional iOS OAuth client ID. Set when an iOS client exists in Google Cloud.
 * Do not put a client secret here.
 */
export const GOOGLE_IOS_CLIENT_ID: string | undefined = undefined;

export const GOOGLE_REVERSED_WEB_CLIENT_ID =
  'com.googleusercontent.apps.27219212015-kocrm1ig6vs0nkar7mjjial0gctbd1nj';

let configured = false;
let configureAttempted = false;
let configureError: string | null = null;

export function isGoogleSignInConfigured(): boolean {
  return configured;
}

export function getGoogleSignInConfigureError(): string | null {
  return configureError;
}

export function configureGoogleSignIn(): boolean {
  if (configured) return true;
  configureAttempted = true;
  try {
    const options: {
      webClientId: string;
      offlineAccess: boolean;
      forceCodeForRefreshToken: boolean;
      iosClientId?: string;
    } = {
      webClientId: GOOGLE_WEB_CLIENT_ID,
      offlineAccess: false,
      forceCodeForRefreshToken: false,
    };
    if (Platform.OS === 'ios' && GOOGLE_IOS_CLIENT_ID) {
      options.iosClientId = GOOGLE_IOS_CLIENT_ID;
    }
    GoogleSignin.configure(options);
    configured = true;
    configureError = null;
    return true;
  } catch (error) {
    configured = false;
    configureError =
      error instanceof Error && error.message
        ? error.message
        : 'Google Sign-In is not configured on this device.';
    return false;
  }
}

export function ensureGoogleSignInConfigured(): void {
  if (configured) return;
  if (!configureAttempted) configureGoogleSignIn();
  if (!configured) {
    const err = new Error(
      configureError || 'Google Sign-In is not configured. Please try again.',
    ) as Error & { status?: number };
    err.status = 500;
    throw err;
  }
}
