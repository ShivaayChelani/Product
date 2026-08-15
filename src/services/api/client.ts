import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG } from '../../config/api';

const TOKEN_KEY = 'ps_api_tk';
const REFRESH_TOKEN_KEY = 'ps_ref_tk';

let EncryptedStorageModule: any = null;
try {
  EncryptedStorageModule = require('react-native-encrypted-storage');
} catch {
}

function getES() {
  return EncryptedStorageModule;
}

const SafeEncryptedStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const es = getES();
      if (es && typeof es.getItem === 'function') {
        const fromEs = await es.getItem(key);
        if (fromEs != null) return fromEs;
      }
    } catch (err) {
    }
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    let esOk = false;
    try {
      const es = getES();
      if (es && typeof es.setItem === 'function') {
        await es.setItem(key, value);
        esOk = true;
        try {
          await AsyncStorage.removeItem(key);
        } catch { /* migrated off plaintext */ }
        return;
      }
    } catch (err) {
    }
    if (!esOk) {
      await AsyncStorage.setItem(key, value);
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      const es = getES();
      if (es && typeof es.removeItem === 'function') {
        await es.removeItem(key);
      }
    } catch (err) {
    }
    try {
      await AsyncStorage.removeItem(key);
    } catch { /* optional */ }
  }
};

interface StandardApiResponse<T = any> {
  success: boolean;
  data: T;
  message: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
    cursor?: string | null;
  };
  errors?: any;
}

type AuthExpiredHandler = () => void;

class ApiClient {
  private token: string | null = null;
  private refreshToken: string | null = null;
  private refreshPromise: Promise<boolean> | null = null;
  private authExpiredHandler: AuthExpiredHandler | null = null;

  onAuthExpired(handler: AuthExpiredHandler | null) {
    this.authExpiredHandler = handler;
  }

  private notifyAuthExpired() {
    this.authExpiredHandler?.();
  }

  async init() {
    try {
      const [stored, storedRefresh] = await Promise.all([
        SafeEncryptedStorage.getItem(TOKEN_KEY),
        SafeEncryptedStorage.getItem(REFRESH_TOKEN_KEY),
      ]);
      if (stored) this.token = stored;
      if (storedRefresh) this.refreshToken = storedRefresh;
    } catch (err) {
    }

    // Wake Render cold starts before the rest of the app hits timed-out endpoints.
    await this.warmUp().catch(() => {});
  }

  /** Best-effort ping so the first user-facing request is less likely to abort. */
  async warmUp(): Promise<void> {
    try {
      await this.get(API_CONFIG.endpoints.health);
    } catch {
      // Ignore — subsequent calls still run with extended timeouts.
    }
  }

  async destroy() {
    this.token = null;
    this.refreshToken = null;
    await SafeEncryptedStorage.removeItem(TOKEN_KEY);
    await SafeEncryptedStorage.removeItem(REFRESH_TOKEN_KEY);
  }

  async setToken(token: string | null) {
    this.token = token;
    if (token) {
      await SafeEncryptedStorage.setItem(TOKEN_KEY, token);
    } else {
      await SafeEncryptedStorage.removeItem(TOKEN_KEY);
    }
  }

  getToken(): string | null {
    return this.token;
  }

  async setRefreshToken(token: string | null) {
    this.refreshToken = token;
    if (token) {
      await SafeEncryptedStorage.setItem(REFRESH_TOKEN_KEY, token);
    } else {
      await SafeEncryptedStorage.removeItem(REFRESH_TOKEN_KEY);
    }
  }

  async getRefreshToken(): Promise<string | null> {
    if (this.refreshToken) return this.refreshToken;
    try {
      const stored = await SafeEncryptedStorage.getItem(REFRESH_TOKEN_KEY);
      if (stored) this.refreshToken = stored;
      return stored;
    } catch {
      return null;
    }
  }

  /** Ensure an access token is present; refresh if needed. Returns false if user must re-login. */
  async ensureAuth(): Promise<boolean> {
    if (!this.token) {
      await this.init();
    }
    if (this.token) return true;
    return this.tryRefresh();
  }

  /**
   * Force refresh so JWT roles match current DB assignments (e.g. after approval).
   * Does not destroy the session on failure (unlike 401 retry path).
   */
  async forceRefreshAccessToken(): Promise<boolean> {
    const refreshToken = await this.getRefreshToken();
    if (!refreshToken) return false;
    try {
      const refreshRes = await this.request<{ accessToken: string; refreshToken?: string }>(
        'POST',
        '/auth/refresh',
        { refreshToken },
        false,
        true,
      );
      if (refreshRes?.success && refreshRes.data?.accessToken) {
        await this.setToken(refreshRes.data.accessToken);
        if (refreshRes.data.refreshToken) {
          await this.setRefreshToken(refreshRes.data.refreshToken);
        }
        return true;
      }
    } catch (err) {
    }
    return false;
  }

