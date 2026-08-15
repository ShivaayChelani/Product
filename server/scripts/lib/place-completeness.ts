/**
 * Weighted factual completeness score (0–100) for canonical places.
 * Does not reward fabricated data — only populated, verifiable fields.
 */

export type CompletenessInput = {
  name: string;
  latitude: number | null;
  longitude: number | null;
  state: string;
  district: string;
  city: string;
  village: string;
  fullAddress: string | null;
  description: string;
  history: string | null;
  category: string;
  subcategory: string | null;
  website: string | null;
  openingHours: unknown;
  ticketPrice: unknown;
  heritageStatus: string | null;
  unescoStatus: string | null;
  religiousType: string | null;
  naturalCultural: string | null;
  searchKeywords: string[];
  tags: string[];
  aliasCount: number;
  translationCount: number;
  nearbyCount: number;
  provenanceCount: number;
  hasVerifiedImage: boolean;
  boundaryValidated: boolean;
  hasParking: boolean;
  parkingDetails: string | null;
  isAccessible: boolean;
  accessibilityDetails: string | null;
  hasWashroom: boolean;
  elevationMeters: number | null;
  postalCode: string;
  hasVisitorInfo?: boolean;
  hasTourismContent?: boolean;
  hasTravelAccess?: boolean;
  hasActivities?: boolean;
};

/** Weights sum to 100. */
const WEIGHTS = {
  identity: 7,
  coordinates: 8,
  boundaryValidated: 4,
  state: 3,
  district: 3,
  city: 3,
  address: 3,
  description: 8,
  history: 4,
  aliases: 4,
  translations: 2,
  searchKeywords: 3,
  category: 4,
  website: 3,
  openingHours: 3,
  entryFee: 3,
  heritage: 3,
  nearby: 3,
  accessibility: 2,
  parking: 2,
  washroom: 1,
  provenance: 3,
  verifiedImage: 3,
  tags: 2,
  elevation: 1,
  visitorInfo: 4,
  tourismContent: 3,
  travelAccess: 3,
  activities: 3,
} as const;

function hasText(v: string | null | undefined): boolean {
  return v != null && String(v).trim().length > 0;
}

export function computeCompletenessScore(input: CompletenessInput): number {
  let score = 0;

  if (hasText(input.name)) score += WEIGHTS.identity;
  if (input.latitude != null && input.longitude != null) score += WEIGHTS.coordinates;
  if (input.boundaryValidated) score += WEIGHTS.boundaryValidated;
  if (hasText(input.state)) score += WEIGHTS.state;
  if (hasText(input.district)) score += WEIGHTS.district;
  if (hasText(input.city)) score += WEIGHTS.city;
  if (hasText(input.fullAddress) || hasText(input.village)) score += WEIGHTS.address;
  if (hasText(input.description) && input.description.trim().length >= 40) score += WEIGHTS.description;
  if (hasText(input.history)) score += WEIGHTS.history;
  if (input.aliasCount > 0) score += WEIGHTS.aliases;
  if (input.translationCount > 0) score += WEIGHTS.translations;
  if (input.searchKeywords.length >= 2) score += WEIGHTS.searchKeywords;
  if (hasText(input.category)) score += WEIGHTS.category;
  if (hasText(input.website)) score += WEIGHTS.website;
  if (input.openingHours != null) score += WEIGHTS.openingHours;
  if (input.ticketPrice != null) score += WEIGHTS.entryFee;
  if (hasText(input.heritageStatus) || hasText(input.unescoStatus)) score += WEIGHTS.heritage;
  if (input.nearbyCount > 0) score += WEIGHTS.nearby;
  if (input.isAccessible || hasText(input.accessibilityDetails)) score += WEIGHTS.accessibility;
  if (input.hasParking || hasText(input.parkingDetails)) score += WEIGHTS.parking;
  if (input.hasWashroom) score += WEIGHTS.washroom;
  if (input.provenanceCount > 0) score += WEIGHTS.provenance;
  if (input.hasVerifiedImage) score += WEIGHTS.verifiedImage;
  if (input.tags.length > 0) score += WEIGHTS.tags;
  if (input.elevationMeters != null) score += WEIGHTS.elevation;
  if (input.hasVisitorInfo) score += WEIGHTS.visitorInfo;
  if (input.hasTourismContent) score += WEIGHTS.tourismContent;
  if (input.hasTravelAccess) score += WEIGHTS.travelAccess;
  if (input.hasActivities) score += WEIGHTS.activities;

  return Math.min(100, Math.round(score));
}

export function completenessBand(score: number): string {
  if (score >= 80) return 'high';
  if (score >= 50) return 'medium';
  if (score >= 25) return 'low';
  return 'minimal';
}
