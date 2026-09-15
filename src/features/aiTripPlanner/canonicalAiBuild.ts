/**
 * Canonical AI BUILD client glue (Phase 5).
 *
 * Mirrors the server's CANONICAL_ITINERARY_ENGINE_ENABLED flag on the client.
 * When enabled, the AI trip planner routes generation to POST /trips/plan with
 * mode=AI_BUILD instead of the legacy POST /trips/ai-generate. The canonical
 * engine resolves prompt place mentions server-side, draws complements only from
 * the approved destination pool, and returns a quality score + explanation.
 *
 * Default OFF so the existing ai-generate flow keeps its current behavior.
 */
import { ITINERARY_ENGINE_CONFIG } from '../../config/itineraryEngine';
import type { AiGenerateInput, PlanItineraryInput } from '../../services/api/trips';

export interface AiBuildGenerateParams {
  /** Explicit switch captured at navigation time (mirrors the client config). */
  useCanonicalAiBuild?: boolean;
}

export function canonicalAiBuildEnabled(): boolean {
  return ITINERARY_ENGINE_CONFIG.canonicalAiBuildEnabled;
}

/** Whether a GenerateLoading invocation must use /trips/plan mode=AI_BUILD. */
export function shouldUseCanonicalAiBuild(params: AiBuildGenerateParams): boolean {
  return params?.useCanonicalAiBuild === true || canonicalAiBuildEnabled();
}

/**
 * Map the legacy ai-generate payload onto /trips/plan mode=AI_BUILD.
 * Field-for-field passthrough only — no client-side planning or trust of ids.
 */
export function toAiBuildPlanInput(input: AiGenerateInput): PlanItineraryInput {
  const out: Record<string, unknown> = { destination: input.destination, mode: 'AI_BUILD' };

  if (input.manualPlaceIds?.length) {
    out.selectedPlaceIds = input.manualPlaceIds;
  }

  const entries: Array<[keyof AiGenerateInput, unknown]> = [
    ['tripId', input.tripId],
    ['days', input.days],
    ['pace', input.pace],
    ['travelers', input.travelers],
    ['budget', input.budget],
    ['customBudgetAmount', input.customBudgetAmount],
    ['interests', input.interests],
    ['timePreference', input.timePreference],
    ['avoid', input.avoid],
    ['transportation', input.transportation],
    ['prompt', input.prompt],
    ['startDate', input.startDate],
    ['regenerateDayNumber', input.regenerateDayNumber],
    ['refresh', input.refresh],
    ['variationSeed', input.variationSeed],
  ];

  for (const [key, value] of entries) {
    if (value !== undefined && value !== null && value !== '') {
      out[key] = value;
    }
  }
  return out as unknown as PlanItineraryInput;
}