import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, type ViewStyle } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { RideOptionsTheme as T } from '../theme';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
  style?: ViewStyle;
};

export function RideButton({
  label,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  style,
}: Props) {
  const isPrimary = variant === 'primary';

  return (
    <TouchableOpacity
      style={[
        styles.btn,
        isPrimary ? styles.btnPrimary : styles.btnSecondary,
        (disabled || loading) && styles.btnDisabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? '#FFF' : T.primary} size="small" />
      ) : (
        <>
          <Text style={[styles.text, isPrimary ? styles.textPrimary : styles.textSecondary]}>{label}</Text>
          <Icon
            name={isPrimary ? 'open-outline' : 'globe-outline'}
            size={18}
            color={isPrimary ? '#FFF' : T.primary}
          />
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: T.radiusButton,
    minHeight: 48,
  },
  btnPrimary: { backgroundColor: T.primary },
  btnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: T.primary,
  },
  btnDisabled: { opacity: 0.45 },
  text: { fontSize: 15, fontWeight: '700' },
  textPrimary: { color: '#FFF' },
  textSecondary: { color: T.primary },
});
