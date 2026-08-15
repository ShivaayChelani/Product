import { z } from 'zod';

/** Coerce form/JSON numeric strings; reject NaN. */
const positiveInt = z.coerce.number().int().positive();
const nonNegativeInt = z.coerce.number().int().min(0);

/** Accept ISO datetimes from admin forms (with or without ms / offset quirks). */
const isoDateTime = z.preprocess((value) => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'string' || !value.trim()) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString();
}, z.string().datetime());

const optionalUrl = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
}, z.string().url().nullish());

const optionalText = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
}, z.string().nullish());

export const createCampaignSchema = z.object({
  name: z.string().min(3),
  description: z.string().min(10),
  imageUrl: optionalUrl,
  pointsRequired: positiveInt,
  totalWinnerSlots: positiveInt.default(999999),
  maxClaimsPerUser: positiveInt.default(1),
  startDate: isoDateTime,
  endDate: isoDateTime,
  termsAndConditions: optionalText,
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED']).optional(),
});

export const updateCampaignSchema = createCampaignSchema.partial().extend({
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED']).optional(),
  /** Explicit remaining slots — use this to repair bad values (e.g. negative remaining). */
  remainingWinnerSlots: nonNegativeInt.optional(),
});

export const claimCampaignSchema = z.object({
  notes: z.string().optional(),
});

export const updateClaimStatusSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SHIPPED', 'DELIVERED']),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
export type ClaimCampaignInput = z.infer<typeof claimCampaignSchema>;
export type UpdateClaimStatusInput = z.infer<typeof updateClaimStatusSchema>;

export interface CampaignQueryInput {
  status?: string;
  page?: string;
  limit?: string;
  search?: string;
  sort?: string; // 'points_asc', 'points_desc', 'newest'
}
