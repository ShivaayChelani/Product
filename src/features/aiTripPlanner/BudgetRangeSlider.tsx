import React, { useRef } from 'react';
import { View, PanResponder, StyleSheet, ViewStyle } from 'react-native';

type Props = {
  position: number;
  onSelectPosition: (pos: number) => void;
  onSelectEnd?: () => void;
  trackStyle?: ViewStyle;
  fillStyle?: ViewStyle;
  thumbStyle?: ViewStyle;
};

/**
 * Interactive budget range control. Visuals stay the existing track/thumb;
 * drag/tap maps 0–1 along the track for the caller to snap to a BudgetTier.
 */
export function BudgetRangeSlider({
  position,
  onSelectPosition,
  onSelectEnd,
  trackStyle,
  fillStyle,
  thumbStyle,
}: Props) {
  const trackRef = useRef<View>(null);
  const originX = useRef(0);
  const width = useRef(0);

  const applyPageX = (pageX: number) => {
    const w = width.current;
    if (w <= 0) return;
    onSelectPosition((pageX - originX.current) / w);
  };

  const measureThenApply = (pageX: number) => {
    const run = () => applyPageX(pageX);
    if (width.current > 0) {
      run();
      return;
    }
    trackRef.current?.measureInWindow((x, _y, w) => {
      originX.current = x;
      width.current = w;
      run();
    });
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => measureThenApply(evt.nativeEvent.pageX),
      onPanResponderMove: (evt) => applyPageX(evt.nativeEvent.pageX),
      onPanResponderRelease: () => onSelectEnd?.(),
      onPanResponderTerminate: () => onSelectEnd?.(),
    }),
  ).current;

  const clamped = Number.isFinite(position) ? Math.max(0, Math.min(1, position)) : 0;
  const fillPct = `${clamped * 100}%` as `${number}%`;
  const thumbPct = `${Math.max(4, clamped * 100 - 2)}%` as `${number}%`;

  return (
    <View
      style={styles.hit}
      accessibilityRole="adjustable"
      accessibilityLabel="Budget range"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      {...pan.panHandlers}
    >
      <View
        ref={trackRef}
        style={[styles.track, trackStyle]}
        onLayout={() => {
          trackRef.current?.measureInWindow((x, _y, w) => {
            originX.current = x;
            width.current = w;
          });
        }}
      >
        <View style={[styles.fill, fillStyle, { width: fillPct }]} />
        <View style={[styles.thumb, thumbStyle, { left: thumbPct }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hit: {
    paddingVertical: 12,
    marginBottom: 4,
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#F0E6D8',
    position: 'relative',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#B9834B',
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    top: -5,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#B9834B',
    borderWidth: 2,
    borderColor: '#FFF',
    marginLeft: -7,
  },
});
