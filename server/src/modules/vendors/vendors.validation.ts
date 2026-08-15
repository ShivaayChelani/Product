import { z } from 'zod';

const BUSINESS_TYPES = ['hotel', 'restaurant', 'guide', 'travel_agent', 'vehicle_rental', 'local_shop', 'cafe', 'homestay', 'bike_rental', 'car_rental', 'boating', 'adventure', 'tour_experience', 'event_organizer'] as const;

export const registerVendorSchema = z.object({
  businessName: z.string().min(1, 'Business name is required').max(200),
  // Accept both 'businessType' (canonical) and 'category' (frontend alias)
  businessType: z.enum(BUSINESS_TYPES, { errorMap: () => ({ message: `Must be one of: ${BUSINESS_TYPES.join(', ')}` }) }).optional(),
  category: z.enum(BUSINESS_TYPES, { errorMap: () => ({ message: `Must be one of: ${BUSINESS_TYPES.join(', ')}` }) }).optional(),
  phone: z.string().min(10, 'Valid phone is required').max(20),
  address: z.string().min(1, 'Address is required').max(500),
  city: z.string().min(1, 'City is required').max(100),
  state: z.string().min(1, 'State is required').max(100),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  description: z.string().max(2000).optional(),
  imageUrl: z.string().url().optional(),
  website: z.string().url().max(500).optional(),
  operatingHours: z.string().max(500).optional(),
  openingHours: z.any().optional(), // frontend alias for operatingHours
  images: z.array(z.string().url()).max(20).default([]),
  gstNumber: z.string().max(50).optional(),
  documents: z.array(z.string().url()).max(20).default([]),
  linkedSpotIds: z.array(z.string()).default([]),
  services: z.any().optional(),
  showOnMap: z.boolean().default(true),
  showContact: z.boolean().default(true),
  showWebsite: z.boolean().default(true),
  showImages: z.boolean().default(true),
  showOffers: z.boolean().default(true),
  showReels: z.boolean().default(true),
  showNavigation: z.boolean().default(true),
  // Set when the user has already been warned that applying will retire their Content Creator role.
  confirmSwitch: z.boolean().optional(),
  // Ignore frontend-only fields
  verificationStatus: z.any().optional(),
  ownerName: z.string().optional(),
  ownerIdType: z.string().optional(),
  ownerIdNumber: z.string().optional(),
  businessProofType: z.string().optional(),
  businessProofNumber: z.string().optional(),
  ownerProofUri: z.string().optional(),
  businessProofUri: z.string().optional(),
}).refine(data => data.businessType || data.category, {
  message: 'businessType or category is required',
  path: ['businessType'],
});

export const updateVendorSchema = z.object({
  businessName: z.string().min(1).max(200).optional(),
  businessType: z.enum(BUSINESS_TYPES).optional(),
  phone: z.string().min(10).max(20).optional(),
  address: z.string().min(1).max(500).optional(),
  city: z.string().min(1).max(100).optional(),
  state: z.string().min(1).max(100).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  description: z.string().max(2000).optional(),
  imageUrl: z.string().url().optional(),
  website: z.string().url().max(500).optional().nullable(),
  operatingHours: z.string().max(500).optional().nullable(),
  images: z.array(z.string().url()).max(20).optional(),
  gstNumber: z.string().max(50).optional().nullable(),
  documents: z.array(z.string().url()).max(20).optional(),
  linkedSpotIds: z.array(z.string()).optional(),
  services: z.any().optional(),
  showOnMap: z.boolean().optional(),
  showContact: z.boolean().optional(),
  showWebsite: z.boolean().optional(),
  showImages: z.boolean().optional(),
  showOffers: z.boolean().optional(),
  showReels: z.boolean().optional(),
  showNavigation: z.boolean().optional(),
});

