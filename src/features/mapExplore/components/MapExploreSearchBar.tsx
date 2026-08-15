import React, { memo } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { MapExploreTheme as T } from '../theme';

type Props = {
  value: string;
  onChangeText: (t: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onSubmit: () => void;
  onClear: () => void;
  onMenu?: () => void;
  onFilterToggle?: () => void;
  onFilter?: () => void;
  filtersOpen?: boolean;
  loading?: boolean;
};

function MapExploreSearchBarComponent({
  value,
  onChangeText,
  onFocus,
  onBlur,
  onSubmit,
  onClear,
  onMenu,
  onFilterToggle,
  onFilter,
  filtersOpen,
  loading,
}: Props) {
  return (
    <View style={styles.row}>
      <View style={[styles.bar, T.shadow]}>
        {loading ? (
          <ActivityIndicator size="small" color={T.primary} style={styles.searchIcon} />
        ) : (
          <Icon name="search-outline" size={20} color={T.textSecondary} style={styles.searchIcon} />
        )}
        <TextInput
          placeholder="Search places, vendors, cities..."
          placeholderTextColor={T.textSecondary}
          value={value}
          onChangeText={onChangeText}
          onFocus={onFocus}
          onBlur={onBlur}
          onSubmitEditing={onSubmit}
          returnKeyType="search"
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {value.length > 0 ? (
          <TouchableOpacity onPress={onClear} hitSlop={8} style={styles.sideHit}>
            <Icon name="close-circle" size={18} color={T.textSecondary} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={onFilterToggle} style={styles.sideHit} accessibilityLabel="Filter">
            <Icon name="options-outline" size={20} color={filtersOpen ? T.primary : T.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
      {onFilter ? (
        <TouchableOpacity style={styles.filterBtn} onPress={onFilter} accessibilityLabel="Filters">
          <Icon name="options-outline" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  bar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.card,
    borderRadius: T.radiusSearch,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 4,
    minHeight: 52,
  },
  searchIcon: { marginLeft: 4 },
  input: {
    flex: 1,
    fontSize: 15,
    color: T.text,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  sideHit: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: T.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export const MapExploreSearchBar = memo(MapExploreSearchBarComponent);