  private async tryRefresh(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      const refreshToken = await this.getRefreshToken();
      if (!refreshToken) {
        await this.destroy();
        return false;
      }
      try {
        const refreshRes = await this.request<{ accessToken: string; refreshToken?: string }>(
          'POST',
          '/auth/refresh',
          { refreshToken },
          false,
          true,
        );
        if (refreshRes?.success && refreshRes.data?.accessToken) {
          await this.setToken(refreshRes.data.accessToken);
          if (refreshRes.data.refreshToken) {
            await this.setRefreshToken(refreshRes.data.refreshToken);
          }
          return true;
        }
      } catch (err) {
        await this.destroy();
        this.notifyAuthExpired();
        return false;
      }
      // Soft failure (invalid payload) — clear local session so stale tokens are not reused.
      await this.destroy();
      return false;
    })();

    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: any,
    isFormData = false,
    isRetry = false,
  ): Promise<StandardApiResponse<T>> {
    const url = `${API_CONFIG.baseUrl}${path}`;
    const headers: Record<string, string> = {};

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }

    const controller = new AbortController();
    // Render free tier can take >60s to wake; give map/bootstrap reads the same budget as login.
    const timeoutMs = path === API_CONFIG.endpoints.auth.login
      || path === API_CONFIG.endpoints.auth.register
      || path === API_CONFIG.endpoints.auth.verifyRegisterEmail
      || path === API_CONFIG.endpoints.auth.resendRegisterOtp
      || path === API_CONFIG.endpoints.trips.aiGenerate
      || path === API_CONFIG.endpoints.health
      || path === API_CONFIG.endpoints.vendors.mapList
      || path === API_CONFIG.endpoints.vendors.list
      || path === API_CONFIG.endpoints.upload.video
      || (path.includes('/trips/') && path.endsWith('/generate'))
      ? 120_000
      : API_CONFIG.timeout;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: isFormData ? body : body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      let json: any = {};
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          json = await response.json();
        } catch {
          // JSON parsing failed
        }
      } else {
        const text = await response.text();
        json = { message: text || `Request failed with status ${response.status}` };
      }

      if (!response.ok) {
        if (response.status === 401 && !isRetry && !path.includes('/auth/refresh') && !path.includes('/auth/login') && !path.includes('/auth/register')) {
          // Guests / anonymous callers hit auth-required endpoints without credentials.
          // Do not treat that as a session expiry — it would kick them to the splash screen.
          const hadAccessToken = Boolean(this.token);
          const hadRefreshToken = Boolean(await this.getRefreshToken());
          if (hadAccessToken || hadRefreshToken) {
            const refreshed = await this.tryRefresh();
            if (refreshed) {
              return this.request<T>(method, path, body, isFormData, true);
            }
            this.notifyAuthExpired();
          }
        }

        const fieldErrors = Array.isArray(json.errors)
          ? json.errors
              .map((e: any) => (e?.message ? String(e.message) : e?.field ? `${e.field} is invalid` : null))
              .filter(Boolean)
          : [];
        const message = fieldErrors.length > 0
          ? fieldErrors.join('\n')
          : (json.message || 'Request failed');
        const err = new Error(message) as any;
        err.status = response.status;
        err.data = json;
        err.errors = json.errors;
        // Structured error code from the backend (e.g. SWITCH_CONFIRMATION_REQUIRED) —
        // clients must branch on this, never on the message text.
        err.code = json.code;
        err.details = json.details;
        throw err;
      }

      const durationMs = Date.now() - startedAt;
      try {
        const { reportApiCall } = require('../monitoring');
        reportApiCall({ method, path, status: response.status, durationMs });
      } catch { /* monitoring optional at bootstrap */ }

      return json as StandardApiResponse<T>;
    } catch (error: any) {
      clearTimeout(timeout);
      const durationMs = Date.now() - startedAt;
      const status = error?.status;
      try {
        const { reportApiCall } = require('../monitoring');
        reportApiCall({
          method,
          path,
          status,
          durationMs,
          error,
          responseBody: error?.data,
        });
      } catch { /* monitoring optional */ }

      if (error.name === 'AbortError') {
        const timeoutErr = new (Error as any)('Request timed out. Please check your connection.', { cause: error });
        timeoutErr.name = 'AbortError';
        throw timeoutErr;
      }
      throw error;
    }
  }

  get<T>(path: string) {
    return this.request<T>('GET', path);
  }

  post<T>(path: string, body?: any) {
    return this.request<T>('POST', path, body);
  }

  patch<T>(path: string, body?: any) {
    return this.request<T>('PATCH', path, body);
  }

  delete<T>(path: string, body?: any) {
    return this.request<T>('DELETE', path, body);
  }

  upload<T>(path: string, formData: FormData) {
    return this.request<T>('POST', path, formData, true);
  }
}

export const apiClient = new ApiClient();
export type { StandardApiResponse };

/** Machine-readable error codes shared with the server (see server ApiError/ErrorCodes). */
export const ApiErrorCodes = {
  SWITCH_CONFIRMATION_REQUIRED: 'SWITCH_CONFIRMATION_REQUIRED',
  ROLE_ALREADY_EXISTS: 'ROLE_ALREADY_EXISTS',
  APPLICATION_PENDING: 'APPLICATION_PENDING',
  APPLICATION_REQUIRED: 'APPLICATION_REQUIRED',
  ROLE_NOT_APPROVED: 'ROLE_NOT_APPROVED',
  ROLE_REQUIRED: 'ROLE_REQUIRED',
  ROLE_SUSPENDED: 'ROLE_SUSPENDED',
  CITY_MISMATCH: 'CITY_MISMATCH',
} as const;

export function getApiErrorCode(err: unknown): string | undefined {
  return (err as { code?: string } | null)?.code;
}
