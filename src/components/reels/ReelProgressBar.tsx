import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { REEL_ACCENT } from './reelTheme';
import { REEL_PROGRESS_H } from './reelLayout';

type Props = {
  progress: number;
};

function ReelProgressBarComponent({ progress }: Props) {
  const pct = Math.min(Math.max(progress, 0), 1);
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${pct * 100}%` }]}>
        <View style={styles.thumb} />
      </View>
    </View>
  );
}

export const ReelProgressBar = memo(ReelProgressBarComponent);

const styles = StyleSheet.create({
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
    right: -5,
    top: -4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: REEL_ACCENT,
  },
});