export const verifyVendorSchema = z.object({
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

export const adminUpdateVendorSchema = z.object({
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  address: z.string().min(1).max(500).optional(),
  city: z.string().min(1).max(100).optional(),
  state: z.string().min(1).max(100).optional(),
});

/** Accept legacy seed values (PERCENTAGE / FLAT / OTHER) and normalize. */
const discountTypeSchema = z.preprocess((val) => {
  if (typeof val !== 'string') return val;
  const v = val.trim().toLowerCase();
  if (v === 'percentage' || v === 'percent') return 'percentage';
  if (v === 'flat' || v === 'fixed') return 'flat';
  if (v === 'freebie' || v === 'other' || v === 'bogo') return 'freebie';
  return v;
}, z.enum(['flat', 'percentage', 'freebie']));

const optionalUrl = z.preprocess(
  (val) => (val === '' || val === null ? undefined : val),
  z.string().url().optional(),
);

export const createOfferSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(2000).optional(),
  banner: optionalUrl,
  discountType: discountTypeSchema,
  discountValue: z.number().min(0, 'Discount value cannot be negative'),
  pointsRequired: z.number().int().min(1, 'Points required must be at least 1'),
  minBillAmount: z.number().min(0).optional(),
  couponCode: z.string().max(50).optional(),
  dailyLimit: z.number().int().min(1).optional(),
  validTill: z.string().max(50).optional(),
  startDate: z.string().optional(),
  category: z.string().max(100).optional(),
  imageUrl: optionalUrl,
  maxRedemptions: z.number().int().min(1).optional(),
}).superRefine((data, ctx) => {
  if (data.discountType !== 'freebie' && data.discountValue < 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Discount value must be at least 1',
      path: ['discountValue'],
    });
  }
});

export const updateOfferSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  banner: optionalUrl,
  discountType: discountTypeSchema.optional(),
  discountValue: z.number().min(0).optional(),
  pointsRequired: z.number().int().min(1).optional(),
  minBillAmount: z.number().min(0).optional(),
  couponCode: z.string().max(50).optional(),
  dailyLimit: z.number().int().min(1).optional(),
  validTill: z.string().max(50).optional(),
  startDate: z.union([z.string(), z.null()]).optional(),
  category: z.string().max(100).optional(),
  imageUrl: optionalUrl,
  maxRedemptions: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (
    data.discountValue !== undefined &&
    data.discountType !== undefined &&
    data.discountType !== 'freebie' &&
    data.discountValue < 1
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Discount value must be at least 1',
      path: ['discountValue'],
    });
  }
});

export const approveOfferSchema = z.object({
  isFeatured: z.boolean().optional(),
});

export const rejectOfferSchema = z.object({
  rejectionReason: z.string().min(1, 'Rejection reason is required').max(500),
});

export const adminFeatureOfferSchema = z.object({
  isFeatured: z.boolean(),
});

export const adminModerateOfferSchema = z.object({
  reason: z.string().min(1).max(500),
  action: z.enum(['disable', 'remove']).default('disable'),
});

export const createVendorReelSchema = z.object({
  videoUrl: z.string().url('Valid video URL is required'),
  thumbnail: z.string().url().optional(),
  title: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
});

export const updateVendorReelSchema = z.object({
  thumbnail: z.string().url().optional(),
  title: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
});

export const vendorReviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  content: z.string().trim().min(1, 'Review text is required').max(5000),
  photos: z.array(z.string().url()).optional().default([]),
});

export type RegisterVendorInput = z.infer<typeof registerVendorSchema>;
export type UpdateVendorInput = z.infer<typeof updateVendorSchema>;
export type VerifyVendorInput = z.infer<typeof verifyVendorSchema>;
export type AdminUpdateVendorInput = z.infer<typeof adminUpdateVendorSchema>;
export type CreateOfferInput = z.infer<typeof createOfferSchema>;
export type UpdateOfferInput = z.infer<typeof updateOfferSchema>;
export type ApproveOfferInput = z.infer<typeof approveOfferSchema>;
export type RejectOfferInput = z.infer<typeof rejectOfferSchema>;
export type AdminFeatureOfferInput = z.infer<typeof adminFeatureOfferSchema>;
export type AdminModerateOfferInput = z.infer<typeof adminModerateOfferSchema>;
export type CreateVendorReelInput = z.infer<typeof createVendorReelSchema>;
export type UpdateVendorReelInput = z.infer<typeof updateVendorReelSchema>;
export type VendorReviewInput = z.infer<typeof vendorReviewSchema>;

export const vendorMapQuerySchema = z.object({
  north: z.string().refine((v) => !isNaN(parseFloat(v))),
  south: z.string().refine((v) => !isNaN(parseFloat(v))),
  east: z.string().refine((v) => !isNaN(parseFloat(v))),
  west: z.string().refine((v) => !isNaN(parseFloat(v))),
  category: z.string().optional(),
  limit: z.string().optional().default('200'),
});
