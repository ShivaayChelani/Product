import { z } from 'zod';

export const creatorAnalyticsQuerySchema = z.object({
  period: z.enum(['7d', '30d', '90d', 'all', 'custom']).optional(),
});

export const creatorReelsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  status: z
    .enum(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'HIDDEN', 'ARCHIVED', 'SCHEDULED'])
    .optional(),
});

export const createDraftSchema = z.object({
  videoUrl: z.string().url(),
  thumbnail: z.string().url().optional(),
  title: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  placeId: z.string().optional(),
  vendorId: z.string().optional(),
});

export const updateCreatorProfileSchema = z.object({
  username: z.string().min(3).max(30).optional(),
  fullName: z.string().max(100).optional(),
  bio: z.string().max(500).optional(),
  avatar: z.string().url().optional(),
  travelCategories: z.array(z.string()).optional(),
  instagramUrl: z.string().url().optional().or(z.literal('')),
  youtubeUrl: z.string().url().optional().or(z.literal('')),
  facebookUrl: z.string().url().optional().or(z.literal('')),
  languages: z.array(z.string()).optional(),
  portfolioLinks: z.array(z.string()).optional(),
});
