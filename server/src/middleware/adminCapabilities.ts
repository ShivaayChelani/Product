import { Role } from '@prisma/client';
import { requireRoles } from './auth';

/**
 * Centralized admin capability sets for mutation authorization.
 * `requireAdmin` remains the gate for admin *reads*; use these for *mutations*.
 * `requireRoles` always allows SUPER_ADMIN.
 *
 * ANALYTICS_VIEWER and SUPPORT_AGENT are intentionally excluded from mutators
 * (except where a capability explicitly includes them).
 */

export const PLATFORM_OPS_ROLES: Role[] = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.OPS_ADMIN,
];

export const CONTENT_OPS_ROLES: Role[] = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.OPS_ADMIN,
  Role.CONTENT_MODERATOR,
];

export const VENDOR_OPS_ROLES: Role[] = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.OPS_ADMIN,
  Role.VENDOR_MANAGER,
];

export const FINANCE_OPS_ROLES: Role[] = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.OPS_ADMIN,
  Role.FINANCE_MANAGER,
];

export const MARKETING_OPS_ROLES: Role[] = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.OPS_ADMIN,
  Role.MARKETING_ADMIN,
];

/** Settings, user role/delete, place wipe/import, canonical merge, DB ops */
export const requirePlatformOps = requireRoles(PLATFORM_OPS_ROLES);

/** Reviews, places approve/reject/update, creators, reels, taxonomy, media, moderation */
export const requireContentOps = requireRoles(CONTENT_OPS_ROLES);

/** Vendor verify/delete/location and offer moderation */
export const requireVendorOps = requireRoles(VENDOR_OPS_ROLES);

/** Wallet/points/refunds/rewards/subscriptions/plans */
export const requireFinanceOps = requireRoles(FINANCE_OPS_ROLES);

/** Campaigns, announcements, notification broadcasts */
export const requireMarketingOps = requireRoles(MARKETING_OPS_ROLES);
