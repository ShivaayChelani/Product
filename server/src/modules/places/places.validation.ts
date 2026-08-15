import { z } from 'zod';

export const createPlaceSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().min(1, 'Description is required').max(5000),
  shortDescription: z.string().max(500).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  category: z.string().min(1, 'Category is required').max(100),
  images: z.array(z.string().url()).default([]),
  tags: z.array(z.string()).default([]),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  openingHours: z.record(z.string(), z.any()).optional(),
  ticketPrice: z.object({
    currency: z.string().default('INR'),
    adult: z.number().optional(),
    child: z.number().optional(),
    foreigner: z.number().optional(),
  }).optional(),
  history: z.string().max(10000).optional(),
  recommendedDuration: z.string().max(100).optional(),
  hasParking: z.boolean().optional(),
  parkingDetails: z.string().max(500).optional(),
  isAccessible: z.boolean().optional(),
  accessibilityDetails: z.string().max(500).optional(),
  hasWashroom: z.boolean().optional(),
  isPetFriendly: z.boolean().optional(),
  website: z.string().url().optional(),
  emergencyContact: z.string().max(100).optional(),
  bestTimeToVisit: z.record(z.string(), z.string()).optional(),
  bestTimeReason: z.string().max(500).optional(),
  editorialPriority: z.coerce.number().int().min(1).max(5).optional(),
});

export const updatePlaceSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(5000).optional(),
  shortDescription: z.string().max(500).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  category: z.string().min(1).max(100).optional(),
  images: z.array(z.string().url()).optional(),
  thumbnail: z.string().url().optional().nullable(),
  tags: z.array(z.string()).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  openingHours: z.record(z.string(), z.any()).optional(),
  ticketPrice: z.object({
    currency: z.string().default('INR'),
    adult: z.number().optional(),
    child: z.number().optional(),
    foreigner: z.number().optional(),
  }).optional(),
  history: z.string().max(10000).optional(),
  recommendedDuration: z.string().max(100).optional(),
  hasParking: z.boolean().optional(),
  parkingDetails: z.string().max(500).optional(),
  isAccessible: z.boolean().optional(),
  accessibilityDetails: z.string().max(500).optional(),
  hasWashroom: z.boolean().optional(),
  isPetFriendly: z.boolean().optional(),
  website: z.string().url().optional(),
  emergencyContact: z.string().max(100).optional(),
  bestTimeToVisit: z.record(z.string(), z.string()).optional(),
  bestTimeReason: z.string().max(500).optional(),
  editorialPriority: z.coerce.number().int().min(1).max(5).optional(),
});

export const vendorUpdatePlaceSchema = z.object({
  images: z.array(z.string().url()).optional(),
  tags: z.array(z.string()).optional(),
  openingHours: z.record(z.string(), z.any()).optional(),
  ticketPrice: z.object({
    currency: z.string().default('INR'),
    adult: z.number().optional(),
    child: z.number().optional(),
    foreigner: z.number().optional(),
  }).optional(),
  thumbnail: z.string().url().optional(),
  history: z.string().max(10000).optional(),
  recommendedDuration: z.string().max(100).optional(),
  hasParking: z.boolean().optional(),
  parkingDetails: z.string().max(500).optional(),
  isAccessible: z.boolean().optional(),
  accessibilityDetails: z.string().max(500).optional(),
  hasWashroom: z.boolean().optional(),
  isPetFriendly: z.boolean().optional(),
  website: z.string().url().optional(),
  emergencyContact: z.string().max(100).optional(),
  bestTimeToVisit: z.record(z.string(), z.string()).optional(),
  bestTimeReason: z.string().max(500).optional(),
});

export const updatePlaceStatusSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED'], { message: 'Status must be APPROVED or REJECTED' }),
  reason: z.string().max(1000).optional(),
});

/** Admin reject endpoint — status is implied; body may only carry reason. */
export const rejectPlaceSchema = z.object({
  reason: z.string().max(1000).optional(),
  status: z.literal('REJECTED').optional(),
});

export const nearbyQuerySchema = z.object({
  lat: z.string().refine((v) => !isNaN(parseFloat(v)) && Math.abs(parseFloat(v)) <= 90, {
    message: 'Invalid latitude (-90 to 90)',
  }),
  lng: z.string().refine((v) => !isNaN(parseFloat(v)) && Math.abs(parseFloat(v)) <= 180, {
    message: 'Invalid longitude (-180 to 180)',
  }),
  radius: z.string().optional().default('5000'),
  category: z.string().optional(),
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('20'),
});

