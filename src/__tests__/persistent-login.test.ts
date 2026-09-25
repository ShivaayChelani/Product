import { apiClient, authApi } from '../services/api';
import { restoreSession, logout } from '../services/authService';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../services/api', () => ({
  apiClient: {
    init: jest.fn(async () => undefined),
    getToken: jest.fn(() => 'access-token'),
    getRefreshToken: jest.fn(async () => 'refresh'),
    hasStoredSession: jest.fn(async () => false),
    forceRefreshAccessToken: jest.fn(async () => true),
    setToken: jest.fn(async () => undefined),
    setRefreshToken: jest.fn(async () => undefined),
  },
  authApi: {
    getProfile: jest.fn(async () => ({
      id: 'user-1',
      email: 'user@palsafar.test',
      name: 'Persist User',
      approvedRoles: ['USER'],
      activeMode: 'USER',
      permission: 'USER',
    })),
    logout: jest.fn(async () => undefined),
  },
}));

jest.mock('../config/devFlags', () => ({
  DEV_FLAGS: { USE_SERVER_API: true },
}));

jest.mock('../config/googleAuth', () => ({
  ensureGoogleSignInConfigured: jest.fn(),
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    signOut: jest.fn(async () => undefined),
    hasPlayServices: jest.fn(async () => true),
    signIn: jest.fn(),
  },
}));

const mockedClient = apiClient as jest.Mocked<typeof apiClient>;
const mockedAuthApi = authApi as jest.Mocked<typeof authApi>;

const cachedUser = {
  uid: 'user-1',
  email: 'user@palsafar.test',
  displayName: 'Persist User',
  role: 'tourist',
};

function apiError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

describe('persistent login across app restarts', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockedClient.getToken.mockReturnValue('access-token');
    mockedAuthApi.getProfile.mockResolvedValue({
      id: 'user-1',
      email: 'user@palsafar.test',
      name: 'Persist User',
      approvedRoles: ['USER'],
      activeMode: 'USER',
      permission: 'USER',
    } as any);
  });

  it('restores the session from the backend when the refresh succeeds', async () => {
    const user = await restoreSession();
    expect(user?.uid).toBe('user-1');
    expect(mockedClient.forceRefreshAccessToken).toHaveBeenCalled();
    expect(mockedAuthApi.getProfile).toHaveBeenCalled();
  });

  it('keeps a still-valid session when the backend is briefly unreachable at boot', async () => {
    mockedClient.forceRefreshAccessToken.mockResolvedValue(false);
    await AsyncStorage.setItem('@palsasafar_auth_user', JSON.stringify(cachedUser));

    const user = await restoreSession();
    expect(user?.uid).toBe('user-1');
    expect(mockedClient.setToken).not.toHaveBeenCalledWith(null);
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
  });

  it('restores from the cached profile when refresh fails with a network error', async () => {
    mockedClient.forceRefreshAccessToken.mockRejectedValue(new Error('Network request failed'));
    await AsyncStorage.setItem('@palsasafar_auth_user', JSON.stringify(cachedUser));

    const user = await restoreSession();
    expect(user?.uid).toBe('user-1');
    expect(mockedClient.setToken).not.toHaveBeenCalledWith(null);
  });

  it('does not wipe the session when profile fetch hits a transient failure', async () => {
    mockedClient.forceRefreshAccessToken.mockResolvedValue(true);
    mockedAuthApi.getProfile.mockRejectedValue(new Error('request timed out'));
    await AsyncStorage.setItem('@palsasafar_auth_user', JSON.stringify(cachedUser));

    const user = await restoreSession();
    expect(user?.uid).toBe('user-1');
    expect(mockedClient.setToken).not.toHaveBeenCalledWith(null);
  });

  it('logs out only on a definitive server rejection (401)', async () => {
    mockedClient.forceRefreshAccessToken.mockRejectedValue(apiError(401, 'Refresh token expired'));
    await AsyncStorage.setItem('@palsasafar_auth_user', JSON.stringify(cachedUser));

    const user = await restoreSession();
    expect(user).toBeNull();
    expect(mockedClient.setToken).toHaveBeenCalledWith(null);
    expect(await AsyncStorage.getItem('@palsasafar_auth_user')).toBeNull();
    expect(await AsyncStorage.getItem('@palsasafar_session')).toBeNull();
  });

  it('restores the last-known profile across restarts without waiting on the network', async () => {
    await AsyncStorage.setItem('@palsasafar_auth_user', JSON.stringify(cachedUser));
    mockedClient.forceRefreshAccessToken.mockResolvedValue(false);

    const user = await restoreSession();
    expect(user?.uid).toBe('user-1');
    expect(user?.email).toBe('user@palsafar.test');
  });

  it('returns null when no token exists at all (fresh install)', async () => {
    mockedClient.getToken.mockReturnValue(null);
    const user = await restoreSession();
    expect(user).toBeNull();
  });

  it('purges user-scoped local data on logout so the next account starts clean', async () => {
    await AsyncStorage.setItem('PALSAFAR_USER_PROGRESS', JSON.stringify({ uid: 'user-1' }));
    await AsyncStorage.setItem('PALSAFAR_SYNC_QUEUE', JSON.stringify([{ id: '1' }]));
    await AsyncStorage.setItem('PALSAFAR_SPOT_COORDINATES', JSON.stringify([]));
    await AsyncStorage.setItem('@palsasafar_auth_user', JSON.stringify(cachedUser));

    await logout();

    expect(await AsyncStorage.getItem('PALSAFAR_USER_PROGRESS')).toBeNull();
    expect(await AsyncStorage.getItem('PALSAFAR_SYNC_QUEUE')).toBeNull();
    expect(await AsyncStorage.getItem('PALSAFAR_SPOT_COORDINATES')).toBeNull();
    expect(await AsyncStorage.getItem('@palsasafar_auth_user')).toBeNull();
    expect(mockedAuthApi.logout).toHaveBeenCalled();
  });

  it('keeps onboarding and app preferences when purging user data on logout', async () => {
    await AsyncStorage.setItem('PALSAFAR_ONBOARDING_COMPLETED', 'true');
    await AsyncStorage.setItem('PALSAFAR_APP_PREFERENCES', JSON.stringify({ selectedCity: 'Bhopal' }));

    await logout();

    expect(await AsyncStorage.getItem('PALSAFAR_ONBOARDING_COMPLETED')).toBe('true');
    expect(await AsyncStorage.getItem('PALSAFAR_APP_PREFERENCES')).toBe(JSON.stringify({ selectedCity: 'Bhopal' }));
  });
});