import { z } from 'zod';

export const createTreasureHuntSchema = z.object({
  city: z.string().min(1, 'City is required'),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  rewardCoins: z.number().int().positive().optional().default(150),
  status: z.string().optional().default('ACTIVE')
});

export const updateTreasureHuntSchema = createTreasureHuntSchema.partial();

export const createRiddleSchema = z.object({
  huntId: z.string(),
  city: z.string(),
  sequence: z.number().int().min(1),
  clueEnglish: z.string().min(1),
  answerEnglish: z.string().min(1),
  clueHindi: z.string().min(1),
  answerHindi: z.string().min(1),
});

export const updateRiddleSchema = createRiddleSchema.partial().extend({
  status: z.string().optional(),
});

export const submitAnswerSchema = z.object({
  answer: z.string().min(1, 'Answer is required'),
  language: z.enum(['en', 'hi']).optional(),
});

export const locationQuerySchema = z.object({
  lat: z.string().regex(/^-?\d+(\.\d+)?$/, 'Valid lat is required'),
  lng: z.string().regex(/^-?\d+(\.\d+)?$/, 'Valid lng is required'),
});

export const importIdParamsSchema = z.object({
  importId: z.string().min(1, 'Import id is required'),
});

export type CreateTreasureHuntInput = z.infer<typeof createTreasureHuntSchema>;
export type UpdateTreasureHuntInput = z.infer<typeof updateTreasureHuntSchema>;
export type CreateRiddleInput = z.infer<typeof createRiddleSchema>;
export type UpdateRiddleInput = z.infer<typeof updateRiddleSchema>;
export type SubmitAnswerInput = z.infer<typeof submitAnswerSchema>;
