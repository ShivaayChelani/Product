import React, { memo, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { MapExploreTheme as T } from '../theme';

type Tab = 'places' | 'vendors';

type Props = {
  active: Tab;
  onChange: (tab: Tab) => void;
};

function MapSegmentControlComponent({ active, onChange }: Props) {
  const thumbX = useSharedValue(0);
  const segmentW = useSharedValue(0);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    segmentW.value = (w - 8) / 2;
    thumbX.value = active === 'places' ? 0 : segmentW.value;
  };

  useEffect(() => {
    thumbX.value = withSpring(active === 'places' ? 0 : segmentW.value, {
      damping: 18,
      stiffness: 220,
    });
  }, [active, segmentW.value, thumbX]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: thumbX.value }],
    width: segmentW.value,
  }));

  return (
    <View style={styles.track} onLayout={onLayout}>
      <Animated.View style={[styles.thumb, thumbStyle]} />
      <Pressable style={styles.segment} onPress={() => onChange('places')}>
        <Text style={[styles.label, active === 'places' && styles.labelActive]}>Places</Text>
      </Pressable>
      <Pressable style={styles.segment} onPress={() => onChange('vendors')}>
        <Text style={[styles.label, active === 'vendors' && styles.labelActive]}>Vendors</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: T.background,
    borderRadius: T.radiusButton,
    borderWidth: 1,
    borderColor: T.border,
    padding: 4,
    marginTop: 12,
  },
  thumb: {
    position: 'absolute',
    top: 4,
    left: 4,
    bottom: 4,
    backgroundColor: T.primary,
    borderRadius: T.radiusButton - 4,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    zIndex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: T.text,
  },
  labelActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});

export const MapSegmentControl = memo(MapSegmentControlComponent);
