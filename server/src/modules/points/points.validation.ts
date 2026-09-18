import { z } from 'zod';
import { cuidSchema } from '../../shared/utils/cuidSchema';

export const earnPointsSchema = z.object({
  userId: cuidSchema.describe('Target userId is a cuid'),
  amount: z.number().int().positive(),
  reason: z.string().min(1),
  referenceId: z.string().optional(),
  referenceType: z.string().optional(),
});

export type EarnPointsInput = z.infer<typeof earnPointsSchema>;
