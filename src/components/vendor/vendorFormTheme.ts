import { SERIF, SANS, SANS_BOLD, SANS_SEMI } from '../profile/profileTheme';

export const VF = {
  bg: '#FFFFFF',
  card: '#FFFFFF',
  inputBg: '#FFFFFF',
  border: '#E8DDD0',
  text: '#2C1810',
  textSecondary: '#8B7355',
  textMuted: '#A39990',
  accent: '#B9834B',
  accentDark: '#63300E',
  bannerBg: '#2D241D',
  bannerGold: '#D4A056',
  stepActive: '#63300E',
  stepInactive: '#D8CAB5',
  stepLine: '#E5D5C5',
  required: '#C0392B',
  securityBg: '#FFFFFF',
  btnBg: '#2D241D',
  btnText: '#F9F9F9',
  link: '#B9834B',
  sectionAccent: '#C68739',
} as const;

export { SERIF, SANS, SANS_BOLD, SANS_SEMI };

export const VENDOR_FORM_STEPS = [
  'Business Info',
  'Contact Info',
  'Business Details',
  'Documents',
  'Review',
] as const;

export const VENDOR_CATEGORIES = [
  { key: 'cafe', label: 'Cafe' },
  { key: 'restaurant', label: 'Restaurant' },
  { key: 'hotel', label: 'Hotel' },
  { key: 'homestay', label: 'Homestay' },
  { key: 'guide', label: 'Guide' },
  { key: 'bike_rental', label: 'Bike Rental' },
  { key: 'car_rental', label: 'Car Rental' },
  { key: 'boating', label: 'Boating' },
  { key: 'adventure', label: 'Adventure' },
  { key: 'tour_experience', label: 'Tour Experience' },
  { key: 'event_organizer', label: 'Event Organizer' },
] as const;

export const SUB_CATEGORIES: Record<string, string[]> = {
  cafe: ['Coffee Shop', 'Bakery', 'Tea House', 'Juice Bar'],
  restaurant: ['Fine Dining', 'Casual Dining', 'Street Food', 'Multi-Cuisine'],
  hotel: ['Budget Hotel', 'Boutique Hotel', 'Resort', 'Guest House'],
  homestay: ['Family Homestay', 'Heritage Stay', 'Farm Stay'],
  guide: ['City Guide', 'Trek Guide', 'Wildlife Guide'],
  bike_rental: ['Scooter Rental', 'Motorcycle Rental', 'Bicycle Rental'],
  car_rental: ['Self Drive', 'Chauffeur Drive', 'Tempo Traveller'],
  boating: ['Houseboat', 'Speed Boat', 'Kayak Rental'],
  adventure: ['Trekking', 'Rafting', 'Paragliding', 'Safari'],
  tour_experience: ['Day Tour', 'Multi-Day Tour', 'Cultural Tour'],
  event_organizer: ['Festival', 'Corporate Event', 'Wedding Event'],
};

export const BUSINESS_TYPES: Record<string, string[]> = {
  cafe: ['Independent Cafe', 'Franchise Cafe', 'Chain Cafe'],
  restaurant: ['Independent Restaurant', 'Franchise', 'Chain', 'Cloud Kitchen'],
  hotel: ['Independent Hotel', 'Hotel Chain', 'Franchise'],
  homestay: ['Individual Owner', 'Property Manager'],
  guide: ['Freelance Guide', 'Agency Guide'],
  bike_rental: ['Independent Shop', 'Fleet Operator'],
  car_rental: ['Independent Operator', 'Fleet Operator', 'Agency'],
  boating: ['Independent Owner', 'Boat Club/Agency'],
  adventure: ['Independent Operator', 'Adventure Agency'],
  tour_experience: ['Independent Operator', 'Tour Company'],
  event_organizer: ['Independent Planner', 'Event Management Company'],
};

export const YEARS = Array.from({ length: 37 }, (_, i) => String(2026 - i));

export { INDIAN_STATES } from '../../constants/locations';

export const VENDOR_BENEFITS = [
  { icon: 'eye-outline' as const, label: 'Increase Visibility' },
  { icon: 'people-outline' as const, label: 'More Customers' },
  { icon: 'star-outline' as const, label: 'Exclusive Benefits' },
];
