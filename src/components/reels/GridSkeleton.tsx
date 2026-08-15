import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, useWindowDimensions, Animated } from 'react-native';

interface GridSkeletonProps {
  count?: number;
}

export const GridSkeleton: React.FC<GridSkeletonProps> = React.memo(({ count = 9 }) => {
  const { width: windowWidth } = useWindowDimensions();
  const gridItemSize = (windowWidth - 4) / 3;
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        })
      ])
    ).start();
  }, [opacity]);

  const animatedStyle = { opacity };

  return (
    <View style={styles.grid}>
      {[...Array(count)].map((_, i) => (
        <Animated.View
          key={i}
          style={[
            styles.gridItem,
            { width: gridItemSize, height: gridItemSize * 1.5 },
            animatedStyle,
          ]}
        />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 1,
    gap: 1,
  },
  gridItem: {
    backgroundColor: '#333',
  },
});
