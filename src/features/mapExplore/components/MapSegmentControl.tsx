import React, { memo, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { MapExploreTheme as T } from '../theme';
import { mapSegmentThumbX } from '../utils/mapSegmentThumb';

type Tab = 'places' | 'vendors';

type Props = {
  active: Tab;
  onChange: (tab: Tab) => void;
};

function MapSegmentControlComponent({ active, onChange }: Props) {
  const thumbX = useSharedValue(0);
  const [segmentWidth, setSegmentWidth] = useState(0);
  const activeRef = useRef(active);
  activeRef.current = active;

  const onLayout = (e: LayoutChangeEvent) => {
    const w = (e.nativeEvent.layout.width - 8) / 2;
    if (!(w > 0)) return;
    setSegmentWidth(prev => (Math.abs(prev - w) < 0.5 ? prev : w));
    // Snap immediately so PalPoints → Vendors does not paint a Places thumb first.
    thumbX.value = mapSegmentThumbX(activeRef.current, w);
  };

  useEffect(() => {
    if (segmentWidth <= 0) return;
    thumbX.value = withSpring(mapSegmentThumbX(active, segmentWidth), {
      damping: 18,
      stiffness: 280,
    });
  }, [active, segmentWidth, thumbX]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: thumbX.value }],
  }));

  return (
    <View style={styles.track} onLayout={onLayout}>
      <Animated.View
        style={[styles.thumb, { width: segmentWidth || undefined }, thumbStyle]}
      />
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
