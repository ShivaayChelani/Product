import React from 'react';
import { ViewStyle, StyleProp } from 'react-native';
import RNLinearGradient from 'react-native-linear-gradient';

interface LinearGradientProps {
  colors: string[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  style?: StyleProp<ViewStyle>;
  locations?: number[];
  children?: React.ReactNode;
}

export const LinearGradient: React.FC<LinearGradientProps> = ({
  colors,
  start = { x: 0, y: 0 },
  end = { x: 1, y: 0 },
  style,
  locations,
  children,
}) => {
  return (
    <RNLinearGradient
      colors={colors}
      start={start}
      end={end}
      locations={locations}
      style={style}
    >
      {children}
    </RNLinearGradient>
  );
};
