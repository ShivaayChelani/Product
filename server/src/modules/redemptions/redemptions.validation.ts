import { z } from 'zod';

export const redeemOfferSchema = z.object({
  offerId: z.string().min(1),
  vendorCode: z.string().min(4, 'Vendor code is required').max(32),
});

/** @deprecated Use redeemOfferSchema */
export const generateRedemptionSchema = redeemOfferSchema;

export const adminRefundSchema = z.object({
  notes: z.string().optional(),
});

export const adminListSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(500).optional().default(20),
  status: z.enum(['PENDING', 'VERIFIED', 'CANCELLED']).optional(),
  userId: z.string().optional(),
  vendorId: z.string().optional(),
  offerId: z.string().optional(),
  receiptNumber: z.string().optional(),
  vendorSearch: z.string().optional(),
  userSearch: z.string().optional(),
});

export const payPointsSchema = z.object({
  vendorCode: z.string().min(4, 'Vendor code is required').max(32),
  points: z.number().int().positive('Points must be a positive number').max(500, 'Maximum 500 points per transfer'),
});

export type RedeemOfferInput = z.infer<typeof redeemOfferSchema>;
export type PayPointsInput = z.infer<typeof payPointsSchema>;
export type AdminRefundInput = z.infer<typeof adminRefundSchema>;
export type AdminListInput = z.infer<typeof adminListSchema>;
