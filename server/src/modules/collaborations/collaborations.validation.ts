import { z } from 'zod';
import { CollaborationStatus } from '@prisma/client';

export const COLLABORATION_CATEGORIES = [
  'Food & Dining',
  'Stay & Hospitality',
  'Adventure & Activities',
  'Shopping & Retail',
  'Events & Entertainment',
  'Wellness & Spa',
  'Travel & Tours',
  'Other',
] as const;

export const MAX_COLLABORATION_BUDGET_PAISE = 10_000_000; // ₹1,00,000

const deliverableSchema = z.object({
  type: z.enum(['REEL', 'STORY', 'CAROUSEL', 'STATIC_POST']),
  quantity: z.number().int().min(1).max(50),
});

export const createCollaborationSchema = z.object({
  creatorProfileId: z.string().min(1),
  campaignTitle: z.string().min(3).max(120),
  campaignCategory: z.enum(COLLABORATION_CATEGORIES),
  budgetPaise: z.number().int().min(100).max(MAX_COLLABORATION_BUDGET_PAISE),
  deliverables: z.array(deliverableSchema).min(1).max(20),
  campaignBrief: z.string().min(20).max(5000),
  expectedShootDate: z.string().datetime().optional(),
  expectedUploadDate: z.string().datetime().optional(),
  campaignDurationDays: z.number().int().min(1).max(365).optional(),
  contactPerson: z.string().min(2).max(120),
  contactPhone: z.string().min(10).max(20),
  contactWhatsApp: z.string().min(10).max(20).optional(),
  contactEmail: z.string().email().max(200),
  notes: z.string().max(2000).optional(),
  attachments: z.array(z.string().url().max(2000)).max(10).optional(),
}).superRefine((data, ctx) => {
  if (data.expectedShootDate && data.expectedUploadDate) {
    const shoot = new Date(data.expectedShootDate);
    const upload = new Date(data.expectedUploadDate);
    if (upload < shoot) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Expected upload date must be on or after shoot date',
        path: ['expectedUploadDate'],
      });
    }
  }
});

export const listCollaborationsQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: z.nativeEnum(CollaborationStatus).optional(),
  search: z.string().max(200).optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'budgetPaise', 'expectedUploadDate', 'campaignTitle']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  bucket: z.enum(['incoming', 'accepted', 'completed', 'cancelled', 'active', 'history']).optional(),
});

export const rejectCollaborationSchema = z.object({
  reason: z.string().min(3).max(1000),
});

export const cancelCollaborationSchema = z.object({
  reason: z.string().min(3).max(1000).optional(),
});

export const submitCollaborationReelSchema = z.object({
  videoUrl: z.string().min(1).max(2000),
  thumbnail: z.string().min(1).max(2000).optional(),
  title: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  placeId: z.string().optional(),
});

export const revisionRequestSchema = z.object({
  feedback: z.string().min(10).max(2000),
});

export const rejectReelSchema = z.object({
  reason: z.string().min(3).max(1000),
});

export const adminSuspendSchema = z.object({
  reason: z.string().min(3).max(1000),
  disputeNotes: z.string().max(2000).optional(),
});

export const adminResolveSchema = z.object({
  disputeNotes: z.string().min(3).max(2000),
  status: z.enum(['COMPLETED', 'CANCELLED', 'IN_PROGRESS']).optional(),
});

export type CreateCollaborationInput = z.infer<typeof createCollaborationSchema>;
export type ListCollaborationsQuery = z.infer<typeof listCollaborationsQuerySchema>;
