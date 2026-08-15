import { z } from 'zod';

export const planAudienceSchema = z.enum(['USER_PREMIUM', 'VENDOR', 'CREATOR']);
export const planPeriodSchema = z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'YEARLY', 'LIFETIME']);
export const planStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED']);

export const createPlanSchema = z.object({
  audience: planAudienceSchema,
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/),
  description: z.string().max(5000).optional().nullable(),
  badge: z.string().max(60).optional().nullable(),
  color: z.string().max(32).optional().nullable(),
  status: planStatusSchema.optional(),
  sortOrder: z.number().int().min(0).optional(),
  features: z.record(z.any()).optional(),
  trialDays: z.number().int().min(0).max(365).optional(),
  gracePeriodDays: z.number().int().min(0).max(60).optional(),
  googleProductIdMonthly: z.string().optional().nullable(),
  googleProductIdYearly: z.string().optional().nullable(),
  appleProductIdMonthly: z.string().optional().nullable(),
  appleProductIdYearly: z.string().optional().nullable(),
  razorpayPlanIdMonthly: z.string().optional().nullable(),
  razorpayPlanIdYearly: z.string().optional().nullable(),
  prices: z.array(z.object({
    period: planPeriodSchema,
    amountPaise: z.number().int().min(0),
    currency: z.string().length(3).default('INR'),
    isActive: z.boolean().optional(),
  })).min(1),
});

export const updatePlanSchema = createPlanSchema.partial().omit({ prices: true }).extend({
  prices: z.array(z.object({
    period: planPeriodSchema,
    amountPaise: z.number().int().min(0),
    currency: z.string().length(3).default('INR'),
    isActive: z.boolean().optional(),
  })).optional(),
});

export const sortPlansSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

export const createRazorpayOrderSchema = z.object({
  planId: z.string().min(1),
  period: planPeriodSchema,
  couponCode: z.string().optional(),
});

export const verifyRazorpayPaymentSchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
  planId: z.string().min(1),
  period: planPeriodSchema,
});

export const verifyIapSchema = z.object({
  platform: z.enum(['android', 'ios']),
  productId: z.string().min(1),
  purchaseToken: z.string().min(1),
  transactionId: z.string().optional(),
  planId: z.string().min(1),
  period: planPeriodSchema,
});

export const createCouponSchema = z.object({
  code: z.string().min(3).max(40).transform((c) => c.toUpperCase()),
  type: z.enum(['PERCENTAGE', 'FLAT', 'BOGO']),
  value: z.number().positive(),
  maxDiscount: z.number().positive().optional().nullable(),
  minPurchase: z.number().min(0).optional().nullable(),
  usageLimit: z.number().int().min(0).optional().nullable(),
  perUserLimit: z.number().int().positive().optional(),
  startsAt: z.string().datetime().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
  vendorId: z.string().optional().nullable(),
  recipientEmail: z.string().email().or(z.literal('')).optional().nullable(),
});

export const updateAdConfigSchema = z.object({
  adsEnabled: z.boolean().optional(),
  killSwitch: z.boolean().optional(),
  interstitialEnabled: z.boolean().optional(),
  rewardedEnabled: z.boolean().optional(),
  nativeEnabled: z.boolean().optional(),
  interstitialCooldownSec: z.number().int().min(0).max(86400).optional(),
  rewardedPoints: z.number().int().min(0).max(10000).optional(),
  interstitialAdUnitIdAndroid: z.string().optional().nullable(),
  interstitialAdUnitIdIos: z.string().optional().nullable(),
  rewardedAdUnitIdAndroid: z.string().optional().nullable(),
  rewardedAdUnitIdIos: z.string().optional().nullable(),
  nativeAdUnitIdAndroid: z.string().optional().nullable(),
  nativeAdUnitIdIos: z.string().optional().nullable(),
  enabledCountries: z.array(z.string()).optional(),
  enabledAppVersions: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional().nullable(),
});

export const createVendorDocumentSchema = z.object({
  type: z.enum(['GST', 'PAN', 'BUSINESS_LICENSE', 'SHOP_PHOTO', 'OWNER_ID', 'BANK_DETAILS', 'OTHER']),
  fileUrl: z.string().url(),
  fileName: z.string().max(255).optional().nullable(),
});

export const reviewVendorDocumentSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'CHANGES_REQUESTED']),
  rejectionReason: z.string().max(1000).optional().nullable(),
});

export const GRANT_DURATION_MONTHS = [1, 3, 6, 12] as const;

export const adminGrantSubscriptionSchema = z.object({
  userId: z.string().min(1),
  planId: z.string().min(1),
  durationMonths: z.coerce.number().refine(
    (n): n is 1 | 3 | 6 | 12 => n === 1 || n === 3 || n === 6 || n === 12,
    { message: 'Duration must be 1, 3, 6, or 12 months' },
  ),
  reason: z.string().trim().max(1000).optional(),
  confirmReplace: z.boolean().optional(),
});

export const adminGrantContextQuerySchema = z.object({
  userId: z.string().min(1),
});
