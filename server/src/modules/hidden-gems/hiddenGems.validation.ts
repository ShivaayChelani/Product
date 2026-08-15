import { z } from 'zod';

export const HIDDEN_GEM_CATEGORY_VALUES = [
  'waterfall',
  'sunset_point',
  'old_temple',
  'local_viewpoint',
  'photo_spot',
  'river_ghat',
  'small_fort',
  'nature_trail',
  'cultural_place',
  'lake',
  'cave',
  'wildlife',
  'heritage',
  'other',
] as const;

export const createHiddenGemSchema = z.object({
  placeName: z.string().min(1).max(200),
  category: z.enum(HIDDEN_GEM_CATEGORY_VALUES, {
    message: `Category must be one of: ${HIDDEN_GEM_CATEGORY_VALUES.join(', ')}`,
  }),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  latitude: z
    .number()
    .min(-90)
    .max(90)
    .refine((v) => Math.abs(v) > 0.0001, { message: 'Valid GPS latitude is required' }),
  longitude: z
    .number()
    .min(-180)
    .max(180)
    .refine((v) => Math.abs(v) > 0.0001, { message: 'Valid GPS longitude is required' }),
  imageUri: z.string().url().optional(),
  /** Additional uploaded photo URLs (http/https). Combined with imageUri. */
  images: z.array(z.string().url()).max(4).optional(),
  description: z.string().min(10).max(2000),
  bestTimeToVisit: z
    .union([
      z.string().max(100),
      z.object({
        from: z.string().min(1),
        to: z.string().min(1),
        label: z.string().optional(),
      }),
    ])
    .optional(),
  estimatedCost: z.string().max(100).optional(),
  safetyTip: z.string().max(500).optional(),
  worthVisitingReason: z.string().min(10).max(1000),
  locationMethod: z.enum(['gps', 'map_pick', 'manual']),
});

export const updateHiddenGemSchema = createHiddenGemSchema.partial().extend({
  placeName: z.string().min(1).max(200).optional(),
  description: z.string().min(10).max(2000).optional(),
  worthVisitingReason: z.string().min(10).max(1000).optional(),
  locationMethod: z.enum(['gps', 'map_pick', 'manual']).optional(),
  category: z.enum(HIDDEN_GEM_CATEGORY_VALUES).optional(),
  latitude: z
    .number()
    .min(-90)
    .max(90)
    .refine((v) => Math.abs(v) > 0.0001, { message: 'Valid GPS latitude is required' })
    .optional(),
  longitude: z
    .number()
    .min(-180)
    .max(180)
    .refine((v) => Math.abs(v) > 0.0001, { message: 'Valid GPS longitude is required' })
    .optional(),
});

export const approveHiddenGemSchema = z.object({
  points: z.number().int().min(0).max(500).optional(),
  force: z.boolean().optional(),
});

export const rejectHiddenGemSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const mergeHiddenGemSchema = z.object({
  targetPlaceId: z.string().min(1),
  updateDescription: z.boolean().optional(),
  appendDescription: z.boolean().optional(),
  description: z.string().max(5000).optional(),
  additionalPhotos: z.array(z.string().url()).optional(),
  points: z.number().int().min(0).max(500).optional(),
  reason: z.string().max(500).optional(),
});

export const listHiddenGemsSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  search: z.string().max(200).optional(),
});

export type CreateHiddenGemInput = z.infer<typeof createHiddenGemSchema>;
export type UpdateHiddenGemInput = z.infer<typeof updateHiddenGemSchema>;
export type ApproveHiddenGemInput = z.infer<typeof approveHiddenGemSchema>;
export type RejectHiddenGemInput = z.infer<typeof rejectHiddenGemSchema>;
export type MergeHiddenGemInput = z.infer<typeof mergeHiddenGemSchema>;
