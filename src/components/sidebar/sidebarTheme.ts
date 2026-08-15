import { SERIF, SANS, SANS_BOLD, SANS_SEMI } from '../profile/profileTheme';

export const SB = {
  bg: '#FFFFFF',
  panel: '#FFFFFF',
  card: '#FFFFFF',
  text: '#2C1810',
  textSecondary: '#8B7355',
  textMuted: '#A39990',
  accent: '#63300E',
  accentSoft: '#B9834B',
  sectionLabel: '#B9834B',
  divider: '#E8DDD0',
  iconBg: '#F9F9F9',
  iconBgActive: '#E5D5C5',
  itemActiveBg: '#FBF0E3',
  itemActiveBorder: '#D9C4A8',
  pendingBg: '#FFFFFF',
  pendingText: '#8B7355',
  danger: '#C0392B',
  dangerBg: '#FDEEEE',
  shadow: 'rgba(44, 24, 16, 0.08)',
} as const;

export { SERIF, SANS, SANS_BOLD, SANS_SEMI };

export type ExploreMenuItem = {
  key: string;
  icon: string;
  label: string;
  subtitle?: string;
  iconColor: string;
  iconBg: string;
  palPoints?: boolean;
  customImage?: any;
  badge?: string;
};

export const EXPLORE_ITEMS: ExploreMenuItem[] = [
  {
    key: 'hiddengems',
    icon: 'diamond-outline',
    label: 'Hidden Gems',
    subtitle: 'Discover secret spots',
    iconColor: '#4A6B5C',
    iconBg: '#E4F0EA',
  },
  {
    key: 'palpoints',
    icon: 'wallet-outline',
    label: 'Wallet',
    subtitle: 'Wallet & balance',
    iconColor: '#D38D36',
    iconBg: '#F9F1E6',
  },
  {
    key: 'rewards',
    icon: 'gift-outline',
    label: 'Offers',
    subtitle: 'Redeem your PalPoints',
    iconColor: '#D25E6B',
    iconBg: '#FDE4E6',
  },
  {
    key: 'leaderboard',
    icon: 'trophy-outline',
    label: 'Leaderboard',
    subtitle: 'Top explorers & creators',
    iconColor: '#7A5C9B',
    iconBg: '#F0EAF5',
  },
];
