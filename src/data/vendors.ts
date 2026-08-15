export const VENDOR_CATEGORY_EMOJI: Record<string, string> = {
  cafe: '☕',
  restaurant: '🍽️',
  hotel: '🏨',
  homestay: '🏡',
  guide: '🧭',
  bike_rental: '🏍️',
  car_rental: '🚗',
  boating: '🚤',
  adventure: '🧗',
  tour_experience: '🎫',
  event_organizer: '🎪',
};

export function getVendorCategoryEmoji(category: string): string {
  return VENDOR_CATEGORY_EMOJI[category] || '🏪';
}
