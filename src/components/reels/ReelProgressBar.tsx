import React, { memo, useRef, useState } from 'react';
import { View, StyleSheet, PanResponder, LayoutChangeEvent } from 'react-native';
import { REEL_ACCENT } from './reelTheme';
import { REEL_PROGRESS_H } from './reelLayout';

type Props = {
  progress: number;
  onSeek?: (progress: number) => void;
};

function ReelProgressBarComponent({ progress, onSeek }: Props) {
  const [width, setWidth] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekProgress, setSeekProgress] = useState(progress);

  const initialPctRef = useRef(0);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !!onSeek,
      onMoveShouldSetPanResponder: () => !!onSeek,
      onPanResponderGrant: (evt) => {
        setIsSeeking(true);
        if (width > 0) {
          const locX = evt.nativeEvent.locationX;
          const pct = Math.max(0, Math.min(1, locX / width));
          initialPctRef.current = pct;
          setSeekProgress(pct);
        }
      },
      onPanResponderMove: (evt, gestureState) => {
        if (width > 0) {
          const dxPct = gestureState.dx / width;
          const newPct = Math.max(0, Math.min(1, initialPctRef.current + dxPct));
          setSeekProgress(newPct);
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        setIsSeeking(false);
        if (width > 0 && onSeek) {
          const dxPct = gestureState.dx / width;
          const newPct = Math.max(0, Math.min(1, initialPctRef.current + dxPct));
          onSeek(newPct);
        }
      },
    })
  ).current;

  const handleLayout = (e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  };

  const currentPct = isSeeking ? seekProgress : Math.min(Math.max(progress, 0), 1);

  return (
    <View style={styles.trackWrap} onLayout={handleLayout} {...pan.panHandlers}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${currentPct * 100}%` }]}>
          <View style={[styles.thumb, isSeeking && styles.thumbActive]} />
        </View>
      </View>
    </View>
  );
}

export const ReelProgressBar = memo(ReelProgressBarComponent);

const styles = StyleSheet.create({
  trackWrap: {
    paddingVertical: 10,
    marginTop: -10,
    zIndex: 10,
  },
  track: {
    height: REEL_PROGRESS_H,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.4)',
    overflow: 'visible',
  },
  fill: {
    height: '100%',
    backgroundColor: REEL_ACCENT,
    borderRadius: 2,
    position: 'relative',
    minWidth: 0,
  },
  thumb: {
    position: 'absolute',
    right: -6,
    top: -5,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: REEL_ACCENT,
  },
  thumbActive: {
    transform: [{ scale: 1.5 }],
  },
});
