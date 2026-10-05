import {
  APPLE_CREDENTIAL_STATE,
  checkAppleCredentialState,
  forgetAppleUserId,
  isAppleAccessRevoked,
  isAppleIdentityTransferred,
  observeAppleCredentialRevocation,
  readRememberedAppleUserId,
  rememberAppleUserId,
} from '../services/appleCredentialState';
import { appleAuth } from '../config/appleAuth';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../config/appleAuth', () => ({
  appleAuth: {
    State: { REVOKED: 0, AUTHORIZED: 1, NOT_FOUND: 2, TRANSFERRED: 3 },
    getCredentialStateForUser: jest.fn(),
    onCredentialRevoked: jest.fn(),
    performRequest: jest.fn(),
    isSupported: true,
  },
  canUseSignInWithApple: jest.fn(() => true),
  generateAppleNonce: jest.fn(() => 'a'.repeat(64)),
  APPLE_BUNDLE_ID: 'com.palsasafar',
}));

const mockedApple = appleAuth as unknown as {
  getCredentialStateForUser: jest.Mock;
  onCredentialRevoked: jest.Mock;
};

const mockedCanUse = require('../config/appleAuth').canUseSignInWithApple as jest.Mock;

/** Drains the whole listener chain: AsyncStorage read -> native call -> state check. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('remembered Apple identifier', () => {
  beforeEach(async () => {
    await forgetAppleUserId();
    mockedApple.getCredentialStateForUser.mockReset();
    mockedApple.onCredentialRevoked.mockReset();
    mockedCanUse.mockReturnValue(true);
  });

  it('round-trips the Apple sub', async () => {
    await rememberAppleUserId('001234.abcdef.1234');
    await expect(readRememberedAppleUserId()).resolves.toBe('001234.abcdef.1234');
  });

  it('ignores blank identifiers instead of storing them', async () => {
    await rememberAppleUserId('   ');
    await rememberAppleUserId(null);
    await expect(readRememberedAppleUserId()).resolves.toBeNull();
  });

  it('clears the identifier on sign-out', async () => {
    await rememberAppleUserId('001234.abcdef.1234');
    await forgetAppleUserId();
    await expect(readRememberedAppleUserId()).resolves.toBeNull();
  });
});

describe('checkAppleCredentialState', () => {
  beforeEach(async () => {
    await forgetAppleUserId();
    mockedApple.getCredentialStateForUser.mockReset();
    mockedCanUse.mockReturnValue(true);
  });

  it('returns null when Apple is unavailable', async () => {
    await rememberAppleUserId('sub-1');
    mockedCanUse.mockReturnValue(false);
    await expect(checkAppleCredentialState()).resolves.toBeNull();
    expect(mockedApple.getCredentialStateForUser).not.toHaveBeenCalled();
  });

  it('returns null when no Apple ID has been stored', async () => {
    await expect(checkAppleCredentialState()).resolves.toBeNull();
    expect(mockedApple.getCredentialStateForUser).not.toHaveBeenCalled();
  });

  it('queries Apple with the stored identifier', async () => {
    await rememberAppleUserId('001234.abcdef.1234');
    mockedApple.getCredentialStateForUser.mockResolvedValue(APPLE_CREDENTIAL_STATE.authorized);
    await expect(checkAppleCredentialState()).resolves.toBe(APPLE_CREDENTIAL_STATE.authorized);
    expect(mockedApple.getCredentialStateForUser).toHaveBeenCalledWith('001234.abcdef.1234');
  });

  it('returns null when the native call fails, rather than guessing', async () => {
    await rememberAppleUserId('sub-1');
    mockedApple.getCredentialStateForUser.mockRejectedValue(new Error('bridge unavailable'));
    await expect(checkAppleCredentialState()).resolves.toBeNull();
  });
});

describe('credential state classification', () => {
  it('treats revoked (0) as revoked ? a falsy value that must not be skipped', () => {
    expect(APPLE_CREDENTIAL_STATE.revoked).toBe(0);
    expect(isAppleAccessRevoked(APPLE_CREDENTIAL_STATE.revoked)).toBe(true);
    expect(isAppleIdentityTransferred(APPLE_CREDENTIAL_STATE.revoked)).toBe(false);
  });

  it('treats transferred as a lost identity', () => {
    expect(isAppleIdentityTransferred(APPLE_CREDENTIAL_STATE.transferred)).toBe(true);
    expect(isAppleAccessRevoked(APPLE_CREDENTIAL_STATE.transferred)).toBe(false);
  });

  it('does not act on authorized, notFound, or an inconclusive null', () => {
    for (const state of [APPLE_CREDENTIAL_STATE.authorized, APPLE_CREDENTIAL_STATE.notFound, null]) {
      expect(isAppleAccessRevoked(state)).toBe(false);
      expect(isAppleIdentityTransferred(state)).toBe(false);
    }
  });
});

describe('observeAppleCredentialRevocation', () => {
  beforeEach(async () => {
    await forgetAppleUserId();
    mockedApple.onCredentialRevoked.mockReset();
    mockedApple.getCredentialStateForUser.mockReset();
    mockedCanUse.mockReturnValue(true);
  });

  it('re-checks state and only reports a genuine revocation', async () => {
    let emit: (() => void) | undefined;
    mockedApple.onCredentialRevoked.mockImplementation((listener: () => void) => {
      emit = listener;
      return () => undefined;
    });
    await rememberAppleUserId('sub-1');

    const onRevoked = jest.fn();
    observeAppleCredentialRevocation(onRevoked);

    mockedApple.getCredentialStateForUser.mockResolvedValue(APPLE_CREDENTIAL_STATE.revoked);
    emit?.();
    await flush();
    expect(onRevoked).toHaveBeenCalledTimes(1);
  });

  it('ignores the OS notification when the credential is still authorized', async () => {
    let emit: (() => void) | undefined;
    mockedApple.onCredentialRevoked.mockImplementation((listener: () => void) => {
      emit = listener;
      return () => undefined;
    });
    await rememberAppleUserId('sub-1');

    const onRevoked = jest.fn();
    observeAppleCredentialRevocation(onRevoked);

    mockedApple.getCredentialStateForUser.mockResolvedValue(APPLE_CREDENTIAL_STATE.authorized);
    emit?.();
    await flush();
    expect(onRevoked).not.toHaveBeenCalled();
  });

  it('returns an unsubscribe function and never throws when unsupported', () => {
    mockedCanUse.mockReturnValue(false);
    expect(() => observeAppleCredentialRevocation(jest.fn())()).not.toThrow();

    mockedCanUse.mockReturnValue(true);
    mockedApple.onCredentialRevoked.mockImplementation(() => {
      throw new Error('no native module');
    });
    expect(() => observeAppleCredentialRevocation(jest.fn())()).not.toThrow();
  });
});
