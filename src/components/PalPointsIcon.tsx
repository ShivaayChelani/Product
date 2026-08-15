import React, { memo } from 'react';
import { StyleProp, View, ViewStyle, Image } from 'react-native';

type Props = {
  size?: number;
  style?: StyleProp<ViewStyle>;
};

function PalPointsIconComponent({ size = 24, style }: Props) {
  const px = Math.round(size);
  return (
    <View style={[{ width: px, height: px, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Image 
        source={require('../assets/palpoint icon.png')} 
        style={{ width: px, height: px, resizeMode: 'contain' }} 
      />
    </View>
  );
}

export const PalPointsIcon = memo(PalPointsIconComponent);
