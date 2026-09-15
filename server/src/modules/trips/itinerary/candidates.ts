/**
 * Candidate resolution (Phase 1). Takes the normalized intent + an injected
 * PlaceStore and produces the enriched, deduplicated candidate set.
 *
 *   SELF_BUILD -> selects the user's own places only — NEVER adds complements
 *                 (Phase 0 Soft-Build contract). Places the user did not pick
 *                 stay OUT even if they are better or closer.
 *   AI_BUILD   -> resolves explicit priority anchors, then fills the pool from
 *                 the destination city (approved rows; no fabricated places).
 *
 * No import from @prisma/client here: tests inject an in-memory PlaceStore.
 * The prisma-backed default lives in prismaPlaceStore.ts.
 *
 * Trust rules honored:
 *   - client ids are NOT trusted to exist — each is resolved via store.
 *   - unresolvable ids are dropped WITH disclosure (warning), never silently.
 *   - unknown coords/price/hours are carried as UNKNOWN and handled downstream.
 */

import type {
  EnrichedPlace,
  GeoCoords,
  ItineraryIntent,
  PlanningWarning,
  PlaceRecord,
  PlaceState,
} from './types';
import { enrichPlace } from './enrichment';
import { placeBelongsToDestination } from '../../../shared/utils/destination';
import { dedupeByLocation } from '../../../shared/utils/placeDedupe';

// ---------------------------------------------------------------------------
// Place store seam (DB implementation in prismaPlaceStore.ts)
// ---------------------------------------------------------------------------

export interface FindPlacesOptions {
  limit?: number;
}

/** Read-only approved-PLACE lookup the engine may use. Batch-fetch only. */
export interface PlaceStore {
  findApprovedByIds(ids: readonly string[]): Promise<PlaceRecord[]>;
  /** Approved places resident in one destination (city/region resolution lives here). */
  findApprovedByDestination(destination: string, opts?: FindPlacesOptions): Promise<PlaceRecord[]>;
  /** Approved places within a radius of a point (nearest-first urge optional). */
  findApprovedNear(latitude: number, longitude: number, radiusKm: number, opts?: FindPlacesOptions): Promise<PlaceRecord[]>;
}

// ---------------------------------------------------------------------------
// Resolution result shapes
// ---------------------------------------------------------------------------

export interface DroppedCandidate {
  placeId: string;
  reason: string;
}

export interface CandidateSet {
  /** Enriched, location-deduplicated, plan-eligible places. */
  resolved: EnrichedPlace[];
  /**
   * Complementary pool for AI_BUILD (meets interests/zone criteria).
   * EMPTY for SELF_BUILD — never suggested.
   */
  suggested: EnrichedPlace[];
  dropped: DroppedCandidate[];
  warnings: PlanningWarning[];
}

/** Candidate resolution options. */
export interface ResolveCandidatesOptions {
  intent: ItineraryIntent;
  store: PlaceStore;
  origin?: GeoCoords | null;
  date?: Date | null;
  /** Cap on the complementary pool fetched per destination (AI only). */
  maxComplementaryPool?: number;
}

// ---------------------------------------------------------------------------
// State assembly from intent
// ---------------------------------------------------------------------------

export function collectExplicitIds(intent: ItineraryIntent): {
  idList: string[];
  bySource: Record<'selected' | 'pinned' | 'locked' | 'fixedTime' | 'priority', string[]>;
} {
  const selected = [...new Set(intent.selectedPlaceIds)];
  const pinned = [...new Set(intent.pinnedPlaceIds)];
  const locked = [...new Set(intent.lockedPlaceIds)];
  const fixedTime = [...new Set(intent.fixedTimePlaces.map((f) => f.placeId))];
  const priority = [...new Set(intent.priorityPlaceIds)];
  const excluded = new Set(intent.excludePlaceIds);
  const idList = [...new Set([...selected, ...pinned, ...locked, ...fixedTime, ...priority])]
    .filter((id) => !excluded.has(id));
  return { idList, bySource: { selected, pinned, locked, fixedTime, priority } };
}

function stateFor(
  id: string,
  bySource: Record<'selected' | 'pinned' | 'locked' | 'fixedTime' | 'priority', string[]>,
  intent: ItineraryIntent,
): PlaceState {
  return {
    selected: bySource.selected.includes(id),
    pinned: bySource.pinned.includes(id),
    lockedPosition: bySource.locked.includes(id),
    fixedTime: bySource.fixedTime.includes(id),
    priorityAnchor: intent.planningMode === 'AI_BUILD' && bySource.priority.includes(id),
    complementary: false,
    optional: false,
  };
}

