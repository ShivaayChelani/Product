import React, { memo, useRef, useState } from 'react';
import { View, StyleSheet, PanResponder, LayoutChangeEvent } from 'react-native';
import { REEL_ACCENT } from './reelTheme';
import { REEL_PROGRESS_H } from './reelLayout';
import {
  clampReelProgress,
  progressFromDrag,
  progressFromTrackX,
  shouldClaimHorizontalScrub,
  shouldYieldToVerticalPaging,
} from './reelSeek';

type Props = {
  progress: number;
  onSeek?: (progress: number) => void;
};

function ReelProgressBarComponent({ progress, onSeek }: Props) {
  const [width, setWidth] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekProgress, setSeekProgress] = useState(progress);

  const widthRef = useRef(0);
  const startPctRef = useRef(0);
  const isScrubbingRef = useRef(false);
  const lastSeekEmitRef = useRef(0);
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;

  const emitSeek = (next: number, force: boolean) => {
    const cb = onSeekRef.current;
    if (!cb) return;
    const now = Date.now();
    if (!force && now - lastSeekEmitRef.current < 80) return;
    lastSeekEmitRef.current = now;
    cb(next);
  };

  const pan = useRef(
    PanResponder.create({
      // Let vertical FlashList paging win unless this is clearly a horizontal scrub.
      onStartShouldSetPanResponderCapture: () => false,
      onStartShouldSetPanResponder: () => !!onSeekRef.current && widthRef.current > 0,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        !!onSeekRef.current && shouldClaimHorizontalScrub(gestureState.dx, gestureState.dy),
      onMoveShouldSetPanResponderCapture: (_, gestureState) =>
        !!onSeekRef.current && shouldClaimHorizontalScrub(gestureState.dx, gestureState.dy),
      onPanResponderTerminationRequest: (_, gestureState) =>
        shouldYieldToVerticalPaging(gestureState.dx, gestureState.dy, isScrubbingRef.current),
      onPanResponderGrant: evt => {
        const next = progressFromTrackX(evt.nativeEvent.locationX, widthRef.current);
        startPctRef.current = next;
        isScrubbingRef.current = false;
        setSeekProgress(next);
      },
      onPanResponderMove: (_, gestureState) => {
        if (widthRef.current <= 0) return;
        if (!isScrubbingRef.current) {
          if (!shouldClaimHorizontalScrub(gestureState.dx, gestureState.dy)) return;
          isScrubbingRef.current = true;
          setIsSeeking(true);
        }
        const next = progressFromDrag(startPctRef.current, gestureState.dx, widthRef.current);
        setSeekProgress(next);
        emitSeek(next, false);
      },
      onPanResponderRelease: (evt, gestureState) => {
        const next = isScrubbingRef.current
          ? progressFromDrag(startPctRef.current, gestureState.dx, widthRef.current)
          : progressFromTrackX(evt.nativeEvent.locationX, widthRef.current);
        isScrubbingRef.current = false;
        setIsSeeking(false);
        setSeekProgress(next);
        emitSeek(next, true);
      },
      onPanResponderTerminate: () => {
        isScrubbingRef.current = false;
        setIsSeeking(false);
      },
    }),
  ).current;

  const handleLayout = (e: LayoutChangeEvent) => {
    const nextWidth = e.nativeEvent.layout.width;
    widthRef.current = nextWidth;
    setWidth(nextWidth);
  };

  const currentPct = isSeeking ? seekProgress : clampReelProgress(progress);

  return (
    <View
      style={styles.trackWrap}
      onLayout={handleLayout}
      {...pan.panHandlers}
      accessibilityRole="adjustable"
      accessibilityLabel="Moment progress"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(currentPct * 100) }}
      collapsable={false}
    >
      <View style={styles.track} pointerEvents="none">
        <View style={[styles.fill, { width: `${currentPct * 100}%` }]} />
      </View>
      {width > 0 ? (
        <View
          pointerEvents="none"
          style={[
            styles.thumb,
            { left: `${currentPct * 100}%` },
            isSeeking && styles.thumbActive,
          ]}
        />
      ) : null}
    </View>
  );
}

export const ReelProgressBar = memo(ReelProgressBarComponent);

const styles = StyleSheet.create({
  trackWrap: {
    height: 44,
    justifyContent: 'center',
    marginTop: -14,
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
  },
  thumb: {
    position: 'absolute',
    width: 12,
    height: 12,
    marginLeft: -6,
    borderRadius: 6,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: REEL_ACCENT,
    top: 16,
  },
  thumbActive: {
    transform: [{ scale: 1.5 }],
  },
});
