import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, useWindowDimensions, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const ReelSkeleton: React.FC = React.memo(() => {
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
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

  const animatedStyle = {
    opacity,
  };

  return (
    <View style={[styles.container, { height: windowHeight, width: windowWidth }]}>
      <Animated.View style={[styles.shimmer, animatedStyle]} />
      
      {/* Right Side Actions */}
      <View style={styles.actionsContainer}>
        {[1, 2, 3, 4].map(i => (
          <View key={i} style={styles.actionItem}>
            <Animated.View style={[styles.circle, animatedStyle]} />
            <Animated.View style={[styles.shortLine, animatedStyle]} />
          </View>
        ))}
      </View>

      {/* Bottom Info */}
      <View style={[styles.infoContainer, { paddingBottom: Math.max(insets.bottom, 20) + 60 }]}>
        <View style={styles.userInfo}>
          <Animated.View style={[styles.avatar, animatedStyle]} />
          <Animated.View style={[styles.nameLine, animatedStyle]} />
        </View>
        <Animated.View style={[styles.titleLine, animatedStyle]} />
        <Animated.View style={[styles.descLine, animatedStyle]} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111',
    position: 'relative',
  },
  shimmer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1a1a1a',
  },
  actionsContainer: {
    position: 'absolute',
    right: 16,
    bottom: 120,
    alignItems: 'center',
    gap: 24,
  },
  actionItem: {
    alignItems: 'center',
    gap: 8,
  },
  circle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  shortLine: {
    width: 30,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  infoContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 80,
    padding: 16,
    gap: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  nameLine: {
    width: 120,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  titleLine: {
    width: '80%',
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  descLine: {
    width: '60%',
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
});
