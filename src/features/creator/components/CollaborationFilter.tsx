import React from 'react';
import { ScrollView, Text, StyleSheet, Pressable } from 'react-native';

const COLORS = {
  activeBg: '#4B3B30', // Deep coffee
  activeText: '#FFFFFF',
  inactiveBg: '#FFFFFF',
  inactiveText: '#1F1A17',
  border: '#E3DACD', // Subtle beige
};

export type CollaborationFilterType = 'all' | 'pending' | 'accepted' | 'in_progress' | 'completed' | 'rejected';

type CollaborationFilterProps = {
  selected: CollaborationFilterType;
  onSelect: (filter: CollaborationFilterType) => void;
};

const FILTERS: { key: CollaborationFilterType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'rejected', label: 'Rejected' },
];

export function CollaborationFilter({ selected, onSelect }: CollaborationFilterProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {FILTERS.map((f) => {
        const isActive = selected === f.key;
        return (
          <Pressable
            key={f.key}
            style={[styles.pill, isActive && styles.pillActive]}
            onPress={() => onSelect(f.key)}
          >
            <Text style={[styles.text, isActive && styles.textActive]}>{f.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.inactiveBg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pillActive: {
    backgroundColor: COLORS.activeBg,
    borderColor: COLORS.activeBg,
  },
  text: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.inactiveText,
  },
  textActive: {
    color: COLORS.activeText,
    fontWeight: '600',
  },
});
