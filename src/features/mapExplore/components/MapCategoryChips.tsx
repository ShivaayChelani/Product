import React, { memo } from 'react';
import { ScrollView, TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { MAP_CATEGORY_CHIPS, type MapCategoryChip } from '../constants/categoryChips';
import { MapExploreTheme as T } from '../theme';

type Props = {
  selected: string;
  onSelect: (key: string) => void;
  /** DB-driven categories from GET /places/map/categories; falls back to static chips. */
  chips?: MapCategoryChip[];
};

function MapCategoryChipsComponent({ selected, onSelect, chips }: Props) {
  const displayChips = chips && chips.length > 0 ? chips : MAP_CATEGORY_CHIPS;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      {displayChips.map(chip => {
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
            <Icon
              name={chip.ionIcon as any}
              size={15}
              color={active ? '#FFF' : chip.color}
            />
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {chip.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { marginTop: 12 },
  content: { paddingRight: 16, gap: 8, flexDirection: 'row', alignItems: 'center' },
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
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: T.text,
  },
  chipTextActive: {
    color: '#FFF',
  },
});

export const MapCategoryChips = memo(MapCategoryChipsComponent);
