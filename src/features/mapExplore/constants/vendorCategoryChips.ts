import { getMapMarkerConfig } from '../../../utils/mapMarkerUtils';

export type VendorCategoryChip = {
  key: string;
  label: string;
  color: string;
  ionIcon: string;
};

export const VENDOR_CATEGORY_CHIPS: VendorCategoryChip[] = [
  { key: 'all', label: 'All', color: '#6E4424', ionIcon: 'grid-outline' },
  { key: 'restaurant', label: 'Restaurants', color: '#E74C3C', ionIcon: 'restaurant-outline' },
  { key: 'cafe', label: 'Cafes', color: '#6F4E37', ionIcon: 'cafe-outline' },
  { key: 'hotel', label: 'Hotels', color: '#9B59B6', ionIcon: 'bed-outline' },
  { key: 'resort', label: 'Resorts', color: '#27AE60', ionIcon: 'umbrella-outline' },
  { key: 'shopping', label: 'Shops', color: '#E91E63', ionIcon: 'cart-outline' },
  { key: 'adventure', label: 'Adventure', color: '#F4511E', ionIcon: 'trail-sign-outline' },
  { key: 'rental', label: 'Rental', color: '#607D8B', ionIcon: 'bicycle-outline' },
  { key: 'guide', label: 'Guide', color: getMapMarkerConfig('guide').color, ionIcon: 'compass-outline' },
  { key: 'spa', label: 'Spa', color: '#AB47BC', ionIcon: 'sparkles-outline' },
];
