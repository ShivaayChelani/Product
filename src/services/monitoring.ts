import { Dimensions, PixelRatio, Platform } from 'react-native';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import * as Sentry from '@sentry/react-native';
import {
  APP_BUILD,
  APP_BUNDLE_ID,
  APP_VERSION,
  MONITORING_CONFIG,
  isMonitoringEnabled,
} from '../config/monitoringConfig';
import { scrubBreadcrumb, scrubEvent, scrubObject, scrubValue } from './monitoringScrubber';

export { isMonitoringEnabled } from '../config/monitoringConfig';

export const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
  routeChangeTimeoutMs: 1_000,
  ignoreEmptyBackNavigationTransactions: true,
});

let initialized = false;
/** True only after Sentry.init succeeds with a valid DSN. */
let monitoringActive = false;
let lastApiEndpoint = '';
let navigationHistory: string[] = [];
let networkOffline = false;
const MAX_NAV_HISTORY = 20;

/** Dedupe identical exceptions (ErrorBoundary + global handler). */
const recentExceptionHashes = new Map<string, number>();

function networkLabel(state: NetInfoState | null): string {
  if (!state) return 'unknown';
  if (state.isConnected === false) return 'offline';
  const type = state.type || 'unknown';
  const gen = (state.details as { cellularGeneration?: string } | null)?.cellularGeneration;
  return gen ? `${type}:${gen}` : type;
}

function exceptionFingerprint(event: Sentry.ErrorEvent): string | null {
  const ex = event.exception?.values?.[0];
  if (!ex) return null;
  const frame = ex.stacktrace?.frames?.slice(-1)[0];
  const loc = frame ? `${frame.filename}:${frame.lineno}` : '';
  return `${ex.type ?? 'Error'}:${ex.value ?? ''}:${loc}`;
}

function shouldDropDuplicate(event: Sentry.ErrorEvent): boolean {
  const key = exceptionFingerprint(event);
  if (!key) return false;
  const now = Date.now();
  const last = recentExceptionHashes.get(key);
  if (last != null && now - last < MONITORING_CONFIG.dedupeWindowMs) {
    return true;
  }
  recentExceptionHashes.set(key, now);
  if (recentExceptionHashes.size > 100) {
    const cutoff = now - MONITORING_CONFIG.dedupeWindowMs;
    for (const [k, t] of recentExceptionHashes) {
      if (t < cutoff) recentExceptionHashes.delete(k);
    }
  }
  return false;
}

function applyDeviceContext(net: NetInfoState | null) {
  const { width, height } = Dimensions.get('screen');
  Sentry.setContext('device_runtime', {
    platform: Platform.OS,
    osVersion: String(Platform.Version),
    screenWidth: width,
    screenHeight: height,
    pixelRatio: PixelRatio.get(),
    fontScale: PixelRatio.getFontScale(),
    locale: Intl.DateTimeFormat().resolvedOptions().locale,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    network: networkLabel(net),
    appVersion: APP_VERSION,
    buildNumber: APP_BUILD,
    bundleId: APP_BUNDLE_ID,
  });
  Sentry.setTag('network', networkLabel(net));
  Sentry.setTag('app.version', APP_VERSION);
  Sentry.setTag('app.build', APP_BUILD);
  Sentry.setTag('app.bundle', APP_BUNDLE_ID);
}

function enrichEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (lastApiEndpoint) {
    event.tags = { ...event.tags, last_api: lastApiEndpoint };
    event.contexts = {
      ...event.contexts,
      last_request: { endpoint: lastApiEndpoint },
    };
  }
  if (navigationHistory.length) {
    event.contexts = {
      ...event.contexts,
      navigation: {
        current: navigationHistory[navigationHistory.length - 1],
        previous:
          navigationHistory.length > 1
            ? navigationHistory[navigationHistory.length - 2]
            : undefined,
        history: navigationHistory.slice(-10).join(' → '),
      },
    };
  }
  return event;
}

/**
 * Must run before AppRegistry / first React render (see index.js).
 * Single init guard — do not call Sentry.init elsewhere.
 */
