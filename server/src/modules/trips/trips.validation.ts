import { z } from 'zod';

/** Accept both API enums and common client aliases (legacy / UI labels). */
function normalizePace(val: unknown): unknown {
  if (typeof val !== 'string') return val;
  const key = val.trim().toUpperCase().replace(/[\s-]+/g, '_');
  const aliases: Record<string, string> = {
    MODERATE: 'BALANCED',
    MEDIUM: 'BALANCED',
    NORMAL: 'BALANCED',
    FAST: 'QUICK',
    SPEEDY: 'QUICK',
    SLOW: 'RELAXED',
    CHILL: 'RELAXED',
    VERYRELAXED: 'VERY_RELAXED',
    VERY_CHILL: 'VERY_RELAXED',
  };
  return aliases[key] || key;
}

function normalizeTravelers(val: unknown): unknown {
  if (typeof val !== 'string') return val;
  const key = val.trim().toUpperCase().replace(/[\s-]+/g, '_');
  const aliases: Record<string, string> = {
    ALONE: 'SOLO',
    SINGLE: 'SOLO',
    PAIR: 'COUPLE',
    COUPLE: 'COUPLE',
    GROUP: 'FRIENDS',
    FRIEND: 'FRIENDS',
  };
  return aliases[key] || key;
}

function normalizeBudget(val: unknown): unknown {
  if (typeof val !== 'string') return val;
  const key = val.trim().toUpperCase().replace(/[\s-]+/g, '_');
  const aliases: Record<string, string> = {
    BUDGET: 'LOW',
    CHEAP: 'LOW',
    STANDARD: 'MEDIUM',
    NORMAL: 'MEDIUM',
    PREMIUM: 'HIGH',
    LUXURY: 'HIGH',
    EXPENSIVE: 'HIGH',
  };
  return aliases[key] || key;
}

const paceEnum = z.preprocess(normalizePace, z.enum(['QUICK', 'BALANCED', 'RELAXED', 'VERY_RELAXED']));
const travelersEnum = z.preprocess(normalizeTravelers, z.enum(['SOLO', 'COUPLE', 'FAMILY', 'FRIENDS']));
const budgetEnum = z.preprocess(normalizeBudget, z.enum(['LOW', 'MEDIUM', 'HIGH', 'CUSTOM']));
const timePreferenceEnum = z.enum(['MORNING_FOCUSED', 'FULL_DAY', 'EVENING_FRIENDLY']);
const avoidEnum = z.enum(['CROWDED', 'LONG_TRAVEL', 'EXPENSIVE_ENTRY', 'NON_FAMILY_FRIENDLY']);
const timeSlotEnum = z.enum(['SUNRISE', 'MORNING', 'AFTERNOON', 'EVENING', 'SUNSET', 'NIGHT']);

export const createTripSchema = z.object({
  title: z.string().min(1, 'Trip name is required').max(200),
  description: z.string().max(2000).optional(),
  destination: z.string().min(1, 'Destination is required').max(200),
  startDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  endDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  travelers: travelersEnum.default('SOLO'),
  transportation: z.array(z.enum(['WALKING', 'BIKE', 'CAR', 'TRAIN', 'FLIGHT'])).default([]),
  budget: z.enum(['LOW', 'MEDIUM', 'LUXURY']).default('MEDIUM'),
  accommodation: z.enum(['HOTEL', 'HOSTEL', 'RESORT', 'HOMESTAY']).optional(),
  interests: z.array(z.string()).default([]),
  coverImage: z.string().url().optional(),
  pace: paceEnum.optional(),
  timePreference: timePreferenceEnum.optional(),
  avoid: z.array(avoidEnum).optional(),
});

export const updateTripSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  destination: z.string().min(1).max(200).optional(),
  startDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  endDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  days: z.number().int().min(1).max(30).optional(),
  travelers: travelersEnum.optional(),
  transportation: z.array(z.enum(['WALKING', 'BIKE', 'CAR', 'TRAIN', 'FLIGHT'])).optional(),
  budget: z.enum(['LOW', 'MEDIUM', 'LUXURY']).optional(),
  accommodation: z.enum(['HOTEL', 'HOSTEL', 'RESORT', 'HOMESTAY']).optional(),
  interests: z.array(z.string()).optional(),
  coverImage: z.string().url().optional(),
  status: z.enum(['DRAFT', 'UPCOMING', 'ACTIVE', 'COMPLETED', 'ARCHIVED']).optional(),
  pace: paceEnum.optional(),
  timePreference: timePreferenceEnum.optional(),
  avoid: z.array(avoidEnum).optional(),
});

