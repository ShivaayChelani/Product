import React, { useCallback } from 'react';
import { View, StyleSheet, FlatList, useWindowDimensions } from 'react-native';
import type { TripPlan } from '../../services/api/trips';

const H_PAD = 20;
const CARD_GAP = 14;
const PEEK = 28;

type Props = {
  trips: TripPlan[];
  renderTrip: (trip: TripPlan, index: number) => React.ReactNode;
};

/** Horizontal trip cards — swipe left/right, never stacked vertically. */
export function TripsHorizontalCarousel({ trips, renderTrip }: Props) {
  const { width: screenW } = useWindowDimensions();
  const cardWidth = screenW - H_PAD * 2 - PEEK;
  const snapInterval = cardWidth + CARD_GAP;

  const renderItem = useCallback(
    ({ item, index }: { item: TripPlan; index: number }) => (
      <View style={[styles.cardWrap, { width: cardWidth }]}>{renderTrip(item, index)}</View>
    ),
    [cardWidth, renderTrip],
  );

  if (trips.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <FlatList
        horizontal
        data={trips}
        keyExtractor={trip => trip.id}
        renderItem={renderItem}
        showsHorizontalScrollIndicator={false}
        snapToInterval={snapInterval}
        snapToAlignment="start"
        decelerationRate="fast"
        nestedScrollEnabled
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ width: CARD_GAP }} />}
        getItemLayout={(_, index) => ({
          length: snapInterval,
          offset: snapInterval * index,
          index,
        })}
        style={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'visible',
  },
  list: {
    flexGrow: 0,
    overflow: 'visible',
  },
  listContent: {
    paddingHorizontal: H_PAD,
    paddingBottom: 12,
  },
  cardWrap: {
    flexGrow: 0,
    overflow: 'visible',
    paddingBottom: 4,
  },
});