/** Warnings about ids the client asked for but the DB could not supply. */
function unresolvedWarnings(intent: ItineraryIntent, foundIds: Set<string>): PlanningWarning[] {
  const warnings: PlanningWarning[] = [];
  for (const id of intent.priorityPlaceIds) {
    if (!foundIds.has(id)) {
      warnings.push({
        code: 'PRIORITY_PLACE_UNRESOLVED',
        message: `Priority place ${id} could not be resolved against the database.`,
        severity: 'WARNING',
        placeIds: [id],
      });
    }
  }
  for (const id of intent.fixedTimePlaces.map((f) => f.placeId)) {
    if (!foundIds.has(id)) {
      warnings.push({
        code: 'FIXED_TIME_PLACE_UNRESOLVED',
        message: `Fixed-time place ${id} could not be resolved against the database.`,
        severity: 'WARNING',
        placeIds: [id],
      });
    }
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the candidate set for an intent. Pure: reads the store, enriches,
 * deduplicates, and reports dropped ids. Never mutates input.
 */
export async function resolveCandidates(options: ResolveCandidatesOptions): Promise<CandidateSet> {
  const { intent, store } = options;
  const { idList, bySource } = collectExplicitIds(intent);
  const warnings: PlanningWarning[] = [];

  const explicitRecords = idList.length ? await store.findApprovedByIds(idList) : [];
  const explicitById = new Map(explicitRecords.map((r) => [r.id, r]));
  const foundIds = new Set(explicitRecords.map((r) => r.id));

  warnings.push(...unresolvedWarnings(intent, foundIds));

  const dropped: DroppedCandidate[] = [];
  const recordClients = idList
    .map((id) => explicitById.get(id))
    .filter((r): r is PlaceRecord => !!r);

  const suppliedState = (id: string) => stateFor(id, bySource, intent);

  let poolRows = [...recordClients];
  if (intent.planningMode === 'AI_BUILD') {
    const cap = options.maxComplementaryPool ?? 60;
    const destinationRecords = await store.findApprovedByDestination(intent.destination, { limit: cap });
    const local: PlaceRecord[] = [];
    for (const r of destinationRecords) {
      if (foundIds.has(r.id)) continue;
      if (intent.excludePlaceIds.includes(r.id)) continue;
      if (!placeBelongsToDestination(r, intent.destination)) continue;
      local.push(r);
    }

    // Locality seeds: a near-origin fetch can reach attractions not labeled
    // with the canonical city string (e.g. "Rani Ghat", "Dhuandhar side").
    const near: PlaceRecord[] = [];
    if (options.origin) {
      const seeds = await store.findApprovedNear(options.origin.lat, options.origin.lng, 40, { limit: 30 });
      for (const r of seeds) {
        if (foundIds.has(r.id)) continue;
        if (intent.excludePlaceIds.includes(r.id)) continue;
        if (!placeBelongsToDestination(r, intent.destination)) continue;
        near.push(r);
      }
    }

    poolRows = [...recordClients, ...dedupeByLocation([...local, ...near])];
  }

  // Explicit ids ALWAYS win a location cluster (rating never outvotes the user).
  // We dedupe the merged pool+explicit rows with explicit rows carrying a rating
  // boost so they survive each cluster's pick, then restore real ratings.
  const explicitSet = new Set(recordClients.map((r) => r.id));
  const poolOnly = poolRows.filter((r) => !explicitSet.has(r.id));
  const boostedExplicit = recordClients.map((r) => ({ ...r, rating: (r.rating ?? 0) + 1_000_000 }));
  const deduped = dedupeByLocation<PlaceRecord>([...boostedExplicit, ...poolOnly]);
  // Explicit requests are NEVER silently dropped, even when they lack
  // coordinates (dedupeByLocation skips null-coord rows). H1 validation
  // downstream discloses unusable coordinates loudly instead.
  const explicitNoCoords = recordClients.filter(
    (r) => r.latitude === null || r.longitude === null,
  );
  const chosenRaw = [...deduped, ...explicitNoCoords];
  const chosenIds = new Set(chosenRaw.map((r) => r.id));
  const chosen = chosenRaw.map((r) =>
    explicitSet.has(r.id) && r.rating != null && r.rating > 1_000_000
      ? { ...r, rating: r.rating - 1_000_000 }
      : r,
  );

  for (const r of poolOnly) {
    if (!chosenIds.has(r.id)) {
      dropped.push({ placeId: r.id, reason: 'DUPLICATE_LOCATION' });
    }
  }

  const resolved: EnrichedPlace[] = [];
  const suggested: EnrichedPlace[] = [];
  for (const r of chosen) {
    const enriched = enrichPlace(r, {
      travelerCount: Math.max(1, intent.travelers),
      date: options.date ?? null,
      state: suppliedState(r.id),
    });
    // Pool-only rows (DB complements resolved for AI_BUILD, not user-requested)
    // are marked complementary AND destination-valid: they already passed the
    // destination/approval checks above, so downstream region guards pass.
    if (!foundIds.has(r.id)) {
      enriched.state.complementary = true;
      enriched.belongsToDestination = true;
      suggested.push(enriched);
    }
    resolved.push(enriched);
  }

  if (resolved.length === 0 && idList.length === 0 && intent.planningMode === 'SELF_BUILD') {
    warnings.push({
      code: 'EMPTY_SELF_BUILD',
      message: 'Self Build received no place selections — nothing to plan.',
      severity: 'WARNING',
    });
  }

  return { resolved, suggested, dropped, warnings };
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

/** Return the suggested ids a priority-ordered complementary pick may consider. */
export function suggestionIds(set: CandidateSet): string[] {
  return set.suggested.map((p) => p.id);
}