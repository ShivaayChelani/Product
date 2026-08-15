import { z } from 'zod';

export const universalSearchSchema = z.object({
  q: z.string().min(1, 'Search query cannot be empty'),
  page: z.string().optional(),
  limit: z.string().optional(),
  sort: z.enum(['relevance', 'distance', 'popularity', 'newest', 'highest_rated', 'trending']).optional(),
  lat: z.string().optional(),
  lng: z.string().optional(),
  radius: z.string().optional(),
  category: z.string().optional(),
  price: z.enum(['free', 'paid']).optional(),
  openNow: z.string().optional(),
  accessibility: z.string().optional(),
  familyFriendly: z.string().optional(),
  petFriendly: z.string().optional(),
});
