import { z } from 'zod';

/** Empty / whitespace / null become undefined so optional link fields stay optional. */
const optionalLink = (max: number) =>
  z.preprocess(
    (val) => (val == null || (typeof val === 'string' && val.trim() === '') ? undefined : val),
    z.string().max(max).optional(),
  );

const optionalUrl = () =>
  z.preprocess(
    (val) => (val == null || (typeof val === 'string' && val.trim() === '') ? undefined : val),
    z.string().url('Avatar must be a valid URL').optional(),
  );

export const applyCreatorSchema = z.object({
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain alphanumeric characters and underscores'),
  fullName: z.string().min(2, 'Full name is required').max(120, 'Full name must be at most 120 characters'),
  bio: z.string().min(20, 'Bio must be at least 20 characters').max(500, 'Bio must be at most 500 characters'),
  travelCategories: z.array(z.string().min(1).max(40))
    .min(1, 'Select at least one travel category')
    .max(8, 'Select up to 8 travel categories'),
  instagramUrl: z.string().trim().min(1, 'Instagram link is required').max(500, 'Instagram link is too long'),
  youtubeUrl: optionalLink(500),
  facebookUrl: optionalLink(500),
  languages: z.array(z.string().min(1).max(50)).max(20).optional(),
  governmentIdUrl: optionalLink(1000),
  portfolioLinks: z.array(z.string().max(1000)).max(20).optional(),
  sampleReelUrl: optionalLink(1000),
  applicationReason: z.string()
    .min(20, 'Please tell us why you want to become a creator')
    .max(1000, 'Reason must be at most 1000 characters'),
  avatar: optionalUrl(),
  // Set when the user has already been warned that applying will retire their Vendor role.
  confirmSwitch: z.boolean().optional(),
});

export const updateCreatorProfileSchema = z.object({
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain alphanumeric characters and underscores')
    .optional(),
  bio: z.string().max(500, 'Bio must be at most 500 characters').optional(),
  avatar: optionalUrl(),
  fullName: z.string().min(2).max(120).optional(),
  travelCategories: z.array(z.string().min(1).max(40)).min(1).max(8).optional(),
  instagramUrl: optionalLink(500),
  youtubeUrl: optionalLink(500),
  facebookUrl: optionalLink(500),
  languages: z.array(z.string().min(1).max(50)).max(20).optional(),
  portfolioLinks: z.array(z.string().max(1000)).max(20).optional(),
});

export const createReelSchema = z.object({
  videoUrl: z.string().min(1, 'Video is required'),
  thumbnail: z.string().min(1, 'Thumbnail is required').optional(),
  title: z.string().max(200, 'Title must be at most 200 characters').optional(),
  description: z.string().max(2000, 'Description must be at most 2000 characters').optional(),
  placeId: z.string().optional(),
  vendorId: z.string().optional(),
  eventId: z.string().optional(),
});

export const updateReelSchema = z.object({
  title: z.string().max(200, 'Title must be at most 200 characters').optional(),
  description: z.string().max(2000, 'Description must be at most 2000 characters').optional(),
  thumbnail: z.string().max(1000, 'Thumbnail is too long').optional(),
  placeId: z.string().nullable().optional(),
  vendorId: z.string().nullable().optional(),
  eventId: z.string().nullable().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'Provide at least one reel field to update.',
});

export const createCommentSchema = z.object({
  text: z.string().min(1, 'Comment text cannot be empty').max(1000, 'Comment is too long'),
});

export const verifyCreatorSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'SUSPENDED', 'PAUSED']),
  rejectionReason: z.string().max(500).optional(),
}).superRefine((data, ctx) => {
  if ((data.status === 'REJECTED' || data.status === 'CHANGES_REQUESTED') && !data.rejectionReason?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'A review reason is required when rejecting or requesting changes',
      path: ['rejectionReason'],
    });
  }
});

export const createCollectionSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().optional().default(true),
});

export const updateCollectionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().optional(),
});

export const addPlaceToCollectionSchema = z.object({
  placeId: z.string().min(1, 'Place ID is required'),
  note: z.string().max(500).optional(),
});

export type ApplyCreatorInput = z.infer<typeof applyCreatorSchema>;
export type UpdateCreatorProfileInput = z.infer<typeof updateCreatorProfileSchema>;
export type CreateReelInput = z.infer<typeof createReelSchema>;
export type UpdateReelInput = z.infer<typeof updateReelSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type VerifyCreatorInput = z.infer<typeof verifyCreatorSchema>;
export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;
export type UpdateCollectionInput = z.infer<typeof updateCollectionSchema>;
export type AddPlaceToCollectionInput = z.infer<typeof addPlaceToCollectionSchema>;
