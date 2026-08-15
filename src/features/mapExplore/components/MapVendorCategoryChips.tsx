import React, { memo } from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { VENDOR_CATEGORY_CHIPS } from '../constants/vendorCategoryChips';
import { MapExploreTheme as T } from '../theme';

type Props = {
  selected: string;
  onSelect: (key: string) => void;
};

function MapVendorCategoryChipsComponent({ selected, onSelect }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      {VENDOR_CATEGORY_CHIPS.map(chip => {
        const active = selected === chip.key || (!selected && chip.key === 'all');
        return (
          <TouchableOpacity
            key={chip.key}
            onPress={() => onSelect(chip.key === 'all' ? '' : chip.key)}
            style={[
              styles.chip,
              active && { backgroundColor: T.primary, borderColor: T.primary },
            ]}
            activeOpacity={0.85}
          >
            <Icon name={chip.ionIcon as any} size={15} color={active ? '#FFF' : chip.color} />
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{chip.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { marginTop: 12 },
  content: { paddingRight: 16, gap: 8, flexDirection: 'row' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: T.radiusButton,
    backgroundColor: T.card,
    borderWidth: 1,
    borderColor: T.border,
  },
  chipText: { fontSize: 13, fontWeight: '600', color: T.text },
  chipTextActive: { color: '#FFF' },
});

export const MapVendorCategoryChips = memo(MapVendorCategoryChipsComponent);
