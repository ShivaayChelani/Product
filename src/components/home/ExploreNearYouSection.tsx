import React, { memo, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import {
  getLuxuryTheme,
  LuxurySpacing,
  LuxuryTypography,
} from '../../design/luxuryTravel';
import { NearbyPlaceCard, type NearbyPlaceItem } from './NearbyPlaceCard';

type Props = {
  places: NearbyPlaceItem[];
  cardWidth: number;
  loading: boolean;
  wishlistIds: string[];
  onViewAll?: () => void;
  onSelectPlace: (id: string) => void;
  onToggleWishlist: (id: string) => void;
  renderSkeleton?: () => React.ReactElement;
  renderEmpty?: () => React.ReactElement;
};

function ExploreNearYouSectionComponent({
  places,
  cardWidth,
  loading,
  wishlistIds,
  onViewAll,
  onSelectPlace,
  onToggleWishlist,
  renderSkeleton,
  renderEmpty,
}: Props) {
  const theme = getLuxuryTheme('light');

  const renderItem = useCallback(
    ({ item, index }: { item: NearbyPlaceItem; index: number }) => (
      <NearbyPlaceCard
        item={item}
        width={cardWidth}
        index={index}
        isWishlisted={wishlistIds.includes(item.id)}
        onPress={() => onSelectPlace(item.id)}
        onToggleWishlist={() => onToggleWishlist(item.id)}
      />
    ),
    [cardWidth, wishlistIds, onSelectPlace, onToggleWishlist],
  );

  const keyExtractor = useCallback((item: NearbyPlaceItem) => item.id, []);

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={[LuxuryTypography.headingSection, { color: theme.textPrimary }]}>
          Explore Near You
        </Text>
        <TouchableOpacity onPress={onViewAll} accessibilityRole="button">
          <Text style={[LuxuryTypography.bodySemiBold, { color: theme.accentBrown }]}>
            View all →
          </Text>
        </TouchableOpacity>
      </View>

      {loading && places.length === 0 ? (
        renderSkeleton ? renderSkeleton() : (
          <ActivityIndicator color={theme.primaryBrown} style={styles.loader} />
        )
      ) : places.length === 0 ? (
        renderEmpty ? renderEmpty() : null
      ) : (
        <FlatList
          data={places}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          decelerationRate="fast"
          snapToInterval={cardWidth + 14}
          initialNumToRender={4}
          maxToRenderPerBatch={6}
          windowSize={5}
          removeClippedSubviews
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: LuxurySpacing.sectionGap,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: LuxurySpacing.screenHorizontal,
    marginBottom: 14,
  },
  listContent: {
    paddingLeft: LuxurySpacing.screenHorizontal,
    paddingRight: LuxurySpacing.screenHorizontal - 6,
  },
  loader: {
    marginVertical: 24,
  },
});

export const ExploreNearYouSection = memo(ExploreNearYouSectionComponent);
