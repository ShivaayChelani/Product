import { apiClient } from './client';
import { API_CONFIG } from '../../config/api';
import type { UserActiveMode, UserPermission } from '../../types';

export interface LoginResponse {
  user: {
    id: string;
    email: string;
    name: string;
    role?: 'USER' | 'ADMIN' | 'VENDOR' | 'CONTENT_CREATOR';
    roles?: string[];
    permission?: UserPermission;
    activeMode?: UserActiveMode;
    activeRole?: string;
    createdAt: string;
    checkIns?: { placeId: string }[];
  };
  accessToken: string;
  refreshToken: string;
}

export interface ActiveModeResponse {
  user: LoginResponse['user'];
  accessToken: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface RegisterPendingResponse {
  requiresEmailVerification: true;
  email: string;
  name: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export const authApi = {
  async register(input: RegisterInput) {
    const payload: RegisterInput = {
      name: input.name,
      email: input.email,
      password: input.password,
    };
    const path = API_CONFIG.endpoints.auth.register;
    const url = `${API_CONFIG.baseUrl}${path}`;

    try {
      const res = await apiClient.post<RegisterPendingResponse | LoginResponse>(path, payload);

      const data = res.data as RegisterPendingResponse & Partial<LoginResponse>;
      if (data?.requiresEmailVerification) {
        return {
          requiresEmailVerification: true as const,
          email: data.email,
          name: data.name,
        };
      }

      // Legacy: immediate session (should not happen for new register flow)
      if (data?.accessToken) {
        await apiClient.setToken(data.accessToken);
        if (data.refreshToken) await apiClient.setRefreshToken(data.refreshToken);
        return { requiresEmailVerification: false as const, session: data as LoginResponse };
      }

      throw new Error('Unexpected registration response.');
    } catch (err: any) {
      const status = err?.status;
      if (status === 404) {
        const notFound = new Error(
          `Not Found — registration endpoint missing: POST ${url}`,
        ) as Error & { status?: number; data?: unknown; url?: string };
        notFound.status = 404;
        notFound.data = err?.data;
        notFound.url = url;
        throw notFound;
      }
      throw err;
    }
  },

  async verifyRegisterEmail(email: string, token: string) {
    const res = await apiClient.post<LoginResponse>(
      API_CONFIG.endpoints.auth.verifyRegisterEmail,
      { email, token },
    );
    const data = res.data;
    if (!data?.accessToken) {
      throw new Error('Verification succeeded but no access token was returned.');
    }
    await apiClient.setToken(data.accessToken);
    if (data.refreshToken) await apiClient.setRefreshToken(data.refreshToken);
    return data;
  },

  async resendRegisterOtp(email: string) {
    const res = await apiClient.post<any>(API_CONFIG.endpoints.auth.resendRegisterOtp, { email });
    return res.data;
  },

  async login(input: LoginInput) {
    const res = await apiClient.post<LoginResponse>(
      API_CONFIG.endpoints.auth.login,
      input,
    );
    const data = res.data;
    if (!data?.accessToken) {
      throw new Error('Login succeeded but no access token was returned. Please try again.');
    }
    await apiClient.setToken(data.accessToken);
    if (data.refreshToken) {
      await apiClient.setRefreshToken(data.refreshToken);
    }
    return data;
  },

  async getProfile() {
    const res = await apiClient.get<LoginResponse['user']>(
      API_CONFIG.endpoints.auth.me,
    );
    return res.data;
  },

  async logout() {
    const refreshToken = await apiClient.getRefreshToken();
    try {
      if (refreshToken) {
        await apiClient.post(API_CONFIG.endpoints.auth.logout, { refreshToken });
      }
    } catch (err) {
    }
    await apiClient.setToken(null);
    await apiClient.setRefreshToken(null);
  },

  async forgotPassword(email: string) {
    const res = await apiClient.post<any>('/auth/forgot-password', { email });
    return res.data;
  },

  async verifyResetOtp(email: string, token: string) {
    const res = await apiClient.post<any>('/auth/verify-reset-otp', { email, token });
    return res.data;
  },

  async resetPassword(input: ResetPasswordInput) {
    const res = await apiClient.post<any>('/auth/reset-password', input);
    return res.data;
  },

  async updateProfile(data: any) {
    const res = await apiClient.patch<any>('/auth/profile', data);
    return res.data;
  },

  async changePassword(input: { currentPassword: string; newPassword: string }) {
    const res = await apiClient.patch<any>('/auth/password', input);
    return res.data;
  },

  async getDeletionInfo() {
    const res = await apiClient.get<AccountDeletionInfo>('/auth/account/deletion-info');
    return res.data;
  },

  async deleteAccount(input: { password: string; confirmDeletion: true; reason?: string; otp?: string }) {
    const res = await apiClient.delete<any>('/auth/account', input);
    await apiClient.setToken(null);
    await apiClient.setRefreshToken(null);
    return res.data;
  },

  async requestAccountDeletionCode() {
    const res = await apiClient.post<any>('/auth/account/deletion-code', {});
    return res.data;
  },

  async setActiveMode(activeMode: UserActiveMode) {
    const attempts: Array<{ path: string; body: Record<string, string> }> = [
      { path: API_CONFIG.endpoints.auth.activeMode, body: { activeMode } },
      { path: API_CONFIG.endpoints.auth.activeRole, body: { activeRole: activeMode } },
      { path: API_CONFIG.endpoints.auth.activeRole, body: { activeMode } },
    ];

    let lastError: any;
    for (const attempt of attempts) {
      try {
        const res = await apiClient.patch<ActiveModeResponse>(attempt.path, attempt.body);
        const data = res.data;
        if (!data?.user || !data?.accessToken) {
          throw new Error('Profile switched but the server returned an incomplete session.');
        }
        await apiClient.setToken(data.accessToken);
        return data.user;
      } catch (err: any) {
        lastError = err;
        const status = err?.status;
        const msg = String(err?.message || '').toLowerCase();
        const missingRoute =
          status === 404 ||
          msg.includes('route not found') ||
          msg.includes('cannot find') ||
          msg.includes('not found');
        if (!missingRoute) throw err;
      }
    }

    // Server is source of truth — never invent a local mode-switch success.
    throw lastError || new Error('Could not switch profile.');
  },

  /** Temporary mobile compatibility alias. */
  async setActiveRole(activeRole: UserActiveMode) {
    return this.setActiveMode(activeRole);
  },
};

export interface ResetPasswordInput {
  email: string;
  token: string;
  password: string;
}

export interface AccountDeletionInfo {
  palPoints: number;
  pendingRedemptions: number;
  vendor: { id: string; status: string; businessName: string } | null;
  creator: { id: string; status: string; username: string } | null;
  canSelfDelete: boolean;
}

