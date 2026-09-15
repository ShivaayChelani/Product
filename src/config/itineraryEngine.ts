/**
 * Client-side mirror of the server's CANONICAL_ITINERARY_ENGINE_ENABLED flag.
 *
 * Keep this in sync with server/src/config/env.ts. While the flag is OFF the
 * TripBuilder keeps the existing manual self-build flow byte-for-byte (no
 * "Organize My Itinerary" button, no /trips/plan calls). Flip it to true
 * together with the server env var to enable canonical SELF_BUILD optimization.
 *
 * Explicitly not a remote config fetch — the flag is a deliberate, deploy-time
 * switch so the mobile build always matches the server's behavior.
 */
export interface ItineraryEngineConfig {
  /** Canonical SELF_BUILD optimization from TripBuilder. Default OFF. */
  canonicalSelfBuildEnabled: boolean;
  /** Route AI trip generation through /trips/plan mode=AI_BUILD. Default OFF. */
  canonicalAiBuildEnabled: boolean;
}

export const ITINERARY_ENGINE_CONFIG: ItineraryEngineConfig = {
  canonicalSelfBuildEnabled: false,
  canonicalAiBuildEnabled: false,
};