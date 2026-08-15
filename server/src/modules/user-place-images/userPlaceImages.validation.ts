import { z } from 'zod';

export const contributeImageSchema = z.object({
  url: z.string().url('Valid image URL is required'),
});

export const rejectImageSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const listImagesSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
});

export type ContributeImageInput = z.infer<typeof contributeImageSchema>;
export type RejectImageInput = z.infer<typeof rejectImageSchema>;