export const viewportQuerySchema = z.object({
  north: z.string().refine((v) => !isNaN(parseFloat(v)) && Math.abs(parseFloat(v)) <= 90),
  south: z.string().refine((v) => !isNaN(parseFloat(v)) && Math.abs(parseFloat(v)) <= 90),
  east: z.string().refine((v) => !isNaN(parseFloat(v)) && Math.abs(parseFloat(v)) <= 180),
  west: z.string().refine((v) => !isNaN(parseFloat(v)) && Math.abs(parseFloat(v)) <= 180),
  category: z.string().optional(),
  tags: z.string().optional(),
  limit: z.string().optional().default('200'),
});

export const viewportSearchQuerySchema = viewportQuerySchema.extend({
  q: z.string().max(200).optional(),
});

export const statActionSchema = z.object({
  action: z.enum(['view', 'like', 'save', 'share', 'game_complete', 'checkin']),
});

export const clusterQuerySchema = z.object({
  neLat: z.string(),
  neLng: z.string(),
  swLat: z.string(),
  swLng: z.string(),
  zoom: z.string().optional().default('10'),
});

export const mapQuerySchema = z.object({
  north: z.string().refine((v) => !isNaN(parseFloat(v)) && Math.abs(parseFloat(v)) <= 90),
  south: z.string().refine((v) => !isNaN(parseFloat(v)) && Math.abs(parseFloat(v)) <= 90),
  east: z.string().refine((v) => !isNaN(parseFloat(v)) && Math.abs(parseFloat(v)) <= 180),
  west: z.string().refine((v) => !isNaN(parseFloat(v)) && Math.abs(parseFloat(v)) <= 180),
  zoom: z.string().optional().default('12'),
  categories: z.string().optional(),
  category: z.string().optional(),
  verifiedOnly: z.enum(['true', 'false', '1', '0']).optional(),
  limit: z.string().optional().default('200'),
  cursor: z.string().optional(),
});

export const searchQuerySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  tags: z.string().optional(),
  lat: z.string().optional().refine((v) => !v || (!isNaN(parseFloat(v)) && Math.abs(parseFloat(v)) <= 90), {
    message: 'Invalid latitude (-90 to 90)',
  }),
  lng: z.string().optional().refine((v) => !v || (!isNaN(parseFloat(v)) && Math.abs(parseFloat(v)) <= 180), {
    message: 'Invalid longitude (-180 to 180)',
  }),
  radius: z.string().optional().default('50000'),
  sort: z.enum(['relevance', 'popularity', 'newest', 'distance']).optional().default('relevance'),
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('20'),
});

export const addImageSchema = z.object({
  url: z.string().url('Valid image URL is required'),
  caption: z.string().max(300).optional(),
  isPrimary: z.boolean().optional().default(false),
});

export const addVideoSchema = z.object({
  url: z.string().url('Valid video URL is required'),
  thumbnail: z.string().url().optional(),
  title: z.string().max(200).optional(),
  duration: z.number().int().positive().optional(),
});

export const createOfferSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(2000).optional(),
  discount: z.string().max(100).optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
});

export const updateOfferSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  discount: z.string().max(100).optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
});

export const createEventSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(5000).optional(),
  imageUrl: z.string().url().optional(),
  startDate: z.string().datetime('Valid start date is required'),
  endDate: z.string().datetime().optional(),
});

export const updateEventSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  imageUrl: z.string().url().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  content: z.string().trim().min(1, 'Review text is required').max(5000),
  photos: z.array(z.string().url()).optional().default([]),
});

export const checkinSchema = z.object({});

export type CreatePlaceInput = z.infer<typeof createPlaceSchema>;
export type UpdatePlaceInput = z.infer<typeof updatePlaceSchema>;
export type VendorUpdatePlaceInput = z.infer<typeof vendorUpdatePlaceSchema>;
export type UpdatePlaceStatusInput = z.infer<typeof updatePlaceStatusSchema>;
export type NearbyQueryInput = z.infer<typeof nearbyQuerySchema>;
export type ViewportQueryInput = z.infer<typeof viewportQuerySchema>;
export type StatActionInput = z.infer<typeof statActionSchema>;
export type ClusterQueryInput = z.infer<typeof clusterQuerySchema>;
export type MapQueryInput = z.infer<typeof mapQuerySchema>;
export type SearchQueryInput = z.infer<typeof searchQuerySchema>;
export type AddImageInput = z.infer<typeof addImageSchema>;
export type AddVideoInput = z.infer<typeof addVideoSchema>;
export type CreateOfferInput = z.infer<typeof createOfferSchema>;
export type UpdateOfferInput = z.infer<typeof updateOfferSchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
