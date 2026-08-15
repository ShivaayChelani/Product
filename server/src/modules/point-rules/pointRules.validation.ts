import { z } from 'zod';

export const createRuleSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  points: z.number().int().min(0),
  category: z.string().optional(),
  isActive: z.boolean().optional(),
  cooldownSec: z.number().int().positive().optional(),
  maxDaily: z.number().int().positive().optional(),
});

export const updateRuleSchema = createRuleSchema.partial();

/**
 * Only rules that map to real wallet awards in server code.
 * Wishlist / unimplemented actions must NOT appear here.
 *
 * Event attendance & hosting: NOT implemented — no PlaceEvent check-in or host reward path.
 * Challenges award points via difficulty/milestones (not a single PointRule key).
 */
export const DEFAULT_POINT_RULES = [
  {
    key: 'place_visit',
    label: 'Place Visit',
    description: 'Checking in at a place (GPS-verified via Itinerary)',
    points: 10,
    category: 'general',
    cooldownSec: 86400,
    maxDaily: 10,
  },
  {
    key: 'daily_login',
    label: 'Daily Login',
    description: 'Logging in once per day',
    points: 5,
    category: 'daily',
    cooldownSec: 86400,
    maxDaily: 1,
  },
  {
    key: 'review_write',
    label: 'Write a Review',
    description: 'Writing a place review',
    points: 10,
    category: 'general',
    cooldownSec: 0,
    maxDaily: 10,
  },
  {
    key: 'reel_upload',
    label: 'Creator Daily Reel',
    description: 'First travel reel upload of the day (creators only, once per day)',
    points: 50,
    category: 'creator',
    cooldownSec: 86400,
    maxDaily: 1,
  },
  {
    key: 'hidden_gem',
    label: 'Hidden Gem Approved',
    description: 'Full reward when admin approves a new hidden gem place',
    points: 50,
    category: 'general',
    cooldownSec: 0,
    maxDaily: 1,
  },
  {
    key: 'hidden_gem_merge',
    label: 'Hidden Gem Merged',
    description: 'Partial reward when admin merges a submission into an existing place',
    points: 25,
    category: 'general',
    cooldownSec: 0,
    maxDaily: 5,
  },
  {
    key: 'game_complete',
    label: 'Game Completion — Riddle Hunt',
    description: 'Solving the Riddle Hunt: user finds the correct place and submits a photo, admin verifies',
    points: 100,
    category: 'general',
    cooldownSec: 3600,
    maxDaily: 10,
  },
  {
    key: 'admin_bonus',
    label: 'Admin Bonus',
    description: 'Manual PalPoints adjustment — amount chosen by admin in Wallets',
    points: 0,
    category: 'admin',
    cooldownSec: 0,
    maxDaily: null,
  },
  {
    key: 'place_image_approved',
    label: 'Place Image Approved',
    description: 'User-submitted place image approved by admin (max 10 per day earn points)',
    points: 5,
    category: 'general',
    cooldownSec: 0,
    maxDaily: 10,
  },
  {
    key: 'itinerary_checkpoint',
    label: 'Itinerary Checkpoint',
    description: 'GPS-verified visit to a place stop on an active itinerary',
    points: 10,
    category: 'itinerary',
    cooldownSec: 0,
    maxDaily: 50,
  },
  {
    key: 'itinerary_completion',
    label: 'Itinerary Completion Bonus',
    description: 'Bonus when every required stop on an itinerary is GPS-verified',
    points: 100,
    category: 'itinerary',
    cooldownSec: 0,
    maxDaily: 10,
  },
  {
    key: 'rewarded_ad',
    label: 'Rewarded Advertisement',
    description: 'Points after completing a rewarded ad (server-validated event id)',
    points: 10,
    category: 'ads',
    cooldownSec: 30,
    maxDaily: 20,
  },
];

/** Keys that existed historically but have no award path — deactivated on seed/reset. */
export const DEPRECATED_POINT_RULE_KEYS = [
  'photo_upload',
  'event',
  'daily_mission',
  'weekly_mission',
  'quiz_complete',
  'sponsored_checkin',
  'referral',
  'campaign_bonus',
  'vendor_promotion',
  'seasonal_reward',
  'puzzle',
  'place_created',
  'place_approved',
  'like',
  'save',
  'share',
] as const;
