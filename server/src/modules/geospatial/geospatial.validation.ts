import { z } from 'zod';

export const nearbyQuerySchema = z.object({
  lat: z.string().regex(/^-?\d+\.?\d*$/),
  lng: z.string().regex(/^-?\d+\.?\d*$/),
  radius: z.string().regex(/^\d+$/).optional(),
  category: z.string().optional(),
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
});

export const clusterQuerySchema = z.object({
  neLat: z.string().regex(/^-?\d+\.?\d*$/),
  neLng: z.string().regex(/^-?\d+\.?\d*$/),
  swLat: z.string().regex(/^-?\d+\.?\d*$/),
  swLng: z.string().regex(/^-?\d+\.?\d*$/),
  zoom: z.string().optional(),
});

export const nearestQuerySchema = z.object({
  lat: z.string().regex(/^-?\d+\.?\d*$/),
  lng: z.string().regex(/^-?\d+\.?\d*$/),
  limit: z.string().regex(/^\d+$/).optional(),
  radius: z.string().regex(/^\d+$/).optional(),
  category: z.string().optional(),
});

export const routeQuerySchema = z.object({
  lat: z.string().regex(/^-?\d+\.?\d*$/),
  lng: z.string().regex(/^-?\d+\.?\d*$/),
  waypoints: z.string(),
  radius: z.string().optional(),
  limit: z.string().optional(),
});

export const geofenceQuerySchema = z.object({
  lat: z.string().regex(/^-?\d+\.?\d*$/),
  lng: z.string().regex(/^-?\d+\.?\d*$/),
  radius: z.string().optional(),
});

export const heatmapQuerySchema = z.object({
  neLat: z.string().regex(/^-?\d+\.?\d*$/),
  neLng: z.string().regex(/^-?\d+\.?\d*$/),
  swLat: z.string().regex(/^-?\d+\.?\d*$/),
  swLng: z.string().regex(/^-?\d+\.?\d*$/),
  zoom: z.string().optional(),
  days: z.string().optional(),
});

export const trendsQuerySchema = z.object({
  days: z.string().optional(),
  category: z.string().optional(),
  limit: z.string().optional(),
});
