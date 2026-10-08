import React, { memo, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { MapExploreTheme as T } from '../theme';
import { MAP_LAYER_TABS, mapSegmentThumbX, type MapLayerTab } from '../utils/mapSegmentThumb';

const TAB_LABELS: Record<MapLayerTab, string> = {
  places: 'Places',
  events: 'Events',
  vendors: 'Vendors',
};

type Props = {
  active: MapLayerTab;
  onChange: (tab: MapLayerTab) => void;
};

function MapSegmentControlComponent({ active, onChange }: Props) {
  const thumbX = useSharedValue(0);
  const [segmentWidth, setSegmentWidth] = useState(0);
  const activeRef = useRef(active);
  activeRef.current = active;

  const onLayout = (e: LayoutChangeEvent) => {
    // One slot per layer, minus the 4px horizontal padding on each side.
    const w = (e.nativeEvent.layout.width - 8) / MAP_LAYER_TABS.length;
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
      {MAP_LAYER_TABS.map((tab) => (
        <Pressable key={tab} style={styles.segment} onPress={() => onChange(tab)}>
          <Text style={[styles.label, active === tab && styles.labelActive]} numberOfLines={1}>
            {TAB_LABELS[tab]}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: '#F0EFEB',
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
    backgroundColor: '#111111',
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
    fontSize: 13,
    fontWeight: '600',
    color: T.text,
  },
  labelActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});

export const MapSegmentControl = memo(MapSegmentControlComponent);
