import { z } from 'zod';

export const createChallengeSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(100),
  description: z.string().min(10, 'Description must be at least 10 characters').max(1000),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD'], {
    errorMap: () => ({ message: "Difficulty must be one of: EASY, MEDIUM, HARD" }),
  }),
  category: z.string().min(2, 'Category must be at least 2 characters').max(50),
  proofRequired: z.enum(['PHOTO', 'VIDEO', 'QR', 'GPS'], {
    errorMap: () => ({ message: "Proof type must be one of: PHOTO, VIDEO, QR, GPS" }),
  }),
});

export const updateChallengeStatusSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  rejectionReason: z.string().max(500).optional(),
});

export const completeChallengeSchema = z.object({
  proofUrl: z.string().url('Invalid proof URL format').optional(),
  qrCode: z.string().min(1).max(256).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
}).superRefine((data, ctx) => {
  // Proof fields are validated server-side against challenge.proofRequired;
  // schema only ensures well-formed optional inputs.
  if (data.latitude !== undefined && data.longitude === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'longitude is required with latitude', path: ['longitude'] });
  }
  if (data.longitude !== undefined && data.latitude === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'latitude is required with longitude', path: ['latitude'] });
  }
});
