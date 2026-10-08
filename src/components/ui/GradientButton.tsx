import { TouchableOpacity, Text, View, type ViewStyle, type TextStyle } from 'react-native';
import { Pal } from '../../design/DesignSystem';

interface GradientButtonProps {
  title: string;
  onPress: () => void;
  gradient?: string[];
  style?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
  loading?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'secondary' | 'accent' | 'danger' | 'outline' | 'ghost';
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

import { scale, verticalScale, fontScale } from '../../design/responsive';

const variantMap: Record<string, { colors: string[]; textColor: string }> = {
  primary: { colors: ['#16392B', '#68756D'], textColor: '#FFFFFF' },
  secondary: { colors: ['#1F4D3A', '#DDEBE3'], textColor: '#FFFFFF' },
  accent: { colors: ['#1F4D3A', '#DDEBE3'], textColor: '#FFFFFF' },
  danger: { colors: ['#C94A4A', '#FF7B7F'], textColor: '#FFFFFF' },
  outline: { colors: ['transparent', 'transparent'], textColor: '#1F4D3A' },
  ghost: { colors: ['transparent', 'transparent'], textColor: '#68756D' },
};

const sizeMap: Record<string, { height: number; paddingHorizontal: number; fontSize: number }> = {
  sm: { height: verticalScale(36), paddingHorizontal: scale(16), fontSize: fontScale(13) },
  md: { height: verticalScale(48), paddingHorizontal: scale(24), fontSize: fontScale(15) },
  lg: { height: verticalScale(56), paddingHorizontal: scale(32), fontSize: fontScale(17) },
};

export function GradientButton({
  title, onPress, style, textStyle, disabled, loading,
  size = 'md', variant = 'primary', icon, fullWidth,
}: GradientButtonProps) {
  const config = variantMap[variant];
  const dims = sizeMap[size];
  const isOutline = variant === 'outline';
  const isGhost = variant === 'ghost';

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={disabled || loading}
      style={[{
        height: dims.height,
        paddingHorizontal: dims.paddingHorizontal,
        borderRadius: Pal.borderRadius.xl,
        backgroundColor: isOutline || isGhost ? 'transparent' : config.colors[0],
        borderWidth: isOutline ? 1.5 : 0,
        borderColor: isOutline ? Pal.colors.light.primary : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
        opacity: disabled ? 0.5 : 1,
        ...Pal.shadows.md,
      }, fullWidth ? { width: '100%' } : {}, style as ViewStyle]}
    >
      {icon && <View style={{ marginRight: 4 }}>{icon}</View>}
      {loading ? (
        <Text style={[{ color: config.textColor, fontSize: dims.fontSize, fontFamily: Pal.typography.fontFamily.semibold }, textStyle as TextStyle]}>
          Loading...
        </Text>
      ) : (
        <Text style={[{ color: isOutline ? Pal.colors.light.primary : isGhost ? Pal.colors.light.textSecondary : config.textColor, fontSize: dims.fontSize, fontFamily: Pal.typography.fontFamily.semibold }, textStyle as TextStyle]}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}
