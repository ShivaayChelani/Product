/**
 * Community Events — discovery feed.
 *
 * Filters here are a thin projection of the server's own query keys
 * (`q`, `types`, `city`, `state`, `featuredOnly`); visibility and moderation
 * stay server-side, so this screen never has to guess what a traveller may see.
 *
 * Reached from Home's strip, Search's Events chip, and the events tab in the
 * profile menu. Lazy-loaded through `useLazyScreen` in RootNavigator.
 */
import React, { useCallback, useDeferredValue, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useRoute, type RouteProp } from '@react-navigation/native';
import type { EventType } from '../services/api/events';
import { EVENT_TYPES } from '../services/api/events';
import { useEventsList } from '../features/events/hooks';
import { DEFAULT_EVENT_FILTERS, type EventListFilters } from '../features/events/queryKeys';
import { EventCard, EVENT_COLORS } from '../features/events/EventCard';
import { eventTypeLabel } from '../features/events/eventFormat';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Filter chips. Kept short so the row scrolls instead of truncating. */
const TYPE_FILTERS: Array<EventType | null> = [
  null,
  'FESTIVAL',
  'RELIGIOUS',
  'CULTURAL',
  'CONCERT',
  'FAIR_MELA',
  'EXHIBITION',
  'SPORTS',
  'FOOD',
  'COMMUNITY',
];

/** Guards against a link or caller handing us a type the server does not know. */
function coerceEventType(value: unknown): EventType | null {
  return typeof value === 'string' && (EVENT_TYPES as readonly string[]).includes(value)
    ? (value as EventType)
    : null;
}

export default function EventsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'Events'>>();

  const [searchText, setSearchText] = useState('');
  const [type, setType] = useState<EventType | null>(
    coerceEventType(route.params?.initialType),
  );
  const [featuredOnly, setFeaturedOnly] = useState(false);
  // Deferred so typing does not fire a request per keystroke.
  const deferredSearch = useDeferredValue(searchText);

  const filters = useMemo<EventListFilters>(
    () => ({ ...DEFAULT_EVENT_FILTERS, q: deferredSearch, type, featuredOnly }),
    [deferredSearch, type, featuredOnly],
  );

  const {
    events,
    isLoading,
    isRefetching,
    isFetchingNextPage,
    hasNextPage,
    isError,
    refresh,
    loadMore,
  } = useEventsList(filters);

  const openEvent = useCallback(
    (eventIdOrSlug: string) => {
      navigation.navigate('EventDetail', { eventIdOrSlug });
    },
    [navigation],
  );

  const toggleType = useCallback((value: EventType | null) => {
    setType(prev => (prev === value ? null : value));
  }, []);

  const renderHeader = useCallback(
    () => (
      <View>
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Icon name="search" size={17} color={EVENT_COLORS.textSecondary} />
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search festivals, concerts, fairs…"
              placeholderTextColor="#94A3B8"
              style={styles.searchInput}
              returnKeyType="search"
              autoCorrect={false}
              accessibilityLabel="Search events"
            />
            {searchText ? (
              <Pressable
                onPress={() => setSearchText('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Icon name="close-circle" size={17} color="#94A3B8" />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            onPress={() => setFeaturedOnly(prev => !prev)}
            style={[styles.featuredToggle, featuredOnly && styles.featuredToggleActive]}
            accessibilityRole="switch"
            accessibilityState={{ checked: featuredOnly }}
            accessibilityLabel="Only featured events"
          >
            <Icon
              name="star"
              size={15}
              color={featuredOnly ? '#FFFFFF' : EVENT_COLORS.soon}
            />
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {TYPE_FILTERS.map(value => {
            const active = value !== null && type === value;
            const label = value === null ? 'All' : eventTypeLabel(value);
            return (
              <Pressable
                key={value ?? 'all'}
                onPress={() => toggleType(value)}
                style={[styles.chip, active && styles.chipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                {value !== null ? (
                  <Icon
                    name={value === 'FESTIVAL' ? 'sparkles-outline' : 'pricetag-outline'}
                    size={12}
                    color={active ? '#FFFFFF' : EVENT_COLORS.accent}
                  />
                ) : null}
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    ),
    [searchText, type, featuredOnly, toggleType],
  );

  const renderEmpty = useCallback(() => {
    if (isError) {
      return (
        <View style={styles.emptyState}>
          <Icon name="cloud-offline-outline" size={34} color={EVENT_COLORS.textSecondary} />
          <Text style={styles.emptyTitle}>Could not load events</Text>
          <Text style={styles.emptyBody}>Check your connection and try again.</Text>
          <Pressable style={styles.retryBtn} onPress={() => void refresh()} accessibilityRole="button">
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      );
    }
    const filtered = Boolean(deferredSearch.trim()) || type !== null || featuredOnly;
    return (
      <View style={styles.emptyState}>
        <Icon name="calendar-outline" size={34} color={EVENT_COLORS.textSecondary} />
        <Text style={styles.emptyTitle}>
          {filtered ? 'No events match your filters' : 'No upcoming events'}
        </Text>
        <Text style={styles.emptyBody}>
          {filtered
            ? 'Try a different search or clear the filters.'
            : 'Check back soon — new events are added regularly.'}
        </Text>
        {filtered ? (
          <Pressable
            style={styles.retryBtn}
            onPress={() => {
              setSearchText('');
              setType(null);
              setFeaturedOnly(false);
            }}
            accessibilityRole="button"
          >
            <Text style={styles.retryBtnText}>Clear filters</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }, [isError, deferredSearch, type, featuredOnly, refresh]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Events</Text>
        <Text style={styles.headerSubtitle}>
          Festivals, fairs and gatherings near you
        </Text>
      </View>

      <FlatList
        data={events}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <EventCard
            event={item}
            onPress={event => openEvent(event.slug || event.id)}
          />
        )}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={isLoading ? null : renderEmpty}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching && !isLoading}
            onRefresh={() => void refresh()}
            tintColor={EVENT_COLORS.accent}
            colors={[EVENT_COLORS.accent]}
            progressBackgroundColor="#FFFFFF"
          />
        }
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage && !isLoading) void loadMore();
        }}
        ListFooterComponent={
          isLoading || isFetchingNextPage ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color={EVENT_COLORS.accent} />
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F9FC' },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: EVENT_COLORS.text },
  headerSubtitle: { fontSize: 13, color: EVENT_COLORS.textSecondary, marginTop: 2 },
  listContent: { paddingHorizontal: 20, paddingBottom: 40, flexGrow: 1 },
  searchRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 12 },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: EVENT_COLORS.border,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, fontSize: 14, color: EVENT_COLORS.text, paddingVertical: 0 },
  featuredToggle: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: EVENT_COLORS.border,
  },
  featuredToggleActive: { backgroundColor: EVENT_COLORS.soon, borderColor: EVENT_COLORS.soon },
  chipRow: { gap: 8, paddingBottom: 14, paddingRight: 20 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: EVENT_COLORS.accentBorder,
  },
  chipActive: { backgroundColor: EVENT_COLORS.accent, borderColor: EVENT_COLORS.accent },
  chipText: { fontSize: 12.5, fontWeight: '600', color: EVENT_COLORS.accent },
  chipTextActive: { color: '#FFFFFF' },
  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: EVENT_COLORS.text },
  emptyBody: { fontSize: 13, color: EVENT_COLORS.textSecondary, textAlign: 'center' },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: EVENT_COLORS.accent,
  },
  retryBtnText: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '700' },
  footerLoader: { paddingVertical: 18, alignItems: 'center' },
});