export function initMonitoring(): void {
  if (initialized) return;
  initialized = true;

  if (!isMonitoringEnabled()) {
    return;
  }

  monitoringActive = true;

  Sentry.init({
    dsn: MONITORING_CONFIG.dsn,
    enabled: true,
    environment: MONITORING_CONFIG.environment,
    release: MONITORING_CONFIG.release,
    dist: MONITORING_CONFIG.dist,
    debug: MONITORING_CONFIG.enableLogs,
    enableLogs: MONITORING_CONFIG.enableLogs,
    sampleRate: MONITORING_CONFIG.sampleRate,
    enableNative: true,
    enableNativeCrashHandling: true,
    enableAutoSessionTracking: true,
    enableAppHangTracking: true,
    enableWatchdogTerminationTracking: true,
    enableNdk: true,
    enableNdkScopeSync: true,
    attachStacktrace: true,
    attachThreads: true,
    sendDefaultPii: false,
    maxCacheItems: MONITORING_CONFIG.maxCacheItems,
    tracesSampleRate: MONITORING_CONFIG.tracesSampleRate,
    profilesSampleRate: MONITORING_CONFIG.profilesSampleRate,
    enableAppStartTracking: true,
    enableNativeFramesTracking: true,
    enableStallTracking: true,
    enableUserInteractionTracing: true,
    enableAutoPerformanceTracing: true,
    integrations: [navigationIntegration],
    beforeBreadcrumb(breadcrumb) {
      return scrubBreadcrumb(breadcrumb);
    },
    beforeSend(event, hint) {
      if (shouldDropDuplicate(event)) {
        return null;
      }
      const original = hint?.originalException;
      if (
        original instanceof Error &&
        (
          original.name === 'AbortError' ||
          original.message?.includes('Aborted') ||
          original.message?.includes('Network request failed') ||
          original.message?.includes('Failed to fetch') ||
          (original as any)?.code === 20
        )
      ) {
        return null;
      }
      if (
        original instanceof Error &&
        event.tags?.error_boundary !== 'root' &&
        (original as Error & { _sentryBoundaryReported?: boolean })._sentryBoundaryReported
      ) {
        return null;
      }
      return scrubEvent(enrichEvent(event));
    },
  });

  applyDeviceContext(null);
  NetInfo.fetch()
    .then((state) => {
      networkOffline = state.isConnected === false;
      applyDeviceContext(state);
    })
    .catch(() => {});
  NetInfo.addEventListener((state) => {
    networkOffline = state.isConnected === false;
    Sentry.setTag('network', networkLabel(state));
    addMonitoringBreadcrumb('network.connectivity', networkLabel(state), {
      isConnected: state.isConnected,
      isInternetReachable: state.isInternetReachable,
      type: state.type,
    });
  });

  addMonitoringBreadcrumb('app.lifecycle', 'monitoring_initialized', {
    environment: MONITORING_CONFIG.environment,
    release: MONITORING_CONFIG.release,
    platform: Platform.OS,
  });
}

export function addMonitoringBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>,
  level: Sentry.SeverityLevel = 'info',
): void {
  if (!monitoringActive) return;
  Sentry.addBreadcrumb({
    category,
    message,
    level,
    data: data ? (scrubObject(data) as Record<string, unknown>) : undefined,
  });
}

export function trackAuthEvent(
  action: 'login' | 'logout' | 'guest' | 'session_restored' | 'signup',
  meta?: Record<string, unknown>,
): void {
  addMonitoringBreadcrumb('auth', action, meta);
}

export function trackRoleSwitch(from: string, to: string): void {
  Sentry.setTag('user.mode', to);
  addMonitoringBreadcrumb('auth.role_switch', `${from} → ${to}`, { from, to });
}

/** PII-safe user context — id + role tags only (no email / phone). */
export function setMonitoringUser(user: {
  id: string;
  role?: string | null;
  activeMode?: string | null;
  roles?: string[] | null;
}): void {
  if (!monitoringActive) return;
  if (!user?.id || user.id === 'guest-user') {
    Sentry.setUser({ id: 'guest' });
    Sentry.setTag('user.role', 'GUEST');
    Sentry.setTag('user.mode', 'GUEST');
    return;
  }
  const role = user.activeMode || user.role || 'USER';
  Sentry.setUser({ id: user.id, segment: role });
  Sentry.setTag('user.role', role);
  Sentry.setTag('user.mode', role);
  if (user.roles?.length) {
    Sentry.setContext('user_roles', { roles: user.roles.map((r) => String(r)) });
  }
}

export function clearMonitoringUser(): void {
  if (!monitoringActive) return;
  Sentry.setUser(null);
  Sentry.setTag('user.role', 'anonymous');
  Sentry.setTag('user.mode', 'anonymous');
  Sentry.setContext('user_roles', null);
}

export function trackScreen(routeName: string): void {
  if (!routeName) return;
  const prev = navigationHistory[navigationHistory.length - 1];
  if (prev === routeName) return;
  navigationHistory.push(routeName);
  if (navigationHistory.length > MAX_NAV_HISTORY) {
    navigationHistory = navigationHistory.slice(-MAX_NAV_HISTORY);
  }
  Sentry.setTag('screen', routeName);
  addMonitoringBreadcrumb('navigation', prev ? `${prev} → ${routeName}` : routeName, {
    from: prev,
    to: routeName,
  });
}

export function getNavigationHistory(): string[] {
  return [...navigationHistory];
}

