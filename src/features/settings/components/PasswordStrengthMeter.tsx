import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SettingsTheme as T, SANS } from '../theme';
import type { PasswordStrength } from '../utils/passwordStrength';

const LABELS: Record<Exclude<PasswordStrength, 'none'>, string> = {
  weak: 'Weak',
  medium: 'Medium',
  strong: 'Strong',
};

type Props = { strength: PasswordStrength };

function PasswordStrengthMeterComponent({ strength }: Props) {
  const active =
    strength === 'strong' ? 3 : strength === 'medium' ? 2 : strength === 'weak' ? 1 : 0;
  const keys: Array<keyof typeof LABELS> = ['weak', 'medium', 'strong'];
  return (
    <View style={styles.wrap}>
      {keys.map((key, idx) => {
        const on = idx < active;
        const color =
          key === 'weak' ? '#E8A598' : key === 'medium' ? T.secondary : T.primary;
        return (
          <View key={key} style={styles.col}>
            <View style={[styles.bar, { backgroundColor: on ? color : '#EDE4D8' }]} />
            <Text style={[styles.label, on && styles.labelOn]}>{LABELS[key]}</Text>
          </View>
        );
      })}
    </View>
  );
}

export const PasswordStrengthMeter = memo(PasswordStrengthMeterComponent);

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 10 },
  col: { flex: 1, gap: 6 },
  bar: { height: 4, borderRadius: 2 },
  label: {
    fontFamily: SANS,
    fontSize: 11,
    color: T.textMuted,
    textAlign: 'center',
  },
  labelOn: { color: T.textSecondary },
});
