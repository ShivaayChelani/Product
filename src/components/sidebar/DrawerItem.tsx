import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { PalPointsIcon } from '../PalPointsIcon';
import { SB, SANS, SANS_BOLD, SANS_SEMI } from './sidebarTheme';

interface DrawerItemProps {
  icon?: string;
  lib?: 'ion' | 'mci';
  iconColor?: string;
  iconBg?: string;
  palPointsIcon?: boolean;
  customImage?: any;
  label: string;
  subtitle?: string;
  badge?: string;
  danger?: boolean;
  disabled?: boolean;
  active?: boolean;
  onPress: () => void;
}

export const DrawerItem: React.FC<DrawerItemProps> = ({
  icon,
  lib = 'ion',
  iconColor,
  iconBg,
  palPointsIcon,
  customImage,
  label,
  subtitle,
  badge,
  danger,
  disabled,
  active,
  onPress,
}) => {
  const IconComp = lib === 'mci' ? MaterialCommunityIcons : Icon;
  const textColor = danger ? SB.danger : disabled ? SB.textMuted : SB.text;
  const circleBg = iconBg || (danger ? SB.dangerBg : active ? SB.iconBgActive : SB.iconBg);
  const circleColor = iconColor || (danger ? SB.danger : disabled ? SB.textMuted : SB.accent);

  return (
    <TouchableOpacity
      style={[
        styles.container,
        active && styles.containerActive,
        disabled && styles.containerDisabled,
      ]}
      activeOpacity={disabled ? 1 : 0.75}
      onPress={onPress}
      disabled={disabled}
    >
      <View style={[styles.iconWrap, { backgroundColor: circleBg }]}>
        {customImage ? (
          <Image source={customImage} style={{ width: 28, height: 28, resizeMode: 'contain' }} />
        ) : palPointsIcon ? (
          <PalPointsIcon size={18} />
        ) : (
          <IconComp name={icon as any} size={20} color={circleColor} />
        )}
      </View>

      <View style={styles.labelCol}>
        <Text style={[styles.label, { color: textColor }]} numberOfLines={1}>
          {label}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
        ) : null}
      </View>

      {badge ? (
        <View style={[styles.badge, active && styles.badgeActive]}>
          <Text style={[styles.badgeText, active && styles.badgeTextActive]}>{badge}</Text>
        </View>
      ) : !disabled ? (
        <Icon name="chevron-forward" size={16} color={SB.textMuted} />
      ) : null}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginHorizontal: 12,
    marginBottom: 4,
    borderRadius: 14,
  },
  containerActive: {
    backgroundColor: SB.itemActiveBg,
    borderWidth: 1,
    borderColor: SB.itemActiveBorder,
  },
  containerDisabled: {
    opacity: 0.72,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  labelCol: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontFamily: SANS_SEMI,
    fontSize: 15,
    color: SB.text,
  },
  subtitle: {
    fontFamily: SANS,
    fontSize: 12,
    color: SB.textMuted,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: SB.pendingBg,
    marginRight: 4,
  },
  badgeActive: {
    backgroundColor: SB.accentSoft,
  },
  badgeText: {
    fontFamily: SANS_BOLD,
    fontSize: 9,
    color: SB.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  badgeTextActive: {
    color: '#FFFFFF',
  },
});
