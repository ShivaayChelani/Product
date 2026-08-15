/**
 * Map selection must survive viewport refetches.
 * Clearing the card because the selected id is missing from a later feed
 * is what made city/place cards flash then disappear.
 */

export type MapSelectable = {
  id: string;
  type?: string;
  isCityGroup?: boolean;
};

export function shouldApplyMapFetch(fetchId: number, latestFetchId: number): boolean {
  return fetchId === latestFetchId;
}

/**
 * Keep the user-selected marker in the list when a map/API feed replaces pins.
 * Do not drop a city group or place just because the viewport payload omitted it.
 */
export function mergeMarkersPreservingSelection<T extends MapSelectable>(
  incoming: T[],
  selected: T | null,
): T[] {
  if (!selected) return incoming;
  const index = incoming.findIndex(m => m.id === selected.id);
  if (index >= 0) {
    const next = incoming.slice();
    next[index] = { ...selected, ...incoming[index] };
    return next;
  }
  return [selected, ...incoming];
}

/**
 * Never auto-clear a user-owned selection just because a feed omitted the id.
 * Clusters use different ids than places; city groups are synthetic (`city:Name`).
 */
export function shouldClearSelectionAfterFeed(args: {
  selected: MapSelectable | null;
  feedIds: string[];
  feedMode: 'clusters' | 'places';
}): boolean {
  if (!args.selected) return false;
  return false;
}

export type MapSelectionState = {
  selected: MapSelectable | null;
  markers: MapSelectable[];
  latestFetchId: number;
};

export type MapSelectionAction =
  | { type: 'select'; marker: MapSelectable; invalidateInFlight?: boolean }
  | { type: 'feed'; fetchId: number; markers: MapSelectable[]; mode: 'clusters' | 'places' }
  | { type: 'clear' };

/**
 * Pure reducer used by regression tests: search → select city → feed updates → card stays.
 */
export function reduceMapSelection(
  state: MapSelectionState,
  action: MapSelectionAction,
): MapSelectionState {
  switch (action.type) {
    case 'select':
      return {
        ...state,
        selected: action.marker,
        markers: mergeMarkersPreservingSelection(state.markers, action.marker),
        latestFetchId: action.invalidateInFlight ? state.latestFetchId + 1 : state.latestFetchId,
      };
    case 'feed': {
      if (!shouldApplyMapFetch(action.fetchId, state.latestFetchId)) {
        return state;
      }
      const merged = mergeMarkersPreservingSelection(action.markers, state.selected);
      const clear = shouldClearSelectionAfterFeed({
        selected: state.selected,
        feedIds: action.markers.map(m => m.id),
        feedMode: action.mode,
      });
      return {
        ...state,
        markers: merged,
        selected: clear ? null : state.selected,
      };
    }
    case 'clear':
      return { ...state, selected: null };
    default:
      return state;
  }
}
