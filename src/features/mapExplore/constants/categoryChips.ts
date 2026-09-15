import { getMapMarkerConfig } from '../../../utils/mapMarkerUtils';
import {
  MAP_VISIBLE_CATEGORY_LABELS,
  toMapMainCategory,
} from '../utils/mapPlaceCategory';

export type MapCategoryChip = {
  key: string;
  label: string;
  color: string;
  ionIcon: string;
  count?: number;
};

/**
 * Map filter chips are a fixed main-category set. Raw API keys are only used
 * to roll counts into those chips — never rendered as extra filters.
 */
export function buildMapCategoryChips(
  apiCategories: { key: string; count: number }[],
): MapCategoryChip[] {
  const counts = new Map<string, number>();
  let allCount = 0;

  for (const row of apiCategories) {
    allCount += row.count;
    const main = toMapMainCategory(row.key);
    if (!main) continue;
    counts.set(main, (counts.get(main) || 0) + row.count);
  }

  return MAP_CATEGORY_CHIPS.map(chip => ({
    ...chip,
    count: chip.key === 'all' ? allCount : counts.get(chip.key) || 0,
  }));
}

export const MAP_CATEGORY_CHIPS: MapCategoryChip[] = [
  { key: 'all', label: MAP_VISIBLE_CATEGORY_LABELS[0], color: '#6E4424', ionIcon: 'grid-outline' },
  { key: 'heritage', label: MAP_VISIBLE_CATEGORY_LABELS[1], color: getMapMarkerConfig('heritage').color, ionIcon: 'flag-outline' },
  { key: 'temple', label: MAP_VISIBLE_CATEGORY_LABELS[2], color: getMapMarkerConfig('temple').color, ionIcon: 'business-outline' },
  { key: 'ghat', label: MAP_VISIBLE_CATEGORY_LABELS[3], color: getMapMarkerConfig('ghat').color, ionIcon: 'boat-outline' },
  { key: 'waterfall', label: MAP_VISIBLE_CATEGORY_LABELS[4], color: getMapMarkerConfig('waterfall').color, ionIcon: 'water-outline' },
  { key: 'nature', label: MAP_VISIBLE_CATEGORY_LABELS[5], color: getMapMarkerConfig('park').color, ionIcon: 'leaf-outline' },
  { key: 'museum', label: MAP_VISIBLE_CATEGORY_LABELS[6], color: getMapMarkerConfig('museum').color, ionIcon: 'library-outline' },
  { key: 'park', label: MAP_VISIBLE_CATEGORY_LABELS[7], color: getMapMarkerConfig('garden').color, ionIcon: 'flower-outline' },
  { key: 'viewpoint', label: MAP_VISIBLE_CATEGORY_LABELS[8], color: getMapMarkerConfig('viewpoint').color, ionIcon: 'eye-outline' },
  { key: 'market', label: MAP_VISIBLE_CATEGORY_LABELS[9], color: getMapMarkerConfig('shopping').color, ionIcon: 'cart-outline' },
];
