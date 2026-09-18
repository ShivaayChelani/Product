/**
 * Canonical admin-role → target-role mapping for notification broadcasts.
 * Admin UI submits legacy/dashboard labels (TOURIST, PARTNER, CREATOR, ADMIN);
 * these normalize to real Role values before the user query runs.
 */
export const NOTIFICATION_ROLE_ALIASES: Record<string, string> = {
  TOURIST: 'VENDOR',
  PARTNER: 'CONTENT_CREATOR',
  CREATOR: 'CONTENT_CREATOR',
};

/** Role values that may receive a broadcast after alias mapping. */
export const NOTIFICATION_TARGET_ROLES = [
  'USER',
  'VENDOR',
  'CONTENT_CREATOR',
  'ADMIN',
  'SUPER_ADMIN',
  'ALL',
];

/** Normalize an admin-supplied role label; invalid labels are returned unchanged. */
export function resolveNotificationTargetRole(role: string): string {
  const normalized = String(role || '').toUpperCase();
  return NOTIFICATION_ROLE_ALIASES[normalized] ?? normalized;
}