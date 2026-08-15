import type { BudgetTier, TravelPace, Travelers } from '../../services/api/trips';

export const AI_PLANNER_DRAFT_KEY = '@palsafar/ai_planner_draft_v2';
export const DESTINATION_HISTORY_KEY = '@palsafar/ai_destination_history';
export const PROMPT_MAX = 300;
export const MAX_INTERESTS = 5;
export const DEFAULT_DAYS = 4;

export const STEPS = [
  { n: 1, title: 'Tell AI', sub: 'Your Preferences' },
  { n: 2, title: 'AI Planning', sub: 'Smart Itinerary' },
  { n: 3, title: 'Review & Save', sub: 'Trip' },
] as const;

export const INTERESTS = [
  { label: 'Nature', value: 'nature', icon: 'leaf-outline' },
  { label: 'Food', value: 'food', icon: 'restaurant-outline' },
  { label: 'Heritage', value: 'heritage', icon: 'library-outline' },
  { label: 'Spiritual', value: 'spiritual', icon: 'flower-outline' },
  { label: 'Wildlife', value: 'wildlife', icon: 'paw-outline' },
  { label: 'Hidden Gems', value: 'hidden gems', icon: 'diamond-outline' },
  { label: 'Beaches', value: 'beaches', icon: 'umbrella-outline' },
  { label: 'Cafes', value: 'cafes', icon: 'cafe-outline' },
] as const;

export const TRAVEL_STYLES: {
  id: string;
  label: string;
  sub: string;
  icon: string;
  pace: TravelPace;
}[] = [
  { id: 'sightseeing', label: 'Sightseeing', sub: 'Explore the area', icon: 'camera-outline', pace: 'BALANCED' },
  { id: 'adventure', label: 'Adventure', sub: 'Thrill & explore', icon: 'compass-outline', pace: 'QUICK' },
  { id: 'relaxation', label: 'Relaxation', sub: 'Unhurried day out', icon: 'bed-outline', pace: 'VERY_RELAXED' },
  { id: 'luxury', label: 'Luxury', sub: 'Comfort & premium', icon: 'star-outline', pace: 'RELAXED' },
  { id: 'road_trip', label: 'Road Trip', sub: 'Scenic drives', icon: 'car-outline', pace: 'BALANCED' },
  { id: 'backpacking', label: 'Backpacking', sub: 'Budget friendly', icon: 'walk-outline', pace: 'QUICK' },
];

export const PACES: { key: TravelPace; label: string; desc: string; icon: string }[] = [
  { key: 'VERY_RELAXED', label: 'Very Relaxed', desc: 'Cover the area, unhurried', icon: 'meditation' },
  { key: 'RELAXED', label: 'Relaxed', desc: 'Full area, easy pace', icon: 'emoticon-happy-outline' },
  { key: 'BALANCED', label: 'Balanced', desc: 'See the cluster properly', icon: 'walk' },
  { key: 'QUICK', label: 'Quick', desc: 'Pack more into the day', icon: 'run-fast' },
];

export const COMPANIONS: { key: Travelers | 'GROUP'; label: string; icon: string }[] = [
  { key: 'SOLO', label: 'Solo', icon: 'person-outline' },
  { key: 'COUPLE', label: 'Couple', icon: 'heart-outline' },
  { key: 'FAMILY', label: 'Family', icon: 'home-outline' },
  { key: 'FRIENDS', label: 'Friends', icon: 'happy-outline' },
  { key: 'GROUP', label: 'Group', icon: 'people-outline' },
];

/** Exact trip lengths only — never map a range chip to a silent midpoint. */
export const DAY_OPTIONS = [
  { label: '1 Day', val: 1 },
  { label: '2 Days', val: 2 },
  { label: '3 Days', val: 3 },
  { label: '4 Days', val: 4 },
  { label: '5 Days', val: 5 },
  { label: '6 Days', val: 6 },
  { label: '7 Days', val: 7 },
] as const;

/** Normalize a day-option press to the exact backend `days` value. */
export function selectExactTripDays(optionVal: number): number {
  const match = DAY_OPTIONS.find((o) => o.val === optionVal);
  if (!match) {
    throw new Error(`Invalid trip duration option: ${optionVal}`);
  }
  return match.val;
}

