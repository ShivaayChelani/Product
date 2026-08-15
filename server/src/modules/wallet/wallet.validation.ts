import { z } from 'zod';

export const earnPointsSchema = z.object({
  userId: z.string().uuid('Target userId is required'),
  amount: z.number().int().positive(),
  reason: z.string().min(1),
  referenceId: z.string().optional(),
  referenceType: z.string().optional(),
});

export const spendPointsSchema = z.object({
  amount: z.number().int().positive(),
  reason: z.string().min(1),
  referenceId: z.string().optional(),
  referenceType: z.string().optional(),
});

export const adjustWalletSchema = z.object({
  palPoints: z.number().int().refine((n) => n !== 0, 'palPoints must be a non-zero integer'),
  reason: z.string().min(1).max(500),
});

export const walletQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const walletBatchQuerySchema = z.object({
  userIds: z
    .string()
    .min(1, 'userIds is required')
    .transform((value) =>
      value
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    )
    .refine((ids) => ids.length > 0, 'At least one userId is required')
    .refine((ids) => ids.length <= 100, 'Maximum 100 userIds per request')
    .refine((ids) => ids.every((id) => z.string().uuid().safeParse(id).success), 'All userIds must be valid UUIDs'),
});

export type EarnPointsInput = z.infer<typeof earnPointsSchema>;
export type SpendPointsInput = z.infer<typeof spendPointsSchema>;
export type AdjustWalletInput = z.infer<typeof adjustWalletSchema>;
export type WalletBatchQuery = z.infer<typeof walletBatchQuerySchema>;
