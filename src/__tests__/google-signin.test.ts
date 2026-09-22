import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { apiClient, authApi } from '../services/api';
import { googleLogin, logout } from '../services/authService';
import { mapGoogleAuthFailure, isGoogleSignInCancelled } from '../services/googleAuthErrors';
import { configureGoogleSignIn } from '../config/googleAuth';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../services/api', () => ({
  apiClient: {
    setToken: jest.fn(async () => undefined),
    setRefreshToken: jest.fn(async () => undefined),
    getToken: jest.fn(() => null),
    init: jest.fn(async () => undefined),
  },
  authApi: {
    googleLogin: jest.fn(),
    logout: jest.fn(async () => undefined),
  },
}));

jest.mock('../config/devFlags', () => ({
  DEV_FLAGS: { USE_SERVER_API: true },
}));

const mockedGoogle = GoogleSignin as jest.Mocked<typeof GoogleSignin>;
const mockedAuthApi = authApi as jest.Mocked<typeof authApi>;
const mockedClient = apiClient as jest.Mocked<typeof apiClient>;

function apiError(status: number, message: string, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(message), { status, ...extra });
}

function successGoogleResponse(idToken: string | null = 'id-token') {
  return { type: 'success' as const, data: { idToken } };
}

const sessionUser = {
  id: 'user-1',
  email: 'google@palsafar.test',
  name: 'Google User',
  permission: 'USER',
  activeMode: 'USER',
  approvedRoles: ['USER'],
};

describe('mobile Google auth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configureGoogleSignIn();
    mockedGoogle.hasPlayServices.mockResolvedValue(true as any);
    mockedGoogle.signIn.mockResolvedValue(successGoogleResponse() as any);
    mockedGoogle.signOut.mockResolvedValue(undefined as any);
    mockedAuthApi.googleLogin.mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      user: sessionUser,
    } as any);
  });

  it('returns null when the Google popup is cancelled', async () => {
    mockedGoogle.signIn.mockResolvedValue({ type: 'cancelled' } as any);
    await expect(googleLogin()).resolves.toBeNull();
    expect(mockedAuthApi.googleLogin).not.toHaveBeenCalled();
  });

  it('returns null when Google throws SIGN_IN_CANCELLED', async () => {
    mockedGoogle.signIn.mockRejectedValue(Object.assign(new Error('cancelled'), { code: 'SIGN_IN_CANCELLED' }));
    await expect(googleLogin()).resolves.toBeNull();
  });

  it('maps a network failure to a controlled error', async () => {
    mockedAuthApi.googleLogin.mockRejectedValue(apiError(0, 'Network request failed'));
    await expect(googleLogin()).rejects.toMatchObject({
      message: expect.stringMatching(/connection/i),
    });
  });

  it('maps backend 401 to a controlled error without crashing', async () => {
    mockedAuthApi.googleLogin.mockRejectedValue(apiError(401, 'Invalid Google token.'));
    await expect(googleLogin()).rejects.toMatchObject({
      status: 401,
      message: 'Invalid Google token.',
    });
  });

  it('maps backend 409 identity conflict', async () => {
    mockedAuthApi.googleLogin.mockRejectedValue(
      apiError(409, 'This Google account is already linked to a different PalSafar user.', {
        code: 'GOOGLE_IDENTITY_CONFLICT',
      }),
    );
    await expect(googleLogin()).rejects.toMatchObject({ status: 409 });
  });

  it('rejects a malformed backend session (missing token/user)', async () => {
    mockedAuthApi.googleLogin.mockResolvedValue({ user: { email: 'x' } } as any);
    await expect(googleLogin()).rejects.toThrow(/incomplete session/i);
  });

  it('persists a PalSafar session after Google login succeeds', async () => {
    const result = await googleLogin();
    expect(result?.user.uid).toBe('user-1');
    expect(result?.user.email).toBe('google@palsafar.test');
    expect(mockedClient.setToken).not.toHaveBeenCalled();
    expect(mockedAuthApi.googleLogin).toHaveBeenCalledWith({ idToken: 'id-token' });
  });

  it('returns a legal-acceptance signal for brand-new Google accounts (Phase 1)', async () => {
    mockedAuthApi.googleLogin.mockResolvedValue({ requiresLegalAcceptance: true } as any);
    await expect(googleLogin()).resolves.toEqual({
      requiresLegalAcceptance: true,
      pendingIdToken: 'id-token',
    });
  });

  it('finalizes Google login with legal acceptance (Phase 2)', async () => {
    const { finalizeGoogleLogin } = await import('../services/authService');
    const result = await finalizeGoogleLogin('id-token', {
      termsVersion: 1,
      privacyVersion: 1,
      platform: 'android',
    });
    expect(result?.user.uid).toBe('user-1');
    expect(mockedAuthApi.googleLogin).toHaveBeenCalledWith({
      idToken: 'id-token',
      termsAccepted: true,
      privacyAccepted: true,
      termsVersion: 1,
      privacyVersion: 1,
      platform: 'android',
    });
    expect(mockedClient.setToken).not.toHaveBeenCalled();
  });

  it('signs out of Google then clears PalSafar session so login can run again', async () => {
    await logout();
    expect(mockedGoogle.signOut).toHaveBeenCalled();
    expect(mockedAuthApi.logout).toHaveBeenCalled();
    mockedGoogle.signIn.mockResolvedValue(successGoogleResponse('id-token-2') as any);
    const again = await googleLogin();
    expect(again?.user.uid).toBe('user-1');
  });

  it('does not crash when Play Services is missing', async () => {
    mockedGoogle.hasPlayServices.mockRejectedValue(
      Object.assign(new Error('play'), { code: 'PLAY_SERVICES_NOT_AVAILABLE' }),
    );
    await expect(googleLogin()).rejects.toMatchObject({
      code: 'PLAY_SERVICES_NOT_AVAILABLE',
    });
  });
});

describe('mapGoogleAuthFailure', () => {
  it('detects cancel', () => {
    expect(isGoogleSignInCancelled({ code: 12501 })).toBe(true);
    expect(mapGoogleAuthFailure({ code: 'SIGN_IN_CANCELLED' }).cancelled).toBe(true);
  });

  it('maps 429 and 500', () => {
    expect(mapGoogleAuthFailure(apiError(429, 'slow down')).status).toBe(429);
    expect(mapGoogleAuthFailure(apiError(500, 'boom')).message).toMatch(/try again/i);
  });
});