export type ApiFailureKind =
  | 'timeout'
  | 'network'
  | 'http_401'
  | 'http_403'
  | 'http_404'
  | 'http_5xx'
  | 'http_4xx'
  | 'unknown';

function classifyApiError(status: number | undefined, error: unknown): ApiFailureKind {
  const name = (error as { name?: string })?.name;
  const message = String((error as { message?: string })?.message || '');
  if (name === 'AbortError' || /timed out/i.test(message)) return 'timeout';
  if (status === 401) return 'http_401';
  if (status === 403) return 'http_403';
  if (status === 404) return 'http_404';
  if (typeof status === 'number' && status >= 500) return 'http_5xx';
  if (typeof status === 'number' && status >= 400) return 'http_4xx';
  if (/network|failed to fetch|internet/i.test(message)) return 'network';
  return 'unknown';
}

function truncateBody(body: unknown, max = 500): string | undefined {
  if (body == null) return undefined;
  try {
    const scrubbed = scrubValue(body);
    const text = typeof scrubbed === 'string' ? scrubbed : JSON.stringify(scrubbed);
    return text.length > max ? `${text.slice(0, max)}…` : text;
  } catch {
    return undefined;
  }
}

/** Record API traffic — expected 4xx are breadcrumbs only; outages become Issues. */
export function reportApiCall(input: {
  method: string;
  path: string;
  status?: number;
  durationMs: number;
  error?: unknown;
  responseBody?: unknown;
}): void {
  if (!monitoringActive) return;

  const endpoint = `${input.method.toUpperCase()} ${input.path}`;
  lastApiEndpoint = endpoint;

  const failed = Boolean(input.error || (input.status != null && input.status >= 400));
  const level: Sentry.SeverityLevel = failed ? 'warning' : 'info';

  addMonitoringBreadcrumb('http', endpoint, {
    url: input.path,
    method: input.method,
    status_code: input.status,
    duration_ms: Math.round(input.durationMs),
  }, level);

  if (input.durationMs >= MONITORING_CONFIG.slowRequestMs && !input.error) {
    addMonitoringBreadcrumb(
      'http.slow',
      `Slow API ${endpoint} (${Math.round(input.durationMs)}ms)`,
      { url: input.path, duration_ms: Math.round(input.durationMs) },
      'warning',
    );
  }

  if (!failed) return;

  if (input.path.includes('/health') || input.path.includes('/auth/refresh')) {
    return;
  }

  const kind = classifyApiError(input.status, input.error);

  if (kind === 'http_401' || kind === 'http_403' || kind === 'http_404' || kind === 'http_4xx') {
    return;
  }

  // Aborted / timed-out client requests — captured in http breadcrumbs, do not report as Sentry Issues.
  if (kind === 'timeout' || (input.error as any)?.name === 'AbortError') {
    return;
  }

  // Offline / flaky network — breadcrumb only, not an Issue storm.
  if (kind === 'network' && networkOffline) {
    return;
  }

  const err =
    input.error instanceof Error
      ? input.error
      : new Error(
          `API ${kind}: ${endpoint}${input.status != null ? ` [${input.status}]` : ''}`,
        );

  Sentry.withScope((scope) => {
    scope.setLevel(kind === 'http_5xx' ? 'error' : 'warning');
    scope.setTag('api.kind', kind);
    scope.setTag('api.path', input.path);
    scope.setFingerprint(['api-failure', kind, input.method, input.path]);
    scope.setContext('api', scrubObject({
      method: input.method,
      path: input.path,
      status: input.status,
      duration_ms: Math.round(input.durationMs),
      response: truncateBody(input.responseBody ?? (input.error as { data?: unknown })?.data),
    }) as Record<string, unknown>);
    Sentry.captureException(err);
  });
}

export function captureFatal(error: unknown, context?: Record<string, unknown>): void {
  if (!monitoringActive) return;
  Sentry.withScope((scope) => {
    scope.setLevel('fatal');
    if (context) scope.setContext('fatal', scrubObject(context) as Record<string, unknown>);
    Sentry.captureException(error);
  });
}

export function captureNonFatal(error: unknown, context?: Record<string, unknown>): void {
  if (!monitoringActive) return;
  Sentry.withScope((scope) => {
    scope.setLevel('error');
    if (context) scope.setContext('non_fatal', scrubObject(context) as Record<string, unknown>);
    Sentry.captureException(error);
  });
}

export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info'): void {
  if (!monitoringActive) return;
  Sentry.captureMessage(scrubValue(message) as string, level);
}

export function triggerNativeCrash(): void {
  if (!monitoringActive) {
    throw new Error('[PalSafar] Native crash test requires Sentry DSN (monitoring.local.ts)');
  }
  Sentry.nativeCrash();
}

export function flushMonitoring(): Promise<boolean> {
  if (!monitoringActive) return Promise.resolve(false);
  return Sentry.flush();
}

export { Sentry };