export const addStopSchema = z.object({
  placeId: z.string().min(1, 'placeId is required'),
  order: z.number().int().min(0).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  duration: z.number().int().positive().optional(),
  cost: z.number().min(0).optional(),
  entryFee: z.number().min(0).optional(),
  distanceFromPrev: z.number().min(0).optional(),
  transportMode: z.enum(['WALKING', 'BIKE', 'CAR', 'TRAIN', 'FLIGHT']).optional(),
  timeSlot: timeSlotEnum.optional(),
  notes: z.string().max(2000).optional(),
  reason: z.string().max(500).optional(),
  isPinned: z.boolean().optional(),
});

export const updateStopSchema = z.object({
  order: z.number().int().min(0).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  duration: z.number().int().positive().optional(),
  cost: z.number().min(0).optional(),
  entryFee: z.number().min(0).optional(),
  distanceFromPrev: z.number().min(0).optional(),
  transportMode: z.enum(['WALKING', 'BIKE', 'CAR', 'TRAIN', 'FLIGHT']).optional(),
  timeSlot: timeSlotEnum.optional(),
  notes: z.string().max(2000).optional(),
  reason: z.string().max(500).optional(),
  isPinned: z.boolean().optional(),
  checklists: z.array(z.object({
    id: z.string(),
    text: z.string(),
    done: z.boolean().default(false),
  })).optional(),
  reminders: z.array(z.object({
    id: z.string(),
    text: z.string(),
    time: z.string().optional(),
  })).optional(),
  photoAttachments: z.array(z.string().url()).optional(),
  voiceNotes: z.array(z.string().url()).optional(),
});

export const addCollaboratorSchema = z.object({
  userId: z.string(),
  role: z.enum(['VIEWER', 'EDITOR', 'OWNER']).default('EDITOR'),
});

export const generateItinerarySchema = z.object({
  pace: z.enum(['relaxed', 'moderate', 'fast']).default('moderate'),
  startLocation: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }).optional(),
});

export const optimizeRouteSchema = z.object({
  strategy: z.enum(['shortest', 'fastest', 'scenic', 'budget', 'family', 'food', 'instagram', 'heritage', 'nature']).default('shortest'),
  startLocation: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }).optional(),
});

export const aiGenerateSchema = z.object({
  tripId: z.string().optional(),
  destination: z.string().min(1, 'Destination is required').max(200),
  days: z.coerce.number().int().min(1).max(21),
  pace: paceEnum.default('BALANCED'),
  travelers: travelersEnum.default('SOLO'),
  budget: budgetEnum.default('MEDIUM'),
  customBudgetAmount: z.coerce.number().min(0).optional(),
  interests: z.array(z.string()).default([]),
  timePreference: timePreferenceEnum.optional(),
  avoid: z.array(avoidEnum).default([]),
  prompt: z.string().max(2000).optional(),
  manualPlaceIds: z.array(z.string()).default([]),
  /** When true with manualPlaceIds, AI may add extra stops to fill remaining day slots. */
  fillWithAi: z.boolean().optional().default(false),
  startDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  transportation: z.array(z.enum(['WALKING', 'BIKE', 'CAR', 'TRAIN', 'FLIGHT'])).optional(),
  regenerateDayNumber: z.coerce.number().int().min(1).max(21).optional(),
  refresh: z.boolean().optional().default(false),
  variationSeed: z.coerce.number().int().min(0).max(10000).optional(),
}).refine((data) => data.budget !== 'CUSTOM' || typeof data.customBudgetAmount === 'number', {
  message: 'customBudgetAmount is required when budget is CUSTOM',
  path: ['customBudgetAmount'],
});

export const replaceStopSchema = z.object({
  placeId: z.string().min(1, 'placeId is required'),
});

export const visitStopSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  accuracy: z.coerce.number().positive().max(5000).optional(),
  timestamp: z.union([z.string(), z.number()]).optional(),
});

export const quickAddSchema = z.object({
  placeId: z.string().min(1, 'placeId is required'),
  tripId: z.string().optional(),
});

export const tripIdParamSchema = z.object({
  id: z.string(),
});
