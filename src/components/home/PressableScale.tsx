import React, { memo, useCallback } from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = PressableProps & {
  style?: StyleProp<ViewStyle>;
  activeScale?: number;
  children: React.ReactNode;
};

function PressableScaleComponent({
  children,
  onPress,
  style,
  activeScale = 0.96,
  accessibilityRole = 'button',
  ...rest
}: Props) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const onPressIn = useCallback(() => {
    scale.value = withSpring(activeScale, { damping: 18, stiffness: 320 });
  }, [activeScale, scale]);

  const onPressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 14, stiffness: 260 });
  }, [scale]);

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[style, animatedStyle]}
      accessibilityRole={accessibilityRole}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}

export const PressableScale = memo(PressableScaleComponent);
