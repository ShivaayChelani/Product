import { z } from 'zod';

const privacySchema = z.object({
  profileVisibility: z.enum(['public', 'private']).optional(),
  showTrips: z.boolean().optional(),
  showReviews: z.boolean().optional(),
  showReels: z.boolean().optional(),
  showWishlist: z.boolean().optional(),
}).partial();

const notificationsSchema = z.object({
  pushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  travelAlerts: z.boolean().optional(),
  offerAlerts: z.boolean().optional(),
  rewardNotifications: z.boolean().optional(),
  systemNotifications: z.boolean().optional(),
}).partial();

const securitySchema = z.object({
  biometricLogin: z.boolean().optional(),
  pinLock: z.boolean().optional(),
  twoFactorEnabled: z.boolean().optional(),
}).partial();

const appearanceSchema = z.object({
  theme: z.enum(['light', 'system']).optional(),
}).partial();

export const patchUserAppSettingsSchema = z.object({
  privacy: privacySchema.optional(),
  notifications: notificationsSchema.optional(),
  security: securitySchema.optional(),
  appearance: appearanceSchema.optional(),
  language: z.enum(['en', 'hi', 'auto']).optional(),
});

export const blockUserSchema = z.object({
  blockedUserId: z.string().min(1),
});

export const feedbackSchema = z.object({
  category: z.enum(['bug', 'feature', 'support', 'rating_fallback', 'general']),
  message: z.string().min(3).max(5000),
  metadata: z.record(z.unknown()).optional(),
});

export const revokeSessionSchema = z.object({
  refreshToken: z.string().optional(),
});
