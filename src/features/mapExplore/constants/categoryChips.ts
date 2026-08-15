import { getMapMarkerConfig } from '../../../utils/mapMarkerUtils';

export type MapCategoryChip = {
  key: string;
  label: string;
  color: string;
  ionIcon: string;
  count?: number;
};

/** Merge DB category keys with static chip labels/icons for map filters. */
export function buildMapCategoryChips(
  apiCategories: { key: string; count: number }[],
): MapCategoryChip[] {
  const staticByKey = new Map(MAP_CATEGORY_CHIPS.map(c => [c.key, c]));
  const allChip = staticByKey.get('all')!;
  const merged: MapCategoryChip[] = [
    { ...allChip, count: apiCategories.reduce((sum, c) => sum + c.count, 0) },
  ];

  for (const row of apiCategories) {
    const base = staticByKey.get(row.key);
    merged.push(
      base
        ? { ...base, count: row.count }
        : {
            key: row.key,
            label: row.key.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase()),
            color: getMapMarkerConfig(row.key).color,
            ionIcon: 'location-outline',
            count: row.count,
          },
    );
  }

  return merged;
}

export const MAP_CATEGORY_CHIPS: MapCategoryChip[] = [
  { key: 'all', label: 'All', color: '#6E4424', ionIcon: 'grid-outline' },
  { key: 'temple', label: 'Temple', color: getMapMarkerConfig('temple').color, ionIcon: 'business-outline' },
  { key: 'waterfall', label: 'Waterfall', color: getMapMarkerConfig('waterfall').color, ionIcon: 'water-outline' },
  { key: 'museum', label: 'Museum', color: getMapMarkerConfig('museum').color, ionIcon: 'library-outline' },
  { key: 'nature', label: 'Nature', color: getMapMarkerConfig('park').color, ionIcon: 'leaf-outline' },
  { key: 'cafe', label: 'Cafe', color: getMapMarkerConfig('cafe').color, ionIcon: 'cafe-outline' },
  { key: 'restaurant', label: 'Restaurant', color: getMapMarkerConfig('food').color, ionIcon: 'restaurant-outline' },
  { key: 'hotel', label: 'Hotel', color: getMapMarkerConfig('hotel').color, ionIcon: 'bed-outline' },
  { key: 'shopping', label: 'Shopping', color: getMapMarkerConfig('shopping').color, ionIcon: 'cart-outline' },
  { key: 'adventure', label: 'Adventure', color: getMapMarkerConfig('adventure').color, ionIcon: 'trail-sign-outline' },
  { key: 'hidden_gems', label: 'Hidden Gems', color: '#008F8F', ionIcon: 'diamond-outline' },
  { key: 'events', label: 'Events', color: '#9B59B6', ionIcon: 'calendar-outline' },
  { key: 'resorts', label: 'Resorts', color: '#D32F2F', ionIcon: 'umbrella-outline' },
  { key: 'lake', label: 'Lake', color: getMapMarkerConfig('lake').color, ionIcon: 'boat-outline' },
];
