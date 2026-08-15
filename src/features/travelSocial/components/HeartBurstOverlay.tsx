import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Ionicons';

type Props = {
  visible: boolean;
  onFinished?: () => void;
};

export function HeartBurstOverlay({ visible, onFinished }: Props) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;
    scale.value = 0.2;
    opacity.value = 1;
    scale.value = withSequence(
      withSpring(1.25, { damping: 8, stiffness: 220 }),
      withTiming(1.5, { duration: 280 }),
    );
    opacity.value = withSequence(
      withTiming(1, { duration: 80 }),
      withTiming(0, { duration: 420 }, finished => {
        if (finished && onFinished) runOnJS(onFinished)();
      }),
    );
  }, [visible, onFinished, opacity, scale]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  if (!visible) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, style]}>
      <Icon name="heart" size={96} color="#FF2D55" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
});
