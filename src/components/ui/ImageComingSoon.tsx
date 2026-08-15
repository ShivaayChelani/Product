import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { IMAGE_COMING_SOON_LABEL } from '../../utils/imageUrl';

type Props = {
  style?: StyleProp<ViewStyle>;
  label?: string;
  iconSize?: number;
  compact?: boolean;
};

export default function ImageComingSoon({
  style,
  label = IMAGE_COMING_SOON_LABEL,
  iconSize = 28,
  compact = false,
}: Props) {
  return (
    <View style={[styles.base, compact && styles.compact, style]}>
      <Icon name="image-outline" size={iconSize} color="#9CA3AF" />
      {!compact ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    gap: 8,
    paddingHorizontal: 12,
  },
  compact: {
    gap: 0,
    paddingHorizontal: 0,
  },
  label: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    fontWeight: '500',
  },
});
