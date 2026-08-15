import { z } from 'zod';

export const createRewardSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  category: z.string().min(1),
  pointsRequired: z.number().int().positive(),
  value: z.string().optional(),
  imageUrl: z.string().optional(),
  vendorId: z.string().optional(),
  vendorOfferId: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateRewardSchema = createRewardSchema.partial();

export const rewardQuerySchema = z.object({
  category: z.string().optional(),
  minPoints: z.string().optional(),
  maxPoints: z.string().optional(),
  city: z.string().optional(),
  vendorId: z.string().optional(),
  search: z.string().optional(),
  sort: z.enum(['popular', 'newest', 'points_asc', 'points_desc']).optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
  isActive: z.string().optional(),
  lat: z.string().optional(),
  lng: z.string().optional(),
});

export const redeemVendorOfferSchema = z.object({
  offerId: z.string().min(1),
  vendorCode: z.string().min(4, 'Vendor code is required').max(32),
});

export type CreateRewardInput = z.infer<typeof createRewardSchema>;
export type UpdateRewardInput = z.infer<typeof updateRewardSchema>;
export type RewardQueryInput = z.infer<typeof rewardQuerySchema>;
export type RedeemVendorOfferInput = z.infer<typeof redeemVendorOfferSchema>;
