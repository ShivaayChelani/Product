import React from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import Pal from '../../design/DesignSystem';
import Icon from 'react-native-vector-icons/Ionicons';
import { scale, verticalScale, fontScale, iconScale, radiusScale } from '../../design/responsive';

export interface BadgeProps {
  label: string;
  icon?: string;
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'outline' | 'ghost' | 'accent';
  size?: 'sm' | 'md' | 'lg';
  onPress?: () => void;
  style?: any;
}

const variantColors = {
  primary: { bg: Pal.colors.dark.primary, text: '#fff', border: 'transparent' },
  secondary: { bg: Pal.colors.dark.secondary, text: '#fff', border: 'transparent' },
  success: { bg: Pal.colors.dark.success, text: '#fff', border: 'transparent' },
  warning: { bg: Pal.colors.dark.warning, text: '#1A1A2E', border: 'transparent' },
  accent: { bg: Pal.colors.dark.accent, text: '#fff', border: 'transparent' },
  danger: { bg: Pal.colors.dark.danger, text: '#fff', border: 'transparent' },
  outline: { bg: 'transparent', text: Pal.colors.dark.primary, border: Pal.colors.dark.primary },
  ghost: { bg: Pal.colors.dark.primary + '15', text: Pal.colors.dark.primary, border: 'transparent' },
};

const sizeStyles = {
  sm: { paddingH: scale(8), paddingV: verticalScale(4), fontSize: fontScale(11), iconSize: iconScale(12), gap: scale(4), radius: radiusScale(12) },
  md: { paddingH: scale(12), paddingV: verticalScale(6), fontSize: fontScale(12), iconSize: iconScale(14), gap: scale(5), radius: radiusScale(16) },
  lg: { paddingH: scale(16), paddingV: verticalScale(8), fontSize: fontScale(14), iconSize: iconScale(16), gap: scale(6), radius: radiusScale(20) },
};

export const Badge = React.memo(({
  label,
  icon,
  variant = 'primary',
  size = 'md',
  onPress,
  style,
}: BadgeProps) => {
  const v = variantColors[variant];
  const s = sizeStyles[size];

  return (
    <TouchableOpacity
      style={[
        styles.badge,
        { backgroundColor: v.bg, borderColor: v.border, borderWidth: v.border !== 'transparent' ? 1 : 0 },
        { paddingHorizontal: s.paddingH, paddingVertical: s.paddingV, borderRadius: s.radius },
        { flexDirection: 'row', alignItems: 'center', gap: s.gap },
        style,
      ]}
      onPress={onPress}
      activeOpacity={onPress ? 0.8 : 1}
      disabled={!onPress}
    >
      {icon && <Icon name={icon} size={s.iconSize} color={v.text} />}
      <Text style={[styles.text, { color: v.text, fontSize: s.fontSize }]}>{label}</Text>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  badge: {},
  text: { fontWeight: '700', letterSpacing: 0.2 },
});

export default Badge;