export const BUDGETS: {
  key: BudgetTier;
  label: string;
  desc: string;
  icon: string;
  luxuryAmount?: number;
}[] = [
  { key: 'LOW', label: 'Budget', desc: '₹5,000 – ₹10,000', icon: 'wallet-outline' },
  { key: 'MEDIUM', label: 'Standard', desc: '₹10,000 – ₹25,000', icon: 'cash-outline' },
  { key: 'HIGH', label: 'Premium', desc: '₹25,000 – ₹50,000', icon: 'diamond-outline' },
  { key: 'CUSTOM', label: 'Luxury', desc: '₹50,000+', icon: 'star-outline', luxuryAmount: 85000 },
];

export const POPULAR_DESTINATIONS = [
  {
    name: 'Kashmir',
    image: 'https://images.unsplash.com/photo-1595815771614-aa25a8174d35?w=400&q=80',
  },
  {
    name: 'Goa',
    image: 'https://images.unsplash.com/photo-1512343879784-a960bf128e56?w=400&q=80',
  },
  {
    name: 'Manali',
    image: 'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=400&q=80',
  },
  {
    name: 'Jaipur',
    image: 'https://images.unsplash.com/photo-1477587458883-47145ed94245?w=400&q=80',
  },
  {
    name: 'Kerala',
    image: 'https://images.unsplash.com/photo-1602216052126-53a08faa1402?w=400&q=80',
  },
  {
    name: 'Udaipur',
    image: 'https://images.unsplash.com/photo-1563492065599-3520f775eeed?w=400&q=80',
  },
] as const;

export const MORE_DESTINATIONS = [
  'Goa',
  'Varanasi',
  'Jabalpur',
  'Udaipur',
  'Rishikesh',
  'Shimla',
] as const;

export const QUICK_SUGGESTIONS = [
  'Avoid crowded places',
  'Travelling with kids',
  'Need wheelchair access',
  'Pet friendly',
  'Elderly friendly',
  'No trekking',
] as const;

export const HERO_IMAGE =
  'https://images.unsplash.com/photo-1595815771614-aa25a8174d35?w=900&q=85';

export function isDayBucketActive(days: number, val: number): boolean {
  return days === val;
}

export function getDayBucketLabel(days: number): string {
  if (days === 1) return '1 Day';
  return `${days} Days`;
}

export function estimateBudgetRange(tier: BudgetTier, days: number): { min: number; max: number } {
  const base: Record<BudgetTier, [number, number]> = {
    LOW: [5000, 9000],
    MEDIUM: [18000, 22000],
    HIGH: [32000, 45000],
    CUSTOM: [55000, 80000],
  };
  const [lo, hi] = base[tier];
  const mult =
    days <= 1 ? 0.45 : days <= 2 ? 0.65 : days <= 5 ? 1 : days <= 7 ? 1.25 : days <= 10 ? 1.5 : 1.85;
  return {
    min: Math.round(lo * mult),
    max: Math.round(hi * mult),
  };
}

export const BUDGET_SLIDER_STOPS: { tier: BudgetTier; position: number }[] = [
  { tier: 'LOW', position: 0.12 },
  { tier: 'MEDIUM', position: 0.42 },
  { tier: 'HIGH', position: 0.68 },
  { tier: 'CUSTOM', position: 0.88 },
];

export function budgetSliderPosition(tier: BudgetTier): number {
  return BUDGET_SLIDER_STOPS.find((s) => s.tier === tier)?.position ?? 0.42;
}

/** Map a 0–1 track position to the nearest existing budget tier. Invalid positions clamp. */
export function budgetTierFromSliderPosition(raw: number): BudgetTier {
  if (!Number.isFinite(raw)) return 'MEDIUM';
  const pos = Math.max(0, Math.min(1, raw));
  let best: (typeof BUDGET_SLIDER_STOPS)[number] = BUDGET_SLIDER_STOPS[1];
  let bestDist = Infinity;
  for (const stop of BUDGET_SLIDER_STOPS) {
    const dist = Math.abs(stop.position - pos);
    if (dist < bestDist) {
      best = stop;
      bestDist = dist;
    }
  }
  return best.tier;
}

/** Payload sent to AI generate — CUSTOM requires the catalog luxury amount, never a silent default. */
export function buildAiBudgetPayload(tier: BudgetTier): {
  budget: BudgetTier;
  customBudgetAmount?: number;
} {
  if (tier !== 'CUSTOM') {
    return { budget: tier };
  }
  const amount = BUDGETS.find((b) => b.key === 'CUSTOM')?.luxuryAmount;
  if (typeof amount !== 'number') {
    return { budget: 'CUSTOM' };
  }
  return { budget: 'CUSTOM', customBudgetAmount: amount };
}

export function formatInr(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}
