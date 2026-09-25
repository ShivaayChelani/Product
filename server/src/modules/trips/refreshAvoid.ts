/**
 * Pure helpers for AI itinerary regeneration.
 * These define "what a full refresh may and may not repeat":
 *  - a full refresh varies AWAY from every current non-pinned stop (not just Day 1)
 *  - explicitly pinned places are never excluded from the availability pool
 */

type RegeneratableStop = {
  placeId: string;
  isPinned: boolean;
};

/** Place ids a full refresh should ask the engine to vary away from. */
export function selectFullRefreshAvoidIds(
  existingStops: RegeneratableStop[],
  hintExcludedIds: Iterable<string> = [],
): string[] {
  const hinted = new Set(hintExcludedIds);
  return Array.from(
    new Set(
      existingStops
        .filter((s) => !s.isPinned && !hinted.has(s.placeId))
        .map((s) => s.placeId),
    ),
  );
}

/**
 * Previous places a same-route retry should avoid, EXCLUDING pinned ones.
 * Pinned places are force-added by the resolver, so repeating them is by
 * design and they must not be treated as avoidable noise.
 */
export function excludeRepeatedButKeepPinned(
  previousPlaceIds: string[],
  pinnedPlaceIds: string[],
): string[] {
  const pinned = new Set(pinnedPlaceIds);
  return previousPlaceIds.filter((pid) => !pinned.has(pid));
}