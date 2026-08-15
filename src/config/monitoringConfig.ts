import { Platform } from 'react-native';
import { DEV_FLAGS } from './devFlags';

/**
 * Optional local override (gitignored). Create from monitoring.local.example.ts
 * when you have a project DSN for local/dev builds.
 */
type LocalMonitoring = {
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: 'development' | 'staging' | 'production';
};

function loadLocal(): LocalMonitoring {
  try {
     
    return require('./monitoring.local') as LocalMonitoring;
  } catch {
    return {};
  }
}

const local = loadLocal();

/** Resolve release channel for Sentry environment tagging. */
function resolveEnvironment(): 'development' | 'staging' | 'production' {
  if (local.SENTRY_ENVIRONMENT) return local.SENTRY_ENVIRONMENT;
  if (__DEV__) return 'development';
  if (DEV_FLAGS.USE_LOCAL_API) return 'staging';
  return 'production';
}

/**
 * Single source of truth for Sentry release/dist.
 * Keep aligned with:
 * - android/app/build.gradle → versionName / versionCode
 * - ios/PalSafar.xcodeproj → MARKETING_VERSION / CURRENT_PROJECT_VERSION
 */
export const APP_VERSION = '1.0';
export const APP_BUILD = '1';
export const APP_BUNDLE_ID = 'com.palsasafar';

/** Keep aligned with android/app/build.gradle applicationId */
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${APP_BUNDLE_ID}`;
export const PLAY_STORE_MARKET_URL = `market://details?id=${APP_BUNDLE_ID}`;

export const MONITORING_CONFIG = {
  /** Empty DSN = SDK initializes but does not send (safe default until secrets are set). */
  dsn: (typeof process !== 'undefined' && process.env?.SENTRY_DSN) || local.SENTRY_DSN || '',
  environment: resolveEnvironment(),
  /** Must match Sentry Releases + CI upload (sentry.gradle / sentry-cli). */
  release: `${APP_BUNDLE_ID}@${APP_VERSION}+${APP_BUILD}`,
  dist: `${Platform.OS}-${APP_BUILD}`,
  /** Error events: always capture in production. */
  sampleRate: 1.0,
  tracesSampleRate: __DEV__ ? 1.0 : 0.2,
  profilesSampleRate: __DEV__ ? 1.0 : 0.1,
  enableLogs: __DEV__,
  /** Dev-only crash-test UI (never shown in release). */
  enableCrashTests: __DEV__,
  /** Dev-only notification QA screen (never shown in release). */
  enableNotificationTests: __DEV__,
  /** Mark API responses slower than this as performance breadcrumbs. */
  slowRequestMs: 3000,
  /** Drop duplicate exception events within this window (ErrorBoundary vs global handler). */
  dedupeWindowMs: 4000,
  /** Max queued events while offline (Sentry native transport). */
  maxCacheItems: 50,
} as const;

export function isMonitoringEnabled(): boolean {
  return Boolean(MONITORING_CONFIG.dsn);
}
