import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { RideOptionsTheme as T } from '../theme';

type Props = {
  vehicles: string[];
  selected?: string | null;
  onSelect: (vehicle: string) => void;
};

export function RideVehicleSelector({ vehicles, selected, onSelect }: Props) {
  if (vehicles.length <= 1) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      {vehicles.map(v => {
        const active = selected === v;
        return (
          <TouchableOpacity
            key={v}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onSelect(v)}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{v}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 40, marginBottom: 8 },
  content: { gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.card,
  },
  chipActive: { backgroundColor: T.primary, borderColor: T.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: T.text },
  chipTextActive: { color: '#FFF' },
});
