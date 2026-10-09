import { mergeUserAppSettings, applyOwnedServerSettings, rollbackFailedSettingsPatch, settingsPatchKeys } from '../features/settings/mergeUserAppSettings';
import type { UserAppSettings } from '../services/api/userApp';

const BASE: UserAppSettings = {
  privacy: {
    profileVisibility: 'public',
    showTrips: true,
    showReviews: true,
    showReels: true,
    showWishlist: true,
  },
  notifications: {
    pushEnabled: true,
    emailEnabled: true,
    travelAlerts: true,
    offerAlerts: true,
    rewardNotifications: true,
    systemNotifications: true,
  },
  security: {
    biometricLogin: false,
    pinLock: false,
    twoFactorEnabled: false,
  },
  appearance: { theme: 'system' },
  language: 'auto',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('mergeUserAppSettings', () => {
  it('flips one privacy switch without clobbering the others', () => {
    const next = mergeUserAppSettings(BASE, { privacy: { showReels: false } as UserAppSettings['privacy'] });
    expect(next.privacy.showReels).toBe(false);
    expect(next.privacy.showReviews).toBe(true);
    expect(next.privacy.profileVisibility).toBe('public');
  });

  it('can turn the public profile off without losing wishlist visibility', () => {
    const next = mergeUserAppSettings(BASE, {
      privacy: { profileVisibility: 'private' } as UserAppSettings['privacy'],
    });
    expect(next.privacy.profileVisibility).toBe('private');
    expect(next.privacy.showWishlist).toBe(true);
  });

  it('keeps a newer in-flight toggle when an older save response arrives last', () => {
    const afterReels = mergeUserAppSettings(BASE, {
      privacy: { showReels: false } as UserAppSettings['privacy'],
    });
    const optimistic = mergeUserAppSettings(afterReels, {
      privacy: { showReviews: false } as UserAppSettings['privacy'],
    });
    const staleServer = mergeUserAppSettings(BASE, {
      privacy: { showReels: false } as UserAppSettings['privacy'],
    });
    const ownsReelsOnly = (key: string) => key === 'privacy.showReels';
    const reconciled = applyOwnedServerSettings(
      optimistic,
      staleServer,
      { privacy: { showReels: false } as UserAppSettings['privacy'] },
      ownsReelsOnly,
    );
    expect(reconciled.privacy.showReels).toBe(false);
    expect(reconciled.privacy.showReviews).toBe(false);
    expect(reconciled.privacy.showWishlist).toBe(true);
  });

  it('ignores an older response for a key a newer toggle already owns', () => {
    const latest = mergeUserAppSettings(BASE, {
      privacy: { showReels: true } as UserAppSettings['privacy'],
    });
    const staleServer = mergeUserAppSettings(BASE, {
      privacy: { showReels: false } as UserAppSettings['privacy'],
    });
    const reconciled = applyOwnedServerSettings(
      latest,
      staleServer,
      { privacy: { showReels: false } as UserAppSettings['privacy'] },
      () => false,
    );
    expect(reconciled.privacy.showReels).toBe(true);
  });

  it('rolls back only the failed toggle and keeps a newer one', () => {
    const snapshot = BASE;
    const current = mergeUserAppSettings(
      mergeUserAppSettings(BASE, { privacy: { showReels: false } as UserAppSettings['privacy'] }),
      { privacy: { showReviews: false } as UserAppSettings['privacy'] },
    );
    const rolled = rollbackFailedSettingsPatch(
      current,
      snapshot,
      { privacy: { showReels: false } as UserAppSettings['privacy'] },
      key => key === 'privacy.showReels',
    );
    expect(rolled.privacy.showReels).toBe(true);
    expect(rolled.privacy.showReviews).toBe(false);
    expect(settingsPatchKeys({ privacy: { showReels: false } as UserAppSettings['privacy'] })).toEqual([
      'privacy.showReels',
    ]);
  });

  it('does not roll back a key a newer toggle still owns', () => {
    const current = mergeUserAppSettings(BASE, {
      privacy: { showReels: true } as UserAppSettings['privacy'],
    });
    const rolled = rollbackFailedSettingsPatch(
      current,
      mergeUserAppSettings(BASE, { privacy: { showReels: false } as UserAppSettings['privacy'] }),
      { privacy: { showReels: false } as UserAppSettings['privacy'] },
      () => false,
    );
    expect(rolled.privacy.showReels).toBe(true);
  });
});
