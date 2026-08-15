/**
 * Itinerary GPS checkpoint configuration.
 * Prefer env overrides; defaults match product requirements.
 */
export function getItineraryCheckpointRadiusMeters(): number {
  const n = Number(process.env.ITINERARY_CHECKPOINT_RADIUS_METERS);
  return Number.isFinite(n) && n > 0 ? n : 100;
}

export function getItineraryGpsAccuracyMaxMeters(): number {
  const n = Number(process.env.ITINERARY_GPS_ACCURACY_MAX_METERS);
  return Number.isFinite(n) && n > 0 ? n : 50;
}

/** Max plausible travel speed between consecutive GPS checkpoints (km/h). */
export function getItineraryMaxTravelSpeedKmh(): number {
  const n = Number(process.env.ITINERARY_MAX_TRAVEL_SPEED_KMH);
  return Number.isFinite(n) && n > 0 ? n : 120;
}

/**
 * GPS checkpoint PalPoints are disabled in production unless explicitly enabled.
 * GPS alone cannot prove physical presence without attestation/review infrastructure.
 */
export function isItineraryGpsRewardsEnabled(): boolean {
  const raw = process.env.ITINERARY_GPS_REWARDS_ENABLED?.trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'yes') return true;
  if (raw === '0' || raw === 'false' || raw === 'no') return false;
  return process.env.NODE_ENV !== 'production';
}

export type GpsProof = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: string | number;
};
