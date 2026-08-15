import { z } from 'zod';

export const recQuerySchema = z.object({
  userId: z.string().optional(),
  placeId: z.string().optional(),
  lat: z.string().optional(),
  lng: z.string().optional(),
  limit: z.string().optional(),
});

export const similarQuerySchema = z.object({
  limit: z.string().optional(),
});

export const userVectorQuerySchema = z.object({
  userId: z.string(),
  limit: z.string().optional(),
});

export const tripPlanQuerySchema = z.object({
  prompt: z.string().optional(),
  location: z.string().optional(),
  lat: z.string().optional(),
  lng: z.string().optional(),
  days: z.string().optional(),
  interests: z.string().optional(),
  radius: z.string().optional(),
  pace: z.string().optional(),
}).refine((data) => data.prompt || (data.location && data.days), {
  message: "Either 'prompt' or both 'location' and 'days' must be provided",
});

export const discoveryQuerySchema = z.object({
  query: z.string().min(1, 'Query is required'),
  limit: z.string().optional(),
});

export const structuredDiscoverySchema = z.object({
  sentiment: z.string().optional(),
  category: z.string().optional(),
  location: z.string().optional(),
  tags: z.string().optional(),
  lat: z.string().optional(),
  lng: z.string().optional(),
  radius: z.string().optional(),
  limit: z.string().optional(),
});
