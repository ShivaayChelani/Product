import React from 'react';
import { View, TextInput, StyleSheet, Pressable, Text } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

const COLORS = {
  bg: '#FFFFFF',
  border: '#E3DACD',
  text: '#1F1A17',
  placeholder: '#A0968C',
  icon: '#7B5E43',
};

export type SortOption = 'recent' | 'oldest' | 'earnings_high' | 'earnings_low';

type CollaborationSearchProps = {
  searchQuery: string;
  onChangeSearch: (text: string) => void;
  sortOption: SortOption;
  onChangeSort: (sort: SortOption) => void;
  onOpenAdvancedFilters?: () => void;
};

const SORT_LABELS: Record<SortOption, string> = {
  recent: 'Recent',
  oldest: 'Oldest',
  earnings_high: 'Highest Earnings',
  earnings_low: 'Lowest Earnings',
};

export function CollaborationSearch({
  searchQuery,
  onChangeSearch,
  sortOption,
  onChangeSort,
  onOpenAdvancedFilters,
}: CollaborationSearchProps) {
  
  // For this compact implementation, tapping sort cycles through options.
  // In a more complex app, this would open a BottomSheet or Menu.
  const cycleSort = () => {
    const keys: SortOption[] = ['recent', 'oldest', 'earnings_high', 'earnings_low'];
    const idx = keys.indexOf(sortOption);
    onChangeSort(keys[(idx + 1) % keys.length]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <Icon name="search-outline" size={18} color={COLORS.placeholder} style={styles.searchIcon} />
        <TextInput
          style={styles.input}
          placeholder="Search collaborations..."
          placeholderTextColor={COLORS.placeholder}
          value={searchQuery}
          onChangeText={onChangeSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => onChangeSearch('')} style={styles.clearBtn}>
            <Icon name="close-circle" size={16} color={COLORS.placeholder} />
          </Pressable>
        )}
      </View>
      
      <Pressable style={styles.sortBtn} onPress={cycleSort}>
        <Text style={styles.sortLabel}>Sort by: <Text style={{ fontWeight: '600' }}>{SORT_LABELS[sortOption]}</Text></Text>
        <Icon name="chevron-down" size={14} color={COLORS.text} />
      </Pressable>

      {onOpenAdvancedFilters && (
        <Pressable style={styles.filterIconBtn} onPress={onOpenAdvancedFilters}>
          <Icon name="options-outline" size={20} color={COLORS.icon} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginBottom: 16,
    flexDirection: 'column',
    gap: 12,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    height: 44,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    height: '100%',
  },
  clearBtn: {
    padding: 4,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
  },
  sortLabel: {
    fontSize: 12,
    color: COLORS.text,
  },
  filterIconBtn: {
    position: 'absolute',
    right: 16,
    bottom: 0,
    height: 24,
    justifyContent: 'center',
  },
});
