import { z } from 'zod';

export const earnPointsSchema = z.object({
  userId: z.string().uuid('Target userId is required'),
  amount: z.number().int().positive(),
  reason: z.string().min(1),
  referenceId: z.string().optional(),
});

export type EarnPointsInput = z.infer<typeof earnPointsSchema>;
