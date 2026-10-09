import type { UserAppSettings } from '../../services/api/userApp';

const SECTIONS = ['privacy', 'notifications', 'security', 'appearance'] as const;

/** Deep-merge a settings PATCH so one toggle never overwrites another in-flight key. */
export function mergeUserAppSettings(
  current: UserAppSettings,
  patch: Partial<UserAppSettings>,
): UserAppSettings {
  return {
    ...current,
    ...patch,
    privacy: patch.privacy ? { ...current.privacy, ...patch.privacy } : current.privacy,
    notifications: patch.notifications
      ? { ...current.notifications, ...patch.notifications }
      : current.notifications,
    security: patch.security ? { ...current.security, ...patch.security } : current.security,
    appearance: patch.appearance ? { ...current.appearance, ...patch.appearance } : current.appearance,
  };
}

/** Stable paths such as `privacy.showReels` for every field a patch writes. */
export function settingsPatchKeys(patch: Partial<UserAppSettings>): string[] {
  const keys: string[] = [];
  for (const section of SECTIONS) {
    const value = patch[section];
    if (!value || typeof value !== 'object') continue;
    for (const key of Object.keys(value)) keys.push(`${section}.${key}`);
  }
  if (patch.language) keys.push('language');
  return keys;
}

function patchFromOwnedKeys(
  source: UserAppSettings,
  patch: Partial<UserAppSettings>,
  owns: (key: string) => boolean,
): Partial<UserAppSettings> {
  const owned: Partial<UserAppSettings> = {};
  for (const section of SECTIONS) {
    const value = patch[section];
    if (!value || typeof value !== 'object') continue;
    const picked: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      if (!owns(`${section}.${key}`)) continue;
      picked[key] = (source[section] as unknown as Record<string, unknown>)[key];
    }
    if (Object.keys(picked).length > 0) {
      (owned as Record<string, unknown>)[section] = picked;
    }
  }
  if (patch.language && owns('language')) owned.language = source.language;
  return owned;
}

/**
 * Apply a server response without letting an older request clobber a newer toggle.
 * `owns` is true only for keys this mutation is still the latest writer of.
 */
export function applyOwnedServerSettings(
  current: UserAppSettings,
  server: UserAppSettings,
  completedPatch: Partial<UserAppSettings>,
  owns: (key: string) => boolean,
): UserAppSettings {
  return mergeUserAppSettings(current, patchFromOwnedKeys(server, completedPatch, owns));
}

/**
 * Roll a failed save back to the pre-toggle snapshot, but only for keys this
 * mutation still owns. Newer in-flight toggles stay put.
 */
export function rollbackFailedSettingsPatch(
  current: UserAppSettings,
  snapshot: UserAppSettings,
  failedPatch: Partial<UserAppSettings>,
  owns: (key: string) => boolean,
): UserAppSettings {
  return mergeUserAppSettings(current, patchFromOwnedKeys(snapshot, failedPatch, owns));
}
