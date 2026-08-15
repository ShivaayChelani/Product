import { z } from 'zod';

export const placesAnalyticsQuerySchema = z.object({
  page: z.string().optional().default('1').refine((v) => !isNaN(parseInt(v)) && parseInt(v) > 0, { message: 'Page must be a positive integer' }),
  limit: z.string().optional().default('20').refine((v) => !isNaN(parseInt(v)) && parseInt(v) > 0 && parseInt(v) <= 100, { message: 'Limit must be between 1 and 100' }),
});

export type PlacesAnalyticsQuery = z.infer<typeof placesAnalyticsQuerySchema>;
