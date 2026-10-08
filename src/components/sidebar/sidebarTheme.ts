import { SERIF, SANS, SANS_BOLD, SANS_SEMI } from '../profile/profileTheme';
import { palette } from '../../config/theme';

export const SB = {
  bg: palette.surface,
  panel: palette.surface,
  card: palette.surface,
  text: palette.text,
  textSecondary: palette.textSecondary,
  textMuted: palette.textSecondary,
  accent: palette.primaryDark,
  accentSoft: palette.primary,
  sectionLabel: palette.primary,
  divider: palette.border,
  iconBg: palette.background,
  iconBgActive: palette.border,
  itemActiveBg: palette.primaryLight,
  itemActiveBorder: palette.border,
  pendingBg: palette.surface,
  pendingText: palette.textSecondary,
  danger: palette.error,
  dangerBg: '#FBEAEA',
  shadow: 'rgba(0, 0, 0, 0.08)',
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
    iconColor: '#111111',
    iconBg: palette.primaryLight,
  },
  {
    key: 'palpoints',
    icon: 'wallet-outline',
    label: 'Wallet',
    subtitle: 'Wallet & PalPoints balance',
    iconColor: palette.textSecondary,
    iconBg: palette.background,
  },
  {
    key: 'offers',
    icon: 'gift-outline',
    label: 'Offers',
    subtitle: 'Exclusive deals from local vendors',
    iconColor: '#B61F3F',
    iconBg: '#FBEAEA',
  },
  {
    key: 'leaderboard',
    icon: 'trophy-outline',
    label: 'Leaderboard',
    subtitle: 'Top explorers & creators',
    iconColor: palette.textSecondary,
    iconBg: palette.primaryLight,
  },
];
