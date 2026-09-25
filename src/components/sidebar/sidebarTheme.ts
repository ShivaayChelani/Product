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
    icon: 'compass-outline',
    label: 'Hidden Gems',
    subtitle: 'Discover secret spots & win rewards',
    iconColor: '#2F4F3D',
    iconBg: '#E7F2EB',
  },
  {
    key: 'palpoints',
    icon: 'wallet-outline',
    label: 'Wallet',
    subtitle: 'Wallet & PalPoints balance',
    iconColor: '#8C5A24',
    iconBg: '#F8EFE3',
  },
  {
    key: 'offers',
    icon: 'gift-outline',
    label: 'Offers',
    subtitle: 'Exclusive deals from local vendors',
    iconColor: '#B61F3F',
    iconBg: '#FCE3E8',
  },
  {
    key: 'leaderboard',
    icon: 'trophy-outline',
    label: 'Leaderboard',
    subtitle: 'Top explorers & creators',
    iconColor: '#533C8B',
    iconBg: '#EDEAF6',
  },
];
