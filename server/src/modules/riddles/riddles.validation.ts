import { z } from 'zod';

export const createRiddleSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  clue: z.string().min(1, 'Clue text is required'),
  hintImage: z.string().url().optional(),
  correctPlaceName: z.string().min(1, 'Correct place name is required'),
  correctLat: z.number().optional(),
  correctLng: z.number().optional(),
  city: z.string().min(1, 'City is required'),
  rewardPoints: z.number().int().positive().optional().default(100),
  startsAt: z.string().datetime().or(z.string().min(1)),
  endsAt: z.string().datetime().or(z.string().min(1)).optional(),
});

export const updateRiddleSchema = createRiddleSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const submitRiddleSchema = z.object({
  photoUrl: z.string().url('Photo URL must be a valid URL'),
});

export const rejectRiddleSchema = z.object({
  adminComment: z.string().min(1, 'A comment with the correct location is required'),
});

export type CreateRiddleInput = z.infer<typeof createRiddleSchema>;
export type UpdateRiddleInput = z.infer<typeof updateRiddleSchema>;
export type SubmitRiddleInput = z.infer<typeof submitRiddleSchema>;
export type RejectRiddleInput = z.infer<typeof rejectRiddleSchema>;
